import { getUserEvents, createUserEvent, deleteUserEvent } from '../controllers/user.events.controller.js';

export default async function routes(app) {
    app.get('/user/events', getUserEvents);
    app.post('/user/events', createUserEvent);
    app.delete('/user/events/:eventId', deleteUserEvent);
}

