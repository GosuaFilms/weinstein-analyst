
import React from 'react';
import { Settings } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsChange: (newSettings: Settings) => void;
}

const SettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSettingsChange }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 transition-colors">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i className="fas fa-cog text-emerald-500"></i> Parámetros de Análisis
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">Periodo SMA (Semanas)</label>
              <span className="bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-md text-emerald-600 dark:text-emerald-400 font-mono font-bold border border-slate-200 dark:border-slate-700">
                {settings.smaPeriod}
              </span>
            </div>
            <input 
              type="range" 
              min="10" 
              max="200" 
              step="5"
              value={settings.smaPeriod}
              onChange={(e) => onSettingsChange({ ...settings, smaPeriod: parseInt(e.target.value) })}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <p className="text-[10px] text-slate-500 italic">
              Weinstein recomienda 30 semanas (150-200 días) para tendencias a largo plazo.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">Mult. de Volumen (Confirmación)</label>
              <span className="bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-md text-emerald-600 dark:text-emerald-400 font-mono font-bold border border-slate-200 dark:border-slate-700">
                {settings.volumeMultiplier}x
              </span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="5" 
              step="0.5"
              value={settings.volumeMultiplier}
              onChange={(e) => onSettingsChange({ ...settings, volumeMultiplier: parseFloat(e.target.value) })}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <p className="text-[10px] text-slate-500 italic">
              Weinstein requiere una ruptura con volumen significativo (típicamente 2x el promedio).
            </p>
          </div>
        </div>

        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl border-t border-slate-200 dark:border-slate-700">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
