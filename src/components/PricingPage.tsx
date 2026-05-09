import React, { useState } from 'react';

interface Props {
  onGetStarted: () => void;
}

const FREE_FEATURES = [
  { label: 'Análisis Weinstein IA', free: '10 / mes', pro: 'Ilimitados' },
  { label: 'Screener Stage 2', free: '5 resultados', pro: 'Completo — todos los índices' },
  { label: 'Alertas técnicas activas', free: '2', pro: '20' },
  { label: 'Historial de análisis', free: true, pro: true },
  { label: 'Watchlist', free: true, pro: true },
  { label: 'Gráfico TradingView', free: true, pro: true },
  { label: 'Compartir análisis (redes)', free: true, pro: true },
  { label: 'Cartera IA Weinstein', free: false, pro: true },
  { label: 'Backtest Stage 2', free: false, pro: true },
  { label: 'Notificaciones Telegram', free: false, pro: true },
  { label: 'Informe semanal de mercado', free: false, pro: true },
  { label: 'Resumen diario 09:00 Madrid', free: false, pro: true },
  { label: 'Soporte prioritario', free: false, pro: true },
];

const FAQS = [
  {
    q: '¿Necesito saber el método Weinstein para usar la app?',
    a: 'No. La IA analiza el activo y te da un veredicto claro: COMPRAR, ESPERAR o CERRAR. Explica el razonamiento para que vayas aprendiendo el método.',
  },
  {
    q: '¿Cuándo estará disponible el plan Pro?',
    a: 'Estamos en fase beta. Durante este período todos los usuarios tienen acceso gratuito a las funcionalidades principales. El plan Pro se activará próximamente con funciones avanzadas.',
  },
  {
    q: '¿Qué mercados cubre el screener?',
    a: 'S&P 500, NASDAQ 100, DAX 40, IBEX 35 y otros índices europeos. Estamos añadiendo más mercados continuamente.',
  },
  {
    q: '¿Los análisis son en tiempo real?',
    a: 'Los datos de precio son en tiempo real vía TwelveData. El análisis IA se genera en el momento para cada consulta.',
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Sí. El plan Pro (cuando esté activo) se puede cancelar en cualquier momento desde tu perfil, sin permanencia ni penalizaciones.',
  },
  {
    q: '¿Esto es asesoramiento financiero?',
    a: 'No. Alpha Stage Terminal es una herramienta educativa de análisis técnico basada en el método Weinstein. Siempre invierte con tu propio criterio y gestión de riesgo.',
  },
];

const NAV_LINKS = [
  { label: 'Resultados', href: '/resultados' },
  { label: 'Precios', href: '/precios' },
];

const PricingPage: React.FC<Props> = ({ onGetStarted }) => {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const monthlyPrice = billing === 'monthly' ? '14.99' : '10.75';
  const yearlyTotal = '129';

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #080e1a 0%, #0b1525 60%, #080e1a 100%)' }}>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-900 font-black text-lg">⚡</div>
            <div>
              <div className="text-white font-black text-base tracking-tight leading-none">ALPHA STAGE</div>
              <div className="text-amber-500 text-[8px] font-bold uppercase tracking-widest">Weinstein Terminal</div>
            </div>
          </a>
          <div className="flex items-center gap-2">
            {NAV_LINKS.map(({ label, href }) => (
              <a key={href} href={href} className="hidden sm:block text-slate-400 hover:text-white text-sm font-bold transition-colors px-3 py-2">{label}</a>
            ))}
            <button
              onClick={onGetStarted}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:scale-105"
            >
              Empezar gratis →
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16">

        {/* ── Hero ── */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-xs font-black uppercase tracking-widest mb-6">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping" />
            100% gratis durante el beta
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-white mb-5 leading-tight">
            Planes simples.<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }}>
              Sin sorpresas.
            </span>
          </h1>
          <p className="text-slate-400 text-xl max-w-xl mx-auto">
            Empieza gratis hoy. El plan Pro se activa próximamente con funciones avanzadas para el inversor serio.
          </p>
        </div>

        {/* ── Billing toggle ── */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <span className={`text-sm font-bold transition-colors ${billing === 'monthly' ? 'text-white' : 'text-slate-500'}`}>Mensual</span>
          <button
            onClick={() => setBilling(b => b === 'monthly' ? 'yearly' : 'monthly')}
            style={{
              position: 'relative',
              width: '52px',
              height: '28px',
              borderRadius: '14px',
              backgroundColor: billing === 'yearly' ? '#f59e0b' : '#334155',
              transition: 'background-color 0.2s',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            <span style={{
              position: 'absolute',
              top: '4px',
              left: '4px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transform: billing === 'yearly' ? 'translateX(24px)' : 'translateX(0)',
              transition: 'transform 0.2s',
            }} />
          </button>
          <span className={`text-sm font-bold transition-colors ${billing === 'yearly' ? 'text-white' : 'text-slate-500'}`}>
            Anual
            <span className="ml-2 text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-black">−17%</span>
          </span>
        </div>

        {/* ── Plan cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">

          {/* Free */}
          <div className="rounded-3xl border border-white/10 p-8 flex flex-col" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="mb-8">
              <div className="text-slate-400 text-xs font-black uppercase tracking-widest mb-3">Gratis</div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-black text-white">€0</span>
                <span className="text-slate-500 text-sm">/ siempre</span>
              </div>
              <p className="text-slate-500 text-sm">Para explorar el método Weinstein sin compromiso.</p>
            </div>

            <ul className="space-y-3.5 flex-grow mb-8">
              {[
                '10 análisis Weinstein al mes',
                'Screener — 5 primeros resultados',
                '2 alertas técnicas activas',
                'Historial de análisis',
                'Watchlist ilimitada',
                'Gráfico TradingView integrado',
                'Compartir análisis en redes',
              ].map(f => (
                <li key={f} className="flex items-center gap-3 text-sm text-slate-400">
                  <i className="fas fa-check text-slate-600 text-xs" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={onGetStarted}
              className="w-full py-3.5 rounded-2xl border border-white/10 text-slate-300 font-black text-sm hover:bg-white/5 transition-all"
            >
              Empezar gratis
            </button>
          </div>

          {/* Pro */}
          <div className="rounded-3xl border-2 border-amber-500/50 p-8 flex flex-col relative" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(251,191,36,0.03))' }}>
            {/* Badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <div className="px-5 py-1.5 bg-amber-500 text-slate-900 text-xs font-black uppercase tracking-widest rounded-full shadow-lg shadow-amber-500/30">
                ⚡ Próximamente
              </div>
            </div>

            <div className="mb-8 mt-2">
              <div className="text-amber-400 text-xs font-black uppercase tracking-widest mb-3">Pro</div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-5xl font-black text-white">€{monthlyPrice}</span>
                <span className="text-slate-500 text-sm">/ mes</span>
              </div>
              {billing === 'yearly' && (
                <div className="text-amber-400 text-xs font-bold mb-2">€{yearlyTotal}/año · ahorras €20.88</div>
              )}
              <p className="text-slate-400 text-sm">Análisis profesional sin límites para el inversor serio.</p>
            </div>

            <ul className="space-y-3.5 flex-grow mb-8">
              {[
                { label: 'Todo lo del plan Gratis', highlight: false },
                { label: 'Análisis ilimitados', highlight: true },
                { label: 'Screener completo — todos los índices', highlight: true },
                { label: 'Hasta 20 alertas activas', highlight: false },
                { label: 'Cartera IA Weinstein', highlight: true },
                { label: 'Backtest Stage 2', highlight: true },
                { label: 'Notificaciones Telegram', highlight: true },
                { label: 'Informe semanal de mercado', highlight: true },
                { label: 'Resumen diario a las 09:00 Madrid', highlight: false },
                { label: 'Soporte prioritario', highlight: false },
              ].map(({ label, highlight }) => (
                <li key={label} className={`flex items-center gap-3 text-sm ${highlight ? 'text-white font-semibold' : 'text-slate-400'}`}>
                  <i className={`fas fa-check text-xs ${highlight ? 'text-amber-400' : 'text-slate-600'}`} />
                  {label}
                </li>
              ))}
            </ul>

            <button
              onClick={onGetStarted}
              className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm transition-all shadow-lg shadow-amber-500/20 hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <i className="fas fa-bell" />
              Avísame cuando esté disponible
            </button>
            <p className="text-center text-slate-600 text-xs mt-3">Cancela cuando quieras · Sin permanencia</p>
          </div>
        </div>

        {/* ── Comparison table ── */}
        <div className="mb-20">
          <h2 className="text-2xl font-black text-white text-center mb-8">Comparativa completa</h2>
          <div className="rounded-2xl border border-white/5 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-3 bg-white/5 px-6 py-4 text-xs font-black uppercase tracking-widest">
              <div className="text-slate-400">Función</div>
              <div className="text-center text-slate-400">Gratis</div>
              <div className="text-center text-amber-400">Pro</div>
            </div>
            {/* Rows */}
            {FREE_FEATURES.map(({ label, free, pro }, i) => (
              <div
                key={label}
                className={`grid grid-cols-3 px-6 py-4 border-t border-white/5 text-sm items-center ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
              >
                <div className="text-slate-300 font-medium">{label}</div>
                <div className="text-center">
                  {typeof free === 'boolean' ? (
                    free
                      ? <i className="fas fa-check text-emerald-500" />
                      : <i className="fas fa-minus text-slate-700" />
                  ) : (
                    <span className="text-slate-400 text-xs font-bold">{free}</span>
                  )}
                </div>
                <div className="text-center">
                  {typeof pro === 'boolean' ? (
                    pro
                      ? <i className="fas fa-check text-amber-400" />
                      : <i className="fas fa-minus text-slate-700" />
                  ) : (
                    <span className="text-amber-400 text-xs font-bold">{pro}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="mb-20">
          <h2 className="text-2xl font-black text-white text-center mb-8">Preguntas frecuentes</h2>
          <div className="space-y-3">
            {FAQS.map(({ q, a }, i) => (
              <div key={i} className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <button
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-white font-bold text-sm">{q}</span>
                  <i className={`fas fa-chevron-down text-slate-500 text-xs transition-transform shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-slate-400 text-sm leading-relaxed border-t border-white/5 pt-4">
                    {a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="rounded-3xl p-10 text-center" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(251,191,36,0.05))', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="text-3xl font-black text-white mb-3">Empieza gratis hoy</div>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            Sin tarjeta de crédito. Sin compromiso. Accede al método Weinstein de forma inmediata.
          </p>
          <button
            onClick={onGetStarted}
            className="inline-flex items-center gap-3 px-10 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl transition-all shadow-2xl shadow-amber-500/30 hover:scale-105"
          >
            <i className="fas fa-rocket" />
            Crear cuenta gratis
          </button>
        </div>

        {/* ── Footer ── */}
        <div className="mt-12 text-center text-slate-600 text-xs space-y-1">
          <p>© 2026 Alpha Stage Terminal · <a href="/" className="hover:text-slate-400 transition-colors">alphastage.finance</a></p>
          <p>Herramienta educativa. No es asesoramiento financiero. Invierte con criterio propio.</p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
