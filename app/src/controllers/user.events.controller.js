export async function getUserEvents(req, res) {
    // Logic to get user events
}

export async function createUserEvent(req, res) {
    const { event_name, total_tickets } = req.body;

    if (!event_name || !total_tickets) {
        return res.status(400).json({ error: 'Event name and total tickets are required' });
    }

}

export async function deleteUserEvent(req, res) {

}