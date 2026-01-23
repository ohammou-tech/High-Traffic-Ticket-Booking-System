import express from 'express'
import {Pool} from "pg"
import 'express-async-errors';
import eventsRoutes from './routes/user.events.route.js'
import ticketsRoutes from './routes/user.tickets.route.js'
import { errorHandler } from './middlewares/errorHandler.middleware.js'


function addingDbToRequest(pool) {
    return function (req, res, next) {
        req.db = pool;
        next();
    };
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

    app.use(addingDbToRequest(pool));

    await ticketsRoutes(app);
    await eventsRoutes(app);

    app.use(errorHandler);

    app.listen(port, host, () => console.log(`server listen on ${host}:${port}`));


}

initServer();
