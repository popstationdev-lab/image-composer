import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
    if (connection) return connection;
    connection = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null, // Required by BullMQ
    });
    connection.on("error", (err) => {
        logger.error({ err }, "Redis connection error");
    });
    return connection;
}

export const GENERATION_QUEUE = "generation-queue";

let generationQueue: Queue | null = null;

export function getGenerationQueue(): Queue {
    if (generationQueue) return generationQueue;
    generationQueue = new Queue(GENERATION_QUEUE, {
        connection: getRedisConnection(),
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 10000, // 10s
            },
            removeOnComplete: true,
            removeOnFail: false,
        },
    });
    return generationQueue;
}

export async function enqueueGeneration(
    generationId: string,
    sessionId: string
): Promise<string> {
    const queue = getGenerationQueue();
    const job = await queue.add(
        "generate",
        { generationId, sessionId },
        {
            jobId: generationId // Unique per generation
        }
    );

    if (!job.id) {
        throw new Error("Failed to enqueue generation job in BullMQ");
    }

    logger.info({ generationId, jobId: job.id }, "Generation job enqueued (BullMQ)");
    return job.id;
}

export async function stopQueue(): Promise<void> {
    if (generationQueue) {
        await generationQueue.close();
        generationQueue = null;
    }
    if (connection) {
        await connection.quit();
        connection = null;
    }
}
