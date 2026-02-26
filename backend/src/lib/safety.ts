/**
 * Image safety checker — pluggable stub.
 *
 * Replace this function body with a real moderation API call
 * (e.g., AWS Rekognition, Google Safe Search, or OpenAI Moderation)
 * when needed. Returning false causes the upload to be rejected.
 */
export async function isSafeImage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _buffer: Buffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _mime: string
): Promise<boolean> {
    // TODO: integrate third-party moderation service here
    return true;
}

const PROMPT_BLOCKLIST = [
    "nude",
    "naked",
    "explicit",
    "pornographic",
    "nsfw",
    // Extend this list as needed
];

/** Returns true if the prompt passes the safety check. */
export function isSafePrompt(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return !PROMPT_BLOCKLIST.some((term) => lower.includes(term));
}
