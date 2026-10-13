
import React from 'react';
import { Language } from '../types';

interface Props { language?: Language }

const EpicHero: React.FC<Props> = ({ language = Language.ES }) => {
  const es = language === Language.ES;
  return (
    <div className="relative w-full rounded-[2rem] overflow-hidden mb-12 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-1000">
      {/* Background Image with Cinematic Filter */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1642388691910-602958742880?q=80&w=2070&auto=format&fit=crop"
          alt="Bull vs Bear financial markets"
          width="2070"
          height="1380"
          loading="lazy"
          className="w-full h-full object-cover scale-110 filter contrast-150 brightness-[0.4] grayscale-[0.2] dark:brightness-[0.25]"
        />
        {/* Layered Overlays for Depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/40 via-transparent to-slate-950/40"></div>
      </div>

      {/* Content Container */}
      <div className="relative z-10 p-10 sm:p-20 flex flex-col items-center text-center">
        {/* Fight Status Indicator */}
        <div className="mb-8 flex gap-6 items-center transform scale-110 sm:scale-125">
          <div className="flex flex-col items-center">
            <i className="fas fa-arrow-trend-up text-emerald-400 text-5xl drop-shadow-[0_0_20px_rgba(52,211,153,0.9)] animate-pulse"></i>
            <span className="text-[10px] text-emerald-400 font-black tracking-widest mt-2 uppercase">Bull Power</span>
          </div>
          <div className="relative flex items-center justify-center">
             <span className="text-white font-[1000] text-7xl italic tracking-tighter opacity-80 select-none">VS</span>
             <div className="absolute w-24 h-px bg-white/20 -rotate-45"></div>
          </div>
          <div className="flex flex-col items-center">
            <i className="fas fa-arrow-trend-down text-rose-500 text-5xl drop-shadow-[0_0_20px_rgba(244,63,94,0.9)] animate-pulse"></i>
            <span className="text-[10px] text-rose-500 font-black tracking-widest mt-2 uppercase">Bear Pressure</span>
          </div>
        </div>

        <h2 className="text-6xl sm:text-8xl font-[1000] text-white leading-[0.9] tracking-[-0.05em] mb-8 uppercase drop-shadow-2xl">
          {es ? <>EL DINERO <br/><span className="text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 drop-shadow-[0_0_25px_rgba(251,191,36,0.5)]">NUNCA DUERME</span></> : <>MONEY NEVER<br/><span className="text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 drop-shadow-[0_0_25px_rgba(251,191,36,0.5)]">SLEEPS</span></>}
        </h2>

        <p className="max-w-2xl text-slate-200 text-xl sm:text-2xl font-bold mb-10 leading-tight italic drop-shadow-md">
          {es
            ? <>"Ganar no te enseña nada. Perder puede ser el mejor <span className="text-amber-400">maestro</span> de todos."</>
            : <>"Winning teaches you nothing. Losing can be the greatest <span className="text-amber-400">teacher</span> of all."</>
          }
          <br/>
          <span className="text-slate-400 text-sm font-black mt-4 block uppercase tracking-[0.3em]">— Stan Weinstein —</span>
        </p>

        {/* Weinstein's core rule */}
        <div className="max-w-2xl mb-10 px-6 py-5 rounded-2xl bg-slate-950/50 backdrop-blur-md border border-rose-500/30 shadow-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-rose-400 mb-3 flex items-center justify-center gap-2">
            <i className="fas fa-triangle-exclamation"></i> {es ? 'La regla de oro' : 'The golden rule'}
          </p>
          <p className="text-slate-200 text-base sm:text-lg font-bold leading-snug">
            {es
              ? <>«Recuerde que nunca ha de comprar una acción, sin importar lo barata que parezca basándose en sus datos fundamentales o debido a un reciente declive importante, si está cotizándose <span className="text-rose-400">por debajo de la MM de 30 semanas orientada a la baja</span>.»</>
              : <>"Remember never to buy a stock, no matter how cheap it looks on its fundamentals or after a recent major decline, if it is trading <span className="text-rose-400">below its declining 30-week moving average</span>."</>
            }
          </p>
          <span className="text-slate-400 text-xs font-black mt-3 block uppercase tracking-[0.3em]">— Stan Weinstein —</span>
        </div>

        {/* High-Octane Badges */}
        <div className="flex flex-wrap justify-center gap-6">
          <div className="px-8 py-3 bg-amber-500 text-slate-900 rounded-full text-[11px] font-[1000] uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(245,158,11,0.3)] flex items-center gap-3 transition-transform hover:scale-105 cursor-default">
            <i className="fas fa-fire-flame-curved"></i> High Octane Analysis
          </div>
          <div className="px-8 py-3 bg-white/5 backdrop-blur-xl border border-white/20 rounded-full text-white text-[11px] font-[1000] uppercase tracking-[0.2em] shadow-xl flex items-center gap-3 transition-transform hover:scale-105 cursor-default">
            <i className="fas fa-crown text-amber-400"></i> {es ? 'Método Stan Weinstein' : 'Stan Weinstein Method'}
          </div>
        </div>
      </div>
      
      {/* Cinematic Borders */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"></div>
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
      
      {/* Corner accents */}
      <div className="absolute top-0 left-0 p-4 opacity-20">
        <i className="fas fa-vector-square text-white text-4xl"></i>
      </div>
    </div>
  );
};

export default EpicHero;
