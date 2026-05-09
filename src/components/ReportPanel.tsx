import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isPro: boolean;
  onUpgrade: () => void;
  initialTicker?: string;
}

interface SavedReport {
  id: string;
  ticker: string;
  name: string;
  created_at: string;
  html: string;
}

const LOADING_MESSAGES = [
  'Consultando datos de mercado…',
  'Analizando posición competitiva…',
  'Calculando distancia a máximos…',
  'Generando informe visual…',
  'Aplicando paleta de colores corporativa…',
  'Renderizando gráfico técnico…',
  'Últimos retoques al informe…',
];

const FREE_MONTHLY_LIMIT = 1;   // 1 informe/mes en free
const PRO_MONTHLY_LIMIT  = 15;  // 15 informes/mes en Pro
const SAVED_LIMIT_FREE   = 3;

interface LivePrice {
  price: number;
  change: number | null;
  currency: string;
  isRealtime: boolean;
  fetchedAt: string;
}

const ReportPanel: React.FC<Props> = ({ isOpen, onClose, isPro, onUpgrade, initialTicker }) => {
  const [ticker, setTicker]           = useState(initialTicker ?? '');
  const [html, setHtml]               = useState<string | null>(null);
  const [reportName, setReportName]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [msgIdx, setMsgIdx]           = useState(0);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [livePrice, setLivePrice]     = useState<LivePrice | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const msgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const monthlyLimit = isPro ? PRO_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
  const canGenerate  = monthlyCount < monthlyLimit;

  // Load saved reports + monthly count on open
  useEffect(() => {
    if (!isOpen) return;
    loadSavedReports();
    loadMonthlyCount();
  }, [isOpen]);

  const loadMonthlyCount = async () => {
    const start = new Date();
    start.setDate(1); start.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', start.toISOString());
    setMonthlyCount(count ?? 0);
  };

  const fetchLivePrice = async (sym: string) => {
    if (!sym.trim()) return;
    setPriceLoading(true);
    setLivePrice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/get-price?ticker=${encodeURIComponent(sym.trim().toUpperCase())}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const data = await res.json();
      if (res.ok && data.price != null) {
        setLivePrice({
          price:      data.price,
          change:     data.change,
          currency:   data.currency,
          isRealtime: data.isRealtime,
          fetchedAt:  data.fetchedAt,
        });
      }
    } catch { /* silent */ } finally {
      setPriceLoading(false);
    }
  };

  const loadSavedReports = async () => {
    const { data } = await supabase
      .from('reports')
      .select('id, ticker, name, created_at, html')
      .order('created_at', { ascending: false })
      .limit(isPro ? 50 : SAVED_LIMIT_FREE);
    if (data) setSavedReports(data as SavedReport[]);
  };

  const saveReport = async (t: string, n: string, h: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // For free users keep only the last SAVED_LIMIT_FREE reports
    if (!isPro && savedReports.length >= SAVED_LIMIT_FREE) {
      const oldest = savedReports[savedReports.length - 1];
      await supabase.from('reports').delete().eq('id', oldest.id);
    }

    await supabase.from('reports').insert({
      ticker: t,
      name:   n,
      html:   h,
    });
    loadSavedReports();
  };

  const deleteReport = async (id: string) => {
    await supabase.from('reports').delete().eq('id', id);
    setSavedReports(prev => prev.filter(r => r.id !== id));
    if (html && savedReports.find(r => r.id === id)?.html === html) {
      setHtml(null);
    }
  };

  const openInNewTab = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Revoke after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const downloadHtml = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${ticker.trim().toUpperCase()}_analisis.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startMessages = () => {
    setMsgIdx(0);
    msgTimer.current = setInterval(() => {
      setMsgIdx(i => (i + 1) % LOADING_MESSAGES.length);
    }, 2800);
  };

  const stopMessages = () => {
    if (msgTimer.current) clearInterval(msgTimer.current);
  };

  const generateWithTicker = (sym: string) => {
    setTicker(sym);
    // defer so state update is flushed
    setTimeout(() => generateCore(sym), 0);
  };

  const generate = () => {
    if (!ticker.trim() || loading) return;
    generateCore(ticker.trim());
  };

  const generateCore = async (sym: string) => {
    if (!sym || loading) return;
    if (!canGenerate) { onUpgrade(); return; }

    setLoading(true);
    setError(null);
    setHtml(null);
    setShowHistory(false);
    startMessages();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sesión expirada. Vuelve a iniciar sesión.');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-report`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ ticker: sym.trim().toUpperCase() }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        if (data.error === 'no_fundamentals') {
          throw new Error(data.message ?? 'Datos no disponibles para este ticker');
        }
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      setHtml(data.html);
      const name = data.name ?? data.ticker ?? ticker.trim().toUpperCase();
      setReportName(name);
      fetchLivePrice(data.ticker ?? ticker.trim().toUpperCase());

      // Auto-save + refresh monthly count
      await saveReport(data.ticker ?? ticker.trim().toUpperCase(), name, data.html);
      setMonthlyCount(c => c + 1);
    } catch (e) {
      setError((e as Error).message || 'Error generando el informe');
    } finally {
      setLoading(false);
      stopMessages();
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white dark:bg-slate-950">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <i className="fas fa-arrow-left text-sm" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-100 dark:bg-violet-500/20 rounded-lg flex items-center justify-center">
            <i className="fas fa-chart-bar text-violet-600 dark:text-violet-400 text-sm" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white leading-none">Informe Fundamental</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Análisis completo por IA</p>
          </div>
        </div>

        {/* History toggle */}
        {savedReports.length > 0 && (
          <button
            onClick={() => setShowHistory(h => !h)}
            className={`ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              showHistory
                ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            }`}
          >
            <i className="fas fa-clock-rotate-left text-[10px]" />
            Guardados ({savedReports.length})
          </button>
        )}

        <div className="ml-auto">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
            !canGenerate
              ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30'
              : isPro
              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30'
              : 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
          }`}>
            {monthlyCount}/{monthlyLimit} este mes
          </span>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0">
        <div className="max-w-2xl mx-auto flex gap-2">
          <div className="flex-1 relative">
            <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text"
              placeholder="Ticker o empresa… NVDA, AAPL, Tesla, Inditex"
              value={ticker}
              onChange={e => setTicker(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500/40 outline-none"
              autoFocus
            />
          </div>
          <button
            data-generate
            onClick={generate}
            disabled={loading || !ticker.trim()}
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black text-sm transition-all flex items-center gap-2 shadow-lg shadow-violet-500/20"
          >
            {loading
              ? <><i className="fas fa-circle-notch animate-spin" /> Generando…</>
              : <><i className="fas fa-wand-magic-sparkles" /> Generar</>}
          </button>
          {html && (
            <>
              <button
                onClick={openInNewTab}
                className="px-4 py-2.5 rounded-xl bg-violet-100 dark:bg-violet-500/20 hover:bg-violet-200 dark:hover:bg-violet-500/30 text-violet-700 dark:text-violet-300 font-bold text-sm transition-all flex items-center gap-2 border border-violet-200 dark:border-violet-500/30"
                title="Abrir en nueva pestaña (Ctrl+P para guardar como PDF)"
              >
                <i className="fas fa-arrow-up-right-from-square" />
                <span className="hidden sm:inline">Abrir / PDF</span>
              </button>
              <button
                onClick={downloadHtml}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm transition-all flex items-center gap-2 border border-slate-200 dark:border-slate-700"
                title="Descargar HTML"
              >
                <i className="fas fa-download" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden relative flex">

        {/* History sidebar */}
        {showHistory && (
          <div className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Informes guardados</p>
              {!isPro && <p className="text-[10px] text-slate-400 mt-0.5">Últimos {SAVED_LIMIT_FREE} · Pro ilimitado</p>}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {savedReports.map(r => (
                <div
                  key={r.id}
                  className="group flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-500/10 cursor-pointer transition-colors"
                  onClick={() => { setHtml(r.html); setReportName(r.name); setTicker(r.ticker); setShowHistory(false); fetchLivePrice(r.ticker); }}
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-black text-violet-600 dark:text-violet-400">{r.ticker.slice(0, 3)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 dark:text-white truncate">{r.ticker}</p>
                    <p className="text-[10px] text-slate-400 truncate">{formatDate(r.created_at)}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteReport(r.id); }}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center text-rose-500 transition-opacity shrink-0"
                  >
                    <i className="fas fa-times text-[10px]" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-hidden relative">

          {/* Empty state */}
          {!loading && !html && !error && (
            <div className="flex flex-col items-center h-full text-center px-6 py-8 overflow-y-auto">

              {/* Header */}
              <div className="relative mb-5">
                <div className="absolute inset-0 rounded-3xl bg-violet-500/20 blur-2xl scale-150" />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600 to-violet-800 shadow-2xl shadow-violet-500/30 flex items-center justify-center">
                  <i className="fas fa-chart-bar text-white text-3xl" />
                  <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shadow-lg">
                    <i className="fas fa-bolt text-slate-900 text-[10px]" />
                  </div>
                </div>
              </div>

              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tighter">
                Informe Fundamental con datos reales
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
                Generamos informes únicamente con datos financieros verificados y actualizados.
                Ingresos, EPS y márgenes reales del último trimestre disponible.
              </p>

              {/* Supported markets */}
              <div className="w-full max-w-2xl mb-6">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">✅ Mercados con datos reales disponibles</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      flag: '🇺🇸', market: 'S&P 500 · NASDAQ 100', desc: '~500 empresas USA',
                      tickers: [
                        { sym: 'AAPL', label: 'AAPL' }, { sym: 'NVDA', label: 'NVDA' },
                        { sym: 'MSFT', label: 'MSFT' }, { sym: 'AMZN', label: 'AMZN' },
                        { sym: 'META', label: 'META' }, { sym: 'GOOGL', label: 'GOOGL' },
                        { sym: 'TSLA', label: 'TSLA' }, { sym: 'AVGO', label: 'AVGO' },
                      ],
                      color: 'border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5',
                      badge: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20',
                    },
                    {
                      flag: '🇩🇪', market: 'DAX 40', desc: '~40 empresas alemanas',
                      tickers: [
                        { sym: 'SAP.DE',  label: 'SAP'  }, { sym: 'SIE.DE',  label: 'SIE'  },
                        { sym: 'ALV.DE',  label: 'ALV'  }, { sym: 'BMW.DE',  label: 'BMW'  },
                        { sym: 'BAYN.DE', label: 'BAYN' }, { sym: 'ADS.DE',  label: 'ADS'  },
                        { sym: 'MBG.DE',  label: 'MBG'  }, { sym: 'DTE.DE',  label: 'DTE'  },
                      ],
                      color: 'border-yellow-200 dark:border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-500/5',
                      badge: 'text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-500/20',
                    },
                    {
                      flag: '🇪🇸', market: 'IBEX 35', desc: '~35 empresas españolas',
                      tickers: [
                        { sym: 'ITX.MC',  label: 'ITX'  }, { sym: 'SAN.MC',  label: 'SAN'  },
                        { sym: 'BBVA.MC', label: 'BBVA' }, { sym: 'IBE.MC',  label: 'IBE'  },
                        { sym: 'REP.MC',  label: 'REP'  }, { sym: 'TEF.MC',  label: 'TEF'  },
                        { sym: 'AMS.MC',  label: 'AMS'  }, { sym: 'ACS.MC',  label: 'ACS'  },
                      ],
                      color: 'border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5',
                      badge: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/20',
                    },
                    {
                      flag: '🌍', market: 'Europa · Global', desc: 'FTSE, CAC40, AEX y más',
                      tickers: [
                        { sym: 'ASML',    label: 'ASML' }, { sym: 'MC.PA',   label: 'LVMH' },
                        { sym: 'NVO',     label: 'NVO'  }, { sym: 'SHEL',    label: 'SHEL' },
                        { sym: 'TTE',     label: 'TTE'  }, { sym: 'UL',      label: 'UL'   },
                        { sym: 'OR.PA',   label: 'L\'Oréal' }, { sym: 'AIR.PA', label: 'Airbus' },
                      ],
                      color: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5',
                      badge: 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20',
                    },
                  ].map(({ flag, market, desc, tickers, color, badge }) => (
                    <div key={market} className={`rounded-2xl border p-4 text-left ${color}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{flag}</span>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white leading-none">{market}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tickers.map(({ sym, label }) => (
                          <button
                            key={sym}
                            onClick={() => { setTicker(sym); setError(null); setHtml(null); generateWithTicker(sym); }}
                            className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all hover:scale-105 ${badge}`}
                            title={sym}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Not available notice */}
              <div className="w-full max-w-2xl p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start gap-3 mb-6 text-left">
                <i className="fas fa-circle-xmark text-slate-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-black text-slate-700 dark:text-slate-300">No disponible: </span>
                  Small caps, OTC, criptomonedas y empresas sin cobertura de analistas. Si introduces un ticker no soportado, se mostrará un aviso sin consumir tu cuota mensual.
                </p>
              </div>

              {!canGenerate && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 max-w-sm w-full">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-1">
                    {isPro ? `Has alcanzado el límite de ${PRO_MONTHLY_LIMIT} informes este mes` : 'Has usado tu informe gratuito del mes'}
                  </p>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mb-3">
                    {isPro ? 'El contador se reinicia el día 1 del próximo mes.' : `Pro incluye ${PRO_MONTHLY_LIMIT} informes/mes por €14.99.`}
                  </p>
                  {!isPro && (
                    <button onClick={onUpgrade} className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm">
                      ⚡ Actualizar a Pro — 15 informes/mes
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-4 border-violet-500/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <div className="absolute inset-4 bg-violet-500/10 rounded-full flex items-center justify-center">
                  <i className="fas fa-wand-magic-sparkles text-violet-500 text-xl animate-pulse" />
                </div>
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                Generando informe de {ticker.trim().toUpperCase()}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm animate-pulse min-h-[20px]">
                {LOADING_MESSAGES[msgIdx]}
              </p>
              <p className="text-xs text-slate-400 mt-4 max-w-xs">
                Tardará ~30-60 segundos. Se guardará automáticamente al terminar.
              </p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              {error.includes('datos fundamentales') || error.includes('datos verificados') ? (
                <>
                  <div className="w-20 h-20 rounded-3xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center mb-5">
                    <i className="fas fa-database text-amber-500 text-3xl" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Datos no disponibles</h3>
                  <p className="text-slate-500 text-sm mb-2 max-w-md" dangerouslySetInnerHTML={{ __html: error }} />
                  <p className="text-xs text-slate-400 mb-6 max-w-xs">Solo generamos informes con datos financieros reales y verificados.</p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    {['AAPL','NVDA','MSFT','AMZN','ASML'].map(t => (
                      <button key={t} onClick={() => { setTicker(t); setError(null); }}
                        className="px-4 py-2 rounded-xl bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 font-black text-sm hover:bg-violet-200 transition-all">
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center mb-5">
                    <i className="fas fa-triangle-exclamation text-rose-500 text-2xl" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Error generando el informe</h3>
                  <p className="text-slate-500 text-sm mb-6 max-w-sm">{error}</p>
                  <button onClick={generate} className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-sm">
                    Reintentar
                  </button>
                </>
              )}
            </div>
          )}

          {/* Report iframe */}
          {html && !loading && (
            <div className="flex flex-col w-full h-full">
              {/* Live price bar */}
              <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-black text-white">{ticker.trim().toUpperCase()}</span>
                  {priceLoading && <i className="fas fa-circle-notch animate-spin text-slate-400 text-xs" />}
                  {livePrice && !priceLoading && (
                    <>
                      <span className="font-black text-lg text-white">
                        {livePrice.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {livePrice.currency}
                      </span>
                      {livePrice.change != null && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${livePrice.change >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          {livePrice.change >= 0 ? '▲' : '▼'} {Math.abs(livePrice.change).toFixed(2)}%
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${livePrice.isRealtime ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {livePrice.isRealtime ? '● LIVE' : '◐ cierre ant.'}
                      </span>
                    </>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 hidden sm:inline">
                    ⚠️ Datos fundamentales basados en el conocimiento del modelo IA — pueden no reflejar resultados recientes
                  </span>
                  <button
                    onClick={() => fetchLivePrice(ticker)}
                    disabled={priceLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold transition-all disabled:opacity-50"
                    title="Actualizar precio"
                  >
                    <i className={`fas fa-rotate-right text-[10px] ${priceLoading ? 'animate-spin' : ''}`} />
                    Actualizar
                  </button>
                </div>
              </div>
              <iframe
                srcDoc={html}
                title={`Informe ${reportName}`}
                className="w-full flex-1 border-0"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportPanel;
