import { Request, Response, NextFunction } from "express";
import { z } from "zod";

const CUID_REGEX = /^c[a-z0-9]{15,}$/;

declare global {
    namespace Express {
        interface Request {
            sessionId: string;
        }
    }
}

/**
 * Reads sessionId from X-Session-Id header OR from sessionId cookie.
 * If neither is present, creates a new cuid-like placeholder.
 * The real Session row is created lazily on first upload.
 */
export function sessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const fromHeader = req.headers["x-session-id"];
    const fromCookie = req.cookies?.sessionId;
    const raw =
        (typeof fromHeader === "string" ? fromHeader : undefined) ??
        (typeof fromCookie === "string" ? fromCookie : undefined);

    if (raw && CUID_REGEX.test(raw)) {
        req.sessionId = raw;
        // Reflect back in cookie for browser clients
        res.cookie("sessionId", raw, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        return next();
    }

    // No valid session — some routes require it, some don't.
    // Set empty string; routes that need it will reject.
    req.sessionId = "";
    next();
}

export function requireSession(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (!req.sessionId) {
        res.status(401).json({
            error: "Missing or invalid X-Session-Id header",
        });
        return;
    }
    next();
}

export const cuidSchema = z.string().regex(CUID_REGEX, "Invalid session/asset ID format");
