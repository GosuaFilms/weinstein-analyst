import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Shown after the user opens the password-recovery email link: Supabase has
// signed them in from the link, and here they choose the new password.
const ResetPasswordModal: React.FC = () => {
  const { session, loading, passwordRecovery, endPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  if (!passwordRecovery || loading) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-8">
        <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
          <i className={`fas ${done ? 'fa-check' : 'fa-key'} text-slate-900 text-xl`}></i>
        </div>

        {!session ? (
          <>
            <h2 className="text-xl font-black text-slate-900 dark:text-white text-center mb-2">Enlace caducado</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
              Este enlace de recuperación ya no es válido. Pide uno nuevo desde «Iniciar sesión» → «¿Olvidaste tu contraseña?».
            </p>
            <button onClick={endPasswordRecovery} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl">
              Entendido
            </button>
          </>
        ) : done ? (
          <>
            <h2 className="text-xl font-black text-slate-900 dark:text-white text-center mb-2">Contraseña actualizada</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">Ya has iniciado sesión con tu nueva contraseña.</p>
            <button onClick={endPasswordRecovery} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl">
              Continuar →
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <h2 className="text-xl font-black text-slate-900 dark:text-white text-center">Nueva contraseña</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-2">
              Elige la contraseña para {session.user.email}.
            </p>
            <input
              type="password" autoComplete="new-password" placeholder="Nueva contraseña" value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm"
            />
            <input
              type="password" autoComplete="new-password" placeholder="Repite la contraseña" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm"
            />
            {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}
            <button type="submit" disabled={saving} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordModal;
