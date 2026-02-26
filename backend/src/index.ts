import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import * as Sentry from "@sentry/node";

import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { getRedisConnection, GENERATION_QUEUE } from "./lib/queue";
import { processGenerationJob } from "./jobs/generationWorker";
import { Worker } from "bullmq";
import { startRetentionJob } from "./jobs/retentionJob";
import { sessionMiddleware } from "./middleware/session";

import uploadRouter from "./routes/upload";
import generateRouter from "./routes/generate";
import historyRouter from "./routes/history";
import downloadRouter from "./routes/download";
import webhooksRouter from "./routes/webhooks";
import healthRouter from "./routes/health";
import adminRouter from "./routes/admin";

// ─── Sentry ───────────────────────────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// Security
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
);
app.use(
    cors({
        origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
        credentials: true,
        methods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Session-Id", "X-Admin-Secret"],
    })
);

// Parsing
app.use(cookieParser());
app.use(
    express.json({ limit: "2mb" }) // JSON bodies (generate, webhook)
);

// Logging
app.use(
    pinoHttp({
        logger,
        // Don't log health/metrics polls
        autoLogging: {
            ignore: (req) =>
                req.url?.startsWith("/health") || req.url?.startsWith("/metrics"),
        },
    })
);

// Session injection (reads X-Session-Id header or cookie)
app.use(sessionMiddleware);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", uploadRouter);
app.use("/api", generateRouter);
app.use("/api", historyRouter);
app.use("/api", downloadRouter);
app.use("/webhooks", webhooksRouter);
app.use("/admin", adminRouter);
app.use("/", healthRouter); // /health and /metrics at root

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(
    (
        err: Error,
        _req: express.Request,
        res: express.Response,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: express.NextFunction
    ) => {
        logger.error({ err }, "Unhandled error");
        if (process.env.SENTRY_DSN) Sentry.captureException(err);
        res.status(500).json({ error: "Internal server error" });
    }
);

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
    // Verify DB connection
    await prisma.$connect();
    logger.info("Database connected");

    // Start BullMQ worker
    new Worker(GENERATION_QUEUE, processGenerationJob, {
        connection: getRedisConnection(),
        concurrency: 3,
    });
    logger.info("Generation worker registered (BullMQ)");

    // Start daily retention cron
    startRetentionJob();

    // Bind HTTP server
    app.listen(PORT, () => {
        logger.info({ port: PORT }, "Backend server listening");
    });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
    logger.info("SIGTERM received — shutting down");
    await prisma.$disconnect();
    process.exit(0);
});

start().catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
});
