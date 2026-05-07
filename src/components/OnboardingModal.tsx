import React, { useState } from 'react';

interface Props {
  onClose: (firstTicker?: string) => void;
}

// ── Weinstein stage cycle visual ─────────────────────────────────────────────
const StageCycle: React.FC = () => (
  <div className="flex items-end justify-center gap-1.5 h-20 my-2">
    {[
      { label: 'Stage 1', h: 'h-10', bg: 'bg-blue-400',   tip: 'Base' },
      { label: 'Stage 2', h: 'h-20', bg: 'bg-emerald-500', tip: '▲ Compra' },
      { label: 'Stage 3', h: 'h-14', bg: 'bg-amber-400',  tip: 'Techo' },
      { label: 'Stage 4', h: 'h-6',  bg: 'bg-rose-500',   tip: '▼ Evitar' },
    ].map((s, i) => (
      <div key={i} className="flex flex-col items-center gap-1">
        <span className={`text-[9px] font-black ${s.bg.replace('bg-', 'text-')}`}>{s.tip}</span>
        <div className={`w-12 ${s.h} ${s.bg} rounded-t-lg opacity-90 flex items-end justify-center pb-1 transition-all`} />
        <span className="text-[8px] text-slate-500 font-bold">{s.label}</span>
      </div>
    ))}
    {/* Arrow */}
    <div className="self-center ml-1 text-slate-400 text-xs">→</div>
  </div>
);

// ── Mini alert card ───────────────────────────────────────────────────────────
const MiniAlert: React.FC<{ ticker: string; label: string; color: string }> = ({ ticker, label, color }) => (
  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${color} text-xs font-bold`}>
    <i className="fas fa-bell text-[10px]" />
    <span className="font-black">{ticker}</span>
    <span className="opacity-70">{label}</span>
  </div>
);

// ── Mini screener card ────────────────────────────────────────────────────────
const MiniStock: React.FC<{ symbol: string; name: string; pct: string }> = ({ symbol, name, pct }) => (
  <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl">
    <div>
      <span className="text-[10px] font-black text-slate-900 dark:text-white">{symbol}</span>
      <span className="text-[9px] text-slate-500 ml-1">{name}</span>
    </div>
    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{pct}</span>
  </div>
);

// ── Steps definition ──────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 'welcome',
    icon: 'fa-bolt',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    title: '¡Bienvenido a Alpha Stage!',
    subtitle: 'El terminal Weinstein más completo',
    body: 'Invierte con disciplina usando el método Stan Weinstein. La IA analiza cualquier activo y te dice exactamente en qué momento del ciclo está y qué deberías hacer.',
    visual: (
      <StageCycle />
    ),
    tip: null,
  },
  {
    id: 'analyze',
    icon: 'fa-search',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    title: 'Analiza en segundos',
    subtitle: 'Ticker, nombre o gráfico — tú eliges',
    body: 'Escribe el símbolo (AAPL, TSLA, NVDA…) o el nombre de la empresa en español. También puedes subir una captura de pantalla del gráfico.',
    visual: (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex items-center gap-3 shadow-sm">
        <i className="fas fa-search text-slate-400 text-sm" />
        <span className="text-sm text-slate-400 flex-1">NVIDIA Corporation…</span>
        <div className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-black rounded-lg">ANALIZAR</div>
      </div>
    ),
    tip: '💡 La IA entiende nombres en español: "Inditex", "Santander", "Telefónica".',
  },
  {
    id: 'stages',
    icon: 'fa-chart-simple',
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
    title: 'El ciclo de 4 etapas',
    subtitle: 'Compra en Stage 2, evita el resto',
    body: 'Weinstein identificó que todo activo pasa por 4 fases. Solo Stage 2 ofrece la mejor relación riesgo/beneficio. La IA te dice en cuál está y cuándo actuar.',
    visual: (
      <div className="grid grid-cols-2 gap-2">
        {[
          { stage: 'Stage 1', desc: 'Fase de base · Acumulación', color: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300', action: 'Observar' },
          { stage: 'Stage 2', desc: 'Tendencia alcista · ¡Oportunidad!', color: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300', action: '✅ COMPRAR' },
          { stage: 'Stage 3', desc: 'Fase de techo · Distribución', color: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300', action: 'Salir' },
          { stage: 'Stage 4', desc: 'Tendencia bajista · Declive', color: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300', action: '🚫 Evitar' },
        ].map(s => (
          <div key={s.stage} className={`p-2.5 rounded-xl border ${s.color}`}>
            <p className="text-[10px] font-black">{s.stage}</p>
            <p className="text-[9px] opacity-70 leading-tight">{s.desc}</p>
            <p className="text-[9px] font-black mt-1">{s.action}</p>
          </div>
        ))}
      </div>
    ),
    tip: null,
  },
  {
    id: 'alerts',
    icon: 'fa-bell',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    title: 'Alertas automáticas',
    subtitle: 'Nunca te pierdas una señal',
    body: 'Configura alertas técnicas y la app te avisará cuando se cumplan. Recibes notificaciones push en el navegador o directamente en Telegram.',
    visual: (
      <div className="space-y-2">
        <MiniAlert ticker="NVDA" label="Supera SMA30 — posible Stage 2" color="bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400" />
        <MiniAlert ticker="META" label="Volumen inusual detectado" color="bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400" />
        <MiniAlert ticker="AAPL" label="Pierde soporte — revisar stop" color="bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400" />
      </div>
    ),
    tip: '💡 Las alertas se comprueban cada 5 minutos automáticamente.',
  },
  {
    id: 'screener',
    icon: 'fa-filter',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    title: 'Screener de mercado',
    subtitle: 'Encuentra los mejores Stage 2',
    body: 'El Screener escanea el S&P 500, NASDAQ, DAX, IBEX35 y más — y filtra solo los valores que cumplen las condiciones Weinstein. Ahorra horas de análisis manual.',
    visual: (
      <div className="space-y-2">
        <MiniStock symbol="NVDA" name="NVIDIA" pct="+Stage 2 ✅" />
        <MiniStock symbol="META" name="Meta Platforms" pct="+Stage 2 ✅" />
        <MiniStock symbol="MSFT" name="Microsoft" pct="+Stage 2 ✅" />
      </div>
    ),
    tip: '💡 El plan gratuito muestra los 5 primeros resultados. Pro desbloquea el screener completo.',
  },
  {
    id: 'start',
    icon: 'fa-rocket',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    title: '¿Cuál es tu primer activo?',
    subtitle: 'Empieza ahora — tarda menos de 10 segundos',
    body: 'Escribe el ticker o nombre de la empresa que quieres analizar primero. Te llevamos directamente al análisis.',
    visual: null,
    tip: null,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
const OnboardingModal: React.FC<Props> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const [firstTicker, setFirstTicker] = useState('');
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleFinish = () => {
    onClose(firstTicker.trim().toUpperCase() || undefined);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={() => onClose()} />

      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="px-7 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === step ? 'w-5 h-2 bg-amber-500' : i < step ? 'w-2 h-2 bg-amber-300' : 'w-2 h-2 bg-slate-300 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => onClose()}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <i className="fas fa-times text-xs" />
          </button>
        </div>

        {/* Content */}
        <div className="px-7 pb-7">
          {/* Icon */}
          <div className={`w-14 h-14 ${current.iconBg} rounded-2xl flex items-center justify-center mb-5`}>
            <i className={`fas ${current.icon} ${current.iconColor} text-xl`} />
          </div>

          <h2 className="text-xl font-black text-slate-900 dark:text-white mb-0.5 leading-tight">
            {current.title}
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {current.subtitle}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
            {current.body}
          </p>

          {/* Visual */}
          {current.visual && (
            <div className="mb-4">
              {current.visual}
            </div>
          )}

          {/* Last step: ticker input */}
          {isLast && (
            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ej: NVDA, Tesla, Inditex…"
                  value={firstTicker}
                  onChange={e => setFirstTicker(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFinish()}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500/50 outline-none"
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Opcional — puedes empezar sin rellenar nada.</p>
            </div>
          )}

          {/* Tip */}
          {current.tip && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{current.tip}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <i className="fas fa-arrow-left" />
              </button>
            )}
            <button
              onClick={isLast ? handleFinish : () => setStep(s => s + 1)}
              className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              {isLast ? (
                <><i className="fas fa-rocket" /> {firstTicker.trim() ? `Analizar ${firstTicker.trim().toUpperCase()}` : '¡Empezar!'}</>
              ) : (
                <>Siguiente <i className="fas fa-arrow-right" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
