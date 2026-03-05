import createError from 'http-errors';
import { CACHE_KEYS, CACHE_TTL } from '../config/redis.js';

/**
 * QUEUED BOOKING  (production strategy)
 *
 * Layer 1 – Redis:  Atomic DECR on the cached counter gives an instant
 *                   "sold out" rejection without touching Postgres.
 * Layer 2 – RabbitMQ:  Accepted requests are pushed into a durable queue,
 *                      absorbing the traffic spike.
 * Layer 3 – Worker:  Consumes messages one-by-one, using SELECT … FOR UPDATE
 *                    (pessimistic lock) to safely decrement available_tickets.
 */
export async function bookTicket(req, res) {
    const { event_id, user_id } = req.body;

    if (!event_id || !user_id)
        throw createError.BadRequest('event_id and user_id are required');

    const cacheKey = CACHE_KEYS.eventAvailable(event_id);

    // Warm the cache on first access so DECR works on a real value
    let available = await req.redis.get(cacheKey);
    if (available === null) {
        const event = await req.db.query(
            'SELECT available_tickets FROM events WHERE id = $1', [event_id]
        );
        if (event.rows.length === 0)
            throw createError.NotFound('Event not found');
        available = event.rows[0].available_tickets;
        await req.redis.set(cacheKey, available, 'EX', CACHE_TTL);
    }

    if (parseInt(available) <= 0)
        throw createError.Conflict('Event is sold out');

    // Atomic decrement – first line of defense against overselling
    const remaining = await req.redis.decr(cacheKey);
    if (remaining < 0) {
        await req.redis.incr(cacheKey);
        throw createError.Conflict('Event is sold out');
    }

    const result = await req.db.query(
        "INSERT INTO tickets (event_id, user_id, ticket_status) VALUES ($1, $2, 'PENDING') RETURNING id",
        [event_id, user_id]
    );
    const ticketId = result.rows[0].id;

    const message = { ticket_id: ticketId, event_id, user_id };
    req.rabbitMq.channel.sendToQueue(
        req.rabbitMq.queue,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );

    res.status(202).json({
        ok: true,
        message: 'Booking request queued for processing',
        ticket_id: ticketId,
        status: 'PENDING',
    });
}

/**
 * DIRECT BOOKING  with OPTIMISTIC LOCKING  (educational / comparison endpoint)
 *
 * Instead of queuing, this hits Postgres directly and relies on a version
 * column.  The UPDATE only succeeds when the row's version still matches
 * what we read, so a concurrent write causes a retry rather than a corrupt
 * decrement.  Good for moderate contention; under extreme load the retry
 * loop becomes expensive – that's why the queued approach is preferred.
 */
export async function bookTicketOptimistic(req, res) {
    const { event_id, user_id } = req.body;

    if (!event_id || !user_id)
        throw createError.BadRequest('event_id and user_id are required');

    const MAX_RETRIES = 5;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const client = await req.db.connect();
        try {
            await client.query('BEGIN');

            const event = await client.query(
                'SELECT available_tickets, version FROM events WHERE id = $1',
                [event_id]
            );

            if (event.rows.length === 0)
                throw createError.NotFound('Event not found');
            if (event.rows[0].available_tickets <= 0)
                throw createError.Conflict('Event is sold out');

            const currentVersion = event.rows[0].version;

            // Only succeeds if no one else changed the row since our read
            const update = await client.query(
                `UPDATE events
                 SET available_tickets = available_tickets - 1, version = version + 1
                 WHERE id = $1 AND version = $2 AND available_tickets > 0
                 RETURNING available_tickets`,
                [event_id, currentVersion]
            );

            if (update.rowCount === 0) {
                await client.query('ROLLBACK');
                if (attempt === MAX_RETRIES)
                    throw createError.Conflict('Booking failed due to high contention. Try again.');
                continue;
            }

            const ticket = await client.query(
                "INSERT INTO tickets (event_id, user_id, ticket_status) VALUES ($1, $2, 'CONFIRMED') RETURNING *",
                [event_id, user_id]
            );

            await client.query('COMMIT');

            await req.redis.set(
                CACHE_KEYS.eventAvailable(event_id),
                update.rows[0].available_tickets,
                'EX', CACHE_TTL
            );

            return res.status(201).json({
                ok: true,
                message: 'Ticket booked (optimistic locking)',
                ticket: ticket.rows[0],
            });
        } catch (error) {
            await client.query('ROLLBACK');
            if (error.statusCode) throw error;
            throw createError.InternalServerError('Booking failed');
        } finally {
            client.release();
        }
    }
}

export async function getTicketStatus(req, res) {
    const { ticketId } = req.params;

    const result = await req.db.query(
        `SELECT t.id, t.event_id, t.user_id, t.ticket_status, t.created_at,
                e.event_name, e.event_date
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         WHERE t.id = $1`,
        [ticketId]
    );

    if (result.rows.length === 0)
        throw createError.NotFound('Ticket not found');

    res.json({ ok: true, ticket: result.rows[0] });
}

export async function getEventTickets(req, res) {
    const { eventId } = req.params;

    const result = await req.db.query(
        `SELECT t.id, t.user_id, t.ticket_status, t.created_at, u.username
         FROM tickets t
         LEFT JOIN users u ON t.user_id = u.id
         WHERE t.event_id = $1
         ORDER BY t.created_at`,
        [eventId]
    );

    res.json({ ok: true, tickets: result.rows });
}

export async function cancelTicket(req, res) {
    const { ticketId } = req.params;

    const client = await req.db.connect();
    try {
        await client.query('BEGIN');

        const ticket = await client.query(
            'SELECT * FROM tickets WHERE id = $1 FOR UPDATE',
            [ticketId]
        );

        if (ticket.rows.length === 0)
            throw createError.NotFound('Ticket not found');
        if (ticket.rows[0].ticket_status === 'CANCELLED')
            throw createError.Conflict('Ticket is already cancelled');

        const wasConfirmed = ticket.rows[0].ticket_status === 'CONFIRMED';
        const eventId = ticket.rows[0].event_id;

        await client.query(
            "UPDATE tickets SET ticket_status = 'CANCELLED' WHERE id = $1",
            [ticketId]
        );

        if (wasConfirmed) {
            await client.query(
                'UPDATE events SET available_tickets = available_tickets + 1 WHERE id = $1',
                [eventId]
            );
            await req.redis.incr(CACHE_KEYS.eventAvailable(eventId));
        }

        await client.query('COMMIT');
        res.json({ ok: true, message: 'Ticket cancelled' });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.statusCode) throw error;
        throw createError.InternalServerError('Cancellation failed');
    } finally {
        client.release();
    }
}
