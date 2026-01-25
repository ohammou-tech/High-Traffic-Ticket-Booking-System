import createError from 'http-errors';

export async function getUserEvents(req, res) {

    console.log('Request params:', req.params);

    if (!req.params || !req.params.id)
        throw createError.Unauthorized('User not authenticated');
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId))
        throw createError.BadRequest('Invalid user ID');

    const events = await req.db.query(`SELECT * FROM events WHERE id = $1`, [userId]);

    res.status(200).json({
        ok: true,
        events: events.rows
    });
}

export async function createUserEvent(req, res) {
    const { event_name, total_tickets } = req.body;

    if (!event_name || !total_tickets) 
        throw createError.BadRequest('Event name and total tickets are required');

    console.log('Creating event:', event_name, total_tickets);
    const changes = await req.db.query(`INSERT INTO events (event_name, total_tickets) VALUES ($1, $2) RETURNING *`,
        [event_name, total_tickets]);
    
    if (changes.rowCount === 0)
        throw createError.InternalServerError('Failed to create event');
    
    res.status(201).json({
        ok: true,
        message: 'Event created successfully'
    });
}

export async function deleteUserEvent(req, res) {

}