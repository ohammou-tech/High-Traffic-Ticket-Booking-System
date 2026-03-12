# Architecture — High-Traffic Ticket Booking System

## 1. Problem Statement

A concert has **100 tickets**. At the moment sales open, **10,000 users** hit the booking endpoint at the exact same second.  
Without protection this causes **race conditions** — two requests read "1 ticket left", both succeed, and the system sells 101 tickets.

This project solves that problem with three layers of concurrency control.

---

## 2. High-Level Architecture

```
                        ┌──────────────────────────────────────────────┐
                        │              Docker Compose                  │
                        │                                              │
  ┌──────────┐   HTTP   │  ┌──────────┐    ┌───────┐    ┌──────────┐  │
  │  Client   │────────►│  │  Express  │───►│ Redis │    │ Postgres │  │
  │ (10,000   │         │  │  API      │    │ Cache │    │   DB     │  │
  │  users)   │◄────────│  │  Server   │    └───┬───┘    └────┬─────┘  │
  └──────────┘  202     │  └─────┬─────┘        │             │        │
                Accepted│        │ publish       │             │        │
                        │        ▼               │             │        │
                        │  ┌──────────┐          │             │        │
                        │  │ RabbitMQ │          │             │        │
                        │  │  Queue   │          │             │        │
                        │  └─────┬────┘          │             │        │
                        │        │ consume        │             │        │
                        │        ▼               │             │        │
                        │  ┌──────────┐          │             │        │
                        │  │  Worker  │──────────┘─────────────┘        │
                        │  │ (SELECT  │  pessimistic lock + update      │
                        │  │  FOR     │  then sync back to Redis        │
                        │  │  UPDATE) │                                 │
                        │  └──────────┘                                 │
                        └──────────────────────────────────────────────┘
```

---

## 3. The Three Defense Layers

### Layer 1 — Redis (Instant Rejection)

When an event is created, its `available_tickets` is cached in Redis:

```
SET event:<uuid>:available 100
```

On each booking request the API runs an **atomic `DECR`**:

```
DECR event:<uuid>:available   →   returns 99, 98, … 0, -1
```

- If the result is `>= 0` → the request passes to Layer 2.
- If the result is `< 0` → immediately `INCR` it back and return `409 Sold Out`.

This rejects the vast majority of the 10,000 requests **in microseconds** without touching PostgreSQL.

### Layer 2 — RabbitMQ (Traffic Absorption)

The ~100 requests that survived Layer 1 are not sent directly to the database.  
Instead, the API:

1. Inserts a `PENDING` ticket row in Postgres.
2. Publishes a message `{ ticket_id, event_id }` to a **durable RabbitMQ queue**.
3. Returns **`202 Accepted`** to the client.

The queue acts as a buffer — even if 200 requests arrive simultaneously, they line up and get processed one by one.

### Layer 3 — PostgreSQL Pessimistic Locking (Ground Truth)

A dedicated **worker process** consumes messages from the queue:

```sql
BEGIN;

-- Acquire an exclusive row-level lock; other transactions block here
SELECT available_tickets FROM events WHERE id = $1 FOR UPDATE;

-- Safe to decrement — no one else can read or write this row
UPDATE events SET available_tickets = available_tickets - 1 WHERE id = $1;
UPDATE tickets SET ticket_status = 'CONFIRMED' WHERE id = $2;

COMMIT;
```

`FOR UPDATE` is a **pessimistic lock**: it assumes conflicts will happen, so it locks the row immediately. Any other transaction that attempts `SELECT ... FOR UPDATE` on the same row will **block** until the first transaction commits or rolls back.

If `available_tickets` has already reached 0, the worker sets the ticket to `REJECTED` and increments the Redis counter back.

---

## 4. Optimistic Locking (Comparison Endpoint)

The system also exposes `POST /api/booking/optimistic` to demonstrate the alternative:

```sql
-- 1. Read the current state
SELECT available_tickets, version FROM events WHERE id = $1;
-- Suppose we get: available_tickets = 5, version = 42

-- 2. Attempt update only if version is unchanged
UPDATE events
SET available_tickets = available_tickets - 1, version = version + 1
WHERE id = $1 AND version = 42 AND available_tickets > 0;
-- Returns rowCount = 0 if someone else modified the row → RETRY
```

**Optimistic locking** assumes conflicts are rare and only detects them at write time. On conflict, the application retries (up to 5 times). This works well for moderate contention but degrades under extreme load because every conflicting request wastes a round-trip.

### When to Use Which

| Strategy | Best For | Drawback |
|----------|----------|----------|
| Pessimistic (`FOR UPDATE`) | High contention, guaranteed correctness | Blocks other transactions; lower throughput |
| Optimistic (version check) | Low-to-moderate contention | Retry storms under high contention |
| Queued (Redis + RabbitMQ + Pessimistic) | Extreme spikes (10K+ concurrent) | Asynchronous — client must poll for result |

---

## 5. Project Structure

```
├── compose.dev.yml                     # Docker Compose (all services)
├── .env                                # Environment variables
├── Makefile                            # Dev commands
├── ARCHITECTURE.md                     # This file
├── README.md                           # Quick-start guide
│
└── app/
    ├── dockerfile.dev                  # Node 20 Alpine image
    └── src/
        ├── server.js                   # Express API entry point
        ├── worker.js                   # RabbitMQ consumer (pessimistic locking)
        ├── package.json
        │
        ├── config/
        │   ├── redis.js                # Redis client + cache key helpers
        │   ├── rabbitmq.js             # RabbitMQ connection factory
        │   └── swagger.js              # OpenAPI 3.0 specification
        │
        ├── controllers/
        │   ├── user.events.controller.js    # Event CRUD + Redis caching
        │   ├── user.tickets.controller.js   # Booking logic (both strategies)
        │   └── users.controller.js          # User registration + lookup
        │
        ├── routes/
        │   ├── user.events.route.js
        │   ├── user.tickets.route.js
        │   └── users.route.js
        │
        ├── middlewares/
        │   └── errorHandler.middleware.js
        │
        └── db/
            ├── init.js                 # Runs SQL on startup
            └── create_tables.sql       # Schema (users, events, tickets)
```

---

## 6. Services (Docker Compose)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| **backend** | `node:20-alpine` | 3000 | Express API server |
| **worker** | `node:20-alpine` | — | RabbitMQ consumer |
| **postgres** | `postgres:16` | 5432 (internal) | Primary data store |
| **redis** | `redis:7-alpine` | 6379 (internal) | Availability cache |
| **rabbitmq** | `rabbitmq:3-management` | 5672 / 15672 | Message queue + management UI |

Dependencies:
- `backend` and `worker` start **after** `postgres`, `redis`, and `rabbitmq` are healthy.
- Both `backend` and `worker` connect to all three infrastructure services.

---

## 7. Database Schema

```sql
users
├── id          UUID (PK)
├── username    TEXT (unique)
├── email       TEXT (unique)
└── created_at  TIMESTAMP

events
├── id                  UUID (PK)
├── event_name          TEXT (unique)
├── event_date          TIMESTAMP
├── total_tickets       INTEGER (> 0)
├── available_tickets   INTEGER (>= 0)    ← decremented on booking
├── version             INTEGER (default 1) ← used by optimistic locking
└── created_at          TIMESTAMP

tickets
├── id              UUID (PK)
├── event_id        UUID (FK → events)
├── user_id         UUID (FK → users)
├── ticket_status   ENUM('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')
└── created_at      TIMESTAMP

Indexes: event_id, user_id, ticket_status
```

---

## 8. Request Lifecycle (Queued Booking)

```
Time ─────────────────────────────────────────────────────────►

Client              API Server              Redis         RabbitMQ         Worker              Postgres
  │                      │                    │               │               │                   │
  │─── POST /booking ──►│                    │               │               │                   │
  │                      │── GET cache ──────►│               │               │                   │
  │                      │◄── "47" ──────────│               │               │                   │
  │                      │── DECR ───────────►│               │               │                   │
  │                      │◄── 46 ────────────│               │               │                   │
  │                      │── INSERT PENDING ──┼───────────────┼───────────────┼──────────────────►│
  │                      │◄── ticket_id ──────┼───────────────┼───────────────┼──────────────────│
  │                      │── publish msg ─────┼──────────────►│               │                   │
  │◄── 202 Accepted ────│                    │               │               │                   │
  │                      │                    │               │── consume ───►│                   │
  │                      │                    │               │               │── BEGIN ─────────►│
  │                      │                    │               │               │── SELECT FOR ────►│
  │                      │                    │               │               │   UPDATE          │
  │                      │                    │               │               │◄── row locked ───│
  │                      │                    │               │               │── UPDATE events ─►│
  │                      │                    │               │               │── UPDATE tickets ►│
  │                      │                    │               │               │── COMMIT ────────►│
  │                      │                    │◄── SET 46 ────┼───────────────│                   │
  │                      │                    │               │◄── ack ───────│                   │
  │                      │                    │               │               │                   │
  │─── GET /status ────►│                    │               │               │                   │
  │                      │── SELECT ──────────┼───────────────┼───────────────┼──────────────────►│
  │◄── CONFIRMED ───────│                    │               │               │                   │
```

---

## 9. Why This Architecture Gets You Hired

| Business Problem | Technical Solution |
|------------------|--------------------|
| Site crashes under load | RabbitMQ absorbs the spike; API stays responsive |
| Customers see "sold out" after paying | Pessimistic lock guarantees no overselling |
| Slow page loads during sale | Redis serves availability in microseconds |
| Lost revenue from bugs | Three independent layers — if one fails, the others still protect |
| Engineering credibility | Demonstrates distributed systems, concurrency, and database internals |
