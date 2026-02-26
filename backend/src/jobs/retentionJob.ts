import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { deleteFromStorage } from "../lib/supabase";
import { logger } from "../lib/logger";

const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS ?? "24", 10);

export async function runRetentionPurge(): Promise<void> {
    const cutoff = new Date(
        Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    logger.info({ cutoff, retentionDays: RETENTION_DAYS }, "Starting retention purge");

    // Find all expired generations (not already deleted)
    const expired = await prisma.generation.findMany({
        where: {
            createdAt: { lt: cutoff },
            deletedAt: null,
        },
        include: {
            outputs: { where: { deletedAt: null } },
            assets: { include: { asset: true } },
        },
    });

    logger.info({ count: expired.length }, "Expired generations found");

    for (const gen of expired) {
        try {
            // Collect storage keys to delete
            const storageKeys: string[] = [
                ...gen.outputs.map((o) => o.storageKey),
                ...gen.assets.map((ga) => ga.asset.storageKey),
            ];

            if (storageKeys.length > 0) {
                await deleteFromStorage(storageKeys);
            }

            // Mark outputs as deleted
            await prisma.generationOutput.updateMany({
                where: { generationId: gen.id },
                data: { deletedAt: new Date() },
            });

            // Soft-delete the generation
            await prisma.generation.update({
                where: { id: gen.id },
                data: { deletedAt: new Date() },
            });

            await prisma.jobLog.create({
                data: {
                    generationId: gen.id,
                    event: "retention.deleted",
                    payload: {
                        storageKeysDeleted: storageKeys.length,
                        cutoff: cutoff.toISOString(),
                    },
                },
            });

            logger.info(
                { generationId: gen.id, keysDeleted: storageKeys.length },
                "Generation purged by retention job"
            );
        } catch (err) {
            logger.error({ generationId: gen.id, err }, "Error purging generation");
        }
    }

    // Orphaned assets: assets whose session has no recent activity
    const orphanedAssets = await prisma.asset.findMany({
        where: {
            createdAt: { lt: cutoff },
            deletedAt: null,
            generations: { none: {} }, // assets not linked to any generation
        },
    });

    if (orphanedAssets.length > 0) {
        const orphanKeys = orphanedAssets.map((a) => a.storageKey);
        await deleteFromStorage(orphanKeys);
        await prisma.asset.updateMany({
            where: { id: { in: orphanedAssets.map((a) => a.id) } },
            data: { deletedAt: new Date() },
        });
        logger.info({ count: orphanedAssets.length }, "Orphaned assets purged");
    }

    logger.info("Retention purge complete");
}

/** Start the daily retention cron job at 02:00 UTC */
export function startRetentionJob(): void {
    cron.schedule("0 2 * * *", async () => {
        try {
            await runRetentionPurge();
        } catch (err) {
            logger.error({ err }, "Retention cron job failed");
        }
    });
    logger.info("Retention cron job scheduled (daily at 02:00 UTC)");
}
