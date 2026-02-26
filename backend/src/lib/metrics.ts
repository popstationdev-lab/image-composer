import {
    Registry,
    Counter,
    Histogram,
    Gauge,
    collectDefaultMetrics,
} from "prom-client";

export const register = new Registry();
register.setDefaultLabels({ app: "composit-backend" });
collectDefaultMetrics({ register });

export const generationCounter = new Counter({
    name: "composit_generations_total",
    help: "Total number of generation requests",
    labelNames: ["status"] as const,
    registers: [register],
});

export const generationLatencyHistogram = new Histogram({
    name: "composit_generation_duration_seconds",
    help: "Generation end-to-end duration in seconds",
    buckets: [10, 30, 60, 120, 240, 480],
    registers: [register],
});

export const queueDepthGauge = new Gauge({
    name: "composit_queue_depth",
    help: "Number of jobs currently in the pg-boss queue",
    registers: [register],
});

export const storageUploadCounter = new Counter({
    name: "composit_storage_uploads_total",
    help: "Total Supabase Storage uploads",
    registers: [register],
});
