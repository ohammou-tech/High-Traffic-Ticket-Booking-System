import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initDatabase(pool) {
    const dbScript = await fs.promises.readFile(
        join(__dirname, 'create_tables.sql'), 'utf-8'
    );
    const client = await pool.connect();
    await client.query(dbScript);
    client.release();
    console.log('Database initialized');
}
