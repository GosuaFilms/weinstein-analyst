import React, { useEffect } from 'react';
import PublicShell from './PublicShell';
import { setPageMeta } from '../lib/publicPage';

// /baja?lista=bienvenida&ok=1 — where the one-click unsubscribe link of the
// welcome e-mails lands (the onboarding-emails function did the work).
const UnsubscribePage: React.FC = () => {
  const ok = new URLSearchParams(window.location.search).get('ok') === '1';
  useEffect(() => {
    setPageMeta('Baja de correos — Alpha Stage', 'Gestión de los correos de Alpha Stage.', '/baja');
    const m = document.querySelector('meta[name="robots"]');
    m?.setAttribute('content', 'noindex');
  }, []);

  return (
    <PublicShell>
      <div className="text-center py-20 max-w-lg mx-auto">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5 ${ok ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
          <i className={`fas ${ok ? 'fa-check text-emerald-400' : 'fa-triangle-exclamation text-rose-400'} text-2xl`} />
        </div>
        <h1 className="text-3xl font-black text-white mb-3">{ok ? 'Te has dado de baja' : 'El enlace no es válido'}</h1>
        <p className="text-slate-400 mb-8">
          {ok
            ? 'No te enviaremos más correos de bienvenida. Tus avisos de la watchlist y el informe del sábado siguen igual: los gestionas en tu perfil → Notificaciones.'
            : 'No hemos podido procesar la baja con este enlace. Puedes desactivar cualquier correo desde tu perfil → Notificaciones, o escribirnos a contabilidad@gosua.com.'}
        </p>
        <a href="/" className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-black">Volver a Alpha Stage</a>
      </div>
    </PublicShell>
  );
};

export default UnsubscribePage;
