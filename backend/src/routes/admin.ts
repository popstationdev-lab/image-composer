import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { deleteFromStorage } from "../lib/supabase";
import { getGenerationQueue as getQueue, GENERATION_QUEUE, enqueueGeneration } from "../lib/queue";
import { runRetentionPurge } from "../jobs/retentionJob";
import { logger } from "../lib/logger";

const router = Router();

/** Simple admin secret guard */
function adminGuard(req: Request, res: Response, next: NextFunction): void {
    const secret = req.headers["x-admin-secret"];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
}

router.use(adminGuard);

/** GET /admin/metrics — queue depth + overall stats */
router.get("/metrics", async (_req: Request, res: Response) => {
    try {
        const queue = getQueue();
        const counts = await queue.getJobCounts(
            "wait",
            "active",
            "failed",
            "completed",
            "delayed"
        );

        const [totalGenerations, failedGenerations, completedGenerations] =
            await Promise.all([
                prisma.generation.count(),
                prisma.generation.count({ where: { status: "failed" } }),
                prisma.generation.count({ where: { status: "completed" } }),
            ]);

        res.json({
            queue: {
                waiting: counts.wait,
                active: counts.active,
                failed: counts.failed,
                completed: counts.completed,
                delayed: counts.delayed
            },
            generations: { total: totalGenerations, failed: failedGenerations, completed: completedGenerations },
        });
    } catch (err) {
        logger.error({ err }, "Admin metrics error");
        res.status(500).json({ error: "Failed to fetch metrics" });
    }
});

/** POST /admin/retry-job — re-enqueue a failed generation */
router.post("/retry-job", async (req: Request, res: Response) => {
    const { generationId } = req.body as { generationId: string };
    if (!generationId) {
        res.status(400).json({ error: "generationId required" });
        return;
    }

    const gen = await prisma.generation.findFirst({ where: { id: generationId } });
    if (!gen) {
        res.status(404).json({ error: "Generation not found" });
        return;
    }

    await prisma.generation.update({
        where: { id: generationId },
        data: {
            status: "queued",
            failureReason: null,
            startedAt: null,
            completedAt: null,
            kieTaskIds: [],
            variationsDone: 0,
        },
    });

    await enqueueGeneration(generationId, gen.sessionId);

    logger.info({ generationId }, "Admin: generation re-enqueued");
    res.json({ generationId, status: "queued" });
});

/** POST /admin/purge — force-purge a session immediately */
router.post("/purge", async (req: Request, res: Response) => {
    const { sessionId } = req.body as { sessionId: string };
    if (!sessionId) {
        res.status(400).json({ error: "sessionId required" });
        return;
    }

    const generations = await prisma.generation.findMany({
        where: { sessionId, deletedAt: null },
        include: { outputs: { where: { deletedAt: null } } },
    });

    let keysDeleted = 0;
    for (const gen of generations) {
        const keys = gen.outputs.map((o) => o.storageKey);
        if (keys.length) {
            await deleteFromStorage(keys);
            keysDeleted += keys.length;
        }
        await prisma.generationOutput.updateMany({
            where: { generationId: gen.id },
            data: { deletedAt: new Date() },
        });
        await prisma.generation.update({
            where: { id: gen.id },
            data: { deletedAt: new Date() },
        });
    }

    await prisma.jobLog.create({
        data: {
            event: "admin.purge",
            payload: { sessionId, generationsDeleted: generations.length, keysDeleted },
        },
    });

    logger.warn({ sessionId, keysDeleted }, "Admin: session force-purged");
    res.json({ sessionId, generationsDeleted: generations.length, keysDeleted });
});

/** POST /admin/run-retention — trigger retention job on demand */
router.post("/run-retention", async (_req: Request, res: Response) => {
    runRetentionPurge()
        .then(() => logger.info("Admin: manual retention run complete"))
        .catch((err) => logger.error({ err }, "Admin: retention run error"));
    res.json({ message: "Retention job triggered" });
});

export default router;
