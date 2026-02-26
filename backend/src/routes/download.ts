import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getSignedUrl } from "../lib/supabase";
import { requireSession } from "../middleware/session";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/download/:outputId
 * Returns a short-lived signed URL for a generation output.
 */
router.get(
    "/download/:outputId",
    requireSession,
    async (req: Request, res: Response) => {
        const outputId = req.params.outputId as string;
        const sessionId = req.sessionId;

        // Find output and verify session ownership via the generation
        const output = await prisma.generationOutput.findFirst({
            where: { id: outputId, deletedAt: null },
            include: { generation: { select: { sessionId: true } } },
        });

        if (!output || output.generation.sessionId !== sessionId) {
            res.status(404).json({ error: "Output not found" });
            return;
        }

        try {
            const url = await getSignedUrl(output.storageKey, 300); // 5-minute TTL
            res.json({ url, expiresInSeconds: 300 });
        } catch (err) {
            logger.error({ outputId, err }, "Failed to generate download URL");
            res.status(500).json({ error: "Failed to generate download URL" });
        }
    }
);

export default router;
