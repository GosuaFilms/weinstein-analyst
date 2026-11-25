// First-touch signup source: where a visitor came from the first time they
// opened the site in this tab (UTM tags, ?ref=, or the referring site).
// Kept only in sessionStorage (this tab, gone when it closes), saved once to
// the new user's profile via set_signup_source() and then forgotten.
// No cookies, no third parties, no cross-site tracking.

const KEY = 'signup_source';
const SAVED = 'signup_source_saved';

export interface SignupSource {
  source?: string;
  medium?: string;
  campaign?: string;
  ref?: string;
  referrer?: string; // host only
  landing?: string;  // path only
}

const clean = (v: string | null) => (v ? v.trim().toLowerCase().slice(0, 60) : undefined);

/** Call once at startup, before anything rewrites the URL. */
export function captureSignupSource(): void {
  try {
    const url = new URL(window.location.href);
    const p = url.searchParams;
    const tagged = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'].some((k) => p.has(k));

    if (!sessionStorage.getItem(KEY)) {
      let referrer: string | undefined;
      try {
        const host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
        if (host && !host.endsWith('alphastage.finance') && host !== window.location.hostname) referrer = host.slice(0, 60);
      } catch { /* bad referrer */ }
      const src: SignupSource = {
        source: clean(p.get('utm_source')),
        medium: clean(p.get('utm_medium')),
        campaign: clean(p.get('utm_campaign')),
        ref: clean(p.get('ref')),
        referrer,
        landing: url.pathname.slice(0, 60),
      };
      sessionStorage.setItem(KEY, JSON.stringify(src));
    }

    // Keep shared links clean once the tags are read
    if (tagged) {
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref'].forEach((k) => p.delete(k));
      const qs = p.toString();
      window.history.replaceState({}, '', url.pathname + (qs ? `?${qs}` : '') + url.hash);
    }
  } catch { /* storage blocked: the source is simply unknown */ }
}

export function readSignupSource(): SignupSource | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SignupSource) : null;
  } catch {
    return null;
  }
}

export function alreadySaved(): boolean {
  try { return sessionStorage.getItem(SAVED) === '1'; } catch { return true; }
}

export function markSaved(): void {
  try { sessionStorage.setItem(SAVED, '1'); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
