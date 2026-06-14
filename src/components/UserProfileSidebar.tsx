
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { useUserSettings } from '../hooks/useUserSettings';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  historyCount: number;
  alertsCount: number;
  onLogout: () => void;
  isPro?: boolean;
  onUpgrade?: () => void;
}

type ViewState = 'main' | 'security' | 'export' | 'notifications';

const UserProfileSidebar: React.FC<Props> = ({ isOpen, onClose, user, historyCount, alertsCount, onLogout, isPro = false, onUpgrade }) => {
  const [currentView, setCurrentView] = useState<ViewState>('main');
  const [exporting,   setExporting]   = useState(false);
  const { settings: notifSettings, loading: notifLoading, saving: notifSaving, update: updateNotif } = useUserSettings();
  const [testEmailState, setTestEmailState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');

  // Security State
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [securityMsg, setSecurityMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  if (!isOpen || !user) return null;

  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const [{ data: analyses }, { data: alerts }, { data: watchlist }, { data: positions }] = await Promise.all([
        supabase.from('analyses').select('*').order('created_at', { ascending: false }),
        supabase.from('alerts').select('*').order('created_at', { ascending: false }),
        supabase.from('watchlist').select('*').order('created_at', { ascending: false }),
        supabase.from('portfolio_positions').select('*').order('created_at', { ascending: false }),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        user: { name: user.name, email: user.email, joinedDate: user.joinedDate },
        stats: { analysisCount: historyCount, alertsCount: alertsCount },
        analyses:   analyses   ?? [],
        alerts:     alerts     ?? [],
        watchlist:  watchlist  ?? [],
        portfolio:  positions  ?? [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `alphastage-data-${user.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityMsg(null);

    if (passwords.new !== passwords.confirm) {
      setSecurityMsg({ type: 'error', text: 'Las nuevas contraseñas no coinciden' });
      return;
    }
    if (passwords.new.length < 6) {
      setSecurityMsg({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }

    // Re-authenticate to verify current password before changing
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: passwords.current,
    });
    if (signInError) {
      setSecurityMsg({ type: 'error', text: 'La contraseña actual es incorrecta' });
      return;
    }

    // Update password via Supabase Auth
    const { error: updateError } = await supabase.auth.updateUser({ password: passwords.new });
    if (updateError) {
      setSecurityMsg({ type: 'error', text: updateError.message ?? 'Error al actualizar la contraseña' });
      return;
    }

    setSecurityMsg({ type: 'success', text: 'Contraseña actualizada correctamente' });
    setPasswords({ current: '', new: '', confirm: '' });
  };

  const renderMainView = () => (
    <>
      <div className="p-8 flex flex-col items-center text-center border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
          <i className="fas fa-times text-xl"></i>
        </button>

        {/* Avatar */}
        <div className={`w-24 h-24 rounded-3xl flex items-center justify-center text-slate-900 text-3xl font-black shadow-xl mb-4 transform -rotate-3 ${isPro ? 'bg-amber-500 ring-4 ring-amber-400/40' : 'bg-slate-300 dark:bg-slate-600'}`}>
          {initials}
        </div>

        <h3 className="text-xl font-black text-slate-900 dark:text-white">{user.name}</h3>
        <p className="text-sm text-slate-500">{user.email}</p>

        {/* Plan badge */}
        {isPro ? (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500 text-slate-900 rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/30">
            <i className="fas fa-crown"></i> Plan Pro
          </div>
        ) : (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full text-[11px] font-black uppercase tracking-widest">
            <i className="fas fa-user"></i> Plan Gratuito
          </div>
        )}
      </div>

      <div className="flex-grow p-6 space-y-6 overflow-y-auto">
        <div>
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Estadísticas de Uso</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors">
              <span className="block text-2xl font-black text-blue-500">{historyCount}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Análisis</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors">
              <span className="block text-2xl font-black text-amber-500">{alertsCount}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Alertas</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Ajustes de Cuenta</h4>
           
           <button 
             onClick={() => setCurrentView('security')}
             className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition-all group"
           >
              <div className="flex items-center gap-3">
                <i className="fas fa-shield-alt text-slate-400 group-hover:text-emerald-500 transition-colors"></i>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Seguridad</span>
              </div>
              <i className="fas fa-chevron-right text-[10px] text-slate-300"></i>
           </button>

           <button
             onClick={() => setCurrentView('export')}
             className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition-all group"
           >
              <div className="flex items-center gap-3">
                <i className="fas fa-file-export text-slate-400 group-hover:text-blue-500 transition-colors"></i>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Exportar Datos</span>
              </div>
              <i className="fas fa-chevron-right text-[10px] text-slate-300"></i>
           </button>

           <button
             onClick={() => setCurrentView('notifications')}
             className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition-all group"
           >
              <div className="flex items-center gap-3">
                <i className="fas fa-bell text-slate-400 group-hover:text-violet-500 transition-colors"></i>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Notificaciones</span>
              </div>
              <div className="flex items-center gap-2">
                {!notifLoading && notifSettings?.daily_email_enabled && (
                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full uppercase">Activo</span>
                )}
                <i className="fas fa-chevron-right text-[10px] text-slate-300"></i>
              </div>
           </button>
        </div>

        <div className="bg-blue-600/5 dark:bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl">
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold leading-relaxed">
            Registrado el {new Date(user.joinedDate).toLocaleDateString()}
          </p>
        </div>

        {/* Ko-fi support card */}
        <a
          href="https://ko-fi.com/weinstein"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full p-4 rounded-2xl border border-[#FF5E5B]/30 bg-[#FF5E5B]/5 hover:bg-[#FF5E5B]/10 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF5E5B] flex items-center justify-center shadow-md shadow-[#FF5E5B]/20 flex-shrink-0 transition-transform group-hover:scale-110">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">¿Te es útil?</p>
              <p className="text-[10px] text-slate-500">Invítanos a un café en Ko-fi ☕</p>
            </div>
            <i className="fas fa-external-link-alt text-[10px] text-slate-400 ml-auto"></i>
          </div>
        </a>
      </div>

      <div className="p-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
        {/* Upgrade CTA for free users */}
        {!isPro && (
          <button
            onClick={onUpgrade}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <i className="fas fa-crown"></i> Actualizar a Pro
          </button>
        )}

        {/* Pro plan management */}
        {isPro && (
          <button
            onClick={onUpgrade}
            className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-black rounded-xl transition-all border border-amber-500/20 flex items-center justify-center gap-2"
          >
            <i className="fas fa-crown"></i> Gestionar suscripción Pro
          </button>
        )}

        <button
          onClick={onLogout}
          className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-black rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <i className="fas fa-sign-out-alt"></i> CERRAR SESIÓN
        </button>
      </div>
    </>
  );

  const renderSecurityView = () => (
    <div className="flex flex-col h-full animate-in slide-in-from-right duration-300">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
        <button onClick={() => { setCurrentView('main'); setSecurityMsg(null); }} className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm">
          <i className="fas fa-arrow-left"></i>
        </button>
        <h3 className="text-lg font-black text-slate-900 dark:text-white">Seguridad</h3>
      </div>
      
      <div className="p-6 flex-grow overflow-y-auto">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1">
             <label className="text-xs font-bold text-slate-500 uppercase ml-1">Contraseña Actual</label>
             <input 
               type="password"
               required 
               className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500/50"
               value={passwords.current}
               onChange={e => setPasswords({...passwords, current: e.target.value})}
             />
          </div>
          <div className="space-y-1">
             <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nueva Contraseña</label>
             <input 
               type="password"
               required 
               className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500/50"
               value={passwords.new}
               onChange={e => setPasswords({...passwords, new: e.target.value})}
             />
          </div>
          <div className="space-y-1">
             <label className="text-xs font-bold text-slate-500 uppercase ml-1">Confirmar Nueva</label>
             <input 
               type="password" 
               required
               className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-3 outline-none focus:ring-2 focus:ring-emerald-500/50"
               value={passwords.confirm}
               onChange={e => setPasswords({...passwords, confirm: e.target.value})}
             />
          </div>

          {securityMsg && (
            <div className={`p-3 rounded-lg text-xs font-bold text-center ${securityMsg.type === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
              {securityMsg.text}
            </div>
          )}

          <button type="submit" className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10 mt-4">
            ACTUALIZAR CONTRASEÑA
          </button>
        </form>
      </div>
    </div>
  );

  const handleSendTestEmail = async () => {
    setTestEmailState('sending');
    try {
      const { error } = await supabase.functions.invoke('daily-brief', {
        body: { test: true },
      });
      setTestEmailState(error ? 'error' : 'ok');
    } catch {
      setTestEmailState('error');
    }
    setTimeout(() => setTestEmailState('idle'), 4000);
  };

  const renderNotificationsView = () => (
    <div className="flex flex-col h-full animate-in slide-in-from-right duration-300">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
        <button onClick={() => setCurrentView('main')} className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm">
          <i className="fas fa-arrow-left"></i>
        </button>
        <h3 className="text-lg font-black text-slate-900 dark:text-white">Notificaciones</h3>
      </div>

      <div className="p-6 flex-grow overflow-y-auto space-y-6">
        {/* Daily email toggle */}
        <div className="bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-envelope text-violet-500"></i>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Briefing Diario</p>
                <p className="text-[11px] text-slate-500 leading-tight">Email matutino con alertas de tu watchlist</p>
              </div>
            </div>
            <button
              onClick={() => updateNotif({ daily_email_enabled: !notifSettings?.daily_email_enabled })}
              disabled={notifLoading || notifSaving}
              className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${notifSettings?.daily_email_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${notifSettings?.daily_email_enabled ? 'translate-x-6' : 'translate-x-0'}`}></span>
            </button>
          </div>
          {notifSettings?.daily_email_enabled && (
            <div className="px-4 pb-4">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 leading-relaxed">
                <i className="fas fa-clock text-violet-400 mr-1.5"></i>
                Recibirás un email cada mañana a las <strong>8:00 AM</strong> con el estado de tu watchlist: rupturas, alertas urgentes y una visión del mercado.
              </p>
            </div>
          )}
        </div>

        {/* Send test email */}
        <div>
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Probar Ahora</h4>
          <button
            onClick={handleSendTestEmail}
            disabled={testEmailState === 'sending' || !notifSettings?.daily_email_enabled}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2"
          >
            {testEmailState === 'sending' && <><i className="fas fa-circle-notch animate-spin"></i> Enviando…</>}
            {testEmailState === 'ok'      && <><i className="fas fa-check"></i> ¡Email enviado!</>}
            {testEmailState === 'error'   && <><i className="fas fa-exclamation-triangle"></i> Error al enviar</>}
            {testEmailState === 'idle'    && <><i className="fas fa-paper-plane"></i> Enviar prueba ahora</>}
          </button>
          {!notifSettings?.daily_email_enabled && (
            <p className="text-[11px] text-slate-400 text-center mt-2">Activa el briefing para enviar una prueba</p>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-[11px] text-slate-500 leading-relaxed">
          <i className="fas fa-info-circle mr-1.5 text-blue-400"></i>
          El email se envía a <strong className="text-slate-600 dark:text-slate-300">{user?.email}</strong>
        </div>
      </div>
    </div>
  );

  const renderExportView = () => (
    <div className="flex flex-col h-full animate-in slide-in-from-right duration-300">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50 dark:bg-slate-900/50">
        <button onClick={() => setCurrentView('main')} className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shadow-sm">
          <i className="fas fa-arrow-left"></i>
        </button>
        <h3 className="text-lg font-black text-slate-900 dark:text-white">Exportar Datos</h3>
      </div>
      
      <div className="p-6 flex-grow flex flex-col justify-center items-center text-center space-y-6">
         <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-2">
            <i className="fas fa-database text-blue-500 text-3xl"></i>
         </div>
         
         <div>
           <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Tu Data es Tuya</h4>
           <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
             Descarga un archivo JSON con todo tu historial de análisis, configuraciones y alertas activas.
           </p>
         </div>

         <div className="w-full max-w-xs bg-slate-100 dark:bg-slate-800 p-4 rounded-xl text-left space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
               <span>Análisis guardados:</span>
               <span>{historyCount}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
               <span>Alertas configuradas:</span>
               <span>{alertsCount}</span>
            </div>
         </div>

         <button
           onClick={handleExportData}
           disabled={exporting}
           className="w-full max-w-xs py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
         >
           <i className={`fas ${exporting ? 'fa-circle-notch animate-spin' : 'fa-download'}`}></i>
           {exporting ? 'Preparando…' : 'DESCARGAR JSON'}
         </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[250] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/20 dark:bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden transition-colors">
        
        {currentView === 'main'          && renderMainView()}
        {currentView === 'security'      && renderSecurityView()}
        {currentView === 'export'        && renderExportView()}
        {currentView === 'notifications' && renderNotificationsView()}

      </div>
    </div>
  );
};

export default UserProfileSidebar;
