import createError from 'http-errors';

export async function registerUser(req, res) {
    const { username, email } = req.body;

    if (!username || !email)
        throw createError.BadRequest('username and email are required');

    const result = await req.db.query(
        'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *',
        [username, email]
    );

    res.status(201).json({ ok: true, user: result.rows[0] });
}

export async function getUser(req, res) {
    const { userId } = req.params;

    const result = await req.db.query(
        'SELECT * FROM users WHERE id = $1', [userId]
    );
    if (result.rows.length === 0)
        throw createError.NotFound('User not found');

    res.json({ ok: true, user: result.rows[0] });
}

export async function getUserTickets(req, res) {
    const { userId } = req.params;

    const result = await req.db.query(
        `SELECT t.id, t.event_id, t.ticket_status, t.created_at,
                e.event_name, e.event_date
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         WHERE t.user_id = $1
         ORDER BY t.created_at DESC`,
        [userId]
    );

    res.json({ ok: true, tickets: result.rows });
}
