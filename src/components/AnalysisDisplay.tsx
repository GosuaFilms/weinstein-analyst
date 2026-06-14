
import React, { useState, useRef } from 'react';
import { AnalysisResult, Verdict, Language } from '../types';
// html2canvas and jspdf are loaded on-demand to keep the initial bundle small
import TradingViewWidget from './TradingViewWidget';
import { useTickerNews } from '../hooks/useTickerNews';
import { useBacktest } from '../hooks/useBacktest';
import { usePlan } from '../hooks/usePlan';

interface Props {
  data: AnalysisResult;
  isSaved?: boolean;
  onSave?: () => void;
  ticker?: string;
  language?: Language;
  images?: { url: string }[];
  theme?: 'light' | 'dark';
}

const AnalysisDisplay: React.FC<Props> = ({ data, isSaved, onSave, ticker, language = Language.ES, images, theme = 'light' }) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  // Position sizing calculator state
  const [posCalcPortfolio, setPosCalcPortfolio] = useState(100000);
  const [posCalcRiskPct, setPosCalcRiskPct] = useState(1);
  const [posCalcAtrMult, setPosCalcAtrMult] = useState(2);
  const displayRef = useRef<HTMLDivElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const { articles: news, loading: newsLoading } = useTickerNews(ticker, language === Language.ES ? 'es' : 'en');
  const { data: backtest, loading: backtestLoading } = useBacktest(ticker);
  const { isPro } = usePlan();

  const getVerdictStyles = (type: string | undefined) => {
    if (!type) return 'bg-slate-700 text-white shadow-slate-500/30 ring-2 ring-slate-500/20';
    switch (type) {
      case 'BUY': 
        return 'bg-emerald-600 text-white shadow-emerald-500/30 ring-2 ring-emerald-500/20';
      case 'SELL': 
        return 'bg-rose-600 text-white shadow-rose-500/30 ring-2 ring-rose-500/20';
      case 'WAIT':
      case 'CLOSE': 
        return 'bg-amber-500 text-slate-950 shadow-amber-500/30 ring-2 ring-amber-500/20';
      default: 
        return 'bg-slate-700 text-white shadow-slate-500/30 ring-2 ring-slate-500/20';
    }
  };

  const getStageStyles = (stage: string | undefined) => {
    if (!stage) return 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20';
    const s = String(stage).toLowerCase();
    if (s.includes('stage 2') || s.includes('etapa 2')) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (s.includes('stage 4') || s.includes('etapa 4')) return 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (s.includes('stage 3') || s.includes('etapa 3')) return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20';
  };

  const siteUrl = 'https://www.alphastage.finance';

  const getShareText = () => {
    const sym = ticker ? `$${ticker.toUpperCase()} ` : '';
    const verdictEmoji = data.verdictType === 'BUY' ? '🟢' : data.verdictType === 'SELL' ? '🔴' : '🟡';
    return `📊 ${sym}analizado con el método Weinstein\n📍 ${data.stage}\n${verdictEmoji} Veredicto: ${data.verdict}\n\nAnaliza cualquier activo gratis 👇\n${siteUrl}\n\n#Weinstein #Bolsa #Inversión`;
  };

  const shareVia = async (network: 'twitter' | 'linkedin' | 'whatsapp' | 'copy') => {
    setShowShareMenu(false);
    const text = getShareText();
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(siteUrl);

    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}&summary=${encodedText}`,
      whatsapp: `https://wa.me/?text=${encodedText}`,
    };

    if (network === 'copy') {
      await navigator.clipboard.writeText(`${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      window.open(urls[network], '_blank', 'noopener,noreferrer,width=600,height=500');
    }
  };

  const generateShareCard = async () => {
    if (!shareCardRef.current) return;
    setShowShareMenu(false);
    setIsGeneratingCard(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      // Make visible temporarily for capture
      shareCardRef.current.style.left = '0';
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: '#080e1a',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      shareCardRef.current.style.left = '-9999px';
      const link = document.createElement('a');
      link.download = `alphastage-${ticker || 'analysis'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingCard(false);
    }
  };

  const download = async (format: 'png' | 'pdf') => {
    if (!displayRef.current) return;
    setShowDownloadMenu(false);
    setIsDownloading(true);
    await new Promise(r => setTimeout(r, 100));

    try {
      const isDark = document.documentElement.classList.contains('dark');
      // scale=3 + PNG produces ~45MB PDFs. scale=2 + JPEG q=0.82 keeps sharpness
      // but brings typical reports under ~3MB.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(displayRef.current, {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        ignoreElements: (e) => e.hasAttribute('data-html2canvas-ignore')
      });

      const fileName = `analysis-${ticker || 'asset'}`;
      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const imgData = canvas.toDataURL('image/jpeg', 0.82);
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        pdf.save(`${fileName}.pdf`);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const labels = language === Language.ES ? {
    report: 'REPORTE DE ACTIVO',
    terminal: 'TERMINAL ALPHA 3.1',
    live: 'DATOS EN TIEMPO REAL',
    sma: 'Análisis SMA 30W',
    rs: 'Fuerza Relativa Mansfield',
    volume: 'Perfil de Volumen',
    support: 'Soporte Crítico',
    resistance: 'Resistencia Clave',
    strategy: 'Plan de Ejecución',
    buyTrigger: 'Punto de Entrada',
    stopLoss: 'Stop de Protección',
    verification: 'Fuentes de Verificación',
    disclaimer: 'Datos de mercado Alpha Pro. No es consejo financiero.',
    sync: 'Terminal Sincronizada',
    buffer: 'Escribiendo en Buffer...',
    currentPrice: 'PRECIO ACTUAL',
    asOf: 'VÁLIDO A:'
  } : {
    report: 'ASSET REPORT',
    terminal: 'ALPHA TERMINAL 3.1',
    live: 'LIVE MARKET FEED',
    sma: '30W SMA Analysis',
    rs: 'Mansfield Rel. Strength',
    volume: 'Volume Profile',
    support: 'Critical Support',
    resistance: 'Key Resistance',
    strategy: 'Execution Blueprint',
    buyTrigger: 'Entry Trigger',
    stopLoss: 'Protection Stop',
    verification: 'Verification Sources',
    disclaimer: 'Alpha Pro Market Data. Non-financial advice.',
    sync: 'Terminal Synced',
    buffer: 'Writing to Buffer...',
    currentPrice: 'CURRENT PRICE',
    asOf: 'AS OF:'
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4 max-w-5xl mx-auto pb-8 relative">
      <div className="flex justify-between items-center px-4" data-html2canvas-ignore="true">
        <div className="flex items-center gap-2">
          {isSaved ? (
            <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-500/5 px-3 py-1 rounded-full border border-emerald-500/10">
              <i className="fas fa-check-circle"></i> {labels.sync}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest bg-amber-500/5 px-3 py-1 rounded-full border border-amber-500/10 animate-pulse">
              <i className="fas fa-circle-notch animate-spin"></i> {labels.buffer}
            </span>
          )}
        </div>
      </div>

      <div 
        ref={displayRef}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-xl transition-all"
      >
        {/* Header Section */}
        <div className="p-8 md:p-12 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-10">
            
            {/* Left Section: Asset Info */}
            <div className="flex-grow space-y-8 w-full">
              {/* Badges */}
              <div className="flex items-center gap-4">
                <span className="px-2 py-0.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[8px] font-black uppercase tracking-[0.2em] rounded inline-flex items-center justify-center">
                  {labels.report}
                </span>
                <div className="h-px w-8 bg-slate-200 dark:bg-slate-700"></div>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.3em] inline-flex items-center justify-center">
                  {labels.terminal}
                </span>
              </div>

              {/* Main Info Block */}
              <div className="space-y-8">
                <div className="space-y-2">
                  <h2 className="text-5xl md:text-7xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-tight break-words">
                    {ticker || (data.companyName ? String(data.companyName).split(' ')[0] : "MARKET")}
                  </h2>

                  {data.companyName && (
                    <p className="text-lg md:text-xl font-bold text-slate-500 dark:text-slate-400 tracking-tight">
                      {data.companyName}
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <div className="inline-flex flex-col border-l-4 border-amber-500 pl-6 py-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-500 leading-none mb-3">
                      {labels.currentPrice}
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
                        <span className="text-5xl md:text-6xl font-mono font-black text-slate-900 dark:text-white leading-none tracking-tighter">
                        {data.currentPrice || '---'}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          {data.priceTimestamp && (
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">
                                {labels.asOf} {data.priceTimestamp}
                            </span>
                          )}
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap opacity-70">
                            NY: {new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} | MAD: {new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Tags */}
              <div className="flex flex-wrap items-center gap-3 pt-4">
                <div className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${getStageStyles(data.stage)}`}>
                  <i className="fas fa-layer-group"></i> <span>{data.stage || 'Stage Unknown'}</span>
                </div>
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest border border-slate-200 dark:border-slate-700">
                  <i className="fas fa-signal text-emerald-500"></i> <span>{labels.live}</span>
                </div>
              </div>
            </div>

            {/* Right Section: Verdict & Actions */}
            <div className="flex flex-col items-center lg:items-end gap-6 shrink-0 w-full lg:w-auto">
              <div className={`w-full lg:w-auto px-6 py-4 rounded-xl font-black text-sm md:text-base shadow-xl tracking-tight uppercase transition-all transform hover:scale-105 flex items-center justify-center text-center leading-tight max-w-xs lg:max-w-[250px] ${getVerdictStyles(data.verdictType)}`}>
                <span className="break-words w-full">{data.verdict || 'Analysis Pending'}</span>
              </div>

              <div className="flex items-center gap-3" data-html2canvas-ignore="true">
                {/* Share button + dropdown */}
                <div className="relative">
                  <button
                    onClick={() => { setShowShareMenu(v => !v); setShowDownloadMenu(false); }}
                    className="w-12 h-12 flex items-center justify-center bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl transition-all border border-slate-200 dark:border-slate-700 shadow-lg"
                    title="Compartir"
                  >
                    <i className={`fas ${copied ? 'fa-check text-emerald-500' : 'fa-share-nodes'} text-lg`}></i>
                  </button>

                  {showShareMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowShareMenu(false)} />
                      <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-20 py-2 animate-in fade-in slide-in-from-top-2">
                        <p className="px-5 pt-2 pb-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Compartir análisis</p>

                        {/* Twitter/X */}
                        <button onClick={() => shareVia('twitter')}
                          className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-4 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                          </div>
                          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Twitter / X</span>
                        </button>

                        {/* LinkedIn */}
                        <button onClick={() => shareVia('linkedin')}
                          className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-4 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-[#0A66C2] flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                          </div>
                          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">LinkedIn</span>
                        </button>

                        {/* WhatsApp */}
                        <button onClick={() => shareVia('whatsapp')}
                          className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-4 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-[#25D366] flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          </div>
                          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">WhatsApp</span>
                        </button>

                        <div className="my-2 border-t border-slate-100 dark:border-slate-700" />

                        {/* Share card image */}
                        <button onClick={generateShareCard} disabled={isGeneratingCard}
                          className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-4 transition-colors disabled:opacity-50">
                          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                            <i className="fas fa-image text-violet-400 text-sm"></i>
                          </div>
                          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                            {isGeneratingCard ? 'Generando…' : 'Descargar tarjeta'}
                          </span>
                        </button>

                        {/* Copy link */}
                        <button onClick={() => shareVia('copy')}
                          className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-4 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                            <i className={`fas ${copied ? 'fa-check text-emerald-500' : 'fa-link text-slate-500'} text-sm`}></i>
                          </div>
                          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                            {copied ? '¡Copiado!' : 'Copiar texto'}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    disabled={isDownloading}
                    className="w-12 h-12 flex items-center justify-center bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl transition-all border border-slate-200 dark:border-slate-700 disabled:opacity-50 shadow-lg"
                    title="Descargar"
                  >
                    {isDownloading ? <i className="fas fa-circle-notch animate-spin text-lg"></i> : <i className="fas fa-download text-lg"></i>}
                  </button>

                  {showDownloadMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowDownloadMenu(false)}></div>
                      <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-20 py-2 animate-in fade-in slide-in-from-top-2">
                        <button onClick={() => download('png')} className="w-full text-left px-5 py-3 text-[10px] font-black text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-4 uppercase tracking-widest transition-colors">
                          <i className="fas fa-file-image text-emerald-500 text-sm"></i> Captura PNG
                        </button>
                        <button onClick={() => download('pdf')} className="w-full text-left px-5 py-3 text-[10px] font-black text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-4 uppercase tracking-widest transition-colors">
                          <i className="fas fa-file-pdf text-rose-500 text-sm"></i> Informe PDF
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Details Grid */}
        <div className="p-8 md:p-12 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <section className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <i className="fas fa-wave-square text-blue-500"></i> {labels.sma}
              </h3>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-semibold text-base">{data.sma30Analysis || 'Data unavailable'}</p>
            </div>

            {/* Multi-MA System indicator — shows when technicalSnapshot available */}
            {data.technicalSnapshot && (() => {
              const ts = data.technicalSnapshot;
              const alignColor = {
                bullish:  'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30',
                partial:  'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30',
                neutral:  'text-slate-500 bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700',
                bearish:  'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30',
              };
              const align = (ts.multiMaAlignment ?? 'neutral') as keyof typeof alignColor;
              const price = ts.currentPrice ?? 0;

              const maRows = [
                { label: 'MA10w ≈ MA50d',  val: ts.sma10Weekly,  trend: ts.sma10WeeklyTrend  },
                { label: 'MA30w ≈ MA150d', val: ts.sma30Weekly,  trend: ts.sma30Trend         },
                { label: 'MA40w ≈ MA200d', val: ts.sma40Weekly,  trend: ts.sma40WeeklyTrend  },
              ];

              return (
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <i className="fas fa-layer-group text-violet-500 text-xs"></i>
                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex-grow">
                      {language === Language.ES ? 'Sistema Multi-MA (upgrade Weinstein)' : 'Multi-MA System (Weinstein upgrade)'}
                    </h3>
                    {ts.multiMaAlignment && (
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${alignColor[align]}`}>
                        {ts.multiMaAlignment}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 mb-3">
                    {maRows.map(row => {
                      if (!row.val) return null;
                      const above = price > row.val;
                      const pct = ((price - row.val) / row.val * 100).toFixed(1);
                      const trendIcon = row.trend === 'rising' ? '↑' : row.trend === 'falling' ? '↓' : '→';
                      return (
                        <div key={row.label} className="flex items-center gap-2 text-xs">
                          <span className="w-28 text-[10px] font-bold text-slate-500 flex-shrink-0">{row.label}</span>
                          <span className="font-black text-slate-700 dark:text-slate-300 w-16 text-right flex-shrink-0">{row.val.toFixed(2)}</span>
                          <span className={`font-bold flex-shrink-0 ${above ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {above ? '▲' : '▼'} {above ? '+' : ''}{pct}%
                          </span>
                          <span className={`text-[10px] font-bold flex-shrink-0 ${row.trend === 'rising' ? 'text-emerald-500' : row.trend === 'falling' ? 'text-rose-500' : 'text-slate-400'}`}>
                            {trendIcon} {row.trend ?? '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/50 text-[9px] text-slate-400">
                    {ts.atr14WeeklyPct != null && (
                      <span><span className="font-bold text-slate-500">ATR14w:</span> {ts.atr14Weekly?.toFixed(2)} ({ts.atr14WeeklyPct.toFixed(1)}%)</span>
                    )}
                    {ts.volumeDryUp != null && (
                      <span className={ts.volumeDryUp ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>
                        {ts.volumeDryUp ? '⚡ ' : ''}{language === Language.ES ? (ts.volumeDryUp ? 'Volumen en contracción (posible rotura)' : 'Volumen normal') : (ts.volumeDryUp ? 'Volume dry-up (potential breakout)' : 'Volume normal')}
                      </span>
                    )}
                    {ts.distanceFromSMA30Pct != null && ts.extendedStage2 && (
                      <span className="text-amber-600 font-bold">⚠ Stage 2 extendido (+{ts.distanceFromSMA30Pct.toFixed(1)}% sobre MA30w)</span>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <i className="fas fa-balance-scale text-amber-500"></i> {labels.rs}
              </h3>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-semibold text-base">{data.relativeStrength || 'Data unavailable'}</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <i className="fas fa-chart-bar text-indigo-500"></i> {labels.volume}
              </h3>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-semibold text-base">{data.volumeAnalysis || 'Data unavailable'}</p>
            </div>
          </section>

          <section className="space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm border-l-4 border-l-rose-500">
                <h3 className="text-[8px] font-black text-rose-600 uppercase tracking-widest mb-2">{labels.support}</h3>
                <p className="text-2xl font-mono font-black text-slate-900 dark:text-white tracking-tighter">{data.support || '---'}</p>
              </div>
              <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm border-l-4 border-l-emerald-500">
                <h3 className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-2">{labels.resistance}</h3>
                <p className="text-2xl font-mono font-black text-slate-900 dark:text-white tracking-tighter">{data.resistance || '---'}</p>
              </div>
            </div>

            <div className="bg-slate-900 dark:bg-slate-950 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <i className="fas fa-shield-halved text-6xl text-emerald-500"></i>
              </div>
              
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
                <i className="fas fa-bolt-lightning text-xs"></i> {labels.strategy}
              </h3>
              <p className="text-white font-bold text-lg leading-snug italic mb-10 border-l-4 border-emerald-500/50 pl-6">
                "{data.suggestedStrategy || 'Strategy currently unavailable.'}"
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl bg-white/5 text-white border border-white/5 transition-all hover:bg-white/10 h-full">
                  <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 mb-3">{labels.buyTrigger}</span>
                  <span className="text-base sm:text-lg font-bold text-center leading-relaxed">{data.entryPrice || 'N/A'}</span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl bg-white/5 text-white border border-white/5 transition-all hover:bg-white/10 h-full">
                  <span className="text-[8px] font-black uppercase tracking-widest text-rose-500 mb-3">{labels.stopLoss}</span>
                  <span className="text-base sm:text-lg font-bold text-center leading-relaxed">{data.stopLoss || 'N/A'}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ATR Position Sizing Calculator */}
        {data.technicalSnapshot?.atr14Weekly && (() => {
          const atr = data.technicalSnapshot!.atr14Weekly!;
          const price = data.technicalSnapshot!.currentPrice ?? parseFloat(data.currentPrice) ?? 0;
          if (!price) return null;

          const riskAmt = posCalcPortfolio * posCalcRiskPct / 100;
          const riskPerShare = atr * posCalcAtrMult;
          const atrStop = price - riskPerShare;
          const shares = riskPerShare > 0 ? Math.floor(riskAmt / riskPerShare) : 0;
          const posValue = shares * price;
          const posPct = posCalcPortfolio > 0 ? (posValue / posCalcPortfolio * 100) : 0;

          const wsStop = data.technicalSnapshot!.suggestedStopLoss ??
            (data.stopLoss ? parseFloat(data.stopLoss.replace(/[^0-9.]/g, '')) : null);
          const wsRisk = wsStop ? price - wsStop : null;
          const wsShares = (wsRisk && wsRisk > 0) ? Math.floor(riskAmt / wsRisk) : null;
          const wsValue = wsShares ? wsShares * price : null;
          const wsPct = (wsValue && posCalcPortfolio > 0) ? wsValue / posCalcPortfolio * 100 : null;

          const fmt0 = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 });

          return (
            <div className="px-8 md:px-12 pb-8" data-html2canvas-ignore="true">
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                  <i className="fas fa-calculator text-violet-500 text-xs"></i>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex-grow">
                    {language === Language.ES ? 'Calculadora de Posición (ATR)' : 'Position Sizing Calculator (ATR)'}
                  </h3>
                  <span className="text-[9px] text-slate-400">
                    ATR14w: <span className="font-black text-slate-600 dark:text-slate-300">{atr.toFixed(2)}</span>
                    {data.technicalSnapshot!.atr14WeeklyPct != null && (
                      <span className="ml-1">({data.technicalSnapshot!.atr14WeeklyPct!.toFixed(1)}%)</span>
                    )}
                    <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
                    <span className="font-bold text-slate-500">{language === Language.ES ? 'Precio' : 'Price'}:</span> <span className="font-black text-slate-600 dark:text-slate-300">{price.toFixed(2)}</span>
                  </span>
                </div>

                {/* Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                      {language === Language.ES ? 'Capital (€/$)' : 'Portfolio ($)'}
                    </label>
                    <input
                      type="number"
                      min={1000}
                      step={5000}
                      value={posCalcPortfolio}
                      onChange={e => setPosCalcPortfolio(Math.max(0, Number(e.target.value)))}
                      className="w-full text-sm font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                      {language === Language.ES ? 'Riesgo / trade' : 'Risk / trade'}
                    </label>
                    <div className="flex gap-1">
                      {([0.5, 1, 1.5, 2] as const).map(v => (
                        <button
                          key={v}
                          onClick={() => setPosCalcRiskPct(v)}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${posCalcRiskPct === v ? 'bg-violet-600 text-white shadow-md' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-violet-400'}`}
                        >
                          {v}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                      ATR {language === Language.ES ? 'multiplicador' : 'multiplier'}
                    </label>
                    <div className="flex gap-1">
                      {([1.5, 2, 2.5] as const).map(v => (
                        <button
                          key={v}
                          onClick={() => setPosCalcAtrMult(v)}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${posCalcAtrMult === v ? 'bg-violet-600 text-white shadow-md' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-violet-400'}`}
                        >
                          {v}×
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div className="space-y-2">
                  {/* ATR row */}
                  <div className="grid grid-cols-5 gap-2 bg-violet-50 dark:bg-violet-500/10 rounded-xl p-3 border border-violet-100 dark:border-violet-500/20">
                    <div className="text-center">
                      <p className="text-[9px] text-violet-500 font-black uppercase tracking-wider mb-0.5">ATR Stop</p>
                      <p className="text-sm font-black text-violet-700 dark:text-violet-300">{atrStop > 0 ? atrStop.toFixed(2) : '—'}</p>
                      <p className="text-[8px] text-violet-400">−{posCalcAtrMult}×ATR</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-violet-500 font-black uppercase tracking-wider mb-0.5">{language === Language.ES ? 'Acciones' : 'Shares'}</p>
                      <p className="text-sm font-black text-slate-800 dark:text-slate-100">{shares.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-violet-500 font-black uppercase tracking-wider mb-0.5">{language === Language.ES ? 'Valor pos.' : 'Pos. value'}</p>
                      <p className="text-sm font-black text-slate-800 dark:text-slate-100">{fmt0(posValue)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-violet-500 font-black uppercase tracking-wider mb-0.5">% {language === Language.ES ? 'cartera' : 'portfolio'}</p>
                      <p className={`text-sm font-black ${posPct > 25 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>{posPct.toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-violet-500 font-black uppercase tracking-wider mb-0.5">{language === Language.ES ? 'Riesgo €' : 'Risk $'}</p>
                      <p className="text-sm font-black text-rose-600 dark:text-rose-400">{fmt0(riskAmt)}</p>
                    </div>
                  </div>

                  {/* Weinstein stop comparison */}
                  {wsStop != null && wsShares != null && wsValue != null && (
                    <div className="grid grid-cols-5 gap-2 bg-slate-100 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700/40">
                      <div className="text-center">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-0.5">{language === Language.ES ? 'Stop W.' : 'W. Stop'}</p>
                        <p className="text-sm font-black text-rose-600 dark:text-rose-400">{wsStop.toFixed(2)}</p>
                        <p className="text-[8px] text-slate-400">Weinstein</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-0.5">{language === Language.ES ? 'Acciones' : 'Shares'}</p>
                        <p className="text-sm font-black text-slate-600 dark:text-slate-400">{wsShares.toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-0.5">{language === Language.ES ? 'Valor pos.' : 'Pos. value'}</p>
                        <p className="text-sm font-black text-slate-600 dark:text-slate-400">{fmt0(wsValue)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-0.5">% {language === Language.ES ? 'cartera' : 'portfolio'}</p>
                        <p className={`text-sm font-black ${wsPct && wsPct > 25 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>{wsPct?.toFixed(1)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mb-0.5">{language === Language.ES ? 'Riesgo €' : 'Risk $'}</p>
                        <p className="text-sm font-black text-rose-400">{fmt0(riskAmt)}</p>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-[8px] text-slate-300 dark:text-slate-600 mt-3 italic">
                  {language === Language.ES
                    ? 'Fórmula: Acciones = (Capital × Riesgo%) ÷ (ATR14w × mult). Solo orientativo, no constituye asesoramiento financiero.'
                    : 'Formula: Shares = (Portfolio × Risk%) ÷ (ATR14w × mult). For reference only, not financial advice.'}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Uploaded Images Section */}
        {images && images.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800" data-html2canvas-ignore="true">
            <div className="p-8 md:p-12 bg-slate-50/30 dark:bg-slate-900/20">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <i className="fas fa-images text-purple-500"></i> {language === Language.ES ? 'Gráficos Analizados' : 'Analyzed Charts'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {images.map((img, idx) => (
                  <div key={idx} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-lg group relative cursor-pointer" onClick={() => window.open(img.url, '_blank')}>
                    <img src={img.url} alt={`Analyzed chart ${idx + 1}`} className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition-colors flex items-center justify-center">
                      <i className="fas fa-search-plus text-white text-3xl opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg"></i>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {data.groundingSources && data.groundingSources.length > 0 && (
          <div className="px-6 md:px-10 py-6 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">{labels.verification}:</h4>
            <div className="flex flex-wrap gap-3">
              {data.groundingSources.map((source, i) => (
                <a 
                  key={i} 
                  href={source.uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[9px] font-black text-slate-600 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 flex items-center gap-2 transition-all bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm"
                >
                  <i className="fas fa-link text-[8px] opacity-40"></i> {source.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Backtest + Price Targets section ── */}
      {ticker && (backtestLoading || backtest) && (
        <div className="mt-8 px-1" data-html2canvas-ignore="true">
          <div className="flex items-center gap-2 mb-3">
            <i className="fas fa-chart-line text-slate-400 text-xs"></i>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {language === Language.ES ? 'Backtest Stage 2' : 'Stage 2 Backtest'} · {ticker.toUpperCase()}
            </span>
            <span className="text-[9px] text-slate-400 ml-1">— {language === Language.ES ? 'últimos 2 años' : 'last 2 years'}</span>
            {!isPro && (
              <span className="ml-auto flex items-center gap-1 text-[9px] font-black text-violet-500 uppercase tracking-widest bg-violet-50 dark:bg-violet-500/10 px-2 py-0.5 rounded-full">
                <i className="fas fa-crown text-yellow-400"></i> Pro
              </span>
            )}
          </div>

          {/* Pro gate */}
          {!isPro ? (
            <div className="relative">
              {/* Blurred preview */}
              <div className="space-y-3 pointer-events-none select-none" style={{ filter: 'blur(6px)', opacity: 0.4 }}>
                <div className="grid grid-cols-3 gap-2">
                  {['S2', '75%', '+18%'].map((v, i) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">——</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="h-20 bg-slate-50 dark:bg-slate-800/40 rounded-xl" />
                <div className="h-14 bg-slate-50 dark:bg-slate-800/40 rounded-xl" />
              </div>
              {/* Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm rounded-2xl">
                <i className="fas fa-lock text-violet-400 text-2xl"></i>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {language === Language.ES ? 'Backtest y objetivos de precio' : 'Backtest & price targets'}
                </p>
                <p className="text-xs text-slate-500 text-center max-w-xs px-4">
                  {language === Language.ES
                    ? 'Disponible en el plan Pro. Desbloquea análisis histórico, win rate y objetivos Weinstein.'
                    : 'Available in the Pro plan. Unlock historical analysis, win rate and Weinstein targets.'}
                </p>
              </div>
            </div>
          ) : backtestLoading ? (
            <div className="flex gap-2 items-center text-xs text-slate-400 py-2">
              <i className="fas fa-circle-notch animate-spin text-[10px]"></i>
              {language === Language.ES ? 'Calculando backtest…' : 'Running backtest…'}
            </div>
          ) : backtest && backtest.periods.length > 0 ? (
            <div className="space-y-3">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">{language === Language.ES ? 'Entradas S2' : 'S2 entries'}</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{backtest.periods.length}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Win rate</p>
                  <p className={`text-lg font-black ${backtest.winRate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {backtest.winRate}%
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">{language === Language.ES ? 'Retorno medio' : 'Avg return'}</p>
                  <p className={`text-lg font-black ${backtest.avgReturn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {backtest.avgReturn >= 0 ? '+' : ''}{backtest.avgReturn}%
                  </p>
                </div>
              </div>

              {/* ── Quant Metrics Panel ── */}
              {backtest.metrics && (() => {
                const m = backtest.metrics!;
                const fmtPct = (v: number, decimals = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`;
                const fmtRatio = (v: number) => v >= 999 ? '∞' : v.toFixed(2);
                const pos = (v: number) => v > 0 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500';

                const cells: { label: string; value: string; cls: string; hint?: string }[] = [
                  {
                    label: 'CAGR',
                    value: fmtPct(m.cagr),
                    cls: pos(m.cagr),
                    hint: language === Language.ES ? '2 años' : '2 yr',
                  },
                  {
                    label: 'Max DD',
                    value: `${m.maxDrawdown.toFixed(1)}%`,
                    cls: m.maxDrawdown < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500',
                    hint: language === Language.ES ? 'drawdown máx' : 'max drawdown',
                  },
                  {
                    label: 'Sharpe',
                    value: fmtRatio(m.sharpeRatio),
                    cls: m.sharpeRatio >= 1 ? 'text-emerald-600 dark:text-emerald-400' : m.sharpeRatio >= 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400',
                    hint: 'RF=0%',
                  },
                  {
                    label: 'Sortino',
                    value: fmtRatio(m.sortinoRatio),
                    cls: m.sortinoRatio >= 1.5 ? 'text-emerald-600 dark:text-emerald-400' : m.sortinoRatio >= 0.75 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400',
                    hint: 'MAR=0%',
                  },
                  {
                    label: 'Calmar',
                    value: fmtRatio(m.calmarRatio),
                    cls: m.calmarRatio >= 0.5 ? 'text-emerald-600 dark:text-emerald-400' : m.calmarRatio >= 0.2 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400',
                    hint: 'CAGR/DD',
                  },
                  {
                    label: language === Language.ES ? 'Prof. Factor' : 'Profit Factor',
                    value: fmtRatio(m.profitFactor),
                    cls: m.profitFactor >= 1.5 ? 'text-emerald-600 dark:text-emerald-400' : m.profitFactor >= 1 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400',
                    hint: 'bruto G/P',
                  },
                  {
                    label: language === Language.ES ? 'Esperanza' : 'Expectancy',
                    value: fmtPct(m.expectancy),
                    cls: pos(m.expectancy),
                    hint: language === Language.ES ? 'por trade' : 'per trade',
                  },
                  {
                    label: language === Language.ES ? 'Exposición' : 'Exposure',
                    value: `${m.exposure}%`,
                    cls: 'text-violet-600 dark:text-violet-400',
                    hint: `${m.completedTrades} trades`,
                  },
                ];

                return (
                  <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center gap-2 mb-2">
                      <i className="fas fa-square-root-variable text-violet-500 text-[10px]"></i>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {language === Language.ES ? 'Métricas cuantitativas' : 'Quant metrics'}
                      </p>
                      <span className="ml-auto text-[9px] text-slate-400">
                        {language === Language.ES ? 'Retorno total' : 'Total return'}:
                        <span className={`font-black ml-1 ${pos(m.totalReturn)}`}>{fmtPct(m.totalReturn)}</span>
                        <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>
                        {language === Language.ES ? 'Vol.' : 'Vol.'} <span className="font-bold">{m.volatility.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {cells.map(cell => (
                        <div key={cell.label} className="bg-white dark:bg-slate-900 rounded-xl p-2 text-center border border-slate-100 dark:border-slate-700/40">
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider leading-none mb-1">{cell.label}</p>
                          <p className={`text-sm font-black leading-none ${cell.cls}`}>{cell.value}</p>
                          {cell.hint && <p className="text-[8px] text-slate-400 mt-0.5 leading-none">{cell.hint}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-2 flex-wrap">
                      <span className="text-[8px] text-slate-400"><span className="font-bold text-slate-500">{language === Language.ES ? 'Mejor' : 'Best'}:</span> {fmtPct(m.bestTrade)}</span>
                      <span className="text-[8px] text-slate-400"><span className="font-bold text-slate-500">{language === Language.ES ? 'Peor' : 'Worst'}:</span> {fmtPct(m.worstTrade)}</span>
                      <span className="text-[8px] text-slate-400"><span className="font-bold text-slate-500">Payoff:</span> {fmtRatio(m.payoffRatio)}:1</span>
                      <span className="text-[8px] text-slate-400"><span className="font-bold text-slate-500">{language === Language.ES ? 'Media G/P' : 'Avg W/L'}:</span> {fmtPct(m.avgWin)} / {fmtPct(m.avgLoss)}</span>
                      <span className="text-[8px] text-slate-400"><span className="font-bold text-slate-500">{language === Language.ES ? 'Durac. media' : 'Avg dur.'}:</span> {m.avgWeeksPerTrade} {language === Language.ES ? 'sem.' : 'wks'}</span>
                      <span className="ml-auto text-[8px] text-slate-300 dark:text-slate-600 italic">
                        {m.completedTrades} {language === Language.ES ? 'trades · RF=0%' : 'trades · RF=0%'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Active entry + price targets */}
              {backtest.activeEntry && (
                <div className="border border-emerald-200 dark:border-emerald-500/30 rounded-2xl overflow-hidden">
                  {/* Active entry header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-500/10">
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <div className="flex-grow">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {language === Language.ES ? 'Actualmente en Stage 2' : 'Currently in Stage 2'}
                        {' · '}{backtest.activeEntry.weeksInStage2} {language === Language.ES ? 'sem.' : 'wks'}
                      </p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {language === Language.ES ? 'Entrada' : 'Entry'} {backtest.activeEntry.entryDate} @ {backtest.activeEntry.entryPrice.toFixed(2)}
                        {' → '}
                        <span className={`font-bold ${backtest.activeEntry.returnPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                          {backtest.activeEntry.returnPct >= 0 ? '+' : ''}{backtest.activeEntry.returnPct}%
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Price targets */}
                  {backtest.priceTargets && (() => {
                    const pt = backtest.priceTargets!;
                    const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return (
                      <div className="px-4 py-4 space-y-4 bg-white dark:bg-slate-900">
                        {/* Targets header */}
                        <div className="flex items-center gap-2">
                          <i className="fas fa-bullseye text-violet-500 text-xs"></i>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {language === Language.ES ? 'Objetivos de precio Weinstein' : 'Weinstein price targets'}
                          </span>
                          <span className="text-[9px] text-slate-400 ml-auto">
                            {language === Language.ES ? 'Base' : 'Base'}: {fmt(pt.baseLow)} → {fmt(pt.baseHigh)} ({pt.baseWidthWeeks} {language === Language.ES ? 'sem.' : 'wks'})
                          </span>
                        </div>

                        {/* Progress bar + target markers */}
                        <div className="relative">
                          {/* Labels row */}
                          <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
                            <span className="flex items-center gap-1">
                              <i className="fas fa-shield text-rose-400 text-[8px]"></i>
                              Stop {fmt(pt.stopProxy)}
                            </span>
                            <span className="text-slate-500">
                              {language === Language.ES ? 'Precio actual' : 'Current'}: <span className="font-black text-slate-700 dark:text-slate-200">{fmt(backtest.currentPrice)}</span>
                            </span>
                            <span className={pt.reachedT3 ? 'text-emerald-500' : ''}>T3 {fmt(pt.target3)}</span>
                          </div>

                          {/* Bar */}
                          <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 relative overflow-visible">
                            {/* Filled progress */}
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-500 transition-all"
                              style={{ width: `${pt.progressPct}%` }}
                            />
                            {/* T1 marker */}
                            <div className="absolute top-0 h-full flex flex-col items-center" style={{ left: '33.3%' }}>
                              <div className="w-0.5 h-full bg-amber-400" />
                            </div>
                            {/* T2 marker */}
                            <div className="absolute top-0 h-full flex flex-col items-center" style={{ left: '61.8%' }}>
                              <div className="w-0.5 h-full bg-orange-400" />
                            </div>
                            {/* T3 marker */}
                            <div className="absolute top-0 h-full flex flex-col items-center" style={{ left: '100%' }}>
                              <div className="w-0.5 h-full bg-violet-500" />
                            </div>
                          </div>

                          {/* Target price row */}
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            {[
                              { label: 'T1 ×1', price: pt.target1, reached: pt.reachedT1, color: 'amber' },
                              { label: 'T2 ×1.6', price: pt.target2, reached: pt.reachedT2, color: 'orange' },
                              { label: 'T3 ×2', price: pt.target3, reached: pt.reachedT3, color: 'violet' },
                            ].map(({ label, price, reached, color }) => (
                              <div key={label} className={`rounded-lg p-2 text-center border ${reached ? `bg-${color}-50 dark:bg-${color}-500/10 border-${color}-200 dark:border-${color}-500/30` : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-700/40'}`}>
                                <p className={`text-[9px] font-black uppercase tracking-wide ${reached ? `text-${color}-600 dark:text-${color}-400` : 'text-slate-400'}`}>
                                  {label} {reached ? '✓' : ''}
                                </p>
                                <p className={`text-sm font-black ${reached ? `text-${color}-700 dark:text-${color}-300` : 'text-slate-700 dark:text-slate-300'}`}>
                                  {fmt(price)}
                                </p>
                                <p className="text-[9px] text-slate-400">
                                  +{(((price - backtest.activeEntry!.entryPrice) / backtest.activeEntry!.entryPrice) * 100).toFixed(1)}%
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* R/R + base metrics */}
                        <div className="flex items-center gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <div>
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide">R/R (T1)</p>
                            <p className={`text-sm font-black ${pt.rrT1 >= 2 ? 'text-emerald-600 dark:text-emerald-400' : pt.rrT1 >= 1 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {pt.rrT1.toFixed(1)}:1
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide">{language === Language.ES ? 'Altura base' : 'Base height'}</p>
                            <p className="text-sm font-black text-slate-700 dark:text-slate-300">{fmt(pt.baseHeight)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide">{language === Language.ES ? 'Stop ref.' : 'Stop ref.'}</p>
                            <p className="text-sm font-black text-rose-600 dark:text-rose-400">{fmt(pt.stopProxy)}</p>
                          </div>
                          <div className="ml-auto">
                            <p className="text-[9px] text-slate-400 uppercase tracking-wide">{language === Language.ES ? 'Progreso → T1' : 'Progress → T1'}</p>
                            <p className="text-sm font-black text-violet-600 dark:text-violet-400">{pt.progressPct}%</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Historical periods */}
              {backtest.periods.filter(p => !p.active).length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">
                    {language === Language.ES ? 'Periodos anteriores' : 'Previous periods'}
                  </p>
                  {backtest.periods.filter(p => !p.active).slice(-5).reverse().map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/40">
                      <div>
                        <span className="text-[10px] text-slate-500">{p.entryDate}</span>
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 mx-1">→</span>
                        <span className="text-[10px] text-slate-500">{p.exitDate ?? '–'}</span>
                        <span className="text-[10px] text-slate-400 ml-2">({p.weeksInStage2} {language === Language.ES ? 'sem.' : 'wks'})</span>
                      </div>
                      <span className={`text-xs font-bold ${p.returnPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {p.returnPct >= 0 ? '+' : ''}{p.returnPct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : backtest && backtest.periods.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              {language === Language.ES ? 'Sin entradas en Stage 2 en los últimos 2 años.' : 'No Stage 2 entries in the last 2 years.'}
            </p>
          ) : null}
        </div>
      )}

      {/* ── News section ── */}
      {ticker && (newsLoading || news.length > 0) && (
        <div className="mt-8 px-1" data-html2canvas-ignore="true">
          <div className="flex items-center gap-2 mb-3">
            <i className="fas fa-newspaper text-slate-400 text-xs"></i>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {language === Language.ES ? 'Últimas noticias' : 'Latest news'} · {ticker.toUpperCase()}
            </span>
          </div>
          {newsLoading ? (
            <div className="flex gap-2 items-center text-xs text-slate-400 py-2">
              <i className="fas fa-circle-notch animate-spin text-[10px]"></i>
              {language === Language.ES ? 'Cargando noticias…' : 'Loading news…'}
            </div>
          ) : (
            <div className="space-y-2">
              {news.map((article, i) => {
                const age = article.publishedAt
                  ? Math.round((Date.now() / 1000 - article.publishedAt) / 3600)
                  : null;
                const ageStr = age != null
                  ? age < 24 ? `hace ${age}h` : `hace ${Math.round(age / 24)}d`
                  : '';
                return (
                  <a
                    key={i}
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all group"
                  >
                    <i className="fas fa-arrow-up-right-from-square text-[9px] text-slate-400 group-hover:text-emerald-500 mt-1 flex-shrink-0 transition-colors"></i>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {article.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-400 font-medium">{article.publisher}</span>
                        {ageStr && <span className="text-[10px] text-slate-300 dark:text-slate-600">{ageStr}</span>}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="text-center text-[9px] text-slate-400 dark:text-slate-500 max-w-xs mx-auto italic font-black uppercase tracking-[0.2em] opacity-40 mt-8">
        {labels.disclaimer}
      </div>

      {/* ── Hidden share card (captured with html2canvas) ── */}
      <div
        ref={shareCardRef}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '20px',
          width: '600px',
          height: '315px',
          background: 'linear-gradient(135deg, #080e1a 0%, #0f1d35 100%)',
          borderRadius: '16px',
          overflow: 'hidden',
          fontFamily: 'Arial Black, Arial, sans-serif',
          zIndex: 9999,
        }}
      >
        {/* Top accent line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />

        {/* Glow blobs */}
        <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '200px', height: '200px', borderRadius: '50%', background: '#f59e0b', opacity: 0.05, filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '-40px', right: '-40px', width: '160px', height: '160px', borderRadius: '50%', background: data.verdictType === 'BUY' ? '#10b981' : data.verdictType === 'SELL' ? '#ef4444' : '#f59e0b', opacity: 0.08, filter: 'blur(40px)' }} />

        <div style={{ padding: '28px 32px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚡</div>
              <div>
                <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: 900, letterSpacing: '1px' }}>ALPHA STAGE</div>
                <div style={{ color: '#f59e0b', fontSize: '9px', fontWeight: 700, letterSpacing: '3px' }}>WEINSTEIN TERMINAL</div>
              </div>
            </div>
            <div style={{ padding: '6px 14px', borderRadius: '20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '10px', fontWeight: 700, letterSpacing: '2px' }}>
              MÉTODO WEINSTEIN
            </div>
          </div>

          {/* Main content */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {/* Left: ticker + stage */}
            <div style={{ flex: 1 }}>
              <div style={{ color: '#f59e0b', fontSize: '40px', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
                {ticker ? `$${ticker.toUpperCase()}` : data.companyName || 'Análisis'}
              </div>
              {ticker && data.companyName && (
                <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{data.companyName}</div>
              )}
              <div style={{ marginTop: '12px', display: 'inline-block', padding: '5px 14px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', fontSize: '11px', fontWeight: 900, letterSpacing: '2px' }}>
                {data.stage || 'Stage Analysis'}
              </div>
            </div>

            {/* Right: verdict */}
            <div style={{
              padding: '18px 28px',
              borderRadius: '16px',
              background: data.verdictType === 'BUY' ? 'rgba(16,185,129,0.2)' : data.verdictType === 'SELL' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
              border: `1px solid ${data.verdictType === 'BUY' ? 'rgba(16,185,129,0.4)' : data.verdictType === 'SELL' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
              textAlign: 'center',
              minWidth: '160px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#64748b', marginBottom: '6px' }}>VEREDICTO</div>
              <div style={{
                fontSize: '22px',
                fontWeight: 900,
                letterSpacing: '-0.5px',
                color: data.verdictType === 'BUY' ? '#34d399' : data.verdictType === 'SELL' ? '#f87171' : '#fbbf24',
              }}>
                {data.verdict || '—'}
              </div>
              {data.stopLoss && (
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '6px', fontWeight: 700 }}>
                  Stop {data.stopLoss}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#334155', fontSize: '10px', fontWeight: 700, letterSpacing: '1px' }}>
              Análisis generado con IA · Sólo educativo
            </div>
            <div style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 900, letterSpacing: '1px' }}>
              alphastage.finance
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisDisplay;
