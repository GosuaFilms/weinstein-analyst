import { supabase } from './supabase';

// Public link for one analysis: /a/<id>?ref=<invite code>. The server copies the
// result it produced (ai_results) into shared_analyses, so only real analyses can
// be shared. The preview image (the share card, 1200×630) is uploaded once to the
// public bucket share-cards as <id>.png and used for WhatsApp/X/Telegram previews.

export const SITE = 'https://www.alphastage.finance';

export interface SharedLink { id: string; url: string }

async function uploadCard(id: string, card: HTMLElement): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const prevLeft = card.style.left;
  card.style.left = '0';
  try {
    await new Promise((r) => setTimeout(r, 60));
    const canvas = await html2canvas(card, { backgroundColor: '#080e1a', scale: 2, logging: false, useCORS: true });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const { error } = await supabase.storage.from('share-cards').upload(`${id}.png`, blob, { contentType: 'image/png', upsert: false });
    if (!error || /exists|duplicate/i.test(error.message)) await supabase.rpc('mark_share_card', { p_id: id });
  } finally {
    card.style.left = prevLeft;
  }
}

export interface MyShare {
  id: string; ticker: string | null; company_name: string | null; stage: string | null; verdict: string | null;
  has_card: boolean; ref_code: string | null; created_at: string;
}

export const shareUrl = (id: string, ref: string | null) => `${SITE}/a/${id}${ref ? `?ref=${ref}` : ''}`;

/** The signed-in user's shared analyses, newest first. */
export async function listMyShares(): Promise<MyShare[]> {
  const { data, error } = await supabase.rpc('my_shared_analyses');
  if (error) throw new Error(error.message);
  return (data as MyShare[]) ?? [];
}

/** Takes a shared analysis down: preview image first (needs the row to prove ownership), then the page. */
export async function unshare(id: string): Promise<void> {
  await supabase.storage.from('share-cards').remove([`${id}.png`]).catch(() => { /* no image */ });
  const { data, error } = await supabase.rpc('unshare_analysis', { p_id: id });
  if (error || data !== true) throw new Error(error?.message ?? 'not found');
}

/** Creates (or returns) the public link of a result; the card is best-effort. */
export async function createShareLink(resultId: string, card: HTMLElement | null): Promise<SharedLink> {
  const { data, error } = await supabase.rpc('share_analysis', { p_result_id: resultId });
  if (error || !data) throw new Error(error?.message ?? 'share failed');
  const { id, ref, has_card } = data as { id: string; ref: string | null; has_card: boolean };
  if (!has_card && card) await uploadCard(id, card).catch(() => { /* link works without a preview image */ });
  return { id, url: shareUrl(id, ref) };
}
