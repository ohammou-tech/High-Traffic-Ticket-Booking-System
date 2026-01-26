import express from 'express'
import {Pool} from "pg"
import { initDatabase } from './db/init.js'
// import 'express-async-errors';
import eventsRoutes from './routes/user.events.route.js'
import ticketsRoutes from './routes/user.tickets.route.js'
import { errorHandler } from './middlewares/errorHandler.middleware.js'
import rabbitMq from 'amqplib';


function addingDbAndRabbitMqToRequest(pool, rabbitMQ) {
    return function (req, res, next) {
        req.db = pool;
        req.rabbitMq = rabbitMQ;
        next();
    };
}


async function connectToRabbitMQ() {
    try {
        const connection = await rabbitMq.connect({
            protocol: 'amqp',
            hostname: process.env.RABBITMQ_HOST || 'localhost',
            port: process.env.RABBITMQ_PORT || 5672,
            username: process.env.RABBITMQ_USER || 'guest',
            password: process.env.RABBITMQ_PASSWORD || 'guest',
        });

        const channel = await connection.createChannel();
        const queue = process.env.RABBITMQ_QUEUE || 'default_queue';
        await channel.assertQueue(queue, { durable: true });

        console.log('Connected to RabbitMQ');
        return { connection, channel, queue };
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
    }
    // Logic to connect to RabbitMQ
}

async function initServer()
{
    const host = process.env.HOST || '0.0.0.0'
    const port = process.env.PORT || '3000'

    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const pool = new Pool({
        user: process.env.POSTGRES_USER,
        host: 'postgres',
        database: process.env.POSTGRES_DB,
        password: process.env.POSTGRES_PASSWORD,
        port: process.env.POSTGRES_PORT,
    });

    await initDatabase(pool);
    const rabbitMQ = await connectToRabbitMQ();

    app.use(addingDbAndRabbitMqToRequest(pool, rabbitMQ));

    await ticketsRoutes(app);
    await eventsRoutes(app);

    app.use(errorHandler);
    app.listen(port, host, () => console.log(`server listen on ${host}:${port}`));

}

try {
    initServer();
} catch (error) {
    console.error('Failed to start server:', error);
}
