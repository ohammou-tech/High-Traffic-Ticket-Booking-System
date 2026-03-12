# High-Traffic Ticket Booking System

A backend system designed to handle 10,000 concurrent users competing for 100 tickets without overselling. Built with **Node.js**, **PostgreSQL**, **Redis**, and **RabbitMQ**.

## Architecture

```
Client → Express API → Redis (atomic DECR) → RabbitMQ (queue) → Worker → PostgreSQL (SELECT FOR UPDATE)
```

Three layers prevent overselling:

1. **Redis** — Atomic `DECR` on cached ticket counts gives instant rejection when sold out (zero DB load for rejected requests)
2. **RabbitMQ** — Buffers accepted requests into a durable queue so the database isn't overwhelmed by 10K concurrent writes
3. **PostgreSQL Pessimistic Locking** — The worker uses `SELECT ... FOR UPDATE` to acquire a row-level lock before decrementing, guaranteeing serialized access

An additional **optimistic locking** endpoint demonstrates the version-check approach for comparison.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| API Server | Node.js + Express 5 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Message Queue | RabbitMQ 3 |
| Containerization | Docker + Docker Compose |

## Quick Start

```bash
make rundev        # Start all services
make alllogs       # Watch all logs
```

Services:
- **API**: http://localhost:3000
- **RabbitMQ Management**: http://localhost:15672

## API Endpoints

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users` | Register a user |
| GET | `/api/users/:userId` | Get user details |
| GET | `/api/users/:userId/tickets` | Get user's tickets |

### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List all events |
| GET | `/api/events/:eventId` | Get event (Redis-cached availability) |
| POST | `/api/events` | Create an event |
| DELETE | `/api/events/:eventId` | Delete an event |

### Booking
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/booking` | Book a ticket (queued — Redis + RabbitMQ + pessimistic lock) |
| POST | `/api/booking/optimistic` | Book a ticket (direct — optimistic locking) |
| GET | `/api/booking/:ticketId/status` | Poll ticket status |
| GET | `/api/events/:eventId/tickets` | List tickets for an event |
| DELETE | `/api/booking/:ticketId` | Cancel a ticket |

## Booking Flow

### Queued Booking (POST /api/booking) — Production Strategy

```
1. Check Redis cache for availability        → instant "sold out" if 0
2. Atomic DECR in Redis                      → first line of defense
3. Insert PENDING ticket in Postgres
4. Publish message to RabbitMQ queue          → return 202 Accepted
5. Worker picks up message
6. SELECT ... FOR UPDATE (pessimistic lock)   → serialized DB access
7. Decrement available_tickets + CONFIRM      → or REJECT if sold out
8. Client polls GET /api/booking/:id/status
```

### Optimistic Locking (POST /api/booking/optimistic) — Comparison

```
1. Read event's available_tickets + version
2. UPDATE ... WHERE version = X               → fails if row changed
3. On conflict → retry (up to 5 times)
4. Insert CONFIRMED ticket on success
```

## Example Usage

```bash
# Register a user
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"username": "alice", "email": "alice@example.com"}'

# Create an event with 100 tickets
curl -X POST http://localhost:3000/api/events \
  -H 'Content-Type: application/json' \
  -d '{"event_name": "Rock Concert 2026", "total_tickets": 100}'

# Book a ticket (queued)
curl -X POST http://localhost:3000/api/booking \
  -H 'Content-Type: application/json' \
  -d '{"event_id": "<EVENT_UUID>", "user_id": "<USER_UUID>"}'

# Check ticket status
curl http://localhost:3000/api/booking/<TICKET_UUID>/status
```

## Key Concepts Demonstrated

- **Pessimistic Locking**: `SELECT ... FOR UPDATE` in the worker serializes ticket decrements
- **Optimistic Locking**: Version column check-and-update with retry loop
- **Message Queuing**: RabbitMQ absorbs traffic spikes, worker processes at safe rate
- **Redis Caching**: Atomic operations for real-time availability without DB reads
- **Race Condition Prevention**: Multi-layer approach ensures zero overselling
