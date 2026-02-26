import { Job } from "bullmq";
import axios from "axios";
import { prisma } from "../lib/prisma";
import { getSignedUrl, uploadToStorage } from "../lib/supabase";
import {
    kieCreateTask,
    kieQueryTask,
    resolutionMap,
    aspectRatioFromParams,
} from "../lib/kieai";
import { logger } from "../lib/logger";
import { generationCounter, generationLatencyHistogram } from "../lib/metrics";

export interface GenerationJobData {
    generationId: string;
    sessionId: string;
}

/**
 * Process a single generation job for BullMQ.
 */
export async function processGenerationJob(job: Job<GenerationJobData>): Promise<void> {
    const { generationId } = job.data;
    const startedAt = new Date();

    logger.info({ generationId, jobId: job.id }, "Processing generation job (BullMQ)");

    await prisma.generation.update({
        where: { id: generationId },
        data: { status: "processing", startedAt },
    });

    await prisma.jobLog.create({
        data: {
            generationId,
            event: "job.started",
            payload: { bullMqJobId: job.id },
        },
    });

    try {
        const generation = await prisma.generation.findUniqueOrThrow({
            where: { id: generationId },
            include: {
                assets: {
                    include: { asset: true },
                },
            },
        });

        const params = generation.params as Record<string, unknown>;
        const prompt = generation.prompt;
        const variations = (params.variations as number) ?? 1;
        const resolution = resolutionMap((params.resolution as string) ?? "4k");
        const aspectRatio = aspectRatioFromParams({
            framing: params.framing as string,
            view: params.view as string,
        });

        // Get 1-hour signed URLs so Kie AI can fetch the images
        const assetUrls: string[] = [];
        for (const ga of generation.assets) {
            const signedUrl = await getSignedUrl(ga.asset.storageKey, 3600);
            assetUrls.push(signedUrl);
        }

        const backendPublicUrl =
            process.env.BACKEND_PUBLIC_URL ?? "http://localhost:3001";
        const callBackUrl = `${backendPublicUrl}/webhooks/kieai`;

        // Submit one Kie AI task per variation
        const taskIds: string[] = [];
        for (let i = 0; i < variations; i++) {
            const taskId = await kieCreateTask({
                prompt,
                imageUrls: assetUrls,
                aspectRatio,
                resolution,
                outputFormat: "png",
                callBackUrl,
            });
            taskIds.push(taskId);

            logger.info({ generationId, taskId, variation: i + 1 }, "Kie AI task submitted");

            await prisma.jobLog.create({
                data: {
                    generationId,
                    event: "kie.submitted",
                    payload: { taskId, variation: i + 1 },
                },
            });
        }

        // Store all task IDs
        await prisma.generation.update({
            where: { id: generationId },
            data: {
                kieTaskIds: taskIds,
                variationsTotal: variations,
                variationsDone: 0,
            },
        });

        logger.info({ generationId, taskIds }, "All Kie AI tasks submitted. Starting safety polling...");

        // POLLING FALLBACK:
        // Especially useful for local development where webhooks can't reach localhost.
        // We poll for up to 10 minutes.
        const startTime = Date.now();
        const maxWait = 10 * 60 * 1000; // 10 minutes
        const pollInterval = 10000; // 10 seconds

        const pendingTasks = new Set(taskIds);

        while (pendingTasks.size > 0 && (Date.now() - startTime) < maxWait) {
            for (const taskId of Array.from(pendingTasks)) {
                try {
                    const record = await kieQueryTask(taskId);
                    if (record.state === "success" || record.state === "fail") {
                        logger.info({ generationId, taskId, state: record.state }, "Polling found terminal state");
                        await handleKieCallback(
                            taskId,
                            record.state as "success" | "fail",
                            record.resultJson,
                            record.failMsg
                        );
                        pendingTasks.delete(taskId);
                    }
                } catch (err) {
                    logger.warn({ taskId, err }, "Polling: failed to query task info");
                }
            }

            if (pendingTasks.size > 0) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }

        if (pendingTasks.size > 0) {
            logger.warn({ generationId, pendingCount: pendingTasks.size }, "Polling timed out for some tasks");
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ generationId, err }, "Generation job failed");

        await prisma.generation.update({
            where: { id: generationId },
            data: { status: "failed", failureReason: msg, completedAt: new Date() },
        });

        await prisma.jobLog.create({
            data: {
                generationId,
                event: "job.failed",
                payload: { error: msg },
            },
        });

        generationCounter.inc({ status: "failed" });
        throw err;
    }
}

/**
 * Handle a Kie AI webhook callback.
 * Looks up the generation via the JobLog (event: "kie.submitted"),
 * downloads result images, uploads to Supabase, and marks generation complete.
 */
export async function handleKieCallback(
    taskId: string,
    state: "success" | "fail",
    resultJson: string | null,
    failMsg: string | null
): Promise<void> {
    logger.info({ taskId, state }, "Received Kie AI callback");

    // Find the generation. Searching Generation table directly by taskId in kieTaskIds is more robust.
    const generation = await prisma.generation.findFirst({
        where: {
            kieTaskIds: {
                array_contains: taskId
            }
        }
    });

    if (!generation) {
        logger.warn({ taskId }, "No generation found for Kie AI callback taskId");
        return;
    }

    const generationId = generation.id;

    // IDEMPOTENCY CHECK: Check if this taskId was already processed
    const existingOutput = await prisma.generationOutput.findFirst({
        where: { generationId, kieTaskId: taskId }
    });
    if (existingOutput) {
        logger.info({ generationId, taskId }, "Kie AI callback: taskId already processed, skipping");
        return;
    }

    await prisma.jobLog.create({
        data: {
            generationId,
            event: "kie.callback",
            payload: { taskId, state, failMsg },
        },
    });

    if (state === "fail") {
        const updated = await prisma.generation.update({
            where: { id: generationId },
            data: {
                variationsDone: { increment: 1 },
                failureReason: failMsg ?? "Kie AI task failed",
            },
        });

        if (updated.variationsDone >= updated.variationsTotal) {
            const hasOutputs = await prisma.generationOutput.count({ where: { generationId } });
            await prisma.generation.update({
                where: { id: generationId },
                data: {
                    status: hasOutputs > 0 ? "completed" : "failed",
                    completedAt: new Date(),
                },
            });
            generationCounter.inc({ status: hasOutputs > 0 ? "completed" : "failed" });
        }
        return;
    }

    // state === "success": download and store output images
    const resultUrls: string[] =
        resultJson ? JSON.parse(resultJson).resultUrls ?? [] : [];

    for (const url of resultUrls) {
        try {
            const imageRes = await axios.get<ArrayBuffer>(url, {
                responseType: "arraybuffer",
                timeout: 60_000,
            });
            const buffer = Buffer.from(imageRes.data);
            const mime = (imageRes.headers["content-type"] as string) || "image/png";
            const ext = mime.includes("jpg") || mime.includes("jpeg") ? "jpg" : "png";
            const outputId = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const storageKey = `generations/${generationId}/outputs/${outputId}.${ext}`;

            await uploadToStorage(storageKey, buffer, mime);

            await prisma.generationOutput.create({
                data: { generationId, kieTaskId: taskId, storageKey, mime, sizeBytes: buffer.length },
            });

            logger.info({ generationId, taskId, storageKey }, "Output stored");
        } catch (err) {
            logger.error({ generationId, taskId, url, err }, "Failed to store output image");
        }
    }

    const updated = await prisma.generation.update({
        where: { id: generationId },
        data: { variationsDone: { increment: 1 } },
    });

    if (updated.variationsDone >= updated.variationsTotal) {
        const completedAt = new Date();
        await prisma.generation.update({
            where: { id: generationId },
            data: { status: "completed", completedAt },
        });

        if (generation.startedAt) {
            const latencySec = (completedAt.getTime() - generation.startedAt.getTime()) / 1000;
            generationLatencyHistogram.observe(latencySec);
        }

        generationCounter.inc({ status: "completed" });
        logger.info({ generationId }, "Generation completed");
    }
}
