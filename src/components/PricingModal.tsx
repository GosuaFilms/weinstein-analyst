import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Language } from '../types';
import { usePlan } from '../hooks/usePlan';

// Stripe prices are chosen server-side (stripe-checkout) from the plan + billing
// period; see supabase/functions/_shared/stripePrices.ts.

type PaidPlan = 'pro' | 'elite';

interface Props {
  language?: Language;
  onClose: () => void;
}

interface Feature { es: string; en: string; highlight?: boolean }

const FREE_FEATURES: Feature[] = [
  { es: '3 análisis Weinstein al mes', en: '3 Weinstein analyses a month' },
  { es: 'Screener — 5 primeros resultados', en: 'Screener — first 5 results' },
  { es: '1 alerta activa', en: '1 active alert' },
  { es: 'Historial y watchlist', en: 'History and watchlist' },
  { es: 'Gráfico TradingView', en: 'TradingView chart' },
];

const PRO_FEATURES: Feature[] = [
  { es: '40 análisis Weinstein al mes', en: '40 Weinstein analyses a month', highlight: true },
  { es: 'Screener completo — todos los índices', en: 'Full screener — all indices', highlight: true },
  { es: 'Hasta 20 alertas activas', en: 'Up to 20 active alerts' },
  { es: '10 análisis de operaciones al mes', en: '10 position reviews a month' },
  { es: 'Cartera virtual y backtest Stage 2', en: 'Virtual portfolio and Stage 2 backtest', highlight: true },
  { es: 'Telegram y resumen diario (09:00 Madrid)', en: 'Telegram and daily digest (09:00 Madrid)', highlight: true },
  { es: 'Informe semanal de mercado', en: 'Weekly market report' },
];

const ELITE_FEATURES: Feature[] = [
  { es: 'Todo lo de Pro', en: 'Everything in Pro' },
  { es: 'Análisis ilimitados*', en: 'Unlimited analyses*', highlight: true },
  { es: 'Análisis de operaciones ilimitados*', en: 'Unlimited position reviews*', highlight: true },
  { es: 'Hasta 100 alertas activas', en: 'Up to 100 active alerts', highlight: true },
  { es: 'Soporte prioritario', en: 'Priority support' },
];

const PRICES: Record<PaidPlan, { monthly: string; yearly: string; yearlyPerMonth: string; saving: string }> = {
  pro:   { monthly: '€14.99', yearly: '€149', yearlyPerMonth: '€12.42', saving: '€30.88' },
  elite: { monthly: '€39.99', yearly: '€399', yearlyPerMonth: '€33.25', saving: '€80.88' },
};

export const PricingModal: React.FC<Props> = ({ language = Language.ES, onClose }) => {
  const es = language === Language.ES;
  const { plan, loading: planLoading } = usePlan();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<PaidPlan | 'portal' | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const handleCheckout = async (target: PaidPlan) => {
    // Already paying: switching plan happens in Stripe's billing portal
    if (plan !== 'free') return handlePortal();
    setLoading(target);
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
          body: JSON.stringify({ plan: target, billing, successUrl, cancelUrl }),
        }
      );
      const json = await res.json();
      if (json.code === 'USE_PORTAL') return handlePortal();
      if (!res.ok || json.error) throw new Error(json.error ?? 'checkout failed');
      if (json.url) window.location.href = json.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  async function handlePortal() {
    setLoading('portal');
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
      setLoading(null);
    }
  }

  const renderFeatures = (features: Feature[], accent: string) => (
    <ul className="space-y-3 flex-grow mb-6">
      {features.map((f, i) => (
        <li key={i} className={`flex items-start gap-2.5 text-sm ${f.highlight ? 'text-slate-800 dark:text-slate-200 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
          <i className={`fas fa-check text-xs mt-0.5 flex-shrink-0 ${f.highlight ? accent : 'text-slate-400'}`}></i>
          {es ? f.es : f.en}
        </li>
      ))}
    </ul>
  );

  const renderPrice = (p: PaidPlan, accent: string) => (
    <>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-black text-slate-900 dark:text-white">
          {billing === 'monthly' ? PRICES[p].monthly : PRICES[p].yearly}
        </span>
        <span className="text-slate-400 text-sm">
          / {billing === 'monthly' ? (es ? 'mes' : 'month') : (es ? 'año' : 'year')}
        </span>
      </div>
      {billing === 'yearly' && (
        <p className={`text-xs font-bold mt-1 ${accent}`}>
          {PRICES[p].yearlyPerMonth} / {es ? `mes · ahorras ${PRICES[p].saving}/año` : `month · save ${PRICES[p].saving}/year`}
        </p>
      )}
    </>
  );

  const renderCta = (p: PaidPlan, label: string, classes: string) => {
    const busy = loading === p || (plan !== 'free' && loading === 'portal');
    const current = plan === p;
    return (
      <button
        onClick={() => handleCheckout(p)}
        disabled={loading !== null || planLoading}
        className={`w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${classes}`}
      >
        {busy ? (
          <><i className="fas fa-circle-notch animate-spin"></i>{es ? 'Cargando…' : 'Loading…'}</>
        ) : current ? (
          <><i className="fas fa-gear"></i>{es ? 'Gestionar suscripción' : 'Manage subscription'}</>
        ) : plan !== 'free' ? (
          <><i className="fas fa-arrow-right-arrow-left"></i>{es ? `Cambiar a ${p === 'pro' ? 'Pro' : 'Élite'}` : `Switch to ${p === 'pro' ? 'Pro' : 'Elite'}`}</>
        ) : (
          <><i className="fas fa-crown text-yellow-300"></i>{label}</>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-6xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[95vh] overflow-y-auto">

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
        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">

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
                {es ? 'Para probar el método Weinstein' : 'To try the Weinstein method'}
              </p>
            </div>
            {renderFeatures(FREE_FEATURES, 'text-slate-400')}
            <div className={`w-full text-center py-2.5 rounded-xl text-sm font-bold ${plan === 'free' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' : 'border border-slate-200 dark:border-slate-700 text-slate-500'}`}>
              {plan === 'free' ? (es ? 'Plan actual' : 'Current plan') : (es ? 'Plan base' : 'Base plan')}
            </div>
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
              {renderPrice('pro', 'text-violet-500')}
              <p className="text-sm text-slate-500 mt-2">
                {es ? 'Todo el método Weinstein para el inversor activo' : 'The full Weinstein method for active investors'}
              </p>
            </div>
            {renderFeatures(PRO_FEATURES, 'text-violet-500')}
            {renderCta('pro', es ? 'Empezar con Pro' : 'Get Pro',
              plan === 'pro'
                ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-500/30'
                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/30')}
          </div>

          {/* Elite plan */}
          <div className="rounded-2xl border-2 border-amber-500 p-6 flex flex-col relative bg-gradient-to-br from-amber-50/60 to-orange-50/40 dark:from-amber-500/5 dark:to-orange-500/5">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-widest text-amber-500 mb-2">{es ? 'Élite' : 'Elite'}</p>
              {renderPrice('elite', 'text-amber-600 dark:text-amber-400')}
              <p className="text-sm text-slate-500 mt-2">
                {es ? 'Sin límites para quien analiza a diario' : 'No limits for daily analysts'}
              </p>
            </div>
            {renderFeatures(ELITE_FEATURES, 'text-amber-500')}
            {renderCta('elite', es ? 'Empezar con Élite' : 'Get Elite',
              plan === 'elite'
                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/30'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/30')}
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
              ? 'Pago seguro vía Stripe · IVA incluido · Cancela cuando quieras · Sin permanencia'
              : 'Secure payment via Stripe · VAT included · Cancel anytime · No lock-in'}
          </p>
          <p className="text-[10px] text-slate-400">
            {es
              ? '* Uso razonable: hasta 15 análisis y 15 análisis de operaciones al día.'
              : '* Fair use: up to 15 analyses and 15 position reviews a day.'}
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
