import React, { useEffect, useState } from 'react';
import { listMyShares, unshare, shareUrl, type MyShare } from '../lib/shareAnalysis';

// Profile → "Análisis compartidos": every public /a/<id> page the user created,
// with a two-step "Retirar" that deletes the page and its preview image.

const MySharesView: React.FC = () => {
  const [items, setItems] = useState<MyShare[] | null>(null);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    listMyShares().then(setItems).catch(() => setError(true));
  }, []);

  const remove = async (id: string) => {
    setRemoving(id);
    setFailed(null);
    try {
      await unshare(id);
      setItems((list) => (list ?? []).filter((i) => i.id !== id));
    } catch {
      setFailed(id);
    } finally {
      setRemoving(null);
      setConfirming(null);
    }
  };

  if (error) return <p className="text-sm text-rose-500 text-center py-10">No se ha podido cargar la lista. Inténtalo más tarde.</p>;
  if (!items) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Cada análisis que compartes tiene una página pública. Al retirarlo, el enlace deja de funcionar y se borra la imagen de vista previa.
        Las copias que ya hayan guardado WhatsApp o X pueden tardar unas horas en desaparecer.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">Todavía no has compartido ningún análisis.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={shareUrl(i.id, i.ref_code)} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-slate-900 dark:text-white hover:underline">
                    {i.ticker ?? i.company_name ?? 'Análisis'}
                  </a>
                  <p className="text-[11px] text-slate-500 truncate">{[i.stage, i.verdict].filter(Boolean).join(' · ')}</p>
                  <p className="text-[10px] text-slate-400">
                    Compartido el {new Date(i.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                {confirming === i.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => remove(i.id)} disabled={removing === i.id}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black disabled:opacity-60">
                      {removing === i.id ? <i className="fas fa-circle-notch animate-spin" /> : 'Sí, retirar'}
                    </button>
                    <button onClick={() => setConfirming(null)} className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirming(i.id)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[11px] font-black hover:bg-rose-500/10">
                    Retirar
                  </button>
                )}
              </div>
              {failed === i.id && <p className="text-[11px] text-rose-500 mt-2">No se ha podido retirar. Inténtalo de nuevo.</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MySharesView;
