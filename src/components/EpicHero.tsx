
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
        {/* Ko-fi button — above the VS */}
        <a
          href="https://ko-fi.com/weinstein"
          target="_blank"
          rel="noopener noreferrer"
          style={{ backgroundColor: '#FF5E5B', boxShadow: '0 4px 20px rgba(255,94,91,0.4)' }}
          className="mb-6 inline-flex items-center gap-2 px-5 py-2 text-white text-[11px] font-black uppercase tracking-widest rounded-full transition-all hover:scale-105 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '14px', height: '14px', flexShrink: 0 }}>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          Apóyanos en Ko-fi ☕
        </a>

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
            ? <>"La única cosa que se interpone entre tú y tu meta es la historia de <span className="text-amber-400">mierda</span> que te sigues contando sobre por qué no puedes lograrla."</>
            : <>"The only thing standing between you and your goal is the <span className="text-amber-400">story</span> you keep telling yourself about why you can't achieve it."</>
          }
          <br/>
          <span className="text-slate-400 text-sm font-black mt-4 block uppercase tracking-[0.3em]">— Weinstein Strategy Terminal —</span>
        </p>

        {/* High-Octane Badges */}
        <div className="flex flex-wrap justify-center gap-6">
          <div className="px-8 py-3 bg-amber-500 text-slate-900 rounded-full text-[11px] font-[1000] uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(245,158,11,0.3)] flex items-center gap-3 transition-transform hover:scale-105 cursor-default">
            <i className="fas fa-fire-flame-curved"></i> High Octane Analysis
          </div>
          <div className="px-8 py-3 bg-white/5 backdrop-blur-xl border border-white/20 rounded-full text-white text-[11px] font-[1000] uppercase tracking-[0.2em] shadow-xl flex items-center gap-3 transition-transform hover:scale-105 cursor-default">
            <i className="fas fa-crown text-amber-400"></i> Weinstein Certified
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
