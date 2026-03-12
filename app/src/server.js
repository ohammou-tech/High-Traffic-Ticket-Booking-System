import express from 'express';
import { Pool } from 'pg';
import swaggerUi from 'swagger-ui-express';
import { initDatabase } from './db/init.js';
import { createRedisClient } from './config/redis.js';
import { connectToRabbitMQ } from './config/rabbitmq.js';
import swaggerSpec from './config/swagger.js';
import eventsRoutes from './routes/user.events.route.js';
import bookingRoutes from './routes/user.tickets.route.js';
import usersRoutes from './routes/users.route.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';

function injectDependencies(pool, redis, rabbitMQ) {
    return (req, res, next) => {
        req.db = pool;
        req.redis = redis;
        req.rabbitMq = rabbitMQ;
        next();
    };
}

async function initServer() {
    const host = process.env.HOST || '0.0.0.0';
    const port = process.env.PORT || 3000;

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const pool = new Pool({
        user: process.env.POSTGRES_USER,
        host: 'postgres',
        database: process.env.POSTGRES_DB,
        password: process.env.POSTGRES_PASSWORD,
        port: parseInt(process.env.POSTGRES_PORT) || 5432,
    });

    await initDatabase(pool);
    const redis = createRedisClient();
    const rabbitMQ = await connectToRabbitMQ();

    app.use(injectDependencies(pool, redis, rabbitMQ));

    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

    app.get('/api/health', (req, res) => {
        res.json({ ok: true, timestamp: new Date().toISOString() });
    });

    usersRoutes(app);
    eventsRoutes(app);
    bookingRoutes(app);

    app.use(errorHandler);

    app.listen(port, host, () => console.log(`Server listening on ${host}:${port}`));
}

initServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
