import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// "Invita a un amigo": the user's personal link, ways to share it and what it
// has earned. Rewards and limits come from my_referral() (migration
// 20261126060000_referrals.sql), so the text always matches the server.

interface Referral {
  code: string;
  signed_up: number;
  activated: number;
  rewarded: number;
  max_rewarded: number;
  referrer_bonus: number;
  friend_bonus: number;
  bonus_left: number;
}

const SITE = 'https://www.alphastage.finance';

const ReferralView: React.FC = () => {
  const [data, setData] = useState<Referral | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.rpc('my_referral').then(({ data: d, error: e }) => {
      if (e || !d) setError(true);
      else setData(d as Referral);
    });
  }, []);

  if (error) return <p className="text-sm text-rose-500 text-center py-10">No se ha podido cargar tu enlace. Inténtalo de nuevo más tarde.</p>;
  if (!data) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;

  const link = `${SITE}/?ref=${data.code}`;
  const message = `Uso Alpha Stage para analizar acciones con el método Weinstein (etapas, MM30 semanal y fuerza relativa). Si te registras con mi enlace tienes ${data.friend_bonus} análisis extra:`;
  const full = `${message} ${link}`;
  const left = Math.max(0, data.max_rewarded - data.rewarded);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard blocked: the link is visible to copy by hand */ }
  };
  const share = async () => {
    try { await navigator.share({ title: 'Alpha Stage', text: message, url: link }); } catch { /* cancelled */ }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const enc = encodeURIComponent;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-3">
          <i className="fas fa-gift text-emerald-500 text-2xl"></i>
        </div>
        <h4 className="text-lg font-black text-slate-900 dark:text-white">Gana análisis extra</h4>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          Tu amigo recibe <strong className="text-slate-700 dark:text-slate-200">{data.friend_bonus} análisis extra</strong> al registrarse con tu enlace,
          y tú <strong className="text-slate-700 dark:text-slate-200">{data.referrer_bonus}</strong> cuando haga su primer análisis.
          No caducan y se usan cuando se acaba el cupo de tu plan.
        </p>
      </div>

      <div>
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tu enlace</label>
        <div className="mt-2 flex gap-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Tu enlace de invitación"
            className="min-w-0 flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-700 dark:text-slate-200" />
          <button onClick={copy} className="px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5">
            <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`}></i>{copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <a href={`https://wa.me/?text=${enc(full)}`} target="_blank" rel="noopener noreferrer"
          className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5">
          <i className="fab fa-whatsapp text-emerald-500"></i> WhatsApp
        </a>
        <a href={`https://t.me/share/url?url=${enc(link)}&text=${enc(message)}`} target="_blank" rel="noopener noreferrer"
          className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5">
          <i className="fab fa-telegram text-sky-500"></i> Telegram
        </a>
        <a href={`https://x.com/intent/post?text=${enc(full)}`} target="_blank" rel="noopener noreferrer"
          className="py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5">
          <span className="font-black">𝕏</span> X
        </a>
      </div>
      {canShare && (
        <button onClick={share} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2">
          <i className="fas fa-share-nodes"></i> Compartir por otra app
        </button>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
          <span className="block text-xl font-black text-slate-800 dark:text-white">{data.signed_up}</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase">Registrados</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
          <span className="block text-xl font-black text-slate-800 dark:text-white">{data.activated}</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase">Activos</span>
        </div>
        <div className="bg-emerald-500/10 rounded-xl p-3">
          <span className="block text-xl font-black text-emerald-600 dark:text-emerald-400">{data.bonus_left}</span>
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Extra libres</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Cuentan hasta {data.max_rewarded} amigos ({left === 0 ? 'ya has llegado al máximo' : `te quedan ${left}`}).
        Solo valen cuentas nuevas creadas desde tu enlace; no compartimos tus datos con ellos ni los suyos contigo.
      </p>
    </div>
  );
};

export default ReferralView;
