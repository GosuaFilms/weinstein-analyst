import React, { useState, useCallback, useRef, useEffect } from 'react';
import { analyzeMarket } from './services/geminiService';
import {
  AnalysisState,
  Settings,
  SavedAnalysis,
  AlertCondition,
  Language,
  OperationAnalysisResult,
} from './types';
import AnalysisDisplay from './components/AnalysisDisplay';
import StageInfo from './components/StageInfo';
import SettingsModal from './components/SettingsModal';
import HistorySidebar from './components/HistorySidebar';
import AlertsSidebar from './components/AlertsSidebar';
import ChatBot from './components/ChatBot';
import AuthModal from './components/AuthModal';
import UserProfileSidebar from './components/UserProfileSidebar';
import EpicHero from './components/EpicHero';
import LiveClock from './components/LiveClock';
import OperationAnalyzer from './components/OperationAnalyzer';
import { useAuth } from './contexts/AuthContext';
import { useAnalyses } from './hooks/useAnalyses';
import { useAlerts } from './hooks/useAlerts';

const THEME_KEY = 'weinstein_theme';
const LANG_KEY = 'weinstein_language';
const MAX_IMAGES = 3;

interface ImageFile {
  url: string;
  data: string;
  mimeType: string;
}

const App: React.FC = () => {
  const { user, signOut } = useAuth();
  const { history, save: saveAnalysis, remove: removeAnalysis, clear: clearHistory } = useAnalyses();
  const { alerts, add: addAlert, remove: removeAlert } = useAlerts();

  const [ticker, setTicker] = useState('');
  const [tickerError, setTickerError] = useState<string | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved as 'light' | 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem(LANG_KEY) as Language) || Language.ES);

  const [settings, setSettings] = useState<Settings>({
    smaPeriod: 30,
    volumeMultiplier: 2.0,
    language,
  });

  useEffect(() => {
    setSettings(s => ({ ...s, language }));
    localStorage.setItem(LANG_KEY, language);
  }, [language]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const [analysis, setAnalysis] = useState<AnalysisState>({ isAnalyzing: false, result: null, error: null });
  const [isSaved, setIsSaved] = useState(true);
  const [images, setImages] = useState<ImageFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'operation'>('scan');
  const [operationResult, setOperationResult] = useState<OperationAnalysisResult | null>(null);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const toggleLanguage = () => setLanguage(prev => (prev === Language.ES ? Language.EN : Language.ES));
  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

  const handleLogout = async () => {
    await signOut();
    setIsProfileOpen(false);
    clear();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    if (images.length + files.length > MAX_IMAGES) {
      alert(`Max ${MAX_IMAGES} images.`);
      return;
    }
    const newImages: ImageFile[] = [];
    for (const file of files) {
      const reader = new FileReader();
      const p = new Promise<ImageFile>(resolve => {
        reader.onloadend = () => {
          const result = reader.result as string;
          const parts = result.split(',');
          resolve({
            url: result,
            data: parts[1],
            mimeType: parts[0].match(/:(.*?);/)?.[1] || 'image/png',
          });
        };
        reader.readAsDataURL(file);
      });
      newImages.push(await p);
    }
    setImages(prev => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => setImages(prev => prev.filter((_, i) => i !== index));

  const startAnalysis = async () => {
    if (!ticker && images.length === 0) return;
    if (!user) { setIsAuthOpen(true); return; }

    setAnalysis({ isAnalyzing: true, result: null, error: null });
    setIsSaved(false);

    try {
      const result = await analyzeMarket({
        ticker: ticker || undefined,
        images: images.length > 0 ? images.map(img => ({ data: img.data, mimeType: img.mimeType })) : undefined,
        settings,
      });
      setAnalysis({ isAnalyzing: false, result, error: null });
      await saveAnalysis('scan', ticker || `${images.length} Graphics`, result, images.map(i => i.url));
      setIsSaved(true);
    } catch (err) {
      setAnalysis({ isAnalyzing: false, result: null, error: (err as Error).message || 'Error connecting to analysis engine.' });
      setIsSaved(true);
    }
  };

  const selectHistoryItem = (item: SavedAnalysis) => {
    if (item.label.startsWith('[Operation]')) {
      setActiveTab('operation');
      setOperationResult(item.result as unknown as OperationAnalysisResult);
      setAnalysis({ isAnalyzing: false, result: null, error: null });
      setIsHistoryOpen(false);
      return;
    }
    setActiveTab('scan');
    setOperationResult(null);
    setTicker(item.label.includes('Graphics') ? '' : item.label);
    if (item.previewUrls) {
      setImages(item.previewUrls.map(url => ({
        url,
        data: url.split(',')[1],
        mimeType: url.match(/:(.*?);/)?.[1] || 'image/png',
      })));
    } else {
      setImages([]);
    }
    setAnalysis({ isAnalyzing: false, result: item.result, error: null });
    setIsSaved(true);
    setIsHistoryOpen(false);
  };

  const clear = useCallback(() => {
    setTicker('');
    setTickerError(null);
    setImages([]);
    setAnalysis({ isAnalyzing: false, result: null, error: null });
    setIsSaved(true);
  }, []);

  const userInitials = user ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '';

  return (
    <div className="min-h-screen flex flex-col font-sans relative">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-4 transition-colors">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={clear}>
            <div className="w-10 h-10 bg-slate-900 dark:bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:rotate-12 transition-transform">
              <i className="fas fa-bolt text-amber-500 dark:text-slate-900 text-xl font-black"></i>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">ALPHA STAGE</h1>
              <p className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase tracking-widest mt-0.5">Weinstein Pro Terminal</p>
            </div>
          </div>

          <LiveClock language={language} />

          <div className="flex items-center gap-1.5 sm:gap-4">
            <button onClick={toggleLanguage} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:text-amber-500 flex items-center gap-2">
              <i className="fas fa-globe"></i>
              {language.toUpperCase()}
            </button>

            <button onClick={toggleTheme} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
              <i className={`fas ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
            </button>

            <button onClick={() => setIsAlertsOpen(true)} className="relative w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
              <i className="fas fa-bell"></i>
              {alerts.filter(a => a.status === 'triggered').length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">!</span>
              )}
            </button>

            <button onClick={() => setIsHistoryOpen(true)} className="relative w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
              <i className="fas fa-history"></i>
              {history.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{history.length > 9 ? '9+' : history.length}</span>
              )}
            </button>

            {user ? (
              <button onClick={() => setIsProfileOpen(true)} className={`w-10 h-10 rounded-xl ${user.avatarColor} text-white font-black text-xs flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-700`}>
                {userInitials}
              </button>
            ) : (
              <button onClick={() => setIsAuthOpen(true)} className="w-10 h-10 rounded-full bg-amber-500 text-slate-900 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <i className="fas fa-user"></i>
              </button>
            )}

            <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
              <i className="fas fa-cog"></i>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="flex justify-center mb-8">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl inline-flex shadow-inner">
            <button onClick={() => { setActiveTab('scan'); setOperationResult(null); }} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'scan' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
              <i className="fas fa-search mr-2"></i>
              {language === Language.ES ? 'Escaneo' : 'Scan'}
            </button>
            <button onClick={() => setActiveTab('operation')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'operation' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
              <i className="fas fa-briefcase mr-2"></i>
              {language === Language.ES ? 'Operaciones' : 'Operations'}
            </button>
          </div>
        </div>

        {activeTab === 'scan' ? (
          <>
            {!analysis.result && !analysis.isAnalyzing && <EpicHero />}

            <div className="max-w-3xl mx-auto mb-12 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-500 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 border border-amber-500/20">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
                {user ? `Operator: ${user.name}` : `Terminal v3.1 (${language.toUpperCase()})`}
              </div>

              <h2 className="text-4xl sm:text-5xl font-black mb-4 bg-gradient-to-r from-slate-900 to-slate-500 dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tighter uppercase">
                {language === Language.ES ? 'Escaneo de Alta Precisión' : 'High-Precision Scanning'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg mb-8 max-w-2xl mx-auto">
                {language === Language.ES
                  ? 'Identifica la etapa de mercado con rigor matemático y disciplina Weinstein.'
                  : 'Identify market stages with mathematical rigor and Weinstein discipline.'}
              </p>

              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 to-emerald-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <form
                  onSubmit={e => { e.preventDefault(); if (!analysis.isAnalyzing && (ticker || images.length > 0) && !tickerError) startAnalysis(); }}
                  className="relative bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row gap-2"
                >
                  <div className="flex-grow relative flex items-center">
                    <i className="fas fa-search absolute left-4 text-slate-400 dark:text-slate-500"></i>
                    <input
                      type="text"
                      placeholder={language === Language.ES ? 'Ticker, símbolo o empresa...' : 'Ticker, symbol or company...'}
                      className={`w-full bg-slate-50 dark:bg-slate-900 border-none text-slate-900 dark:text-white rounded-xl py-4 pl-12 pr-12 focus:ring-2 outline-none ${tickerError ? 'focus:ring-rose-500/50' : 'focus:ring-amber-500/50'}`}
                      value={ticker}
                      onChange={e => { setTicker(e.target.value); setTickerError(null); }}
                    />
                    {ticker && (
                      <button type="button" onClick={() => setTicker('')} className="absolute right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        <i className="fas fa-times-circle"></i>
                      </button>
                    )}
                  </div>

                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={images.length >= MAX_IMAGES} className={`px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-2 ${images.length > 0 ? 'bg-blue-600 text-white shadow-blue-500/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50'}`}>
                    <i className="fas fa-images"></i>
                    {images.length > 0 ? `${images.length}/${MAX_IMAGES}` : language === Language.ES ? 'Gráficos' : 'Charts'}
                  </button>

                  <button type="submit" disabled={analysis.isAnalyzing || (!ticker && images.length === 0) || !!tickerError} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 text-white font-black rounded-xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20">
                    {analysis.isAnalyzing ? (
                      <><i className="fas fa-circle-notch animate-spin"></i> {language === Language.ES ? 'CALCULANDO...' : 'CALCULATING...'}</>
                    ) : (
                      <><i className="fas fa-chart-simple"></i> {language === Language.ES ? 'ANALIZAR' : 'ANALYZE'}</>
                    )}
                  </button>
                </form>
              </div>

              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" />

              {images.length > 0 && (
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-32 h-20 rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-600 shadow-lg group">
                      <img src={img.url} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100">
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!analysis.result && !analysis.isAnalyzing && !analysis.error && <StageInfo />}

            {analysis.error && (
              <div className="max-w-3xl mx-auto mt-8 p-6 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl text-center">
                <i className="fas fa-exclamation-triangle text-3xl text-rose-500 mb-4"></i>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {language === Language.ES ? 'Error de Análisis' : 'Analysis Error'}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 font-medium">{analysis.error}</p>
              </div>
            )}

            {analysis.isAnalyzing && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="relative w-24 h-24 mb-6">
                  <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-4 bg-amber-500/10 rounded-full flex items-center justify-center">
                    <i className="fas fa-microchip text-amber-500 text-xl animate-pulse"></i>
                  </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 text-center uppercase tracking-tighter">
                  {language === Language.ES ? 'Crujiendo Datos...' : 'Crunching Data...'}
                </h3>
                <p className="text-slate-500 text-sm text-center max-w-xs italic">
                  {language === Language.ES ? 'Consultando Finnhub y aplicando método Weinstein.' : 'Fetching Finnhub data and applying Weinstein method.'}
                </p>
              </div>
            )}

            {analysis.result && (
              <AnalysisDisplay data={analysis.result} isSaved={isSaved} ticker={ticker} language={language} images={images} theme={theme} />
            )}
          </>
        ) : (
          <OperationAnalyzer
            language={language}
            settings={settings}
            onSave={async (result, t) => { await saveAnalysis('operation', `[Operation] ${t}`, result); }}
            initialResult={operationResult}
          />
        )}
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSettingsChange={setSettings} />
      <HistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={selectHistoryItem} onDelete={removeAnalysis} onClearAll={clearHistory} />
      <AlertsSidebar isOpen={isAlertsOpen} onClose={() => setIsAlertsOpen(false)} alerts={alerts} onAddAlert={(t: string, c: AlertCondition) => addAlert(t, c)} onDeleteAlert={removeAlert} onCheckAll={() => {}} isChecking={false} />

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <UserProfileSidebar
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        historyCount={history.length}
        alertsCount={alerts.length}
        onLogout={handleLogout}
      />

      <ChatBot currentAnalysis={analysis.result} language={language} />

      <footer className="bg-slate-900 border-t border-slate-800 py-12 px-4 mt-auto">
        <div className="container mx-auto text-center space-y-6">
          <p className="text-[11px] text-slate-500 tracking-[0.3em] font-black uppercase">
            &copy; {new Date().getFullYear()} ALPHA STAGE TERMINAL — WEINSTEIN STRATEGY CERTIFIED
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
