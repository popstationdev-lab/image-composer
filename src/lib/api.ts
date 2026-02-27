/**
 * Composit API client — typed fetch wrapper for all backend endpoints.
 * Session ID is sent via X-Session-Id header and reflected as a cookie.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadedAsset {
    id: string;
    role: "model" | "garment" | "fabric" | "style_ref";
    filename: string;
    width: number | null;
    height: number | null;
    storageKey: string;
    warning?: string;
}

export interface UploadAssetsResponse {
    sessionId: string;
    assets: UploadedAsset[];
}

export interface GenerationParams {
    preserveHead?: boolean;
    preserveOtherGarments?: boolean;
    view?: "front" | "back" | "side";
    fitStrictness?: number;
    shadowEnforcement?: boolean;
    shadowLevel?: "soft" | "medium" | "hard";
    framing?: "preserve" | "waist-legs" | "full-body";
    resolution?: "2k" | "4k" | "8k";
    variations?: 1 | 2 | 3;
    quality?: "fast" | "balanced" | "hd";
    customPrompt?: string;
}

export interface GenerationOutput {
    id: string;
    kieTaskId: string;
    storageKey: string;
    mime: string;
    sizeBytes: number | null;
    width: number | null;
    height: number | null;
    url: string | null;
    createdAt: string;
}

export interface GenerationRecord {
    id: string;
    status: "queued" | "processing" | "completed" | "failed" | "cancelled";
    prompt: string;
    params: GenerationParams;
    parentGenerationId: string | null;
    kieTaskIds: string[];
    variationsTotal: number;
    variationsDone: number;
    failureReason: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    outputs: GenerationOutput[];
    assets: Array<{
        id: string;
        role: string;
        filename: string;
        width: number | null;
        height: number | null;
    }>;
}

export interface HistoryItem {
    id: string;
    status: string;
    prompt: string;
    shortPrompt: string;
    params: GenerationParams;
    parentGenerationId: string | null;
    createdAt: string;
    completedAt: string | null;
    expiresAt: string;
    thumbnailUrl: string | null;
    outputCount: number;
}

export interface HistoryPage {
    items: HistoryItem[];
    nextCursor: string | null;
    hasMore: boolean;
}

// ─── Session management ───────────────────────────────────────────────────────

let _sessionId: string | null = null;

function generateCuid(): string {
    // Simple client-side cuid-like ID (must match /^c[a-z0-9]{20,}$/)
    const ts = Date.now().toString(36);
    const r1 = Math.random().toString(36).slice(2, 12);
    const r2 = Math.random().toString(36).slice(2, 12);
    return `c${ts}${r1}${r2}`;
}

export function getSessionId(): string {
    if (_sessionId) return _sessionId;
    const stored = localStorage.getItem("composit-session-id");
    if (stored && /^c[a-z0-9]{15,}$/.test(stored)) {
        _sessionId = stored;
        return _sessionId;
    }
    _sessionId = generateCuid();
    localStorage.setItem("composit-session-id", _sessionId);
    return _sessionId;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(
    path: string,
    init: RequestInit = {}
): Promise<T> {
    const sessionId = getSessionId();
    const headers: Record<string, string> = {
        "X-Session-Id": sessionId,
        ...(init.headers as Record<string, string> ?? {}),
    };
    if (!(init.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = `API ${res.status}`;
        try {
            const json = JSON.parse(text);
            msg = json.error ?? msg;
        } catch { /* use default */ }
        throw new Error(msg);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Upload model + garment images (+ optional fabric and style refs).
 */
export async function uploadAssets(files: {
    modelImage: File;
    garmentImage: File;
    fabricImage?: File | null;
    styleRefs?: File[];
}): Promise<UploadAssetsResponse> {
    const form = new FormData();
    form.append("modelImage", files.modelImage);
    form.append("garmentImage", files.garmentImage);
    if (files.fabricImage) form.append("fabricImage", files.fabricImage);
    for (const ref of files.styleRefs ?? []) {
        form.append("styleRefs", ref);
    }

    const sessionId = getSessionId();
    const res = await fetch(`${API_BASE}/upload-assets`, {
        method: "POST",
        headers: { "X-Session-Id": sessionId },
        body: form,
        credentials: "include",
    });

    if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? `Upload failed: ${res.status}`);
    }

    return res.json() as Promise<UploadAssetsResponse>;
}

/**
 * Submit a generation job.
 */
export async function generate(req: {
    assetIds: string[];
    prompt: string;
    params: GenerationParams;
    parentGenerationId?: string;
}): Promise<{ generationId: string; status: string; createdAt: string }> {
    return apiFetch("/generate", {
        method: "POST",
        body: JSON.stringify({ ...req, sessionId: getSessionId() }),
    });
}

/**
 * Poll generation status + outputs.
 */
export async function getGeneration(id: string): Promise<GenerationRecord> {
    return apiFetch(`/generation/${id}`);
}

/**
 * Re-generate with new prompt/params (creates child generation).
 */
export async function updateGeneration(
    id: string,
    req: {
        assetIds?: string[];
        prompt: string;
        params: GenerationParams;
    }
): Promise<{ generationId: string; status: string; createdAt: string; parentGenerationId: string }> {
    return apiFetch(`/generation/${id}/update`, {
        method: "POST",
        body: JSON.stringify({ ...req, sessionId: getSessionId() }),
    });
}

/**
 * Soft-delete a generation.
 */
export async function deleteGeneration(id: string): Promise<void> {
    return apiFetch(`/generation/${id}`, { method: "DELETE" });
}

/**
 * Get paginated history for the current session.
 */
export async function getHistory(
    limit = 20,
    cursor?: string
): Promise<HistoryPage> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return apiFetch(`/history?${params.toString()}`);
}

/**
 * Get a fresh signed download URL for an output.
 */
export async function getDownloadUrl(
    outputId: string
): Promise<{ url: string; expiresInSeconds: number }> {
    return apiFetch(`/download/${outputId}`);
}
