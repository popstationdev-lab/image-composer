import rateLimit from "express-rate-limit";

const perHour = parseInt(
    process.env.RATE_LIMIT_GENERATE_PER_HOUR ?? "10",
    10
);

/** Per-session generate rate limit: max N requests/hour */
export const generateRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: perHour,
    keyGenerator: (req) => req.sessionId || req.ip || "unknown",
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: `Too many generation requests. Max ${perHour} per hour per session.`,
    },
});

/** Global upload rate limit: 30 uploads/minute per IP */
export const uploadRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => req.ip || "unknown",
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many upload requests. Please slow down." },
});
