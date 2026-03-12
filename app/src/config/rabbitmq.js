import amqplib from 'amqplib';

export async function connectToRabbitMQ() {
    const connection = await amqplib.connect({
        protocol: 'amqp',
        hostname: process.env.RABBITMQ_HOST || 'localhost',
        port: parseInt(process.env.RABBITMQ_PORT) || 5672,
        username: process.env.RABBITMQ_USER || 'guest',
        password: process.env.RABBITMQ_PASSWORD || 'guest',
    });

    const channel = await connection.createChannel();
    const queue = process.env.RABBITMQ_QUEUE || 'booking_queue';

    await channel.assertQueue(queue, { durable: true });
    await channel.prefetch(1);

    console.log(`Connected to RabbitMQ (queue: ${queue})`);
    return { connection, channel, queue };
}
