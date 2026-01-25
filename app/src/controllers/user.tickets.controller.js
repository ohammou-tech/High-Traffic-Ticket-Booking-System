import createError from 'http-errors';

export async function getUserTickets(req, res) {

    if (!req.params || !req.params.id)
        throw createError.Unauthorized('User not authenticated');

    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId))
        throw createError.BadRequest('Invalid user ID');

    const tickets = await req.db.query(`SELECT * FROM tickets WHERE user_id = $1`, [userId]);

    res.status(200).json({
        ok: true,
        tickets: tickets.rows
    });
}

export async function createUserTicket(req, res) {
    // Logic to create a new user ticket
    // const { event_id, price } = req.body;
    const channel = req.rabbitMq.channel;
    const queue = req.rabbitMq.queue;

    channel.sendToQueue(queue, Buffer.from("New ticket booking request"));

    res.status(201).json({
        ok: true,
        message: 'Ticket booking request sent successfully'
    });
}

export async function deleteUserTicket(req, res) {
    // Logic to delete a user ticket
}