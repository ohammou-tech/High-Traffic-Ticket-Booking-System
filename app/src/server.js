import express from 'express'
import {Pool} from "pg"
import eventsRoutes from './routes/user.events.route.js'
import ticketsRoutes from './routes/user.tickets.route.js'

async function initServer()
{
    const host = process.env.HOST || '0.0.0.0'
    const port = process.env.PORT || '3000'

    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    

    await ticketsRoutes(app);
    await eventsRoutes(app);

    const pool = new Pool({
        user: process.env.POSTGRES_USER,
        host: 'postgres',
        database: process.env.POSTGRES_DB,
        password: process.env.POSTGRES_PASSWORD,
        port: process.env.POSTGRES_PORT,
    });

    app.listen(port, host, () => console.log(`server listen on ${host}:${port}`));


}

initServer();
