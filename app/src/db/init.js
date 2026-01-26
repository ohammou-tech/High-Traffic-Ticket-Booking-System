import fs from 'fs';

export async function initDatabase(pool) {
    const dbScript = await fs.promises.readFile('./db/create_tables.sql', 'utf-8');
    const client = await pool.connect();
    await client.query(dbScript);
    client.release();
    console.log('Database initialized');
}