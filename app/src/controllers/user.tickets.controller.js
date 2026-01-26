import createError from 'http-errors';

export async function getUserTickets(req, res) {

    if (!req.params || !req.params.id)
        throw createError.Unauthorized('User not authenticated');


    const tickets = await req.db.query(`SELECT * FROM tickets WHERE event_id = $1`, [userId]);

    res.status(200).json({
        ok: true,
        tickets: tickets.rows
    });
}

export async function createUserTicket(req, res) {
    // Logic to create a new user ticket
    const { event_id } = req.body;

    const result = await req.db.query(`INSERT INTO tickets (event_id, ticket_status) VALUES ($1, $2) RETURNING id`, [event_id, 'PENDING']);

    const channel = req.rabbitMq.channel;
    const queue = req.rabbitMq.queue;

    const message = {
        ticket_id: result.rows[0].id,
        event_id: event_id,
        status: 'PENDING'
    };
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));

    res.status(201).json({
        ok: true,
        message: 'Ticket booking request sent successfully',
        ticket_id: result.rows[0].id,
        status: 'PENDING'
    });
}

export async function deleteUserTicket(req, res) {
    // Logic to delete a user ticket
}