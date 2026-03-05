import Redis from 'ioredis';

export function createRedisClient() {
    const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        retryStrategy: (times) => Math.min(times * 200, 3000),
        maxRetriesPerRequest: 3,
    });

    redis.on('connect', () => console.log('Connected to Redis'));
    redis.on('error', (err) => console.error('Redis error:', err.message));

    return redis;
}

export const CACHE_KEYS = {
    eventAvailable: (eventId) => `event:${eventId}:available`,
};

export const CACHE_TTL = 3600;
