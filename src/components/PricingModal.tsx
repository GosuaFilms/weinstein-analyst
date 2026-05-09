import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Language } from '../types';
import { usePlan } from '../hooks/usePlan';

// ── Env vars (set in .env and Vercel) ────────────────────────────────────────
// VITE_STRIPE_PRICE_MONTHLY — Stripe price ID for monthly Pro
// VITE_STRIPE_PRICE_YEARLY  — Stripe price ID for yearly Pro

const PRICE_MONTHLY = import.meta.env.VITE_STRIPE_PRICE_MONTHLY ?? '';
const PRICE_YEARLY  = import.meta.env.VITE_STRIPE_PRICE_YEARLY ?? '';

interface Props {
  language?: Language;
  onClose: () => void;
}

const FREE_FEATURES = [
  { es: 'Análisis Weinstein (hasta 10)', en: 'Weinstein analyses (up to 10)' },
  { es: 'Screener — 5 primeros resultados', en: 'Screener — first 5 results' },
  { es: '2 alertas activas', en: '2 active alerts' },
  { es: 'Historial de análisis', en: 'Analysis history' },
  { es: 'Watchlist', en: 'Watchlist' },
  { es: 'Gráfico TradingView', en: 'TradingView chart' },
];

const PRO_FEATURES = [
  { es: 'Análisis ilimitados', en: 'Unlimited analyses', highlight: true },
  { es: 'Screener completo — todos los índices', en: 'Full screener — all indices', highlight: true },
  { es: 'Hasta 20 alertas activas', en: 'Up to 20 active alerts' },
  { es: 'Cartera virtual Weinstein', en: 'Weinstein virtual portfolio', highlight: true },
  { es: 'Backtest Stage 2 + objetivos de precio', en: 'Stage 2 backtest + price targets', highlight: true },
  { es: 'Notificaciones Telegram', en: 'Telegram notifications', highlight: true },
  { es: 'Resumen diario de Stage 2 (09:00 Madrid)', en: 'Daily Stage 2 digest (09:00 Madrid)', highlight: true },
  { es: 'Re-escaneo automático de cartera', en: 'Auto portfolio re-scan' },
  { es: 'Soporte prioritario', en: 'Priority support' },
];

export const PricingModal: React.FC<Props> = ({ language = Language.ES, onClose }) => {
  const es = language === Language.ES;
  const { plan, loading: planLoading } = usePlan();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const priceId = billing === 'monthly' ? PRICE_MONTHLY : PRICE_YEARLY;

  const handleCheckout = async () => {
    if (!priceId) {
      setError(es
        ? 'Stripe no está configurado. Contacta al administrador.'
        : 'Stripe is not configured. Contact the administrator.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const origin     = window.location.origin;
      const successUrl = `${origin}/?checkout=success`;
      const cancelUrl  = `${origin}/?checkout=cancel`;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            Authorization:   `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ priceId, successUrl, cancelUrl }),
        }
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? 'checkout failed');
      if (json.url) window.location.href = json.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePortal = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-portal`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            Authorization:   `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ returnUrl: window.location.href }),
        }
      );
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? 'portal failed');
      if (json.url) window.location.href = json.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[95vh] overflow-y-auto">

        {/* Header */}
        <div className="relative px-8 pt-10 pb-6 text-center bg-gradient-to-br from-violet-600 via-violet-500 to-indigo-500 text-white overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors">
            <i className="fas fa-xmark text-sm"></i>
          </button>
          <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
            <i className="fas fa-crown text-yellow-300"></i>
            {es ? 'Planes y precios' : 'Plans & pricing'}
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-2">
            {es ? 'Elige tu plan' : 'Choose your plan'}
          </h2>
          <p className="text-white/80 text-sm">
            {es
              ? 'Weinstein Stage Analyst — análisis técnico profesional'
              : 'Weinstein Stage Analyst — professional technical analysis'}
          </p>

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${billing === 'monthly' ? 'bg-white text-violet-600 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              {es ? 'Mensual' : 'Monthly'}
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all relative ${billing === 'yearly' ? 'bg-white text-violet-600 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              {es ? 'Anual' : 'Annual'}
              <span className="pointer-events-none absolute -top-2 -right-1 bg-yellow-400 text-yellow-900 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full">
                −17%
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Free plan */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                {es ? 'Gratis' : 'Free'}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 dark:text-white">€0</span>
                <span className="text-slate-400 text-sm">/ {es ? 'siempre' : 'forever'}</span>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                {es ? 'Para explorar la metodología Weinstein' : 'To explore the Weinstein methodology'}
              </p>
            </div>

            <ul className="space-y-3 flex-grow mb-6">
              {FREE_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                  <i className="fas fa-check text-slate-400 text-xs mt-0.5 flex-shrink-0"></i>
                  {es ? f.es : f.en}
                </li>
              ))}
            </ul>

            {plan === 'free' ? (
              <div className="w-full text-center py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {es ? 'Plan actual' : 'Current plan'}
              </div>
            ) : (
              <div className="w-full text-center py-2.5 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 text-slate-500">
                {es ? 'Plan base' : 'Base plan'}
              </div>
            )}
          </div>

          {/* Pro plan */}
          <div className="rounded-2xl border-2 border-violet-500 p-6 flex flex-col relative bg-gradient-to-br from-violet-50/50 to-indigo-50/50 dark:from-violet-500/5 dark:to-indigo-500/5">
            <div className="absolute -top-3 right-6">
              <span className="bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                {es ? 'Más popular' : 'Most popular'}
              </span>
            </div>

            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-violet-500 mb-2">Pro</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900 dark:text-white">
                  {billing === 'monthly' ? '€14.99' : '€129'}
                </span>
                <span className="text-slate-400 text-sm">
                  / {billing === 'monthly' ? (es ? 'mes' : 'month') : (es ? 'año' : 'year')}
                </span>
              </div>
              {billing === 'yearly' && (
                <p className="text-xs text-violet-500 font-bold mt-1">
                  €10.75 / {es ? 'mes · ahorras €50.88/año' : 'month · save €50.88/year'}
                </p>
              )}
              <p className="text-sm text-slate-500 mt-2">
                {es ? 'Análisis profesional completo sin límites' : 'Full professional analysis without limits'}
              </p>
            </div>

            <ul className="space-y-3 flex-grow mb-6">
              {PRO_FEATURES.map((f, i) => (
                <li key={i} className={`flex items-start gap-2.5 text-sm ${f.highlight ? 'text-slate-800 dark:text-slate-200 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                  <i className={`fas fa-check text-xs mt-0.5 flex-shrink-0 ${f.highlight ? 'text-violet-500' : 'text-slate-400'}`}></i>
                  {es ? f.es : f.en}
                </li>
              ))}
            </ul>

            {plan === 'pro' ? (
              <button
                onClick={handlePortal}
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-bold bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-500/30 transition-all disabled:opacity-50"
              >
                <i className={`fas ${loading ? 'fa-circle-notch animate-spin' : 'fa-gear'} mr-2`}></i>
                {loading ? (es ? 'Cargando…' : 'Loading…') : (es ? 'Gestionar suscripción' : 'Manage subscription')}
              </button>
            ) : (
              <button
                onClick={handleCheckout}
                disabled={loading || planLoading}
                className="w-full py-3 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><i className="fas fa-circle-notch animate-spin"></i>{es ? 'Cargando…' : 'Loading…'}</>
                ) : (
                  <><i className="fas fa-crown text-yellow-300"></i>{es ? 'Empezar con Pro' : 'Get Pro'}</>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-8 mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400">
            <i className="fas fa-triangle-exclamation mr-2"></i>{error}
          </div>
        )}

        {/* Footer */}
        <div className="px-8 pb-8 text-center space-y-2">
          <p className="text-[10px] text-slate-400">
            {es
              ? 'Pago seguro vía Stripe · Cancela cuando quieras · Sin permanencia'
              : 'Secure payment via Stripe · Cancel anytime · No lock-in'}
          </p>
          <p className="text-[10px] text-slate-400">
            {es
              ? '⚠️ Herramienta educativa. No es asesoramiento financiero.'
              : '⚠️ Educational tool. Not financial advice.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
