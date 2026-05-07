
import React, { useState, useEffect } from 'react';

interface Props {
  onGetStarted: () => void;
}

const FEATURES = [
  {
    icon: 'fa-magnifying-glass-chart',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    title: 'Análisis IA con método Weinstein',
    desc: 'Introduce cualquier ticker o sube un gráfico. La IA identifica el stage actual, analiza la SMA30 semanal, el volumen y te da un veredicto claro: COMPRAR, ESPERAR o CERRAR.',
  },
  {
    icon: 'fa-bell',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    title: 'Alertas técnicas automáticas',
    desc: 'Configura alertas para cruces de SMA30, rupturas de resistencia y explosiones de volumen. Se comprueban cada 5 minutos. Recibe avisos por Telegram o notificación push.',
  },
  {
    icon: 'fa-filter',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    title: 'Screener Stage 2',
    desc: 'Escanea cientos de valores del S&P 500, NASDAQ, DAX e IBEX 35 y filtra automáticamente los que están en Stage 2 con mayor Relative Strength de Mansfield.',
  },
  {
    icon: 'fa-briefcase',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
    title: 'Portfolio y Cartera IA',
    desc: 'Registra tus operaciones reales con P&L en tiempo real. La Cartera IA construye una distribución óptima Weinstein entre los mejores Stage 2 del momento.',
  },
  {
    icon: 'fa-clock-rotate-left',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
    title: 'Backtest Stage 2',
    desc: 'Simula cómo habría funcionado la estrategia Weinstein en cualquier activo durante los últimos años. Rentabilidad histórica, drawdown y comparativa vs Buy & Hold.',
  },
  {
    icon: 'fa-newspaper',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
    title: 'Informe semanal de mercado',
    desc: 'Cada sábado recibes en Telegram y email un análisis completo del mercado: índices, rotación sectorial, macro y los mejores Stage 2 de la semana.',
  },
];

const STAGES = [
  { num: 1, label: 'Base / Acumulación', color: 'bg-slate-500', text: 'text-slate-400', desc: 'El precio consolida. Smart money acumula en silencio.' },
  { num: 2, label: 'Tendencia alcista ✅', color: 'bg-emerald-500', text: 'text-emerald-400', desc: 'Señal de compra. Precio sobre SMA30 ascendente con volumen.' },
  { num: 3, label: 'Techo / Distribución', color: 'bg-amber-500', text: 'text-amber-400', desc: 'Señales de agotamiento. El smart money distribuye.' },
  { num: 4, label: 'Declive', color: 'bg-rose-500', text: 'text-rose-400', desc: 'Precio bajo SMA30. Hay que estar fuera.' },
];

const STEPS = [
  { num: '01', icon: 'fa-keyboard', title: 'Introduce el ticker', desc: 'Escribe el símbolo bursátil (AAPL, SAN.MC, BTC-USD) o el nombre de la empresa. También puedes subir una captura de gráfico.' },
  { num: '02', icon: 'fa-microchip', title: 'La IA analiza', desc: 'En segundos obtienes el stage actual, análisis de la SMA30 semanal, volumen, Relative Strength y objetivos de precio T1, T2 y T3.' },
  { num: '03', icon: 'fa-bullseye', title: 'Toma decisiones', desc: 'Actúa con criterio. Compra en Stage 2, espera en Stage 1, cierra en Stage 3-4. Sin ruido, sin emociones.' },
];

const LandingPage: React.FC<Props> = ({ onGetStarted }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#080e1a] text-white overflow-x-hidden">

      {/* ── Navbar ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#080e1a]/95 backdrop-blur-md border-b border-slate-800 shadow-xl' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/30">
              <i className="fas fa-bolt text-slate-900 text-lg"></i>
            </div>
            <div>
              <span className="text-white font-black text-lg tracking-tight">ALPHA STAGE</span>
              <span className="hidden sm:block text-amber-500 text-[9px] font-bold uppercase tracking-widest -mt-1">Weinstein Terminal</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onGetStarted}
              className="text-slate-400 hover:text-white text-sm font-bold transition-colors px-3 py-2"
            >
              Iniciar sesión
            </button>
            <button
              onClick={onGetStarted}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:scale-105 active:scale-95"
            >
              Empezar gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-20 left-1/4 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-20 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-xs font-black uppercase tracking-widest mb-8">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping"></span>
            Método Stan Weinstein · Análisis técnico profesional
          </div>

          <h1 className="text-5xl sm:text-7xl font-black leading-[0.9] tracking-tight mb-6">
            Invierte con
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600">
              disciplina Weinstein
            </span>
          </h1>

          <p className="text-slate-400 text-xl sm:text-2xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Terminal de análisis técnico que identifica automáticamente el <strong className="text-white">stage de cualquier activo</strong> y te dice cuándo comprar, esperar o cerrar.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-10 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl transition-all shadow-2xl shadow-amber-500/30 hover:scale-105 active:scale-95 flex items-center justify-center gap-3"
            >
              <i className="fas fa-rocket"></i>
              Empezar gratis ahora
            </button>
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-10 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-lg rounded-2xl transition-all flex items-center justify-center gap-3"
            >
              <i className="fas fa-play text-amber-400 text-sm"></i>
              Ver demo
            </button>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-center">
            {[
              { value: '100%', label: 'Gratis durante el beta' },
              { value: 'S&P · DAX · IBEX', label: 'Mercados cubiertos' },
              { value: 'Semanal', label: 'Informe de mercado' },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-2xl font-black text-white">{value}</p>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── App preview mockup ── */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl shadow-black/50">
            {/* Fake browser bar */}
            <div className="bg-slate-800 px-4 py-3 flex items-center gap-3 border-b border-slate-700">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500/60"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/60"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/60"></div>
              </div>
              <div className="flex-1 bg-slate-700 rounded-md px-3 py-1 text-[11px] text-slate-400 font-mono">
                www.alphastage.finance
              </div>
            </div>
            {/* Mock app UI */}
            <div className="bg-[#0b1220] p-6 space-y-4">
              {/* Mock header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                    <i className="fas fa-bolt text-slate-900 text-sm"></i>
                  </div>
                  <div>
                    <div className="text-white font-black text-sm">ALPHA STAGE</div>
                    <div className="text-amber-500 text-[8px] font-bold uppercase">Weinstein Pro Terminal</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {['fa-bell', 'fa-star', 'fa-filter'].map(icon => (
                    <div key={icon} className="w-7 h-7 bg-slate-800 rounded-full flex items-center justify-center">
                      <i className={`fas ${icon} text-slate-400 text-[10px]`}></i>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mock analysis result */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div className="sm:col-span-2 bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">AAPL · Apple Inc.</div>
                      <div className="text-2xl font-black text-white">$211.45</div>
                    </div>
                    <div className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
                      <div className="text-emerald-400 font-black text-sm">COMPRAR</div>
                      <div className="text-[9px] text-emerald-600 uppercase tracking-wider">Stage 2 · Alta confianza</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {[
                      { label: 'SMA30', value: '$198.20', color: 'text-emerald-400' },
                      { label: 'Volumen', value: '↑ 2.3x', color: 'text-amber-400' },
                      { label: 'RS Mansfield', value: '+14.2', color: 'text-blue-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-slate-900/50 rounded-lg p-2 text-center">
                        <div className={`text-sm font-black ${color}`}>{value}</div>
                        <div className="text-[9px] text-slate-500 uppercase">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Objetivo T1', value: '$234.50', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'Objetivo T2', value: '$258.20', color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { label: 'Stop Loss', value: '$195.80', color: 'text-rose-400', bg: 'bg-rose-500/10' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`${bg} rounded-xl p-3 border border-white/5`}>
                      <div className={`text-sm font-black ${color}`}>{value}</div>
                      <div className="text-[9px] text-slate-500 uppercase">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Método Weinstein ── */}
      <section className="px-6 py-24 bg-slate-900/30 border-y border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-xs font-black uppercase tracking-widest mb-4">
              <i className="fas fa-book"></i> Fundamento del método
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">Los 4 stages de Weinstein</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Stan Weinstein descubrió que todo activo pasa por 4 etapas cíclicas. La clave es identificar el Stage 2 y actuar antes que la mayoría.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STAGES.map(({ num, label, color, text, desc }) => (
              <div key={num} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600 transition-all">
                <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white font-black text-lg mb-4 shadow-lg`}>
                  {num}
                </div>
                <h3 className={`font-black text-sm mb-2 ${text}`}>{label}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">Tan fácil como 1, 2, 3</h2>
            <p className="text-slate-400 text-lg">Del ticker al veredicto en segundos.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {STEPS.map(({ num, icon, title, desc }) => (
              <div key={num} className="text-center">
                <div className="relative inline-block mb-6">
                  <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
                    <i className={`fas ${icon} text-amber-400 text-xl`}></i>
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-slate-900 text-[10px] font-black">
                    {num.slice(1)}
                  </div>
                </div>
                <h3 className="text-white font-black text-lg mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-6 py-24 bg-slate-900/30 border-y border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">Todo lo que necesitas</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Una suite completa de herramientas Weinstein. Gratis durante el beta.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon, color, bg, title, desc }) => (
              <div key={title} className={`bg-slate-800/40 border ${bg} rounded-2xl p-6 hover:scale-[1.02] transition-all`}>
                <div className={`w-10 h-10 ${bg} border rounded-xl flex items-center justify-center mb-4`}>
                  <i className={`fas ${icon} ${color}`}></i>
                </div>
                <h3 className="text-white font-black text-sm mb-2">{title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="px-6 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-500/5 rounded-3xl blur-3xl"></div>
            <div className="relative bg-slate-800/40 border border-slate-700/50 rounded-3xl p-12">
              <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-amber-500/30">
                <i className="fas fa-bolt text-slate-900 text-2xl"></i>
              </div>
              <h2 className="text-4xl font-black text-white mb-4">¿Listo para invertir con método?</h2>
              <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">Únete durante el beta — acceso completo, sin límites, sin tarjeta de crédito.</p>
              <button
                onClick={onGetStarted}
                className="px-12 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-lg rounded-2xl transition-all shadow-2xl shadow-amber-500/30 hover:scale-105 active:scale-95 inline-flex items-center gap-3"
              >
                <i className="fas fa-rocket"></i>
                Crear cuenta gratis
              </button>
              <p className="text-slate-600 text-xs mt-4">Sin permanencia · Sin tarjeta · Cancela cuando quieras</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 px-6 py-10">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
              <i className="fas fa-bolt text-slate-900 text-sm"></i>
            </div>
            <span className="text-slate-500 text-sm font-bold">Alpha Stage Terminal</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-600">
            <a href="mailto:juantxu@gosua.com" className="hover:text-slate-400 transition-colors">Contacto</a>
            <span>·</span>
            <a href="https://ko-fi.com/weinstein" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">Ko-fi</a>
            <span>·</span>
            <span>© {new Date().getFullYear()} Alpha Stage Terminal</span>
          </div>
          <p className="text-[10px] text-slate-700 text-center sm:text-right">
            Herramienta educativa. No constituye asesoramiento financiero.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
