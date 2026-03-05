import {
    bookTicket,
    bookTicketOptimistic,
    getTicketStatus,
    getEventTickets,
    cancelTicket,
} from '../controllers/user.tickets.controller.js';

export default function routes(app) {
    app.post('/api/booking', bookTicket);
    app.post('/api/booking/optimistic', bookTicketOptimistic);
    app.get('/api/booking/:ticketId/status', getTicketStatus);
    app.get('/api/events/:eventId/tickets', getEventTickets);
    app.delete('/api/booking/:ticketId', cancelTicket);
}
