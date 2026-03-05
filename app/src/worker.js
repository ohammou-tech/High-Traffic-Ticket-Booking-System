import { Pool } from 'pg';
import { createRedisClient, CACHE_KEYS } from './config/redis.js';
import { connectToRabbitMQ } from './config/rabbitmq.js';

const pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: 'postgres',
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
});

const redis = createRedisClient();

/**
 * Processes a single booking message using PESSIMISTIC LOCKING.
 *
 * SELECT ... FOR UPDATE acquires a row-level exclusive lock on the event row.
 * All other transactions attempting to lock the same row will block until this
 * transaction commits or rolls back. This guarantees serialized access to the
 * available_tickets counter -- no two workers can decrement it simultaneously,
 * which prevents overselling even under extreme concurrency.
 */
async function processBooking(msg, channel) {
    const { ticket_id, event_id } = JSON.parse(msg.content.toString());
    console.log(`Processing booking: ticket=${ticket_id} event=${event_id}`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // PESSIMISTIC LOCK: row-level exclusive lock prevents concurrent reads
        const eventResult = await client.query(
            'SELECT available_tickets FROM events WHERE id = $1 FOR UPDATE',
            [event_id]
        );

        if (eventResult.rows.length === 0) {
            await client.query(
                "UPDATE tickets SET ticket_status = 'REJECTED' WHERE id = $1",
                [ticket_id]
            );
            await client.query('COMMIT');
            await redis.incr(CACHE_KEYS.eventAvailable(event_id));
            console.log(`REJECTED (event not found): ticket=${ticket_id}`);
            channel.ack(msg);
            return;
        }

        const available = eventResult.rows[0].available_tickets;

        if (available > 0) {
            await client.query(
                'UPDATE events SET available_tickets = available_tickets - 1 WHERE id = $1',
                [event_id]
            );
            await client.query(
                "UPDATE tickets SET ticket_status = 'CONFIRMED' WHERE id = $1",
                [ticket_id]
            );
            await client.query('COMMIT');

            const newAvailable = available - 1;
            await redis.set(CACHE_KEYS.eventAvailable(event_id), newAvailable);
            console.log(`CONFIRMED: ticket=${ticket_id} remaining=${newAvailable}`);
        } else {
            await client.query(
                "UPDATE tickets SET ticket_status = 'REJECTED' WHERE id = $1",
                [ticket_id]
            );
            await client.query('COMMIT');

            await redis.incr(CACHE_KEYS.eventAvailable(event_id));
            console.log(`REJECTED (sold out): ticket=${ticket_id}`);
        }

        channel.ack(msg);
    } catch (error) {
        await client.query('ROLLBACK');
        await redis.incr(CACHE_KEYS.eventAvailable(event_id));
        console.error(`Error processing ticket=${ticket_id}:`, error.message);
        // Requeue the message so it can be retried
        channel.nack(msg, false, true);
    } finally {
        client.release();
    }
}

async function startWorker() {
    console.log('Starting booking worker...');
    const { channel, queue } = await connectToRabbitMQ();

    console.log(`Worker consuming from queue: ${queue}`);
    channel.consume(queue, (msg) => {
        if (msg) processBooking(msg, channel);
    });
}

startWorker().catch((error) => {
    console.error('Worker failed to start:', error);
    process.exit(1);
});
