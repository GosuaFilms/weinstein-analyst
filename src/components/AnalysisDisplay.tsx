
import React, { useState, useRef } from 'react';
import { AnalysisResult, Verdict, Language } from '../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import TradingViewWidget from './TradingViewWidget';

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
  const displayRef = useRef<HTMLDivElement>(null);

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

  const handleShare = async () => {
    const summary = `📊 Weinstein ${ticker || ''}\n📍 ${data.stage}\n📈 ${data.verdict}\n🛡️ ${data.support}\n🚀 ${data.resistance}`;
    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const shareUrl = `${window.location.origin}${window.location.pathname}#analysis=${encodedData}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Analysis: ${ticker || data.companyName}`,
          text: summary,
          url: shareUrl,
        });
      } catch (err) {}
    } else {
      await navigator.clipboard.writeText(`${summary}\n\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const download = async (format: 'png' | 'pdf') => {
    if (!displayRef.current) return;
    setShowDownloadMenu(false);
    setIsDownloading(true);
    await new Promise(r => setTimeout(r, 100));

    try {
      const isDark = document.documentElement.classList.contains('dark');
      const canvas = await html2canvas(displayRef.current, {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        scale: 3, // Increased scale for better quality
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
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
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
                <button
                  onClick={handleShare}
                  className="w-12 h-12 flex items-center justify-center bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl transition-all border border-slate-200 dark:border-slate-700 shadow-lg"
                  title="Compartir"
                >
                  <i className={`fas ${copied ? 'fa-check text-emerald-500' : 'fa-share-nodes'} text-lg`}></i>
                </button>

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

      <div className="text-center text-[9px] text-slate-400 dark:text-slate-500 max-w-xs mx-auto italic font-black uppercase tracking-[0.2em] opacity-40 mt-8">
        {labels.disclaimer}
      </div>
    </div>
  );
};

export default AnalysisDisplay;
