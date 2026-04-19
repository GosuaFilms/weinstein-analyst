
import React, { useState, useEffect } from 'react';
import { Language } from '../types';

interface Props {
  language: Language;
}

const LiveClock: React.FC<Props> = ({ language }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString(language === Language.ES ? 'es-ES' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const dateStr = now.toLocaleDateString(language === Language.ES ? 'es-ES' : 'en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).toUpperCase();

  return (
    <div className="flex flex-col items-end sm:items-center px-4 py-1 border-x border-slate-200 dark:border-slate-800 hidden md:flex">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-widest uppercase">
          {language === Language.ES ? 'HORA SISTEMA' : 'SYSTEM TIME'}
        </span>
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-mono font-black text-slate-900 dark:text-white tabular-nums">
          {timeStr}
        </span>
        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 font-mono">
          {dateStr}
        </span>
      </div>
    </div>
  );
};

export default LiveClock;
