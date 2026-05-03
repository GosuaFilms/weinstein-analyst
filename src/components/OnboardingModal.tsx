
import React, { useState } from 'react';

interface Props {
  onClose: () => void;
}

const STEPS = [
  {
    icon: 'fa-bolt',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    title: '¡Bienvenido a Alpha Stage Terminal!',
    subtitle: 'Tu herramienta de análisis técnico Weinstein',
    body: 'Esta app aplica el método Stan Weinstein para identificar el ciclo de vida de cualquier activo: Stage 1 (base), Stage 2 (tendencia alcista), Stage 3 (techo) y Stage 4 (declive). El objetivo es comprar en Stage 2 y evitar el resto.',
    tip: null,
  },
  {
    icon: 'fa-search',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    title: 'Analiza cualquier activo',
    subtitle: 'Escribe el ticker o sube un gráfico',
    body: 'Introduce el símbolo bursátil (ej. AAPL, TSLA, BTC-USD) o sube una captura de gráfico. La IA analizará el stage actual, la media de 30 semanas, el volumen y te dará un veredicto claro: COMPRAR, ESPERAR o CERRAR.',
    tip: '💡 También puedes escribir el nombre de la empresa en español o inglés y la IA lo buscará automáticamente.',
  },
  {
    icon: 'fa-bell',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    title: 'Alertas técnicas automáticas',
    subtitle: 'Te avisamos cuando pase algo importante',
    body: 'Configura alertas para que la app te notifique cuando un activo cruza la SMA30, rompe una resistencia, perfora un soporte o registra un volumen inusual. Las alertas se comprueban cada 5 minutos automáticamente.',
    tip: '💡 Activa las notificaciones push o conecta Telegram para recibir avisos aunque no estés en la app.',
  },
  {
    icon: 'fa-filter',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
    title: 'Screener de mercado',
    subtitle: 'Encuentra los mejores Stage 2 del mercado',
    body: 'El Screener escanea cientos de valores y filtra los que cumplen las condiciones Weinstein: precio sobre SMA30, SMA30 en ascenso, volumen creciente y patrón de base válido. Ahorra horas de análisis manual.',
    tip: '💡 Usa los filtros por índice (S&P 500, NASDAQ, IBEX35…) para acotar la búsqueda a tu mercado.',
  },
  {
    icon: 'fa-briefcase',
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
    title: 'Portfolio y Cartera IA',
    subtitle: 'Gestiona y optimiza tus posiciones',
    body: 'Registra tus operaciones reales en el Portfolio para hacer seguimiento de P&L, stop-loss y objetivos de precio. La Cartera IA aplica el modelo Weinstein para sugerirte una distribución óptima entre los mejores Stage 2 del momento.',
    tip: '💡 El Backtest Stage 2 calcula el histórico de rentabilidad de cualquier activo siguiendo la estrategia Weinstein.',
  },
];

const OnboardingModal: React.FC<Props> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">

        {/* Progress bar */}
        <div className="h-1 bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <i className="fas fa-times text-xs" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 pb-8">
          {/* Icon */}
          <div className={`w-16 h-16 ${current.iconBg} rounded-2xl flex items-center justify-center mb-6`}>
            <i className={`fas ${current.icon} ${current.iconColor} text-2xl`} />
          </div>

          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1 leading-tight">
            {current.title}
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            {current.subtitle}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
            {current.body}
          </p>

          {current.tip && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{current.tip}</p>
            </div>
          )}

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${
                  i === step
                    ? 'w-6 h-2 bg-amber-500'
                    : 'w-2 h-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Anterior
              </button>
            )}
            <button
              onClick={isLast ? onClose : () => setStep(s => s + 1)}
              className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              {isLast ? (
                <><i className="fas fa-rocket" /> ¡Empezar a analizar!</>
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
