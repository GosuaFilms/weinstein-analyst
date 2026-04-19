
import React from 'react';
import { SavedAnalysis } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  history: SavedAnalysis[];
  onSelect: (item: SavedAnalysis) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

const HistorySidebar: React.FC<Props> = ({ isOpen, onClose, history, onSelect, onDelete, onClearAll }) => {
  if (!isOpen) return null;

  // Update to accept string to match AnalysisResult.verdictType literals ('BUY', 'SELL', 'WAIT', 'CLOSE')
  const getVerdictColor = (v?: string) => {
    switch (v) {
      case 'BUY': return 'text-emerald-600 dark:text-emerald-500';
      case 'SELL': return 'text-rose-600 dark:text-rose-500';
      case 'CLOSE': return 'text-amber-600 dark:text-amber-500';
      default: return 'text-slate-500 dark:text-slate-400';
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/20 dark:bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 transition-colors">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i className="fas fa-history text-blue-500 dark:text-blue-400"></i> Historial
            </h3>
            <p className="text-xs text-slate-500 mt-1">{history.length} análisis guardados</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 transition-colors">
                <i className="fas fa-folder-open text-slate-400 dark:text-slate-600 text-2xl"></i>
              </div>
              <p className="text-slate-500 text-sm">No hay análisis guardados aún.</p>
            </div>
          ) : (
            history.sort((a, b) => b.timestamp - a.timestamp).map((item) => (
              <div 
                key={item.id}
                className="group relative bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl p-4 cursor-pointer transition-all shadow-sm dark:shadow-none"
                onClick={() => onSelect(item)}
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-all p-1"
                >
                  <i className="fas fa-trash-alt text-xs"></i>
                </button>
                <div className="flex gap-3">
                  {item.previewUrls && item.previewUrls.length > 0 ? (
                    <div className="w-12 h-12 rounded bg-slate-200 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 overflow-hidden flex-shrink-0 relative transition-colors">
                      <img src={item.previewUrls[0]} className="w-full h-full object-cover opacity-60" alt="" />
                      {item.previewUrls.length > 1 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-slate-900 dark:text-white bg-white/50 dark:bg-slate-900/50 px-1 rounded">+{item.previewUrls.length - 1}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded bg-slate-200 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 flex items-center justify-center flex-shrink-0 transition-colors">
                      <i className="fas fa-search text-slate-400 dark:text-slate-600"></i>
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.label}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {new Date(item.timestamp).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {/* Fixed: Use verdictType for color logic to ensure consistency and fix type error where Argument of type 'string' was not assignable to parameter of type 'Verdict' */}
                      <span className={`text-[10px] font-black uppercase tracking-wider ${getVerdictColor(item.result.verdictType)}`}>
                        {item.result.verdict}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {history.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 transition-colors">
            <button 
              onClick={() => { if(confirm('¿Seguro que quieres borrar todo el historial?')) onClearAll(); }}
              className="w-full py-2 text-xs font-bold text-slate-500 hover:text-rose-500 transition-colors flex items-center justify-center gap-2"
            >
              <i className="fas fa-trash-sweep"></i> BORRAR TODO EL HISTORIAL
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistorySidebar;
