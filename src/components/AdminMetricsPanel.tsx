import React from 'react';

// Shape returned by the admin-metrics edge function (SQL public.admin_metrics()).
export interface AdminMetrics {
  users_total: number;
  users_pro: number;
  signups_7d: number;
  dau: number;
  wau: number;
  mau: number;
  tracking_since: string | null;
  signups_weekly: Array<{ week: string; n: number }>;
  active_weekly: Array<{ week: string; n: number }>;
  events_30d: Array<{ event: string; n: number; users: number }>;
}

// Edge function name → what the owner calls it
const EVENT_LABELS: Record<string, string> = {
  'analyze-market':    'Análisis con IA',
  'analyze-operation': 'Análisis de operación',
  'chat':              'Chat',
  'screener':          'Screener',
  'stage2-daily':      'Monitor Stage 2 (actualizar)',
  'virtual-portfolio': 'Cartera virtual (generar)',
  'portfolio-prices':  'Precios de cartera',
  'backtest':          'Backtest',
  'watchlist-scan':    'Escaneo de watchlist',
  'get-live-price':    'Precio en vivo',
  'get-news':          'Noticias',
};

const fmtWeek = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};

// Single-series weekly bars: thin marks on a baseline, native hover title per bar.
const WeeklyBars: React.FC<{ title: string; rows: Array<{ week: string; n: number }>; barClass: string }> = ({ title, rows, barClass }) => {
  const W = 520, H = 150, padL = 28, padB = 22, padT = 10;
  const max = Math.max(1, ...rows.map(r => r.n));
  const step = (W - padL) / Math.max(1, rows.length);
  const bw = Math.min(26, step - 6);
  const y = (n: number) => padT + (H - padT - padB) * (1 - n / max);
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
      <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 mb-2">{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title}>
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="1" />
        <text x={padL - 6} y={y(max) + 4} textAnchor="end" className="fill-slate-400" fontSize="10">{max}</text>
        <text x={padL - 6} y={H - padB + 4} textAnchor="end" className="fill-slate-400" fontSize="10">0</text>
        {rows.map((r, i) => {
          const x = padL + i * step + (step - bw) / 2;
          const top = y(r.n);
          return (
            <g key={r.week}>
              <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} fill="transparent">
                <title>{`Semana del ${fmtWeek(r.week)}: ${r.n}`}</title>
              </rect>
              {r.n > 0 && (
                <rect x={x} y={top} width={bw} height={H - padB - top} rx="3" className={barClass} pointerEvents="none" />
              )}
              {(i % 2 === 1 || i === rows.length - 1) && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-slate-400" fontSize="10">{fmtWeek(r.week)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    <span className="block text-2xl font-black text-slate-900 dark:text-white mt-1">{value}</span>
    {sub && <span className="block text-[11px] text-slate-500 mt-0.5">{sub}</span>}
  </div>
);

interface Props {
  metrics: AdminMetrics;
  onClose: () => void;
}

const AdminMetricsPanel: React.FC<Props> = ({ metrics: m, onClose }) => {
  const conversion = m.users_total > 0 ? (m.users_pro / m.users_total) * 100 : 0;
  const since = m.tracking_since
    ? new Date(m.tracking_since).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl mx-4 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <i className="fas fa-chart-line text-blue-500 text-lg"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Métricas del negocio</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Solo visible para administradores</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-2">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Usuarios" value={String(m.users_total)} sub={`+${m.signups_7d} en 7 días`} />
            <Kpi label="Activos 7 días" value={String(m.wau)} sub={`${m.dau} hoy · ${m.mau} en 30 días`} />
            <Kpi label="Plan Pro" value={String(m.users_pro)} />
            <Kpi label="Conversión a Pro" value={`${conversion.toFixed(1)} %`} sub="Pro / usuarios totales" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WeeklyBars title="Altas por semana" rows={m.signups_weekly} barClass="fill-emerald-500" />
            <WeeklyBars title="Usuarios activos por semana" rows={m.active_weekly} barClass="fill-blue-500" />
          </div>

          <div>
            <h3 className="text-xs font-black text-slate-700 dark:text-slate-200 mb-2">Uso por herramienta · últimos 30 días</h3>
            {m.events_30d.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay actividad registrada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2">Herramienta</th>
                    <th className="py-2 text-right">Usos</th>
                    <th className="py-2 text-right">Usuarios</th>
                  </tr>
                </thead>
                <tbody>
                  {m.events_30d.map(e => (
                    <tr key={e.event} className="border-b border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200">
                      <td className="py-2">{EVENT_LABELS[e.event] ?? e.event}</td>
                      <td className="py-2 text-right font-mono">{e.n}</td>
                      <td className="py-2 text-right font-mono">{e.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            {since
              ? `La actividad se registra desde el ${since}; las semanas anteriores aparecen sin usuarios activos.`
              : 'La actividad empezará a registrarse con el próximo uso de la app.'}
            {' '}Altas y plan Pro incluyen todo el histórico.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminMetricsPanel;
