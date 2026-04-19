
import React, { useState } from 'react';
import { User } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  historyCount: number;
  alertsCount: number;
  onLogout: () => void;
}

type ViewState = 'main' | 'security' | 'export';

const UserProfileSidebar: React.FC<Props> = ({ isOpen, onClose, user, historyCount, alertsCount, onLogout }) => {
  const [currentView, setCurrentView] = useState<ViewState>('main');
  
  // Security State
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [securityMsg, setSecurityMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  if (!isOpen || !user) return null;

  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleExportData = () => {
    const data = {
      user: user,
      timestamp: new Date().toISOString(),
      stats: {
        analysisCount: historyCount,
        alertsCount: alertsCount
      },
      history: JSON.parse(localStorage.getItem('weinstein_stage_analyst_history') || '[]'),
      alerts: JSON.parse(localStorage.getItem('weinstein_stage_analyst_alerts') || '[]')
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weinstein-data-${user.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleChangePassword = (e: React.FormEvent) => {
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

    // Logic to verify and update password in localStorage
    const usersStr = localStorage.getItem('weinstein_users');
    if (usersStr) {
      const users = JSON.parse(usersStr);
      const currentUserIndex = users.findIndex((u: any) => u.email === user.email);

      if (currentUserIndex !== -1) {
        // Verify old password
        if (users[currentUserIndex].password !== passwords.current) {
          setSecurityMsg({ type: 'error', text: 'La contraseña actual es incorrecta' });
          return;
        }

        // Update password
        users[currentUserIndex].password = passwords.new;
        localStorage.setItem('weinstein_users', JSON.stringify(users));
        setSecurityMsg({ type: 'success', text: 'Contraseña actualizada correctamente' });
        setPasswords({ current: '', new: '', confirm: '' });
      } else {
        setSecurityMsg({ type: 'error', text: 'Usuario no encontrado en la base de datos local' });
      }
    }
  };

  const renderMainView = () => (
    <>
      <div className="p-8 flex flex-col items-center text-center border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
          <i className="fas fa-times text-xl"></i>
        </button>
        
        <div className={`w-24 h-24 ${user.avatarColor} rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-xl mb-4 transform -rotate-3`}>
          {initials}
        </div>
        
        <h3 className="text-xl font-black text-slate-900 dark:text-white">{user.name}</h3>
        <p className="text-sm text-slate-500">{user.email}</p>
        
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-widest">
          <i className="fas fa-crown"></i> Miembro Pro
        </div>
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
        </div>

        <div className="bg-blue-600/5 dark:bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl">
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold leading-relaxed">
            Registrado el {new Date(user.joinedDate).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="p-6 border-t border-slate-100 dark:border-slate-800">
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
           className="w-full max-w-xs py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
         >
           <i className="fas fa-download"></i> DESCARGAR JSON
         </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[250] flex justify-end">
      <div className="absolute inset-0 bg-slate-950/20 dark:bg-slate-950/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden transition-colors">
        
        {currentView === 'main' && renderMainView()}
        {currentView === 'security' && renderSecurityView()}
        {currentView === 'export' && renderExportView()}

      </div>
    </div>
  );
};

export default UserProfileSidebar;
