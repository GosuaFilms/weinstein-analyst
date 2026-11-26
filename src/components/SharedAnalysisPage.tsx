import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PublicShell from './PublicShell';
import { fmtDate, setPageMeta } from '../lib/publicPage';
import { readSignupSource } from '../lib/attribution';

// Public page /a/<id>: an analysis a user chose to share (table shared_analyses,
// a copy of what analyze-market produced). Shows no data about who shared it.
// The link carries the sharer's invite code (?ref=), picked up at startup.

interface Payload {
  companyName?: string; tickerSymbol?: string; currentPrice?: string; priceTimestamp?: string;
  stage?: string; sma30Analysis?: string; relativeStrength?: string; volumeAnalysis?: string;
  support?: string; resistance?: string; entryPrice?: string; stopLoss?: string;
  verdict?: string; verdictType?: 'BUY' | 'SELL' | 'WAIT' | 'CLOSE'; suggestedStrategy?: string;
  sector?: { name_es: string; stage: string; rank: number; of: number } | null;
}
interface Shared { id: string; ticker: string | null; company_name: string | null; payload: Payload; created_at: string }

const VERDICT_STYLE: Record<string, string> = {
  BUY: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SELL: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  CLOSE: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  WAIT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

const slugOf = (symbol: string) => symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const Block: React.FC<{ title: string; text?: string }> = ({ title, text }) =>
  text ? (
    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
      <h2 className="text-white font-black mb-2">{title}</h2>
      <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">{text}</p>
    </section>
  ) : null;

const SharedAnalysisPage: React.FC<{ id: string }> = ({ id }) => {
  const [row, setRow] = useState<Shared | null>(null);
  const [missing, setMissing] = useState(false);
  const [hasStockPage, setHasStockPage] = useState(false);
  const [invited, setInvited] = useState(false);

  // The link carries the sharer's invite code: say what the visitor gets
  useEffect(() => {
    const ref = readSignupSource()?.ref;
    if (ref && /^[a-z2-9]{7}$/.test(ref)) {
      supabase.rpc('referral_code_valid', { p_code: ref }).then(({ data }) => setInvited(data === true));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('shared_analyses').select('id, ticker, company_name, payload, created_at').eq('id', id).maybeSingle();
      if (!data) {
        setMissing(true);
        setPageMeta('Análisis no disponible — Alpha Stage', 'Este análisis ya no está disponible.', `/a/${id}`);
        return;
      }
      const r = data as Shared;
      setRow(r);
      const p = r.payload;
      const name = r.company_name ?? r.ticker ?? 'Análisis';
      setPageMeta(
        `${r.ticker ?? name}: ${p.stage ?? 'análisis'} · ${p.verdict ?? ''} — análisis Weinstein`,
        `Análisis de ${name} con el método de Stan Weinstein del ${fmtDate(r.created_at)}: ${p.stage ?? ''}. ${p.verdict ?? ''}.`,
        `/a/${r.id}`,
      );
      if (r.ticker) {
        const { data: sp } = await supabase.from('stock_pages').select('slug').eq('slug', slugOf(r.ticker)).maybeSingle();
        setHasStockPage(!!sp);
      }
    })();
  }, [id]);

  if (missing) {
    return (
      <PublicShell>
        <div className="text-center py-20">
          <h1 className="text-3xl font-black text-white mb-3">Este análisis ya no está disponible</h1>
          <p className="text-slate-400 mb-8">Quien lo compartió puede haberlo retirado.</p>
          <a href="/" className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black">Analiza tú cualquier valor gratis</a>
        </div>
      </PublicShell>
    );
  }
  if (!row) {
    return <PublicShell><div className="flex justify-center py-32"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div></PublicShell>;
  }

  const p = row.payload;
  const sym = row.ticker ?? p.tickerSymbol ?? '';
  const levels = [
    { k: 'Entrada', v: p.entryPrice }, { k: 'Stop', v: p.stopLoss },
    { k: 'Soporte', v: p.support }, { k: 'Resistencia', v: p.resistance },
  ].filter((l) => l.v);

  return (
    <PublicShell>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400 mb-8">
        <i className="fas fa-share-nodes mr-2 text-amber-400" />
        Análisis compartido por un usuario de Alpha Stage, generado el {fmtDate(row.created_at, { day: 'numeric', month: 'long', year: 'numeric' })}.
        Los precios han podido cambiar desde entonces.
      </div>

      <header className="mb-8">
        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight">{sym || row.company_name}</h1>
        {row.company_name && sym && <p className="text-slate-400 text-lg font-bold mt-1">{row.company_name}</p>}
        <div className="flex flex-wrap items-center gap-3 mt-5">
          {p.currentPrice && <span className="text-white font-black text-2xl font-mono">{p.currentPrice}</span>}
          {p.priceTimestamp && <span className="text-slate-500 text-xs">Precio de {p.priceTimestamp}</span>}
        </div>
        <div className="flex flex-wrap gap-3 mt-5">
          {p.stage && <span className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white text-xs font-black uppercase tracking-widest">{p.stage}</span>}
          {p.verdict && <span className={`px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest ${VERDICT_STYLE[p.verdictType ?? 'WAIT']}`}>{p.verdict}</span>}
          {p.sector && (
            <span className="px-4 py-2 rounded-xl border border-white/10 text-slate-300 text-xs font-bold">
              Sector: {p.sector.name_es} · Etapa {p.sector.stage.slice(-1)} · {p.sector.rank}/{p.sector.of}
            </span>
          )}
        </div>
      </header>

      {levels.length > 0 && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {levels.map((l) => (
            <div key={l.k} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">{l.k}</div>
              <div className="text-white font-black text-sm mt-1 break-words">{l.v}</div>
            </div>
          ))}
        </section>
      )}

      <div className="space-y-4 mb-8">
        <Block title="Plan" text={p.suggestedStrategy} />
        <Block title="Media de 30 semanas" text={p.sma30Analysis} />
        <Block title="Fuerza relativa" text={p.relativeStrength} />
        <Block title="Volumen" text={p.volumeAnalysis} />
      </div>

      {hasStockPage && (
        <p className="text-center text-sm text-slate-400 mb-8">
          ¿Cómo está hoy? Mira la <a href={`/valor/${slugOf(sym)}`} className="text-amber-400 font-bold hover:underline">ficha de {sym} actualizada cada día</a>.
        </p>
      )}

      <div className="rounded-3xl p-7 sm:p-9 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))', border: '1px solid rgba(245,158,11,0.2)' }}>
        <div className="text-2xl sm:text-3xl font-black text-white mb-3">Analiza tú cualquier valor</div>
        <p className="text-slate-400 mb-6 max-w-lg mx-auto">
          Etapa de Weinstein, media de 30 semanas, fuerza relativa, volumen y un plan con entrada y stop. 3 análisis gratis al mes, sin tarjeta{invited ? ', y 3 análisis extra por venir invitado' : ''}.
        </p>
        <a href={sym ? `/?analizar=${encodeURIComponent(sym)}` : '/'} className="inline-flex items-center gap-3 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl">
          <i className="fas fa-magnifying-glass-chart" /> Empezar gratis
        </a>
        <p className="text-slate-500 text-xs mt-5">
          ¿Funciona el método? Mira el <a href="/resultados" className="underline hover:text-slate-300">historial público de señales</a>, con las pérdidas incluidas.
        </p>
      </div>
    </PublicShell>
  );
};

export default SharedAnalysisPage;
