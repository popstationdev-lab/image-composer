import axios from "axios";
import { logger } from "./logger";

const KIE_BASE_URL =
    process.env.KIE_AI_BASE_URL ?? "https://api.kie.ai";
const KIE_API_KEY = process.env.KIE_AI_API_KEY!;

export interface KieCreateTaskParams {
    prompt: string;
    imageUrls: string[];       // Signed Supabase URLs for Kie AI to fetch
    aspectRatio?: string;      // "1:1" | "9:16" | "16:9" | "2:3" | "3:2" | "auto" etc.
    resolution?: "1K" | "2K" | "4K";
    outputFormat?: "png" | "jpg";
    callBackUrl?: string;
}

export interface KieTaskRecord {
    taskId: string;
    model: string;
    state: "waiting" | "success" | "fail";
    param: string;
    resultJson: string | null;
    failCode: string | null;
    failMsg: string | null;
    costTime: number | null;
    completeTime: number | null;
    createTime: number;
}

export interface KieResultUrls {
    resultUrls: string[];
}

function resolutionMap(res: string): "1K" | "2K" | "4K" {
    if (res === "2k" || res === "2K") return "2K";
    if (res === "8k" || res === "8K") return "4K"; // Kie max is 4K
    return "4K"; // default to 4K (best quality)
}

/** Map frontend params to a Kie AI aspect_ratio string */
function aspectRatioFromParams(params: {
    framing?: string;
    view?: string;
}): string {
    // Default to portrait 2:3 for fashion imagery
    if (params.framing === "full-body") return "2:3";
    if (params.framing === "waist-legs") return "3:4";
    return "2:3";
}

/** Submit a single generation task to Kie AI. Returns taskId. */
export async function kieCreateTask(
    p: KieCreateTaskParams
): Promise<string> {
    const body = {
        model: "nano-banana-pro",
        callBackUrl: p.callBackUrl,
        input: {
            prompt: p.prompt,
            image_input: p.imageUrls,
            aspect_ratio: p.aspectRatio ?? "2:3",
            resolution: p.resolution ?? "4K",
            output_format: p.outputFormat ?? "png",
        },
    };

    logger.debug({ body }, "Submitting task to Kie AI");

    const res = await axios.post(
        `${KIE_BASE_URL}/api/v1/jobs/createTask`,
        body,
        {
            headers: {
                Authorization: `Bearer ${KIE_API_KEY}`,
                "Content-Type": "application/json",
            },
            timeout: 30_000,
        }
    );

    if (res.data?.code !== 200) {
        throw new Error(
            `Kie AI createTask error ${res.data?.code}: ${res.data?.msg}`
        );
    }

    return res.data.data.taskId as string;
}

/** Poll a task's status. */
export async function kieQueryTask(taskId: string): Promise<KieTaskRecord> {
    const res = await axios.get(
        `${KIE_BASE_URL}/api/v1/jobs/recordInfo`,
        {
            params: { taskId },
            headers: { Authorization: `Bearer ${KIE_API_KEY}` },
            timeout: 15_000,
        }
    );

    if (res.data?.code !== 200) {
        throw new Error(
            `Kie AI recordInfo error ${res.data?.code}: ${res.data?.msg}`
        );
    }

    return res.data.data as KieTaskRecord;
}

/** Parse resultUrls out of a Kie task record's resultJson. */
export function parseKieResultUrls(record: KieTaskRecord): string[] {
    if (!record.resultJson) return [];
    try {
        const parsed = JSON.parse(record.resultJson) as KieResultUrls;
        return parsed.resultUrls ?? [];
    } catch {
        return [];
    }
}

export { resolutionMap, aspectRatioFromParams };
