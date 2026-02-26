import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getSignedUrl } from "../lib/supabase";
import { isSafePrompt } from "../lib/safety";
import { enqueueGeneration } from "../lib/queue";
import { requireSession } from "../middleware/session";
import { generateRateLimit } from "../middleware/rateLimit";
import { logger } from "../lib/logger";
import { generationCounter } from "../lib/metrics";

const router = Router();

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const generateSchema = z.object({
    sessionId: z.string().min(1),
    assetIds: z.array(z.string().min(1)).min(1).max(8),
    prompt: z.string().min(1).max(2000),
    params: z.object({
        preserveHead: z.boolean().optional(),
        preserveOtherGarments: z.boolean().optional(),
        view: z.enum(["front", "back", "side"]).optional(),
        fitStrictness: z.number().min(0).max(100).optional(),
        shadowEnforcement: z.boolean().optional(),
        shadowLevel: z.enum(["soft", "medium", "hard"]).optional(),
        framing: z.enum(["preserve", "waist-legs", "full-body"]).optional(),
        resolution: z.enum(["2k", "4k", "8k"]).optional(),
        variations: z.number().int().min(1).max(3).optional(),
        quality: z.enum(["fast", "balanced", "hd"]).optional(),
        customPrompt: z.string().max(2000).optional(),
    }),
    parentGenerationId: z.string().optional(),
});

// ─── Helper: add signed URLs to outputs ──────────────────────────────────────

async function withSignedUrls(
    outputs: Array<{ storageKey: string;[key: string]: unknown }>
) {
    return Promise.all(
        outputs.map(async (o) => ({
            ...o,
            url: await getSignedUrl(o.storageKey, 300).catch(() => null),
        }))
    );
}

// ─── POST /api/generate ───────────────────────────────────────────────────────

router.post(
    "/generate",
    requireSession,
    generateRateLimit,
    async (req: Request, res: Response) => {
        const parsed = generateSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.flatten() });
            return;
        }

        const { assetIds, prompt, params, parentGenerationId } = parsed.data;
        const sessionId = req.sessionId;

        // Prompt safety
        if (!isSafePrompt(prompt)) {
            res.status(422).json({ error: "Prompt contains disallowed content" });
            return;
        }

        // Verify assets belong to this session
        const assets = await prisma.asset.findMany({
            where: { id: { in: assetIds }, sessionId, deletedAt: null },
        });
        if (assets.length !== assetIds.length) {
            res.status(404).json({ error: "One or more assets not found or not owned by this session" });
            return;
        }

        // Create generation row
        const generation = await prisma.generation.create({
            data: {
                sessionId,
                parentGenerationId: parentGenerationId ?? null,
                prompt,
                params: params as object,
                status: "queued",
                variationsTotal: params.variations ?? 1,
                assets: {
                    create: assetIds.map((assetId) => ({ assetId })),
                },
            },
        });

        // Enqueue pg-boss job
        await enqueueGeneration(generation.id, sessionId);

        await prisma.jobLog.create({
            data: {
                generationId: generation.id,
                event: "job.queued",
                payload: { assetIds, prompt: prompt.slice(0, 200) },
            },
        });

        generationCounter.inc({ status: "queued" });

        logger.info({ generationId: generation.id, sessionId }, "Generation queued");

        res.status(201).json({
            generationId: generation.id,
            status: generation.status,
            createdAt: generation.createdAt,
        });
    }
);

// ─── GET /api/generation/:id ──────────────────────────────────────────────────

router.get(
    "/generation/:id",
    requireSession,
    async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const sessionId = req.sessionId;

        const gen = await prisma.generation.findFirst({
            where: { id, sessionId, deletedAt: null },
            include: {
                outputs: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
                assets: { include: { asset: true } },
            },
        });

        if (!gen) {
            res.status(404).json({ error: "Generation not found" });
            return;
        }

        const outputsWithUrls = await withSignedUrls(gen.outputs);

        res.json({
            id: gen.id,
            status: gen.status,
            prompt: gen.prompt,
            params: gen.params,
            parentGenerationId: gen.parentGenerationId,
            kieTaskIds: gen.kieTaskIds,
            variationsTotal: gen.variationsTotal,
            variationsDone: gen.variationsDone,
            failureReason: gen.failureReason,
            createdAt: gen.createdAt,
            startedAt: gen.startedAt,
            completedAt: gen.completedAt,
            outputs: outputsWithUrls,
            assets: gen.assets.map((ga: { asset: { id: string; role: string | null; filename: string; width: number | null; height: number | null } }) => ({
                id: ga.asset.id,
                role: ga.asset.role,
                filename: ga.asset.filename,
                width: ga.asset.width,
                height: ga.asset.height,
            })),
        });
    }
);

// ─── POST /api/generation/:id/update ─────────────────────────────────────────

router.post(
    "/generation/:id/update",
    requireSession,
    generateRateLimit,
    async (req: Request, res: Response) => {
        const parentGenerationId = req.params.id as string;
        const sessionId = req.sessionId;

        // Verify parent belongs to session
        const parent = await prisma.generation.findFirst({
            where: { id: parentGenerationId, sessionId, deletedAt: null },
            include: { assets: true },
        });
        if (!parent) {
            res.status(404).json({ error: "Parent generation not found" });
            return;
        }

        const parsed = generateSchema.safeParse({
            ...req.body,
            sessionId,
            // Re-use parent's assetIds if not provided
            assetIds:
                req.body.assetIds ??
                parent.assets.map((ga: { assetId: string }) => ga.assetId),
        });
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.flatten() });
            return;
        }

        const { assetIds, prompt, params } = parsed.data;

        if (!isSafePrompt(prompt)) {
            res.status(422).json({ error: "Prompt contains disallowed content" });
            return;
        }

        const newGen = await prisma.generation.create({
            data: {
                sessionId,
                parentGenerationId,
                prompt,
                params: params as object,
                status: "queued",
                variationsTotal: params.variations ?? 1,
                assets: {
                    create: assetIds.map((assetId) => ({ assetId })),
                },
            },
        });

        await enqueueGeneration(newGen.id, sessionId);
        generationCounter.inc({ status: "queued" });

        res.status(201).json({
            generationId: newGen.id,
            status: newGen.status,
            createdAt: newGen.createdAt,
            parentGenerationId,
        });
    }
);

// ─── DELETE /api/generation/:id ───────────────────────────────────────────────

router.delete(
    "/generation/:id",
    requireSession,
    async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const sessionId = req.sessionId;

        const gen = await prisma.generation.findFirst({
            where: { id, sessionId, deletedAt: null },
        });
        if (!gen) {
            res.status(404).json({ error: "Generation not found" });
            return;
        }

        await prisma.generation.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        logger.info({ generationId: id }, "Generation soft-deleted");
        res.status(204).send();
    }
);

export default router;
