import createError from 'http-errors';
import { CACHE_KEYS, CACHE_TTL } from '../config/redis.js';

export async function listEvents(req, res) {
    const result = await req.db.query(
        'SELECT id, event_name, event_date, total_tickets, available_tickets, created_at FROM events ORDER BY event_date'
    );

    res.json({ ok: true, events: result.rows });
}

export async function getEvent(req, res) {
    const { eventId } = req.params;

    const result = await req.db.query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (result.rows.length === 0)
        throw createError.NotFound('Event not found');

    const event = result.rows[0];

    // Overlay the Redis-cached availability (more up-to-date under load)
    const cached = await req.redis.get(CACHE_KEYS.eventAvailable(eventId));
    if (cached !== null) {
        event.available_tickets = parseInt(cached);
    }

    res.json({ ok: true, event });
}

export async function createEvent(req, res) {
    const { event_name, event_date, total_tickets } = req.body;

    if (!event_name || !total_tickets)
        throw createError.BadRequest('event_name and total_tickets are required');
    if (total_tickets <= 0)
        throw createError.BadRequest('total_tickets must be a positive number');

    const result = await req.db.query(
        `INSERT INTO events (event_name, event_date, total_tickets, available_tickets)
         VALUES ($1, $2, $3, $3) RETURNING *`,
        [event_name, event_date || new Date(), total_tickets]
    );

    const event = result.rows[0];

    await req.redis.set(
        CACHE_KEYS.eventAvailable(event.id),
        event.available_tickets,
        'EX', CACHE_TTL
    );

    res.status(201).json({ ok: true, message: 'Event created', event });
}

export async function deleteEvent(req, res) {
    const { eventId } = req.params;

    const result = await req.db.query(
        'DELETE FROM events WHERE id = $1 RETURNING id', [eventId]
    );
    if (result.rowCount === 0)
        throw createError.NotFound('Event not found');

    await req.redis.del(CACHE_KEYS.eventAvailable(eventId));

    res.json({ ok: true, message: 'Event deleted' });
}
