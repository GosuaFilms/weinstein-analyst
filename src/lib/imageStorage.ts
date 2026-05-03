/**
 * Upload a base64-encoded image to Supabase Storage (analysis-images bucket).
 * Returns the public URL, or null on failure (caller falls back gracefully).
 */
import { supabase } from './supabase';

const BUCKET = 'analysis-images';

export async function uploadAnalysisImage(
  userId: string,
  base64Data: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;

    // Convert base64 → Uint8Array without loading the whole string into a Blob URL
    const byteStr = atob(base64Data);
    const buf = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) buf[i] = byteStr.charCodeAt(i);
    const blob = new Blob([buf], { type: mimeType });

    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: mimeType,
      upsert: false,
    });

    if (error) {
      console.warn('[Storage] upload failed:', error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.warn('[Storage] unexpected error:', err);
    return null;
  }
}
