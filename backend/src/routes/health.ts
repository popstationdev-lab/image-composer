import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { register, queueDepthGauge } from "../lib/metrics";
import { getBoss, GENERATION_QUEUE } from "../lib/queue";
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

    // Queue check (pg-boss is backed by DB, so same check)
    try {
        const boss = await getBoss();
        const waiting = await boss.getQueueSize(GENERATION_QUEUE);
        queueDepthGauge.set(waiting);
        checks.queue = "ok";
        checks.queueDepth = String(waiting);
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
