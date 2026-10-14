import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type AuthView = 'login' | 'register' | 'recovery';

const AuthModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { signIn, signUp } = useAuth();
  const [view, setView] = useState<AuthView>('login');
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (view === 'login') {
        await signIn(formData.email, formData.password);
      } else if (view === 'register') {
        if (!formData.name) { setError('El nombre es obligatorio'); setLoading(false); return; }
        await signUp(formData.email, formData.password, formData.name);
      }
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    // Redirects to Google and back; supabase-js picks the session up from the URL
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryMessage(null);
    if (!recoveryEmail) return;
    const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setRecoveryMessage(
      error
        ? { type: 'error', text: error.message }
        : { type: 'success', text: `Hemos enviado un enlace de recuperación a ${recoveryEmail}` }
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden transition-colors">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <i className={`fas ${view === 'recovery' ? 'fa-key' : 'fa-user-shield'} text-emerald-500 text-3xl`}></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white">
              {view === 'login' && 'Bienvenido de nuevo'}
              {view === 'register' && 'Crea tu cuenta'}
              {view === 'recovery' && 'Recuperar Contraseña'}
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              {view === 'recovery'
                ? 'Introduce tu email para restablecer el acceso'
                : 'Accede a tus análisis y alertas desde cualquier lugar'}
            </p>
          </div>

          {view !== 'recovery' && (
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6">
              <button onClick={() => setView('login')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${view === 'login' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
                Iniciar Sesión
              </button>
              <button onClick={() => setView('register')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${view === 'register' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
                Registro
              </button>
            </div>
          )}

          {view === 'recovery' ? (
            <form onSubmit={handleRecovery} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email Registrado</label>
                <div className="relative">
                  <i className="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                  <input type="email" required className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-900 dark:text-white" placeholder="ejemplo@correo.com" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} />
                </div>
              </div>
              {recoveryMessage && (
                <div className={`p-3 rounded-lg text-xs font-bold text-center ${recoveryMessage.type === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                  {recoveryMessage.text}
                </div>
              )}
              <button type="submit" className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black rounded-xl shadow-lg shadow-emerald-500/20 mt-2">ENVIAR CORREO</button>
              <button type="button" onClick={() => { setView('login'); setRecoveryMessage(null); }} className="w-full py-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 font-bold text-xs mt-2 flex items-center justify-center gap-2">
                <i className="fas fa-arrow-left"></i> Volver a Iniciar Sesión
              </button>
            </form>
          ) : (
            <>
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-3 py-3 bg-white hover:bg-slate-50 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-800 font-bold text-sm shadow-sm transition-colors"
            >
              <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z"/>
              </svg>
              Continuar con Google
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">o con tu email</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {view === 'register' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nombre</label>
                  <div className="relative">
                    <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="text" required className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-900 dark:text-white" placeholder="Tu nombre completo" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email</label>
                <div className="relative">
                  <i className="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                  <input type="email" required className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-900 dark:text-white" placeholder="ejemplo@correo.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Contraseña</label>
                <div className="relative">
                  <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                  <input type="password" required minLength={6} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-900 dark:text-white" placeholder="••••••••" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                </div>
                {view === 'login' && (
                  <div className="flex justify-end pt-1">
                    <button type="button" onClick={() => setView('recovery')} className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500">
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}
              </div>
              {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}
              <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-black rounded-xl shadow-lg shadow-emerald-500/20 mt-4">
                {loading ? 'PROCESANDO...' : view === 'login' ? 'ENTRAR' : 'CREAR CUENTA'}
              </button>
            </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
