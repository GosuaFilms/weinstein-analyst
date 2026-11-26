import React from 'react';

// Dark frame (top bar + footer) of the public stock pages.
const PublicShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #080e1a 0%, #0b1525 60%, #080e1a 100%)' }}>
    <nav className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(8,14,26,0.85)', backdropFilter: 'blur(20px)' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-900 font-black text-lg">⚡</div>
          <div className="hidden sm:block">
            <div className="text-white font-black text-base tracking-tight leading-none">ALPHA STAGE</div>
            <div className="text-amber-500 text-[8px] font-bold uppercase tracking-widest">Weinstein Terminal</div>
          </div>
        </a>
        <div className="flex items-center gap-1 sm:gap-2">
          <a href="/mercado" className="hidden sm:block text-slate-400 hover:text-white text-sm font-bold px-3 py-2">Mercado</a>
          <a href="/valores" className="text-slate-400 hover:text-white text-sm font-bold px-2 sm:px-3 py-2">Valores</a>
          <a href="/etapa-2" className="hidden sm:block text-slate-400 hover:text-white text-sm font-bold px-3 py-2">Etapa 2 hoy</a>
          <a href="/resultados" className="hidden sm:block text-slate-400 hover:text-white text-sm font-bold px-3 py-2">Resultados</a>
          <a href="/" className="px-4 sm:px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-sm rounded-xl">Empezar gratis</a>
        </div>
      </div>
    </nav>

    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">{children}</main>

    <footer className="max-w-5xl mx-auto px-4 sm:px-6 pb-12 text-center text-slate-600 text-xs space-y-1">
      <p>Herramienta educativa basada en el método Weinstein. No es una recomendación de compra ni asesoramiento financiero.</p>
      <p>
        Datos de mercado proporcionados por Twelve Data · © 2026 Alpha Stage ·{' '}
        <a href="/legal/terms" className="hover:text-slate-400">Términos</a> · <a href="/legal/privacy" className="hover:text-slate-400">Privacidad</a>
      </p>
    </footer>
  </div>
);

export default PublicShell;
