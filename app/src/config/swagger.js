const swaggerDefinition = {
    openapi: '3.0.3',
    info: {
        title: 'High-Traffic Ticket Booking System',
        version: '1.0.0',
        description:
            'A backend system designed to handle 10,000 concurrent users competing for limited tickets ' +
            'without overselling.  Uses **Redis** (atomic cache), **RabbitMQ** (queue buffer), and ' +
            '**PostgreSQL** (pessimistic & optimistic locking) as three layers of defense against race conditions.',
    },
    servers: [{ url: '/api', description: 'API server' }],
    tags: [
        { name: 'Health', description: 'Service health' },
        { name: 'Users', description: 'User registration and lookup' },
        { name: 'Events', description: 'Concert / event management' },
        { name: 'Booking', description: 'Ticket booking, status, and cancellation' },
    ],
    paths: {
        /* ------------------------------------------------------------------ */
        /*  HEALTH                                                            */
        /* ------------------------------------------------------------------ */
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Health check',
                responses: {
                    200: {
                        description: 'Service is healthy',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
                    },
                },
            },
        },

        /* ------------------------------------------------------------------ */
        /*  USERS                                                             */
        /* ------------------------------------------------------------------ */
        '/users': {
            post: {
                tags: ['Users'],
                summary: 'Register a new user',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUserRequest' } } },
                },
                responses: {
                    201: {
                        description: 'User created',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } },
                    },
                    400: { $ref: '#/components/responses/BadRequest' },
                },
            },
        },
        '/users/{userId}': {
            get: {
                tags: ['Users'],
                summary: 'Get user by ID',
                parameters: [{ $ref: '#/components/parameters/userId' }],
                responses: {
                    200: {
                        description: 'User details',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } },
                    },
                    404: { $ref: '#/components/responses/NotFound' },
                },
            },
        },
        '/users/{userId}/tickets': {
            get: {
                tags: ['Users'],
                summary: "List a user's tickets",
                parameters: [{ $ref: '#/components/parameters/userId' }],
                responses: {
                    200: {
                        description: 'List of tickets belonging to the user',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/UserTicketsResponse' } } },
                    },
                },
            },
        },

        /* ------------------------------------------------------------------ */
        /*  EVENTS                                                            */
        /* ------------------------------------------------------------------ */
        '/events': {
            get: {
                tags: ['Events'],
                summary: 'List all events',
                responses: {
                    200: {
                        description: 'Array of events ordered by date',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/EventListResponse' } } },
                    },
                },
            },
            post: {
                tags: ['Events'],
                summary: 'Create a new event',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateEventRequest' } } },
                },
                responses: {
                    201: {
                        description: 'Event created (availability also cached in Redis)',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/EventCreatedResponse' } } },
                    },
                    400: { $ref: '#/components/responses/BadRequest' },
                },
            },
        },
        '/events/{eventId}': {
            get: {
                tags: ['Events'],
                summary: 'Get event details (Redis-cached availability)',
                description:
                    'Returns the event from PostgreSQL but overlays the `available_tickets` value from Redis ' +
                    'when present, since the cache is more up-to-date under high load.',
                parameters: [{ $ref: '#/components/parameters/eventId' }],
                responses: {
                    200: {
                        description: 'Event details',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/EventDetailResponse' } } },
                    },
                    404: { $ref: '#/components/responses/NotFound' },
                },
            },
            delete: {
                tags: ['Events'],
                summary: 'Delete an event',
                description: 'Deletes the event and invalidates its Redis cache key.',
                parameters: [{ $ref: '#/components/parameters/eventId' }],
                responses: {
                    200: { description: 'Event deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } } },
                    404: { $ref: '#/components/responses/NotFound' },
                },
            },
        },
        '/events/{eventId}/tickets': {
            get: {
                tags: ['Booking'],
                summary: 'List all tickets for an event',
                parameters: [{ $ref: '#/components/parameters/eventId' }],
                responses: {
                    200: {
                        description: 'Tickets for the event',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/EventTicketsResponse' } } },
                    },
                },
            },
        },

        /* ------------------------------------------------------------------ */
        /*  BOOKING                                                           */
        /* ------------------------------------------------------------------ */
        '/booking': {
            post: {
                tags: ['Booking'],
                summary: 'Book a ticket (queued — pessimistic locking)',
                description:
                    '**Production strategy.** Three layers prevent overselling:\n\n' +
                    '1. **Redis DECR** — atomic cache decrement for instant sold-out rejection\n' +
                    '2. **RabbitMQ** — accepted request is queued; returns 202 immediately\n' +
                    '3. **Worker + SELECT … FOR UPDATE** — pessimistic row lock in PostgreSQL\n\n' +
                    'Poll `GET /booking/{ticketId}/status` to check the final result.',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingRequest' } } },
                },
                responses: {
                    202: {
                        description: 'Booking request accepted and queued',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingAcceptedResponse' } } },
                    },
                    400: { $ref: '#/components/responses/BadRequest' },
                    404: { $ref: '#/components/responses/NotFound' },
                    409: { $ref: '#/components/responses/Conflict' },
                },
            },
        },
        '/booking/optimistic': {
            post: {
                tags: ['Booking'],
                summary: 'Book a ticket (direct — optimistic locking)',
                description:
                    '**Educational / comparison endpoint.** Hits PostgreSQL directly using a `version` column.\n\n' +
                    'The UPDATE only succeeds if the version matches what was read. On conflict the server ' +
                    'retries up to 5 times. Under extreme contention this is slower than the queued approach.',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingRequest' } } },
                },
                responses: {
                    201: {
                        description: 'Ticket booked immediately',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/OptimisticBookingResponse' } } },
                    },
                    400: { $ref: '#/components/responses/BadRequest' },
                    404: { $ref: '#/components/responses/NotFound' },
                    409: { $ref: '#/components/responses/Conflict' },
                },
            },
        },
        '/booking/{ticketId}/status': {
            get: {
                tags: ['Booking'],
                summary: 'Poll ticket booking status',
                description: 'Use this to check whether a queued booking was CONFIRMED or REJECTED by the worker.',
                parameters: [{ $ref: '#/components/parameters/ticketId' }],
                responses: {
                    200: {
                        description: 'Ticket status',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/TicketStatusResponse' } } },
                    },
                    404: { $ref: '#/components/responses/NotFound' },
                },
            },
        },
        '/booking/{ticketId}': {
            delete: {
                tags: ['Booking'],
                summary: 'Cancel a ticket',
                description:
                    'Cancels the ticket. If it was CONFIRMED, the event\'s available_tickets is incremented ' +
                    'in both PostgreSQL and the Redis cache.',
                parameters: [{ $ref: '#/components/parameters/ticketId' }],
                responses: {
                    200: { description: 'Ticket cancelled', content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageResponse' } } } },
                    404: { $ref: '#/components/responses/NotFound' },
                    409: { $ref: '#/components/responses/Conflict' },
                },
            },
        },
    },

    /* ====================================================================== */
    /*  COMPONENTS                                                            */
    /* ====================================================================== */
    components: {
        /* ---- Parameters -------------------------------------------------- */
        parameters: {
            userId:  { name: 'userId',  in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            eventId: { name: 'eventId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            ticketId:{ name: 'ticketId',in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        },

        /* ---- Reusable responses ----------------------------------------- */
        responses: {
            BadRequest: { description: 'Validation error',   content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            NotFound:   { description: 'Resource not found',  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            Conflict:   { description: 'Conflict (e.g. sold out)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },

        /* ---- Schemas ----------------------------------------------------- */
        schemas: {
            /* -- Shared -- */
            ErrorResponse: {
                type: 'object',
                properties: {
                    ok:    { type: 'boolean', example: false },
                    error: {
                        type: 'object',
                        properties: {
                            status:  { type: 'integer', example: 400 },
                            message: { type: 'string',  example: 'Bad Request' },
                        },
                    },
                },
            },
            MessageResponse: {
                type: 'object',
                properties: {
                    ok:      { type: 'boolean', example: true },
                    message: { type: 'string',  example: 'Operation successful' },
                },
            },
            HealthResponse: {
                type: 'object',
                properties: {
                    ok:        { type: 'boolean', example: true },
                    timestamp: { type: 'string', format: 'date-time' },
                },
            },

            /* -- User -- */
            CreateUserRequest: {
                type: 'object',
                required: ['username', 'email'],
                properties: {
                    username: { type: 'string', example: 'alice' },
                    email:    { type: 'string', format: 'email', example: 'alice@example.com' },
                },
            },
            User: {
                type: 'object',
                properties: {
                    id:         { type: 'string', format: 'uuid' },
                    username:   { type: 'string' },
                    email:      { type: 'string', format: 'email' },
                    created_at: { type: 'string', format: 'date-time' },
                },
            },
            UserResponse: {
                type: 'object',
                properties: {
                    ok:   { type: 'boolean', example: true },
                    user: { $ref: '#/components/schemas/User' },
                },
            },
            UserTicketsResponse: {
                type: 'object',
                properties: {
                    ok:      { type: 'boolean', example: true },
                    tickets: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id:            { type: 'string', format: 'uuid' },
                                event_id:      { type: 'string', format: 'uuid' },
                                ticket_status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'] },
                                created_at:    { type: 'string', format: 'date-time' },
                                event_name:    { type: 'string' },
                                event_date:    { type: 'string', format: 'date-time' },
                            },
                        },
                    },
                },
            },

            /* -- Event -- */
            CreateEventRequest: {
                type: 'object',
                required: ['event_name', 'total_tickets'],
                properties: {
                    event_name:    { type: 'string',  example: 'Rock Concert 2026' },
                    event_date:    { type: 'string',  format: 'date-time', description: 'Defaults to now if omitted' },
                    total_tickets: { type: 'integer', minimum: 1, example: 100 },
                },
            },
            Event: {
                type: 'object',
                properties: {
                    id:                { type: 'string', format: 'uuid' },
                    event_name:        { type: 'string' },
                    event_date:        { type: 'string', format: 'date-time' },
                    total_tickets:     { type: 'integer' },
                    available_tickets: { type: 'integer' },
                    version:           { type: 'integer' },
                    created_at:        { type: 'string', format: 'date-time' },
                },
            },
            EventListResponse: {
                type: 'object',
                properties: {
                    ok:     { type: 'boolean', example: true },
                    events: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
                },
            },
            EventDetailResponse: {
                type: 'object',
                properties: {
                    ok:    { type: 'boolean', example: true },
                    event: { $ref: '#/components/schemas/Event' },
                },
            },
            EventCreatedResponse: {
                type: 'object',
                properties: {
                    ok:      { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Event created' },
                    event:   { $ref: '#/components/schemas/Event' },
                },
            },

            /* -- Booking / Ticket -- */
            BookingRequest: {
                type: 'object',
                required: ['event_id', 'user_id'],
                properties: {
                    event_id: { type: 'string', format: 'uuid' },
                    user_id:  { type: 'string', format: 'uuid' },
                },
            },
            BookingAcceptedResponse: {
                type: 'object',
                properties: {
                    ok:        { type: 'boolean', example: true },
                    message:   { type: 'string', example: 'Booking request queued for processing' },
                    ticket_id: { type: 'string', format: 'uuid' },
                    status:    { type: 'string', example: 'PENDING' },
                },
            },
            Ticket: {
                type: 'object',
                properties: {
                    id:            { type: 'string', format: 'uuid' },
                    event_id:      { type: 'string', format: 'uuid' },
                    user_id:       { type: 'string', format: 'uuid' },
                    ticket_status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'] },
                    created_at:    { type: 'string', format: 'date-time' },
                },
            },
            OptimisticBookingResponse: {
                type: 'object',
                properties: {
                    ok:      { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Ticket booked (optimistic locking)' },
                    ticket:  { $ref: '#/components/schemas/Ticket' },
                },
            },
            TicketStatusResponse: {
                type: 'object',
                properties: {
                    ok: { type: 'boolean', example: true },
                    ticket: {
                        type: 'object',
                        properties: {
                            id:            { type: 'string', format: 'uuid' },
                            event_id:      { type: 'string', format: 'uuid' },
                            user_id:       { type: 'string', format: 'uuid' },
                            ticket_status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'] },
                            created_at:    { type: 'string', format: 'date-time' },
                            event_name:    { type: 'string' },
                            event_date:    { type: 'string', format: 'date-time' },
                        },
                    },
                },
            },
            EventTicketsResponse: {
                type: 'object',
                properties: {
                    ok:      { type: 'boolean', example: true },
                    tickets: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id:            { type: 'string', format: 'uuid' },
                                user_id:       { type: 'string', format: 'uuid' },
                                ticket_status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'] },
                                created_at:    { type: 'string', format: 'date-time' },
                                username:      { type: 'string', nullable: true },
                            },
                        },
                    },
                },
            },
        },
    },
};

export default swaggerDefinition;
