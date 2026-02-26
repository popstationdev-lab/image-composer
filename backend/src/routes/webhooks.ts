import { Router, Request, Response } from "express";
import { handleKieCallback } from "../jobs/generationWorker";
import { logger } from "../lib/logger";

const router = Router();

/**
 * POST /webhooks/kieai
 * Receives async task completion callbacks from Kie AI (Nano Banana).
 * Payload structure is identical to the GET recordInfo response.
 */
router.post("/kieai", async (req: Request, res: Response) => {
    try {
        const body = req.body as {
            code: number;
            data?: {
                taskId: string;
                state: string;
                resultJson: string | null;
                failCode: string | null;
                failMsg: string | null;
            };
            msg: string;
        };

        const data = body?.data;
        if (!data?.taskId) {
            logger.warn({ body }, "Kie AI webhook: missing taskId");
            return res.status(200).json({ received: false, error: "Missing taskId" });
        }

        // Acknowledge immediately
        res.status(200).json({ received: true });

        const state = data.state;

        // Terminal states only
        if (state !== "success" && state !== "fail") {
            logger.debug({ taskId: data.taskId, state }, "Kie AI webhook: non-terminal state, ignoring");
            return;
        }

        logger.info({ taskId: data.taskId, state }, "Kie AI webhook received terminal state");

        // Process asynchronously
        handleKieCallback(
            data.taskId,
            state as "success" | "fail",
            data.resultJson ?? null,
            data.failMsg ?? null
        ).catch((err) => {
            logger.error({ taskId: data.taskId, err }, "Error handling Kie AI callback");
        });
    } catch (err) {
        logger.error({ err }, "Kie AI webhook handler error");
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal error" });
        }
    }
});

export default router;
