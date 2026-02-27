import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { uploadToStorage } from "../lib/supabase";
import { isSafeImage } from "../lib/safety";
import { requireSession } from "../middleware/session";
import { uploadRateLimit } from "../middleware/rateLimit";
import { logger } from "../lib/logger";
import { storageUploadCounter as uploadMetric } from "../lib/metrics";

const router = Router();

const ACCEPTED_MIME = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE_BYTES, files: 8 },
    fileFilter: (_req, file, cb) => {
        const ext = file.originalname.toLowerCase();
        const isHeic = ext.endsWith(".heic") || ext.endsWith(".heif");
        if (ACCEPTED_MIME.has(file.mimetype) || isHeic) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    },
});

const roleSchema = z.enum(["model", "garment", "fabric", "style_ref"]);

/**
 * POST /api/upload-assets
 * Fields: modelImage, garmentImage, fabricImage?, styleRefs[]?
 * Body field: sessionId (optional — if not passed, one is created)
 */
router.post(
    "/upload-assets",
    uploadRateLimit,
    requireSession,
    upload.fields([
        { name: "modelImage", maxCount: 1 },
        { name: "garmentImage", maxCount: 1 },
        { name: "fabricImage", maxCount: 1 },
        { name: "styleRefs", maxCount: 3 },
    ]),
    async (req: Request, res: Response) => {
        try {
            const files = req.files as Record<string, Express.Multer.File[]>;
            const sessionId = req.sessionId;

            // Ensure we have the required assets
            if (!files?.modelImage?.[0] || !files?.garmentImage?.[0]) {
                res.status(400).json({ error: "modelImage and garmentImage are required" });
                return;
            }

            // Upsert Session row
            await prisma.session.upsert({
                where: { id: sessionId },
                update: { lastActiveAt: new Date() },
                create: {
                    id: sessionId,
                    userAgent: req.headers["user-agent"] ?? null,
                    ipHash: req.ip ? Buffer.from(req.ip).toString("base64") : null,
                },
            });

            const assetEntries: Array<{
                file: Express.Multer.File;
                role: string;
            }> = [
                    { file: files.modelImage[0], role: "model" },
                    { file: files.garmentImage[0], role: "garment" },
                    ...(files.fabricImage ?? []).map((f) => ({ file: f, role: "fabric" })),
                    ...(files.styleRefs ?? []).map((f) => ({ file: f, role: "style_ref" })),
                ];

            const createdAssets = [];

            for (const entry of assetEntries) {
                const { file, role } = entry;

                // Safety check
                const safe = await isSafeImage(file.buffer, file.mimetype);
                if (!safe) {
                    res.status(422).json({
                        error: `Image failed safety check (${role})`,
                    });
                    return;
                }

                // Read dimensions
                let width: number | null = null;
                let height: number | null = null;
                try {
                    const meta = await sharp(file.buffer).metadata();
                    width = meta.width ?? null;
                    height = meta.height ?? null;
                } catch {
                    // Non-fatal — HEIC might fail sharp
                }

                // Create Asset row first to get the ID
                const asset = await prisma.asset.create({
                    data: {
                        sessionId,
                        filename: file.originalname,
                        mime: file.mimetype,
                        sizeBytes: file.size,
                        width,
                        height,
                        role,
                        storageKey: "pending", // will be updated after upload
                    },
                });

                const storageKey = `sessions/${sessionId}/assets/${asset.id}/${file.originalname}`;

                // Upload
                await uploadToStorage(storageKey, file.buffer, file.mimetype);
                uploadMetric.inc();

                // Update key
                await prisma.asset.update({
                    where: { id: asset.id },
                    data: { storageKey },
                });

                createdAssets.push({
                    id: asset.id,
                    role,
                    filename: file.originalname,
                    width,
                    height,
                    storageKey,
                });

                logger.info({ assetId: asset.id, role, storageKey }, "Asset uploaded");
            }

            res.status(201).json({ sessionId, assets: createdAssets });
        } catch (err) {
            logger.error({ err }, "Upload assets error");
            res.status(500).json({ error: "Failed to upload assets" });
        }
    }
);

export default router;
