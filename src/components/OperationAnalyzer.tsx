import React, { useState, useRef } from 'react';
import { Language, OperationAnalysisResult, Settings } from '../types';
import { analyzeOperation } from '../services/geminiService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface Props {
  language: Language;
  settings: Settings;
  onSave?: (result: OperationAnalysisResult, ticker: string) => void;
  initialResult?: OperationAnalysisResult | null;
}

const OperationAnalyzer: React.FC<Props> = ({ language, settings, onSave, initialResult }) => {
  const [ticker, setTicker] = useState(initialResult?.tickerSymbol || '');
  const [purchaseDate, setPurchaseDate] = useState(initialResult?.purchaseDate || '');
  const [purchasePrice, setPurchasePrice] = useState(initialResult?.purchasePrice || '');
  const [shares, setShares] = useState(initialResult?.shares?.toString() || '');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<OperationAnalysisResult | null>(initialResult || null);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(!!initialResult);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const displayRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (initialResult) {
      setTicker(initialResult.tickerSymbol || '');
      setPurchaseDate(initialResult.purchaseDate || '');
      setPurchasePrice(initialResult.purchasePrice || '');
      setShares(initialResult.shares?.toString() || '');
      setResult(initialResult);
      setIsSaved(true);
      setError(null);
    }
  }, [initialResult]);

  const handleAnalyze = async () => {
    if (!ticker || !purchaseDate || !purchasePrice || !shares) {
      setError(language === Language.ES ? 'Por favor, rellena todos los campos.' : 'Please fill in all fields.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const analysisResult = await analyzeOperation({
        ticker,
        purchaseDate,
        purchasePrice,
        shares,
        settings,
      });
      
      setResult(analysisResult);
      setIsSaved(false);
    } catch (err: any) {
      setError(err.message || 'Error analizando la operación.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getVerdictStyles = (type: string) => {
    switch (type) {
      case 'BUY': return 'bg-emerald-500 text-white shadow-emerald-500/50';
      case 'SELL': return 'bg-rose-500 text-white shadow-rose-500/50';
      case 'CLOSE': return 'bg-rose-600 text-white shadow-rose-600/50';
      case 'WAIT': return 'bg-amber-500 text-white shadow-amber-500/50';
      default: return 'bg-slate-500 text-white';
    }
  };

  const handleShare = async () => {
    if (!result) return;
    const summary = `📊 Operación ${result.tickerSymbol || ticker}\n📍 ${result.stage}\n💰 P/L: ${result.profitPercentage}\n📈 ${result.verdict}`;
    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(result))));
    const shareUrl = `${window.location.origin}${window.location.pathname}#operation=${encodedData}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Operación: ${result.tickerSymbol || ticker}`,
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
        scale: 3,
        logging: false,
        useCORS: true,
        allowTaint: true,
        ignoreElements: (e) => e.hasAttribute('data-html2canvas-ignore')
      });

      const fileName = `operacion-${result?.tickerSymbol || ticker || 'asset'}`;
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

  const handleSave = () => {
    if (onSave && result) {
      onSave(result, result.tickerSymbol || ticker);
      setIsSaved(true);
    }
  };

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">
            {language === Language.ES ? 'Analizador de Operaciones' : 'Operation Analyzer'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {language === Language.ES 
              ? 'Introduce los datos de tu operación para evaluar si debes mantener, cerrar o ampliar según el método Weinstein.' 
              : 'Enter your trade details to evaluate whether to hold, close, or add according to the Weinstein method.'}
          </p>
        </div>

        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (!isAnalyzing) {
              handleAnalyze();
            }
          }}
          className="p-6 md:p-8 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                {language === Language.ES ? 'Ticker / Empresa' : 'Ticker / Company'}
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Ej: AAPL, Tesla..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                {language === Language.ES ? 'Fecha de Compra' : 'Purchase Date'}
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                {language === Language.ES ? 'Precio de Compra' : 'Purchase Price'}
              </label>
              <input
                type="number"
                step="any"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="Ej: 150.50"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                {language === Language.ES ? 'Número de Acciones' : 'Number of Shares'}
              </label>
              <input
                type="number"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="Ej: 100"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200 dark:border-rose-800 text-sm font-medium">
              <i className="fas fa-exclamation-circle mr-2"></i> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isAnalyzing}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 uppercase tracking-widest"
          >
            {isAnalyzing ? (
              <><i className="fas fa-circle-notch animate-spin"></i> {language === Language.ES ? 'Analizando Operación...' : 'Analyzing Trade...'}</>
            ) : (
              <><i className="fas fa-microscope"></i> {language === Language.ES ? 'Evaluar Operación' : 'Evaluate Trade'}</>
            )}
          </button>
        </form>

        {result && (
          <div ref={displayRef} className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
              <div>
                <h3 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  {result.tickerSymbol || ticker}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 font-bold">{result.companyName}</p>
              </div>

              <div className="flex flex-col items-center lg:items-end gap-6 shrink-0 w-full lg:w-auto">
                <div className={`w-full lg:w-auto px-6 py-4 rounded-xl font-black text-sm md:text-base shadow-xl tracking-tight uppercase transition-all transform hover:scale-105 flex items-center justify-center text-center leading-tight max-w-xs lg:max-w-[250px] ${getVerdictStyles(result.verdictType)}`}>
                  <span className="break-words w-full">{result.verdict}</span>
                </div>

                <div className="flex items-center gap-3" data-html2canvas-ignore="true">
                  <button
                    onClick={handleShare}
                    className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center transition-all"
                    title={language === Language.ES ? 'Compartir' : 'Share'}
                  >
                    <i className={`fas ${copied ? 'fa-check text-emerald-500' : 'fa-share-nodes'}`}></i>
                  </button>
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                      disabled={isDownloading}
                      className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center transition-all disabled:opacity-50"
                      title={language === Language.ES ? 'Descargar' : 'Download'}
                    >
                      {isDownloading ? (
                        <i className="fas fa-circle-notch animate-spin"></i>
                      ) : (
                        <i className="fas fa-download"></i>
                      )}
                    </button>
                    
                    {showDownloadMenu && (
                      <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-10">
                        <button
                          onClick={() => download('png')}
                          className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                        >
                          <i className="fas fa-image text-blue-500"></i> PNG
                        </button>
                        <button
                          onClick={() => download('pdf')}
                          className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 border-t border-slate-100 dark:border-slate-700"
                        >
                          <i className="fas fa-file-pdf text-rose-500"></i> PDF
                        </button>
                      </div>
                    )}
                  </div>

                  {onSave && (
                    <button
                      onClick={handleSave}
                      disabled={isSaved}
                      className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${
                        isSaved 
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                          : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 shadow-lg'
                      }`}
                    >
                      <i className={`fas ${isSaved ? 'fa-check' : 'fa-bookmark'}`}></i>
                      {isSaved ? (language === Language.ES ? 'Guardado' : 'Saved') : (language === Language.ES ? 'Guardar' : 'Save')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Precio Actual</span>
                <span className="text-xl font-mono font-bold text-slate-900 dark:text-white">{result.currentPrice}</span>
                {result.priceTimestamp && <span className="block text-[9px] text-slate-500 mt-1 truncate" title={result.priceTimestamp}>{result.priceTimestamp}</span>}
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Etapa Actual</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{result.stage}</span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Beneficio / Pérdida</span>
                <span className={`text-xl font-mono font-bold ${String(result.profitPercentage || '').includes('-') ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {result.profitPercentage || '0%'}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total P/L</span>
                <span className={`text-xl font-mono font-bold ${String(result.profitAmount || '').includes('-') ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {result.profitAmount || '0'}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <i className="fas fa-chart-pie text-blue-500"></i> Análisis Técnico Actual
                </h4>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
                  {result.technicalAnalysis}
                </p>
              </div>

              <div className="bg-slate-900 dark:bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <i className="fas fa-chess-knight text-6xl text-amber-500"></i>
                </div>
                <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <i className="fas fa-lightbulb"></i> Estrategia Sugerida
                </h4>
                <p className="text-white font-medium leading-relaxed text-sm">
                  {result.suggestedStrategy}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OperationAnalyzer;
