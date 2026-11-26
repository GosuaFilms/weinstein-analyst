// Helpers shared by the public, crawlable pages (/valor/<slug>, /valores).

export const SITE = 'https://www.alphastage.finance';

export const STAGE_NAME: Record<string, string> = {
  STAGE_1: 'Etapa 1', STAGE_2: 'Etapa 2', STAGE_3: 'Etapa 3', STAGE_4: 'Etapa 4',
};
export const STAGE_SUBTITLE: Record<string, string> = {
  STAGE_1: 'base', STAGE_2: 'tendencia alcista', STAGE_3: 'techo', STAGE_4: 'tendencia bajista',
};
/** Badge classes on the dark public pages. */
export const STAGE_BADGE: Record<string, string> = {
  STAGE_1: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
  STAGE_2: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  STAGE_3: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  STAGE_4: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};
export const STAGE_ORDER: Record<string, number> = { STAGE_2: 0, STAGE_1: 1, STAGE_3: 2, STAGE_4: 3 };

export const INDEX_LABEL: Record<string, string> = {
  IBEX35: 'IBEX 35', SP100: 'S&P 100', NASDAQ50: 'NASDAQ', DAX40: 'DAX 40',
  CAC40: 'CAC 40', FTSE100: 'FTSE 100', EUROSTOXX50: 'Euro Stoxx 50',
};
export const INDEX_ORDER = ['IBEX35', 'SP100', 'NASDAQ50', 'DAX40', 'CAC40', 'FTSE100', 'EUROSTOXX50'];

export const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', opts);

export function money(v: number | null | undefined, currency: string | null | undefined): string {
  if (v == null) return '—';
  if (currency === 'GBp' || currency === 'GBX') return `${v.toFixed(1)} p`;
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency ?? ''}`;
  }
}

export const signed = (v: number | null | undefined, d = 1, suffix = '') =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d).replace('.', ',')}${suffix}`;

function upsertTag(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) { el = create(); document.head.appendChild(el); }
  el.setAttribute(attr, value);
}

/** Title, description, canonical and social tags for a client-rendered page. */
export function setPageMeta(title: string, description: string, path: string) {
  document.title = title;
  const meta = (name: string, prop = false) => () => {
    const m = document.createElement('meta');
    m.setAttribute(prop ? 'property' : 'name', name);
    return m;
  };
  upsertTag('meta[name="description"]', meta('description'), 'content', description);
  upsertTag('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }, 'href', SITE + path);
  upsertTag('meta[property="og:title"]', meta('og:title', true), 'content', title);
  upsertTag('meta[property="og:description"]', meta('og:description', true), 'content', description);
  upsertTag('meta[property="og:url"]', meta('og:url', true), 'content', SITE + path);
  upsertTag('meta[name="twitter:title"]', meta('twitter:title'), 'content', title);
  upsertTag('meta[name="twitter:description"]', meta('twitter:description'), 'content', description);
}
