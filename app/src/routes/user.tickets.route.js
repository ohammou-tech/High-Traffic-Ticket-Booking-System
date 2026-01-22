import { getUserTickets, createUserTicket, deleteUserTicket } from '../controllers/user.tickets.controller.js';

export default async function routes(app) {

    app.get('/user/tickets', getUserTickets);
    app.post('/user/book', createUserTicket);
    // app.delete('/user/tickets/:ticketId', deleteUserTicket);
}
