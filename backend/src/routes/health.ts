import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { register, queueDepthGauge } from "../lib/metrics";
import { getGenerationQueue, GENERATION_QUEUE } from "../lib/queue";
import { logger } from "../lib/logger";

const router = Router();

/** GET /health — liveness + readiness probe */
router.get("/health", async (_req: Request, res: Response) => {
    const checks: Record<string, string> = {};

    // DB check
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.db = "ok";
    } catch {
        checks.db = "error";
    }

    // Queue check (BullMQ)
    try {
        const queue = getGenerationQueue();
        const counts = await queue.getJobCounts("waiting", "delayed");
        const depth = counts.waiting + counts.delayed;
        queueDepthGauge.set(depth);
        checks.queue = "ok";
        checks.queueDepth = String(depth);
    } catch {
        checks.queue = "error";
    }

    const healthy = Object.values(checks).every((v) => v === "ok" || !isNaN(Number(v)));

    res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "degraded",
        ...checks,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

/** GET /metrics — Prometheus text format */
router.get("/metrics", async (_req: Request, res: Response) => {
    try {
        res.set("Content-Type", register.contentType);
        res.send(await register.metrics());
    } catch (err) {
        logger.error({ err }, "Metrics endpoint error");
        res.status(500).send("Error collecting metrics");
    }
});

export default router;
