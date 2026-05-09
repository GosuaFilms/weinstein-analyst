import React, { useState, useCallback, useRef, useEffect, Suspense, lazy } from 'react';
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
import AuthModal from './components/AuthModal';
import UserProfileSidebar from './components/UserProfileSidebar';
import EpicHero from './components/EpicHero';
import LiveClock from './components/LiveClock';
import OnboardingModal from './components/OnboardingModal';
import HelpPanel from './components/HelpPanel';
import LandingPage from './components/LandingPage';
import TrackRecordPage from './components/TrackRecordPage';
import PricingPage from './components/PricingPage';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { uploadAnalysisImage } from './lib/imageStorage';
import { useAnalyses } from './hooks/useAnalyses';
import { useAlerts } from './hooks/useAlerts';
import { useWatchlist } from './hooks/useWatchlist';
import WatchlistSidebar from './components/WatchlistSidebar';
import { usePlan } from './hooks/usePlan';
import { PricingModal } from './components/PricingModal';
import { ErrorBoundary } from './components/ErrorBoundary';

// Heavy panels — loaded lazily so they don't bloat the initial bundle
const ChatBot           = lazy(() => import('./components/ChatBot'));
const OperationAnalyzer = lazy(() => import('./components/OperationAnalyzer'));
const TradingViewWidget = lazy(() => import('./components/TradingViewWidget'));
const ScreenerPanel     = lazy(() => import('./components/ScreenerPanel'));
const PortfolioPanel    = lazy(() => import('./components/PortfolioPanel'));
const VirtualPortfolioPanel = lazy(() => import('./components/VirtualPortfolioPanel'));

const THEME_KEY = 'weinstein_theme';
const LANG_KEY = 'weinstein_language';
const MAX_IMAGES = 3;

// ── Tooltip wrapper ────────────────────────────────────────────────────────────
const Tip: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="relative group/tip">
    {children}
    <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xl opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-[200]">
      {label}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-900 dark:border-b-slate-100" />
    </span>
  </div>
);

interface ImageFile {
  url: string;
  data: string;
  mimeType: string;
}

const App: React.FC = () => {
  const { user, signOut, loading: authLoading } = useAuth();
  const { isPro, limits } = usePlan();
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const { history, save: saveAnalysis, remove: removeAnalysis, clear: clearHistory } = useAnalyses();
  const { alerts, add: addAlert, remove: removeAlert, reload: reloadAlerts } = useAlerts();
  const [isCheckingAlerts, setIsCheckingAlerts] = useState(false);
  const [alertCheckResult, setAlertCheckResult] = useState<{ checked: number; triggered: number; skipped?: boolean } | null>(null);
  const [isChartOpen, setIsChartOpen] = useState(false);
  const { watchlist, loading: watchlistLoading, add: addToWatchlist, remove: removeFromWatchlist, has: isInWatchlist } = useWatchlist();

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
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [isScreenerOpen, setIsScreenerOpen] = useState(false);
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [isVirtualPortfolioOpen, setIsVirtualPortfolioOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('weinstein_onboarding_done');
  });

  const [analysis, setAnalysis] = useState<AnalysisState>({ isAnalyzing: false, result: null, error: null });
  const [isSaved, setIsSaved] = useState(true);
  const [images, setImages] = useState<ImageFile[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'operation'>('scan');
  const [operationResult, setOperationResult] = useState<OperationAnalysisResult | null>(null);
  // Used to trigger analysis after setting ticker from an external source (screener, watchlist, etc.)
  const [pendingAnalysis, setPendingAnalysis] = useState<string | null>(null);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Trigger analysis once ticker state has settled (avoids stale closure race with setTimeout)
  useEffect(() => {
    if (!pendingAnalysis) return;
    setPendingAnalysis(null);
    startAnalysis();
    // startAnalysis is intentionally omitted: we want it to re-run only when pendingAnalysis
    // changes (i.e. when a new symbol is requested), not on every render cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnalysis]);

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
      setImageError(`Máximo ${MAX_IMAGES} imágenes por análisis.`);
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

  const triggeredAlertsCount = React.useMemo(
    () => alerts.filter(a => a.status === 'triggered').length,
    [alerts]
  );

  const startAnalysis = useCallback(async () => {
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

      // Upload images to Supabase Storage; fall back to base64 data URLs if upload fails
      let previewUrls: string[] = [];
      if (images.length > 0 && user) {
        previewUrls = await Promise.all(
          images.map(img =>
            uploadAnalysisImage(user.id, img.data, img.mimeType)
              .then(url => url ?? img.url)  // fallback to base64 if upload fails
          )
        );
      }

      await saveAnalysis('scan', ticker || `${images.length} Graphics`, result, previewUrls.length > 0 ? previewUrls : images.map(i => i.url));
      setIsSaved(true);
    } catch (err) {
      setAnalysis({ isAnalyzing: false, result: null, error: (err as Error).message || 'Error connecting to analysis engine.' });
      setIsSaved(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, images, settings, user]);

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
      setImages(item.previewUrls.map(url => {
        // Supabase Storage URLs (https://...) vs legacy base64 data-URIs
        const isDataUri = url.startsWith('data:');
        return {
          url,
          data: isDataUri ? url.split(',')[1] : '',
          mimeType: isDataUri ? (url.match(/:(.*?);/)?.[1] || 'image/png') : 'image/png',
        };
      }));
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

  // Public routes — visible without auth
  if (window.location.pathname === '/resultados') {
    return <TrackRecordPage />;
  }
  if (window.location.pathname === '/precios') {
    return <PricingPage onGetStarted={() => setIsAuthOpen(true)} />;
  }

  // Show landing page for non-authenticated visitors
  if (!authLoading && !user) {
    return (
      <>
        <LandingPage onGetStarted={() => setIsAuthOpen(true)} />
        {isAuthOpen && (
          <AuthModal
            isOpen={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
          />
        )}
      </>
    );
  }

  // Show nothing while auth state is loading (avoids flash of landing page)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Tip label={language === Language.ES ? 'Cambiar a inglés' : 'Switch to Spanish'}>
              <button onClick={toggleLanguage} aria-label={`Cambiar idioma a ${language === Language.ES ? 'inglés' : 'español'}`} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:text-amber-500">
                {language.toUpperCase()}
              </button>
            </Tip>

            <Tip label={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}>
              <button onClick={toggleTheme} aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <i className={`fas ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
              </button>
            </Tip>

            <Tip label={`Alertas técnicas${triggeredAlertsCount > 0 ? ` (${triggeredAlertsCount} disparadas)` : ''}`}>
              <button onClick={() => setIsAlertsOpen(true)} aria-label="Alertas técnicas" className="relative w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <i className="fas fa-bell"></i>
                {triggeredAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">!</span>
                )}
              </button>
            </Tip>

            <Tip label={`Watchlist (${watchlist.length} valores)`}>
              <button onClick={() => setIsWatchlistOpen(true)} aria-label="Watchlist" className="relative w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <i className="fas fa-star"></i>
                {watchlist.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{watchlist.length > 9 ? '9+' : watchlist.length}</span>
                )}
              </button>
            </Tip>

            <Tip label={`Historial (${history.length} análisis)`}>
              <button onClick={() => setIsHistoryOpen(true)} aria-label="Historial de análisis" className="relative w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <i className="fas fa-history"></i>
                {history.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{history.length > 9 ? '9+' : history.length}</span>
                )}
              </button>
            </Tip>

            {user ? (
              <Tip label={`Mi perfil (${user.name})`}>
                <button onClick={() => setIsProfileOpen(true)} aria-label={`Perfil de ${user.name}`} className="w-10 h-10 rounded-xl bg-amber-500 text-slate-900 font-black text-xs flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-700">
                  {userInitials}
                </button>
              </Tip>
            ) : (
              <Tip label="Iniciar sesión">
                <button onClick={() => setIsAuthOpen(true)} aria-label="Iniciar sesión" className="w-10 h-10 rounded-full bg-amber-500 text-slate-900 flex items-center justify-center shadow-lg shadow-amber-500/20">
                  <i className="fas fa-user"></i>
                </button>
              </Tip>
            )}

            <Tip label="Señales públicas">
              <a
                href="/resultados"
                className="hidden sm:flex w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 items-center justify-center text-emerald-600 dark:text-emerald-400"
              >
                <i className="fas fa-trophy text-sm" />
              </a>
            </Tip>

            <Tip label={isPro ? 'Tu plan: Pro ⚡' : 'Actualizar a Pro'}>
              <button
                onClick={() => setIsPricingOpen(true)}
                className="hidden sm:flex w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 items-center justify-center text-amber-600 dark:text-amber-400"
              >
                <i className="fas fa-crown text-sm" />
              </button>
            </Tip>

            <Tip label="Ayuda y manual">
              <button onClick={() => setIsHelpOpen(true)} aria-label="Manual de uso" className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-500 dark:text-blue-400 font-black text-sm">
                ?
              </button>
            </Tip>

            <Tip label="Configuración">
              <button onClick={() => setIsSettingsOpen(true)} aria-label="Configuración" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <i className="fas fa-cog"></i>
              </button>
            </Tip>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {/* Main tabs */}
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl inline-flex shadow-inner">
            <button onClick={() => { setActiveTab('scan'); setOperationResult(null); }} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'scan' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
              <i className="fas fa-search mr-2"></i>
              {language === Language.ES ? 'Escaneo' : 'Scan'}
            </button>
            <button onClick={() => setActiveTab('operation')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'operation' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
              <i className="fas fa-suitcase mr-2"></i>
              {language === Language.ES ? 'Operaciones' : 'Operations'}
            </button>
          </div>

          {/* Tool buttons */}
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl inline-flex shadow-inner gap-1">
            <button
              onClick={() => { if (!user) { setIsAuthOpen(true); return; } setIsPortfolioOpen(true); }}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-sm flex items-center gap-2"
            >
              <i className="fas fa-briefcase text-blue-500"></i>
              <span className="hidden sm:inline">{language === Language.ES ? 'Portfolio' : 'Portfolio'}</span>
            </button>
            <button
              onClick={() => { if (!user) { setIsAuthOpen(true); return; } setIsVirtualPortfolioOpen(true); }}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-violet-600 dark:hover:text-violet-400 hover:shadow-sm flex items-center gap-2"
            >
              <i className="fas fa-chart-pie text-violet-500"></i>
              <span className="hidden sm:inline">{language === Language.ES ? 'Cartera IA' : 'AI Portfolio'}</span>
            </button>
            <button
              onClick={() => { if (!user) { setIsAuthOpen(true); return; } setIsScreenerOpen(true); }}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-emerald-600 dark:hover:text-emerald-400 hover:shadow-sm flex items-center gap-2"
            >
              <i className="fas fa-filter text-emerald-500"></i>
              <span className="hidden sm:inline">Screener</span>
            </button>
          </div>
        </div>

        {activeTab === 'scan' ? (
          <>
            {!analysis.result && !analysis.isAnalyzing && <EpicHero language={language} />}

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

              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple className="hidden" aria-label="Subir gráficos para analizar" />

              {imageError && (
                <p className="mt-3 text-center text-xs font-bold text-rose-500 flex items-center justify-center gap-1.5">
                  <i className="fas fa-triangle-exclamation"></i>
                  {imageError}
                  <button onClick={() => setImageError(null)} className="ml-1 underline hover:no-underline">Cerrar</button>
                </p>
              )}

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
                  {language === Language.ES ? 'Consultando TwelveData y Yahoo Finance y aplicando método Weinstein.' : 'Fetching TwelveData and Yahoo Finance data and applying Weinstein method.'}
                </p>
              </div>
            )}

            {analysis.result && (
              <>
                {/* Action bar — chart toggle + watchlist */}
                {ticker && (
                  <div className="max-w-3xl mx-auto mb-4 flex justify-end gap-2">
                    <button
                      onClick={() => setIsChartOpen(prev => !prev)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border shadow-sm ${
                        isChartOpen
                          ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-500'
                      }`}
                    >
                      <i className="fas fa-chart-candlestick"></i>
                      {isChartOpen
                        ? (language === Language.ES ? 'Ocultar Gráfico' : 'Hide Chart')
                        : (language === Language.ES ? 'Ver Gráfico' : 'View Chart')}
                    </button>
                  </div>
                )}
                {/* Watchlist shortcut bar */}
                {ticker && (
                  <div className="max-w-3xl mx-auto mb-4 flex justify-end">
                    <button
                      onClick={async () => {
                        if (!user) { setIsAuthOpen(true); return; }
                        try {
                          if (isInWatchlist(ticker)) {
                            const item = watchlist.find(w => w.symbol === ticker.toUpperCase());
                            if (item) await removeFromWatchlist(item.id);
                          } else {
                            await addToWatchlist(ticker, analysis.result?.companyName);
                          }
                        } catch (e) { console.error(e); }
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border shadow-sm ${
                        isInWatchlist(ticker)
                          ? 'bg-amber-500 text-slate-900 border-amber-400 hover:bg-amber-400'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:text-amber-500'
                      }`}
                    >
                      <i className={`fas fa-star ${isInWatchlist(ticker) ? '' : 'opacity-60'}`}></i>
                      {isInWatchlist(ticker)
                        ? (language === Language.ES ? 'En Watchlist' : 'In Watchlist')
                        : (language === Language.ES ? 'Añadir a Watchlist' : 'Add to Watchlist')}
                    </button>
                  </div>
                )}
                <AnalysisDisplay data={analysis.result} isSaved={isSaved} ticker={ticker} language={language} images={images} theme={theme} />

                {/* TradingView Chart */}
                {isChartOpen && ticker && (
                  <div className="max-w-5xl mx-auto mt-8">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xl">
                      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                            <i className="fas fa-chart-candlestick text-blue-500"></i>
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                              {ticker.toUpperCase()} — {language === Language.ES ? 'Gráfico Semanal' : 'Weekly Chart'}
                            </h3>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
                              SMA30 · {language === Language.ES ? 'Método Weinstein' : 'Weinstein Method'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setIsChartOpen(false)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                      <Suspense fallback={<div className="h-96 flex items-center justify-center text-slate-400"><i className="fas fa-circle-notch animate-spin mr-2"></i>Cargando gráfico…</div>}>
                    <TradingViewWidget symbol={ticker} theme={theme} />
                  </Suspense>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <Suspense fallback={<div className="flex items-center justify-center py-20 text-slate-400"><i className="fas fa-circle-notch animate-spin mr-2"></i>Cargando…</div>}>
            <OperationAnalyzer
              language={language}
              settings={settings}
              onSave={async (result, t) => { await saveAnalysis('operation', `[Operation] ${t}`, result); }}
              initialResult={operationResult}
            />
          </Suspense>
        )}
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSettingsChange={setSettings} />
      <HistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={selectHistoryItem} onDelete={removeAnalysis} onClearAll={clearHistory} />
      <AlertsSidebar
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        alerts={alerts}
        onAddAlert={(t: string, c: AlertCondition, level?: number) => addAlert(t, c, level)}
        onDeleteAlert={removeAlert}
        checkResult={alertCheckResult}
        isPro={isPro}
        maxAlerts={limits.maxAlerts}
        onUpgrade={() => { setIsAlertsOpen(false); setIsPricingOpen(true); }}
        onCheckAll={async () => {
          setIsCheckingAlerts(true);
          setAlertCheckResult(null);
          try {
            const { data, error } = await supabase.functions.invoke('check-alerts', { body: {} });
            if (error) throw error;
            await reloadAlerts();
            setAlertCheckResult({
              checked: data?.checked ?? 0,
              triggered: data?.triggered ?? 0,
              skipped: data?.skipped ?? false,
            });
          } catch (e) {
            console.error(e);
            setAlertCheckResult({ checked: 0, triggered: 0 });
          } finally {
            setIsCheckingAlerts(false);
          }
        }}
        isChecking={isCheckingAlerts}
      />
      <WatchlistSidebar
        isOpen={isWatchlistOpen}
        onClose={() => setIsWatchlistOpen(false)}
        watchlist={watchlist}
        loading={watchlistLoading}
        onAnalyze={(symbol) => { setTicker(symbol); setActiveTab('scan'); setPendingAnalysis(symbol); }}
        onAddAlert={(t, c) => addAlert(t, c)}
        onRemove={removeFromWatchlist}
      />

      <Suspense fallback={null}>
        {isVirtualPortfolioOpen && (
          <ErrorBoundary label="Error en Cartera Virtual">
          <VirtualPortfolioPanel
            language={language}
            isPro={isPro}
            onUpgrade={() => { setIsVirtualPortfolioOpen(false); setIsPricingOpen(true); }}
            onAnalyze={(symbol) => {
              setTicker(symbol);
              setActiveTab('scan');
              setIsChartOpen(false);
              setPendingAnalysis(symbol);
            }}
            onClose={() => setIsVirtualPortfolioOpen(false)}
          />
          </ErrorBoundary>
        )}

        {isPortfolioOpen && (
          <ErrorBoundary label="Error en Portfolio">
          <PortfolioPanel
            language={language}
            onAnalyze={(symbol) => {
              setTicker(symbol);
              setActiveTab('scan');
              setIsChartOpen(false);
              setPendingAnalysis(symbol);
            }}
            onClose={() => setIsPortfolioOpen(false)}
          />
          </ErrorBoundary>
        )}

        {isScreenerOpen && (
          <ErrorBoundary label="Error en Screener">
          <ScreenerPanel
            language={language}
            isPro={isPro}
            onUpgrade={() => { setIsScreenerOpen(false); setIsPricingOpen(true); }}
            onAnalyze={(symbol) => {
              setTicker(symbol);
              setActiveTab('scan');
              setIsChartOpen(false);
              setPendingAnalysis(symbol);
            }}
            onClose={() => setIsScreenerOpen(false)}
          />
          </ErrorBoundary>
        )}
      </Suspense>


      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      {isPricingOpen && (
        <PricingModal language={language} onClose={() => setIsPricingOpen(false)} />
      )}
      <UserProfileSidebar
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        historyCount={history.length}
        alertsCount={alerts.length}
        onLogout={handleLogout}
        isPro={isPro}
        onUpgrade={() => { setIsProfileOpen(false); setIsPricingOpen(true); }}
      />

      <Suspense fallback={null}>
        <ChatBot currentAnalysis={analysis.result} language={language} />
      </Suspense>

      {/* Help panel */}
      <HelpPanel isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Onboarding modal — first visit only */}
      {showOnboarding && (
        <OnboardingModal onClose={(firstTicker) => {
          localStorage.setItem('weinstein_onboarding_done', '1');
          setShowOnboarding(false);
          if (firstTicker) {
            setTicker(firstTicker);
            setActiveTab('scan');
            setPendingAnalysis(firstTicker);
          }
        }} />
      )}

      <footer className="bg-slate-900 border-t border-slate-800 py-10 px-4 mt-auto">
        <div className="container mx-auto text-center space-y-5">
          <p className="text-[11px] text-slate-500 tracking-[0.3em] font-black uppercase">
            &copy; {new Date().getFullYear()} ALPHA STAGE TERMINAL — WEINSTEIN STRATEGY CERTIFIED
          </p>

          {/* Ko-fi donation button */}
          <div className="flex justify-center">
            <a
              href="https://ko-fi.com/weinstein"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5E5B] hover:bg-[#ff4441] text-white text-xs font-black uppercase tracking-widest rounded-full transition-all shadow-lg shadow-[#FF5E5B]/20 hover:shadow-[#FF5E5B]/40 hover:scale-105 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              {language === Language.ES ? 'Apóyanos en Ko-fi' : 'Support us on Ko-fi'}
            </a>
          </div>

          <div className="flex items-center justify-center gap-6 text-[10px] text-slate-600 dark:text-slate-500">
            <a href="/legal/terms" className="hover:text-slate-400 transition-colors">
              {language === Language.ES ? 'Términos de uso' : 'Terms of Service'}
            </a>
            <span>·</span>
            <a href="/legal/privacy" className="hover:text-slate-400 transition-colors">
              {language === Language.ES ? 'Política de privacidad' : 'Privacy Policy'}
            </a>
            <span>·</span>
            <a href="mailto:juantxu@gosua.com" className="hover:text-slate-400 transition-colors">
              {language === Language.ES ? 'Contacto' : 'Contact'}
            </a>
          </div>
          <p className="text-[10px] text-slate-700 max-w-lg mx-auto leading-relaxed">
            {language === Language.ES
              ? '⚠️ Herramienta educativa basada en el método Weinstein. No constituye asesoramiento financiero. Los mercados conllevan riesgo de pérdida de capital.'
              : '⚠️ Educational tool based on the Weinstein method. Not financial advice. Markets involve risk of capital loss.'}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
