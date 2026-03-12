import { registerUser, getUser, getUserTickets } from '../controllers/users.controller.js';

export default function routes(app) {
    app.post('/api/users', registerUser);
    app.get('/api/users/:userId', getUser);
    app.get('/api/users/:userId/tickets', getUserTickets);
}

