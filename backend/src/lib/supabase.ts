import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const STORAGE_BUCKET =
    process.env.SUPABASE_STORAGE_BUCKET ?? "composit-assets";

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
});

/**
 * Upload a buffer to Supabase Storage.
 * Returns the storageKey (path within the bucket).
 */
export async function uploadToStorage(
    key: string,
    buffer: Buffer,
    mime: string
): Promise<string> {
    const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(key, buffer, {
            contentType: mime,
            upsert: true,
        });

    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return key;
}

/**
 * Generate a signed URL for a storage key.
 * Default TTL: 300 seconds (5 minutes) for download links.
 * Use a longer TTL (3600s) when providing URLs to Kie AI for image input.
 */
export async function getSignedUrl(
    key: string,
    ttlSeconds = 300
): Promise<string> {
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(key, ttlSeconds);

    if (error || !data?.signedUrl) {
        throw new Error(`Supabase signed URL failed: ${error?.message}`);
    }
    return data.signedUrl;
}

/**
 * Delete one or more storage objects by key.
 */
export async function deleteFromStorage(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(keys);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}
