import { listEvents, getEvent, createEvent, deleteEvent } from '../controllers/user.events.controller.js';

export default function routes(app) {
    app.get('/api/events', listEvents);
    app.get('/api/events/:eventId', getEvent);
    app.post('/api/events', createEvent);
    app.delete('/api/events/:eventId', deleteEvent);
}
