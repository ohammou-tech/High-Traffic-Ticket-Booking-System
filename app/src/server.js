import express from 'express'

async function initServer()
{
    const host = process.env.HOST || '0.0.0.0'
    const port = process.env.PORT || '3000'

    const app = express();

    app.listen(port, host, () => console.log(`server listen on ${host}:${port}`));
}

initServer();