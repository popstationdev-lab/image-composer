import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getSignedUrl } from "../lib/supabase";
import { requireSession } from "../middleware/session";

const router = Router();

/**
 * GET /api/history?sessionId=&limit=20&cursor=
 * Keyset pagination on createdAt DESC.
 */
router.get("/history", requireSession, async (req: Request, res: Response) => {
    const sessionId = req.sessionId;
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 100);
    const cursor = req.query.cursor as string | undefined;

    const generations = await prisma.generation.findMany({
        where: {
            sessionId,
            deletedAt: null,
            ...(cursor
                ? { createdAt: { lt: new Date(cursor) } }
                : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        include: {
            outputs: {
                where: { deletedAt: null },
                orderBy: { createdAt: "asc" },
                take: 1, // only thumbnail (first output)
            },
        },
    });

    const hasMore = generations.length > limit;
    const items = generations.slice(0, limit);

    const result = await Promise.all(
        items.map(async (gen) => {
            const firstOutput = gen.outputs[0];
            let thumbnailUrl: string | null = null;

            if (firstOutput) {
                thumbnailUrl = await getSignedUrl(firstOutput.storageKey, 300).catch(() => null);
            }

            const expiresAt = new Date(
                gen.createdAt.getTime() +
                parseInt(process.env.RETENTION_DAYS ?? "24", 10) * 24 * 60 * 60 * 1000
            );

            return {
                id: gen.id,
                status: gen.status,
                prompt: gen.prompt,
                shortPrompt: gen.prompt.slice(0, 120),
                params: gen.params,
                parentGenerationId: gen.parentGenerationId,
                createdAt: gen.createdAt,
                completedAt: gen.completedAt,
                expiresAt,
                thumbnailUrl,
                outputCount: gen.outputs.length,
            };
        })
    );

    res.json({
        items: result,
        nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
        hasMore,
    });
});

export default router;
