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

const FREE_LIMIT = 2;
const SESSION_KEY = 'report_count_session';
const SAVED_LIMIT_FREE = 3;

const ReportPanel: React.FC<Props> = ({ isOpen, onClose, isPro, onUpgrade, initialTicker }) => {
  const [ticker, setTicker]           = useState(initialTicker ?? '');
  const [html, setHtml]               = useState<string | null>(null);
  const [reportName, setReportName]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [msgIdx, setMsgIdx]           = useState(0);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const msgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sessionCount, setSessionCount] = useState(() => {
    const v = sessionStorage.getItem(SESSION_KEY);
    return v ? parseInt(v, 10) : 0;
  });

  const canGenerate = isPro || sessionCount < FREE_LIMIT;

  // Load saved reports on open
  useEffect(() => {
    if (!isOpen) return;
    loadSavedReports();
  }, [isOpen]);

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

  const generate = async () => {
    if (!ticker.trim() || loading) return;
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
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase() }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `Error ${res.status}`);

      setHtml(data.html);
      const name = data.name ?? data.ticker ?? ticker.trim().toUpperCase();
      setReportName(name);

      // Auto-save
      await saveReport(data.ticker ?? ticker.trim().toUpperCase(), name, data.html);

      if (!isPro) {
        const next = sessionCount + 1;
        setSessionCount(next);
        sessionStorage.setItem(SESSION_KEY, String(next));
      }
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
          {!isPro ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
              {sessionCount}/{FREE_LIMIT} gratis
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
              ⚡ Pro — ilimitado
            </span>
          )}
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
                  onClick={() => { setHtml(r.html); setReportName(r.name); setTicker(r.ticker); setShowHistory(false); }}
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
            <div className="flex flex-col items-center justify-center h-full text-center px-6 bg-gradient-to-b from-violet-950/20 to-transparent dark:from-violet-950/40">
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-3xl bg-violet-500/20 blur-2xl scale-150" />
                <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-600 to-violet-800 shadow-2xl shadow-violet-500/30 flex items-center justify-center">
                  <i className="fas fa-chart-bar text-white text-4xl" />
                  <div className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center shadow-lg">
                    <i className="fas fa-bolt text-slate-900 text-xs" />
                  </div>
                </div>
              </div>

              <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-3 tracking-tighter">
                Informe Fundamental IA
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mb-8 leading-relaxed">
                Análisis completo con colores corporativos, datos financieros, posición competitiva y gráfico TradingView.
                Se guarda automáticamente para no regenerarlo.
              </p>

              <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-md">
                {[
                  { icon: 'fa-building', label: 'Negocio & sector' },
                  { icon: 'fa-trophy', label: 'Posición competitiva' },
                  { icon: 'fa-table', label: 'Datos trimestrales' },
                  { icon: 'fa-chart-line', label: 'Análisis técnico' },
                ].map(f => (
                  <span key={f.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 text-xs font-bold border border-violet-200 dark:border-violet-500/25">
                    <i className={`fas ${f.icon} text-[10px]`} />
                    {f.label}
                  </span>
                ))}
              </div>

              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Prueba con uno de estos</p>
              <div className="grid grid-cols-4 gap-2 max-w-xs w-full mb-6">
                {[
                  { t: 'NVDA', color: 'bg-green-600' },
                  { t: 'AAPL', color: 'bg-slate-700' },
                  { t: 'MSFT', color: 'bg-blue-600' },
                  { t: 'META', color: 'bg-blue-500' },
                ].map(({ t, color }) => (
                  <button
                    key={t}
                    onClick={() => setTicker(t)}
                    className={`py-2.5 rounded-xl ${color} hover:opacity-80 text-white font-black text-sm transition-all shadow-lg`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {!isPro && sessionCount >= FREE_LIMIT && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 max-w-sm w-full">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3">
                    Has usado tus {FREE_LIMIT} informes gratuitos
                  </p>
                  <button onClick={onUpgrade} className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm">
                    ⚡ Actualizar a Pro — informes ilimitados
                  </button>
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
              <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center mb-5">
                <i className="fas fa-triangle-exclamation text-rose-500 text-2xl" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Error generando el informe</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-sm">{error}</p>
              <button onClick={generate} className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-sm">
                Reintentar
              </button>
            </div>
          )}

          {/* Report iframe */}
          {html && !loading && (
            <iframe
              srcDoc={html}
              title={`Informe ${reportName}`}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportPanel;
