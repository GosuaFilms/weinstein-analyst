import React from 'react';
import { useTelegramLink } from '../hooks/useTelegramLink';

const TelegramConnect: React.FC = () => {
  const { status, loading, generateToken, disconnect } = useTelegramLink();

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <i className="fas fa-circle-notch animate-spin"></i> Cargando…
      </div>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  if (status.connected) {
    return (
      <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 rounded-xl">
        <div className="flex items-center gap-2">
          <i className="fab fa-telegram text-sky-500 text-lg"></i>
          <div>
            <p className="text-xs font-bold text-sky-700 dark:text-sky-300">Telegram vinculado</p>
            <p className="text-[10px] text-sky-600 dark:text-sky-400">Recibirás alertas en Telegram</p>
          </div>
        </div>
        <button
          onClick={disconnect}
          disabled={loading}
          className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50 px-2 py-1 rounded"
        >
          {loading ? <i className="fas fa-circle-notch animate-spin"></i> : 'Desconectar'}
        </button>
      </div>
    );
  }

  // ── Pending link token ────────────────────────────────────────────────────
  if (status.link_token) {
    const deepLink = `https://t.me/${status.bot_username}?start=${status.link_token}`;
    return (
      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <i className="fab fa-telegram text-sky-500 text-lg"></i>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Vincula tu Telegram</p>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Esperando…
          </span>
        </div>

        <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <li className="flex gap-2">
            <span className="w-4 h-4 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
            <span>Abre el bot de Telegram:</span>
          </li>
        </ol>

        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-lg text-sm transition-all shadow"
        >
          <i className="fab fa-telegram"></i>
          Abrir @{status.bot_username}
        </a>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 rounded-lg px-3 py-2">
          <code className="text-xs font-mono text-slate-700 dark:text-slate-200 flex-1">
            /start {status.link_token}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(`/start ${status.link_token}`)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            title="Copiar"
          >
            <i className="fas fa-copy text-xs"></i>
          </button>
        </div>

        <p className="text-[10px] text-slate-400 text-center">
          Envía ese comando al bot. Esta ventana se actualizará sola.
        </p>
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────
  return (
    <button
      onClick={generateToken}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-500/10 border border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-500/40 text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-300 font-semibold rounded-xl text-sm transition-all disabled:opacity-50"
    >
      {loading
        ? <><i className="fas fa-circle-notch animate-spin"></i> Generando código…</>
        : <><i className="fab fa-telegram text-sky-500"></i> Conectar Telegram</>
      }
    </button>
  );
};

export default TelegramConnect;
