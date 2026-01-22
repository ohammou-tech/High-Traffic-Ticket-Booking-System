import express from 'express'
import {Pool} from pg

async function initServer()
{
    const host = process.env.HOST || '0.0.0.0'
    const port = process.env.PORT || '3000'

    const app = express();

    app.listen(port, host, () => console.log(`server listen on ${host}:${port}`));


}

initServer();
