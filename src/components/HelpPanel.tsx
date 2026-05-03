
import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Section {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'weinstein',
    icon: 'fa-book',
    iconColor: 'text-amber-500',
    title: '¿Qué es el método Weinstein?',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>Stan Weinstein desarrolló un método de análisis técnico basado en <strong className="text-slate-800 dark:text-white">ciclos de precio y volumen</strong>. Todo activo pasa por 4 etapas:</p>
        <div className="space-y-2">
          {[
            { stage: 'Stage 1', label: 'Base / Acumulación', color: 'bg-slate-400', desc: 'El precio consolida horizontalmente. El smart money acumula posiciones silenciosamente.' },
            { stage: 'Stage 2', label: 'Tendencia alcista', color: 'bg-emerald-500', desc: '¡La señal de compra! El precio rompe la SMA30 con volumen. Es el mejor momento para entrar.' },
            { stage: 'Stage 3', label: 'Techo / Distribución', color: 'bg-amber-500', desc: 'El precio vuelve a consolidar en zona alta. El smart money distribuye (vende). Evitar comprar.' },
            { stage: 'Stage 4', label: 'Declive', color: 'bg-rose-500', desc: 'El precio cae por debajo de la SMA30. Hay que estar fuera o en corto.' },
          ].map(({ stage, label, color, desc }) => (
            <div key={stage} className="flex gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <div className={`w-2 rounded-full flex-shrink-0 ${color}`} />
              <div>
                <p className="font-black text-slate-900 dark:text-white text-xs">{stage} — {label}</p>
                <p className="text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 rounded-xl text-amber-700 dark:text-amber-300">
          💡 La <strong>SMA30</strong> (media móvil de 30 semanas) es la referencia clave. Precio sobre SMA30 ascendente = alcista. Precio bajo SMA30 descendente = bajista.
        </p>
      </div>
    ),
  },
  {
    id: 'analyze',
    icon: 'fa-search',
    iconColor: 'text-emerald-500',
    title: 'Cómo analizar un activo',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>Tienes <strong className="text-slate-800 dark:text-white">dos formas</strong> de analizar:</p>
        <div className="space-y-2">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <p className="font-black text-slate-900 dark:text-white text-xs mb-1">1. Por ticker o nombre</p>
            <p className="text-xs">Escribe el símbolo bursátil (AAPL, TSLA, BTC-USD, SAN.MC) o el nombre de la empresa. La IA busca automáticamente el ticker correcto.</p>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <p className="font-black text-slate-900 dark:text-white text-xs mb-1">2. Subiendo un gráfico</p>
            <p className="text-xs">Haz una captura de pantalla de cualquier gráfico (TradingView, broker, etc.) y súbela. La IA analizará visualmente el stage, la SMA30 y el patrón.</p>
          </div>
        </div>
        <p className="font-black text-slate-900 dark:text-white text-xs mt-2">El análisis incluye:</p>
        <ul className="space-y-1 text-xs">
          {['Stage actual y tendencia de la SMA30', 'Veredicto: COMPRAR / ESPERAR / CERRAR POSICIÓN', 'Objetivos de precio T1, T2 y T3', 'Stop-loss recomendado', 'Análisis de volumen', 'Contexto del mercado y sector'].map(item => (
            <li key={item} className="flex items-start gap-2">
              <i className="fas fa-check text-emerald-500 text-[10px] mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    id: 'verdict',
    icon: 'fa-chart-line',
    iconColor: 'text-blue-500',
    title: 'Entender el resultado',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <div className="space-y-2">
          {[
            { verdict: 'COMPRAR', color: 'bg-emerald-500', textColor: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20', desc: 'El activo está en Stage 2 con condiciones favorables. Precio sobre SMA30 ascendente, volumen confirma la tendencia. Momento óptimo de entrada.' },
            { verdict: 'ESPERAR', color: 'bg-slate-400', textColor: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700', desc: 'El activo está en Stage 1 (base) o la señal no es clara. Mejor vigilar y esperar la ruptura con volumen.' },
            { verdict: 'CERRAR', color: 'bg-amber-500', textColor: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20', desc: 'El activo muestra señales de Stage 3 o 4. Si tienes posición abierta, considera cerrarla para proteger beneficios.' },
            { verdict: 'VENDER', color: 'bg-rose-500', textColor: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20', desc: 'Stage 4 confirmado. El activo está en declive claro. Salida recomendada si tienes posición larga.' },
          ].map(({ verdict, textColor, bg, desc }) => (
            <div key={verdict} className={`p-3 rounded-xl border ${bg}`}>
              <p className={`font-black text-xs mb-1 ${textColor}`}>{verdict}</p>
              <p className="text-xs">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'alerts',
    icon: 'fa-bell',
    iconColor: 'text-amber-500',
    title: 'Alertas técnicas',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>Las alertas se comprueban <strong className="text-slate-800 dark:text-white">automáticamente cada 5 minutos</strong> mientras la app está abierta.</p>
        <p className="font-black text-slate-900 dark:text-white text-xs">Tipos de alerta disponibles:</p>
        <div className="space-y-2">
          {[
            { name: 'Cruce SMA30 al alza', desc: 'El precio cruza por encima de la media de 30 semanas. Posible inicio de Stage 2.' },
            { name: 'Cruce SMA30 a la baja', desc: 'El precio cae por debajo de la SMA30. Señal de debilidad.' },
            { name: 'Ruptura de resistencia', desc: 'El precio supera un nivel que defines tú. Indica el precio de ruptura.' },
            { name: 'Perforación de soporte', desc: 'El precio cae por debajo de un nivel clave. Indica el precio de soporte.' },
            { name: 'Volumen inusual', desc: 'El volumen supera significativamente la media. Puede indicar movimiento importante.' },
          ].map(({ name, desc }) => (
            <div key={name} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <p className="font-black text-slate-900 dark:text-white text-xs mb-0.5">{name}</p>
              <p className="text-xs">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-3 rounded-xl text-blue-700 dark:text-blue-300">
          💡 Activa <strong>notificaciones push</strong> (icono campana en Alertas) o conecta <strong>Telegram</strong> para recibir avisos en tiempo real aunque no estés en la app.
        </p>
      </div>
    ),
  },
  {
    id: 'screener',
    icon: 'fa-filter',
    iconColor: 'text-blue-500',
    title: 'Screener de mercado',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>El Screener escanea cientos de valores y filtra los que cumplen las <strong className="text-slate-800 dark:text-white">condiciones Weinstein para Stage 2</strong>:</p>
        <ul className="space-y-1 text-xs">
          {[
            'Precio por encima de la SMA30',
            'SMA30 en tendencia ascendente',
            'Volumen por encima de la media',
            'Patrón de base previo válido',
            'Sin sobrecompra extrema',
          ].map(item => (
            <li key={item} className="flex items-start gap-2">
              <i className="fas fa-check text-emerald-500 text-[10px] mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
          <p className="font-black text-slate-900 dark:text-white text-xs mb-1">Filtros disponibles</p>
          <p className="text-xs">Filtra por índice (S&P 500, NASDAQ 100, IBEX 35, DAX, etc.), sector, capitalización y puntuación Weinstein. Ordena por los más fuertes.</p>
        </div>
        <p className="text-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 rounded-xl text-amber-700 dark:text-amber-300">
          💡 Haz clic en cualquier resultado para lanzar el análisis completo directamente.
        </p>
      </div>
    ),
  },
  {
    id: 'portfolio',
    icon: 'fa-briefcase',
    iconColor: 'text-blue-500',
    title: 'Portfolio de operaciones',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>Registra tus operaciones reales para hacer seguimiento completo de tu cartera:</p>
        <ul className="space-y-1 text-xs">
          {[
            'P&L en tiempo real (beneficio/pérdida)',
            'Stop-loss y objetivo de precio por posición',
            'Fecha de entrada y precio de compra',
            'Porcentaje de la cartera por posición',
            'Historial de operaciones cerradas',
          ].map(item => (
            <li key={item} className="flex items-start gap-2">
              <i className="fas fa-check text-blue-500 text-[10px] mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl">
          ⚠️ El Portfolio es para <strong className="text-slate-900 dark:text-white">seguimiento personal</strong>, no ejecuta órdenes reales en tu broker.
        </p>
      </div>
    ),
  },
  {
    id: 'ai-portfolio',
    icon: 'fa-chart-pie',
    iconColor: 'text-violet-500',
    title: 'Cartera IA Weinstein',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>La Cartera IA analiza automáticamente una lista de activos y construye una <strong className="text-slate-800 dark:text-white">cartera óptima según el modelo Weinstein</strong>:</p>
        <ul className="space-y-1 text-xs">
          {[
            'Selecciona los mejores Stage 2 del momento',
            'Propone distribución porcentual entre posiciones',
            'Calcula stop-loss y objetivos para cada activo',
            'Diversifica por sector y geografía',
            'Se actualiza con cada nuevo análisis',
          ].map(item => (
            <li key={item} className="flex items-start gap-2">
              <i className="fas fa-check text-violet-500 text-[10px] mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    id: 'backtest',
    icon: 'fa-clock-rotate-left',
    iconColor: 'text-rose-500',
    title: 'Backtest Stage 2',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>El Backtest simula <strong className="text-slate-800 dark:text-white">cómo habría funcionado la estrategia Weinstein</strong> en un activo concreto durante los últimos años.</p>
        <p className="font-black text-slate-900 dark:text-white text-xs">Resultado incluye:</p>
        <ul className="space-y-1 text-xs">
          {[
            'Todas las entradas y salidas Stage 2 históricas',
            'Rentabilidad de cada operación',
            'Rentabilidad total acumulada',
            'Comparativa vs Buy & Hold',
            'Máximo drawdown',
            'Objetivos de precio T1, T2 y T3',
          ].map(item => (
            <li key={item} className="flex items-start gap-2">
              <i className="fas fa-check text-rose-500 text-[10px] mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl">
          ⚠️ Resultados históricos <strong className="text-slate-900 dark:text-white">no garantizan rendimientos futuros</strong>. Herramienta educativa.
        </p>
      </div>
    ),
  },
  {
    id: 'telegram',
    icon: 'fa-paper-plane',
    iconColor: 'text-sky-500',
    title: 'Notificaciones Telegram',
    content: (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>Conecta tu cuenta de Telegram para recibir alertas directamente en tu móvil.</p>
        <p className="font-black text-slate-900 dark:text-white text-xs">Cómo conectarlo:</p>
        <ol className="space-y-2 text-xs">
          {[
            'Abre el panel de Alertas (icono campana en el header)',
            'En la sección "Canales de notificación", haz clic en "Conectar Telegram"',
            'Escanea el QR o abre el enlace en Telegram',
            'Envía el comando /start al bot',
            '¡Listo! Recibirás alertas cuando se disparen tus condiciones',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    ),
  },
];

const HelpPanel: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  if (!isOpen) return null;

  const active = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/20 dark:bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 transition-colors">

        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            {activeSection && (
              <button
                onClick={() => setActiveSection(null)}
                className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm"
              >
                <i className="fas fa-arrow-left text-xs" />
              </button>
            )}
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-circle-question text-blue-500" /> Manual de uso
              </h3>
              {!activeSection && (
                <p className="text-xs text-slate-500 mt-0.5">Guía completa de la app</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <i className="fas fa-times text-xl" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto">
          {activeSection && active ? (
            /* Section detail */
            <div className="p-6 animate-in fade-in slide-in-from-right duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <i className={`fas ${active.icon} ${active.iconColor}`} />
                </div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">{active.title}</h4>
              </div>
              {active.content}
            </div>
          ) : (
            /* Section list */
            <div className="p-4 space-y-2 animate-in fade-in duration-200">
              {SECTIONS.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl transition-all group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow transition-all">
                      <i className={`fas ${section.icon} ${section.iconColor} text-sm`} />
                    </div>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{section.title}</span>
                  </div>
                  <i className="fas fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-400 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            ¿Tienes dudas? Escríbenos a{' '}
            <a href="mailto:juantxu@gosua.com" className="text-blue-500 hover:underline">juantxu@gosua.com</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default HelpPanel;
