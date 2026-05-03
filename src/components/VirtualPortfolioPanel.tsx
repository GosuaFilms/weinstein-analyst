import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Language } from '../types';
import { useVirtualPortfolios, SavedVirtualPortfolio } from '../hooks/useVirtualPortfolios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VirtualPosition {
  symbol: string;
  name: string;
  nativeCurrency: string;
  currentPrice: number;   // price at generation time (= entry price)
  confidence: 'low' | 'medium' | 'high';
  mansfieldRS: number | null;
  stopLoss: number | null;
  stopLossRiskPct: number | null;
  distanceFromSMA30Pct: number | null;
  extendedStage2: boolean;
  region: string;
  allocationPct: number;
  allocationAmount: number;
  approxShares: number;
  positionRisk: number;
  positionRiskPct: number;
}

interface VirtualPortfolioResult {
  portfolioCurrency: string;
  portfolioAmount: number;
  scannedAt: string;
  duration: number;
  indicesScanned: string[];
  totalStage2Found: number;
  totalAllocated: number;
  totalAllocatedPct: number;
  cashReserve: number;
  cashReservePct: number;
  maxPortfolioRisk: number;
  maxPortfolioRiskPct: number;
  positions: VirtualPosition[];
  methodology: {
    riskPerPosition: string;
    maxPositions: number;
    maxPerRegion: number;
    cashReserveTarget: string;
    stopLossMethod: string;
  };
}

interface LivePrice {
  price: number | null;
  name: string;
  currency: string;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REGION_LABELS: Record<string, string> = {
  US: '🇺🇸 USA', ES: '🇪🇸 España', DE: '🇩🇪 Alemania',
  UK: '🇬🇧 Reino Unido', EU: '🇪🇺 Europa', APAC: '🌏 Asia-Pac',
};

const CONF_CONFIG = {
  high:   { label: 'Alta',  badge: 'bg-emerald-500 text-white' },
  medium: { label: 'Media', badge: 'bg-amber-500 text-white' },
  low:    { label: 'Baja',  badge: 'bg-slate-400 text-white' },
};

const PALETTE = [
  '#10b981','#3b82f6','#f59e0b','#8b5cf6','#f43f5e',
  '#06b6d4','#84cc16','#f97316','#ec4899','#6366f1',
  '#14b8a6','#a855f7',
];

const INDEX_OPTIONS = [
  { id: 'IBEX35',      label: 'IBEX 35',       flag: '🇪🇸' },
  { id: 'DAX40',       label: 'DAX 40',        flag: '🇩🇪' },
  { id: 'CAC40',       label: 'CAC 40',        flag: '🇫🇷' },
  { id: 'FTSE100',     label: 'FTSE 100',      flag: '🇬🇧' },
  { id: 'EUROSTOXX50', label: 'Euro Stoxx 50', flag: '🇪🇺' },
  { id: 'SP100',       label: 'S&P 100',       flag: '🇺🇸' },
  { id: 'SP500',       label: 'S&P 500',       flag: '🇺🇸' },
  { id: 'NASDAQ50',    label: 'NASDAQ 50',     flag: '🇺🇸' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtMoney(n: number, currency: string) {
  try { return n.toLocaleString('es-ES', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  catch { return `${fmt(n, 0)} ${currency}`; }
}
function pnlColor(v: number) {
  if (v > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (v < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-slate-500';
}
function r2(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return (Math.round(v * 100) / 100).toFixed(2);
}
function exportCSV(result: VirtualPortfolioResult | SavedVirtualPortfolio, livePrices?: Record<string, LivePrice>) {
  const positions: VirtualPosition[] = (result as VirtualPortfolioResult).positions ?? (result as SavedVirtualPortfolio).positions;
  const currency = (result as VirtualPortfolioResult).portfolioCurrency ?? (result as SavedVirtualPortfolio).currency;
  const amount = (result as VirtualPortfolioResult).portfolioAmount ?? (result as SavedVirtualPortfolio).amount;
  const scannedAt = (result as VirtualPortfolioResult).scannedAt ?? (result as SavedVirtualPortfolio).generatedAt;

  const hasLive = livePrices && Object.keys(livePrices).length > 0;
  const headers = [
    'Símbolo','Nombre','Moneda nativa','Precio entrada',
    ...(hasLive ? ['Precio actual','P&L %','P&L (abs)'] : []),
    'Asignación %','Importe asignado','Acciones aprox.',
    'Stop Loss','Riesgo stop %','Riesgo posición (abs)','Riesgo posición (% cartera)',
    'RS Mansfield','Dist. SMA30 %','Confianza','Región','Stage2 Extendido',
  ];
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = positions.map((p: VirtualPosition) => {
    const lp = livePrices?.[p.symbol];
    const pnlPct = lp?.price ? ((lp.price - p.currentPrice) / p.currentPrice) * 100 : null;
    const pnlAbs = pnlPct !== null ? (pnlPct / 100) * p.allocationAmount : null;
    return [
      p.symbol, p.name, p.nativeCurrency, r2(p.currentPrice),
      ...(hasLive ? [lp?.price ? r2(lp.price) : '', pnlPct !== null ? `${pnlPct.toFixed(2)}%` : '', pnlAbs !== null ? r2(pnlAbs) : ''] : []),
      p.allocationPct.toFixed(1), p.allocationAmount.toFixed(2), p.approxShares,
      r2(p.stopLoss), r2(p.stopLossRiskPct), r2(p.positionRisk), p.positionRiskPct.toFixed(2),
      r2(p.mansfieldRS), r2(p.distanceFromSMA30Pct), p.confidence, p.region,
      p.extendedStage2 ? 'Sí' : 'No',
    ].map(esc).join(',');
  });
  const meta = [
    `# Cartera Virtual Weinstein — ${currency} ${fmtMoney(amount, currency)}`,
    `# Generada: ${new Date(scannedAt).toLocaleString('es-ES')}`,
    `# ⚠️  NO ES UNA RECOMENDACIÓN DE INVERSIÓN. Carácter exclusivamente educativo.`,
    '',
  ];
  const bom = '﻿';
  const csv = bom + [...meta, headers.join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cartera_weinstein_${currency}_${scannedAt.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Disclaimer ───────────────────────────────────────────────────────────────

const Disclaimer: React.FC<{ es: boolean; compact?: boolean }> = ({ es, compact }) => (
  <div className={`bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 rounded-xl ${compact ? 'p-3' : 'p-4'}`}>
    <div className="flex gap-3 items-start">
      <i className="fas fa-triangle-exclamation text-amber-500 flex-shrink-0 mt-0.5"></i>
      <div>
        <p className={`font-black text-amber-800 dark:text-amber-400 ${compact ? 'text-[10px]' : 'text-xs'} uppercase tracking-wide mb-1`}>
          {es ? '⚠️ No es una recomendación de inversión' : '⚠️ Not investment advice'}
        </p>
        <p className={`text-amber-700 dark:text-amber-300 ${compact ? 'text-[10px]' : 'text-xs'} leading-relaxed`}>
          {es
            ? 'Ejemplo educativo basado en el método Weinstein. No constituye asesoramiento financiero. Los mercados conllevan riesgos significativos y puedes perder tu capital. Consulta siempre a un asesor cualificado.'
            : 'Educational example based on the Weinstein method. Not financial advice. Markets involve significant risks. Always consult a qualified advisor.'}
        </p>
      </div>
    </div>
  </div>
);

// ─── Allocation Bar ───────────────────────────────────────────────────────────

const AllocationBar: React.FC<{ positions: VirtualPosition[]; cashReservePct: number }> = ({ positions, cashReservePct }) => (
  <div>
    <div className="h-7 rounded-xl overflow-hidden flex bg-slate-100 dark:bg-slate-800">
      {positions.map((p, i) => (
        <div key={p.symbol} style={{ width: `${p.allocationPct}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
          className="h-full flex items-center justify-center overflow-hidden" title={`${p.symbol}: ${p.allocationPct}%`}>
          {p.allocationPct > 5 && <span className="text-[9px] font-black text-white truncate px-1">{p.symbol}</span>}
        </div>
      ))}
      <div style={{ width: `${cashReservePct}%` }} className="h-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center" title={`Cash: ${cashReservePct}%`}>
        {cashReservePct > 5 && <span className="text-[9px] font-black text-slate-500 dark:text-slate-300">CASH</span>}
      </div>
    </div>
    <div className="flex flex-wrap gap-2 mt-2">
      {positions.map((p, i) => (
        <div key={p.symbol} className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{p.symbol} {p.allocationPct}%</span>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-500" />
        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Cash {cashReservePct}%</span>
      </div>
    </div>
  </div>
);

// ─── Saved Portfolio Detail ───────────────────────────────────────────────────

interface RescanItem {
  symbol: string;
  currentStage: string;
  exitedStage2: boolean;
  currentPrice: number;
  mansfieldRS: number | null;
  error?: string;
}

const STAGE_BADGE: Record<string, { label: string; cls: string }> = {
  STAGE_1: { label: 'Stage 1', cls: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' },
  STAGE_2: { label: 'Stage 2 ✓', cls: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  STAGE_3: { label: 'Stage 3 ⚠', cls: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' },
  STAGE_4: { label: 'Stage 4 ✕', cls: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300' },
};

const SavedPortfolioDetail: React.FC<{
  portfolio: SavedVirtualPortfolio;
  es: boolean;
  onAnalyze: (s: string) => void;
  onClose: () => void;
  onBack: () => void;
  onDelete: () => void;
}> = ({ portfolio, es, onAnalyze, onClose, onBack, onDelete }) => {
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rescanData, setRescanData] = useState<Record<string, RescanItem>>({});
  const [rescanning, setRescanning] = useState(false);
  const [rescanDone, setRescanDone] = useState(false);

  const positions: VirtualPosition[] = portfolio.positions;

  const fetchPrices = useCallback(async () => {
    setRefreshing(true);
    try {
      const tickers = [...new Set(positions.map(p => p.symbol))];
      const { data } = await supabase.functions.invoke('portfolio-prices', { body: { tickers } });
      if (data) setLivePrices(data as Record<string, LivePrice>);
    } finally {
      setRefreshing(false);
    }
  }, [positions]);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  const handleRescan = useCallback(async () => {
    setRescanning(true);
    setRescanDone(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const symbols = [...new Set(positions.map(p => p.symbol))];
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portfolio-rescan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ symbols }),
        }
      );
      if (!res.ok) return;
      const json = await res.json();
      const map: Record<string, RescanItem> = {};
      for (const item of (json.items ?? []) as RescanItem[]) map[item.symbol] = item;
      setRescanData(map);
      setRescanDone(true);
    } finally {
      setRescanning(false);
    }
  }, [positions]);

  // Portfolio-level P&L
  const totalCost = positions.reduce((s, p) => s + p.allocationAmount, 0);
  const totalCurrentValue = positions.reduce((s, p) => {
    const lp = livePrices[p.symbol]?.price;
    return lp ? s + lp * p.approxShares : s + p.allocationAmount;
  }, 0);
  const hasPrices = positions.some(p => livePrices[p.symbol]?.price != null);
  const totalPnL = totalCurrentValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Subheader */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-slate-50 dark:bg-slate-800/40">
        <button onClick={onBack} className="text-slate-400 hover:text-violet-500 transition-colors flex items-center gap-1.5 text-sm font-bold">
          <i className="fas fa-arrow-left text-xs"></i>
          {es ? 'Volver' : 'Back'}
        </button>
        <div className="flex-grow">
          <p className="text-sm font-black text-slate-900 dark:text-white">{portfolio.label}</p>
          <p className="text-[10px] text-slate-500">{new Date(portfolio.generatedAt).toLocaleString('es-ES')} · {portfolio.indices.join(', ')}</p>
        </div>
        <button onClick={fetchPrices} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-blue-500 hover:border-blue-400 transition-all disabled:opacity-50">
          <i className={`fas fa-rotate-right text-[10px] ${refreshing ? 'animate-spin' : ''}`}></i>
          {es ? 'P&L' : 'P&L'}
        </button>
        <button onClick={handleRescan} disabled={rescanning} title={es ? 'Verificar si los valores siguen en Stage 2' : 'Check if holdings are still Stage 2'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-violet-500 hover:border-violet-400 transition-all disabled:opacity-50">
          <i className={`fas fa-radar text-[10px] ${rescanning ? 'animate-pulse text-violet-500' : ''}`}></i>
          {rescanning ? (es ? 'Escaneando…' : 'Scanning…') : (es ? 'Etapas' : 'Stages')}
        </button>
        <button onClick={() => exportCSV(portfolio, livePrices)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-emerald-500 hover:border-emerald-400 transition-all">
          <i className="fas fa-file-csv text-emerald-500 text-[10px]"></i>
          CSV
        </button>
      </div>

      <div className="p-6 overflow-y-auto flex-grow space-y-5">
        {/* P&L summary */}
        {hasPrices && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{es ? 'Capital base' : 'Base capital'}</p>
              <p className="text-xl font-black text-slate-900 dark:text-white">{fmtMoney(portfolio.amount, portfolio.currency)}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{es ? 'Invertido' : 'Invested'}</p>
              <p className="text-xl font-black text-slate-900 dark:text-white">{fmtMoney(totalCost, portfolio.currency)}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{es ? 'Valor actual' : 'Current value'}</p>
              <p className={`text-xl font-black ${pnlColor(totalPnL)}`}>{fmtMoney(totalCurrentValue, portfolio.currency)}</p>
            </div>
            <div className={`rounded-xl p-4 border ${totalPnL >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">P&L Total</p>
              <p className={`text-xl font-black ${pnlColor(totalPnL)}`}>{totalPnL >= 0 ? '+' : ''}{fmt(totalPnLPct)}%</p>
              <p className={`text-xs font-bold ${pnlColor(totalPnL)}`}>{totalPnL >= 0 ? '+' : ''}{fmtMoney(totalPnL, portfolio.currency)}</p>
            </div>
          </div>
        )}

        {/* Rescan banner */}
        {rescanDone && (() => {
          const exited = Object.values(rescanData).filter(r => r.exitedStage2 && !r.error);
          if (exited.length === 0) {
            return (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                <i className="fas fa-circle-check text-emerald-500"></i>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  {es ? 'Todas las posiciones siguen en Stage 2 ✓' : 'All positions are still in Stage 2 ✓'}
                </p>
              </div>
            );
          }
          return (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40">
              <i className="fas fa-triangle-exclamation text-amber-500 flex-shrink-0 mt-0.5"></i>
              <div>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  {es
                    ? `⚠️ ${exited.length} posición${exited.length > 1 ? 'es han' : ' ha'} salido de Stage 2`
                    : `⚠️ ${exited.length} position${exited.length > 1 ? 's have' : ' has'} exited Stage 2`}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {exited.map(r => r.symbol).join(', ')}
                  {es ? ' — revisa tus stops' : ' — review your stops'}
                </p>
                {es && <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">Se ha enviado alerta por Telegram si tienes el bot conectado.</p>}
              </div>
            </div>
          );
        })()}

        <AllocationBar positions={positions} cashReservePct={portfolio.cashReservePct} />

        {/* Position rows */}
        <div className="space-y-2">
          {positions.map((p: VirtualPosition, i: number) => {
            const lp = livePrices[p.symbol];
            const currentPrice = lp?.price ?? null;
            const pnlPct = currentPrice ? ((currentPrice - p.currentPrice) / p.currentPrice) * 100 : null;
            const pnlAbs = pnlPct !== null ? (pnlPct / 100) * p.allocationAmount : null;
            const belowStop = p.stopLoss && currentPrice && currentPrice < p.stopLoss;

            return (
              <div key={p.symbol} className={`flex flex-wrap items-center gap-3 p-4 rounded-xl border transition-all ${belowStop ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/40' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                {/* Color swatch */}
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />

                {/* Symbol + name */}
                <div className="w-28 flex-shrink-0">
                  <p className="text-sm font-black text-slate-900 dark:text-white">{p.symbol}</p>
                  <p className="text-[10px] text-slate-500 truncate">{REGION_LABELS[p.region] ?? p.region}</p>
                  {rescanDone && rescanData[p.symbol] && (
                    <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${(STAGE_BADGE[rescanData[p.symbol].currentStage] ?? STAGE_BADGE.STAGE_1).cls}`}>
                      {(STAGE_BADGE[rescanData[p.symbol].currentStage] ?? { label: rescanData[p.symbol].currentStage }).label}
                    </span>
                  )}
                </div>

                {/* Allocation */}
                <div className="w-20 flex-shrink-0">
                  <p className="text-[10px] text-slate-400 uppercase">Peso</p>
                  <p className="text-sm font-bold text-violet-600 dark:text-violet-400">{p.allocationPct}%</p>
                  <p className="text-[10px] text-slate-500">{fmtMoney(p.allocationAmount, portfolio.currency)}</p>
                </div>

                {/* Entry price */}
                <div className="w-24 flex-shrink-0">
                  <p className="text-[10px] text-slate-400 uppercase">{es ? 'Precio entrada' : 'Entry'}</p>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{fmt(p.currentPrice)}</p>
                  <p className="text-[10px] text-slate-400">~{p.approxShares} acc.</p>
                </div>

                {/* Current price + P&L */}
                <div className="w-28 flex-shrink-0">
                  <p className="text-[10px] text-slate-400 uppercase">{es ? 'Precio actual' : 'Current'}</p>
                  {refreshing ? (
                    <i className="fas fa-circle-notch animate-spin text-slate-400 text-xs" />
                  ) : currentPrice !== null ? (
                    <>
                      <p className={`text-sm font-bold ${pnlColor(pnlPct ?? 0)}`}>{fmt(currentPrice)}</p>
                      {pnlPct !== null && (
                        <p className={`text-[10px] font-bold ${pnlColor(pnlPct)}`}>
                          {pnlPct >= 0 ? '+' : ''}{fmt(pnlPct)}% ({pnlAbs !== null ? (pnlAbs >= 0 ? '+' : '') + fmtMoney(pnlAbs, portfolio.currency) : ''})
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-slate-400 text-sm">—</p>
                  )}
                </div>

                {/* Stop loss */}
                <div className="w-24 flex-shrink-0">
                  <p className="text-[10px] text-slate-400 uppercase">Stop</p>
                  <p className={`text-sm font-bold ${belowStop ? 'text-rose-600 dark:text-rose-400 animate-pulse' : 'text-slate-600 dark:text-slate-400'}`}>
                    {p.stopLoss ? fmt(p.stopLoss) : '—'}
                  </p>
                  {belowStop && <p className="text-[9px] text-rose-600 dark:text-rose-400 font-bold">⚠ STOP ALCANZADO</p>}
                </div>

                {/* Confidence */}
                <div className="flex-shrink-0">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${CONF_CONFIG[p.confidence as keyof typeof CONF_CONFIG]?.badge ?? 'bg-slate-400 text-white'}`}>
                    {CONF_CONFIG[p.confidence as keyof typeof CONF_CONFIG]?.label ?? p.confidence}
                  </span>
                </div>

                {/* Analyze */}
                <button onClick={() => { onAnalyze(p.symbol); onClose(); }} className="ml-auto px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-xs transition-all flex items-center gap-1">
                  <i className="fas fa-chart-simple text-[10px]"></i>
                  {es ? 'Analizar' : 'Analyze'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Delete */}
        <div className="flex justify-end pt-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{es ? '¿Eliminar esta cartera?' : 'Delete this portfolio?'}</span>
              <button onClick={onDelete} className="px-4 py-2 bg-rose-500 text-white font-bold rounded-xl text-xs hover:bg-rose-400 transition-all">{es ? 'Sí, eliminar' : 'Yes, delete'}</button>
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs transition-all">{es ? 'Cancelar' : 'Cancel'}</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all">
              <i className="fas fa-trash-alt"></i>
              {es ? 'Eliminar cartera guardada' : 'Delete saved portfolio'}
            </button>
          )}
        </div>

        <Disclaimer es={es} compact />
      </div>
    </div>
  );
};

// ─── Saved Portfolios List ────────────────────────────────────────────────────

const SavedPortfoliosList: React.FC<{
  portfolios: SavedVirtualPortfolio[];
  loading: boolean;
  es: boolean;
  onView: (p: SavedVirtualPortfolio) => void;
  onDelete: (id: string) => void;
}> = ({ portfolios, loading, es, onView, onDelete }) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <i className="fas fa-circle-notch animate-spin text-3xl text-violet-500"></i>
    </div>
  );

  if (portfolios.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
      <i className="fas fa-box-open text-5xl mb-4 text-slate-300 dark:text-slate-600"></i>
      <p className="text-slate-500 font-medium">{es ? 'No hay carteras guardadas' : 'No saved portfolios'}</p>
      <p className="text-sm text-slate-400 mt-1">{es ? 'Genera una cartera y pulsa "Guardar"' : 'Generate a portfolio and press "Save"'}</p>
    </div>
  );

  return (
    <div className="p-6 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {portfolios.map(p => (
        <div key={p.id} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-violet-300 dark:hover:border-violet-600 transition-all group">
          <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <i className="fas fa-chart-pie text-violet-500"></i>
          </div>
          <div className="flex-grow min-w-0">
            <p className="font-black text-slate-900 dark:text-white text-sm truncate">{p.label}</p>
            <div className="flex flex-wrap gap-3 mt-1">
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <i className="fas fa-calendar text-[9px]"></i>
                {new Date(p.generatedAt).toLocaleDateString('es-ES')}
              </span>
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <i className="fas fa-chart-simple text-[9px]"></i>
                {p.positions.length} {es ? 'posiciones' : 'positions'}
              </span>
              <span className="text-[10px] text-violet-600 dark:text-violet-400 font-bold">
                {p.totalAllocatedPct}% {es ? 'invertido' : 'invested'}
              </span>
              <span className="text-[10px] text-slate-500">{p.indices.join(', ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => onView(p)} className="px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white font-bold rounded-xl text-xs transition-all shadow-sm">
              <i className="fas fa-eye mr-1.5"></i>
              {es ? 'Ver P&L' : 'View P&L'}
            </button>
            {confirmId === p.id ? (
              <>
                <button onClick={() => { onDelete(p.id); setConfirmId(null); }} className="px-3 py-2 bg-rose-500 text-white font-bold rounded-xl text-xs hover:bg-rose-400 transition-all">✓</button>
                <button onClick={() => setConfirmId(null)} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs transition-all">✕</button>
              </>
            ) : (
              <button onClick={() => setConfirmId(p.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all">
                <i className="fas fa-trash-alt text-xs"></i>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  language: Language;
  onAnalyze: (symbol: string) => void;
  onClose: () => void;
}

const VirtualPortfolioPanel: React.FC<Props> = ({ language, onAnalyze, onClose }) => {
  const es = language === Language.ES;
  const { portfolios, loading: loadingSaved, save: savePortfolio, remove: removePortfolio } = useVirtualPortfolios();

  const [tab, setTab] = useState<'generate' | 'saved'>('generate');
  const [viewingPortfolio, setViewingPortfolio] = useState<SavedVirtualPortfolio | null>(null);

  // Generator state
  const [currency, setCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [amount, setAmount] = useState(100000);
  const [amountInput, setAmountInput] = useState('100000');
  const [selectedIndices, setSelectedIndices] = useState<string[]>(['IBEX35', 'DAX40', 'SP100']);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<VirtualPortfolioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPos, setExpandedPos] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleCurrencyChange = (c: 'EUR' | 'USD') => {
    setCurrency(c);
    setSelectedIndices(c === 'EUR' ? ['IBEX35', 'DAX40', 'SP100'] : ['SP100', 'NASDAQ50', 'IBEX35']);
    setResult(null); setSavedId(null);
  };

  const toggleIndex = (id: string) =>
    setSelectedIndices(prev => prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id]);

  const generate = async () => {
    setGenerating(true); setError(null); setResult(null); setSavedId(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('virtual-portfolio', { body: { currency, amount, indices: selectedIndices } });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setResult(data as VirtualPortfolioResult);
    } catch (e) {
      setError((e as Error).message || 'Error al generar la cartera.');
    } finally { setGenerating(false); }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const saved = await savePortfolio(result);
      setSavedId(saved.id);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await removePortfolio(id);
    if (viewingPortfolio?.id === id) setViewingPortfolio(null);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl mx-4 my-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col" style={{ minHeight: '70vh' }}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center">
              <i className="fas fa-chart-pie text-violet-500 text-lg"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {es ? 'Cartera Virtual Weinstein' : 'Weinstein Virtual Portfolio'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {es ? 'Generada automáticamente con el método Weinstein · No es asesoramiento financiero' : 'Auto-generated using the Weinstein method · Not financial advice'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-2">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        {/* Tab bar */}
        {!viewingPortfolio && (
          <div className="px-6 pt-4 pb-0 border-b border-slate-200 dark:border-slate-800 flex gap-1">
            {[
              { id: 'generate', icon: 'fa-wand-magic-sparkles', label: es ? 'Generar cartera' : 'Generate' },
              { id: 'saved',    icon: 'fa-folder-open',         label: es ? `Guardadas (${portfolios.length})` : `Saved (${portfolios.length})` },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as 'generate' | 'saved')}
                className={`px-5 py-2.5 text-sm font-bold rounded-t-xl transition-all flex items-center gap-2 border-b-2 -mb-px ${
                  tab === t.id
                    ? 'text-violet-600 dark:text-violet-400 border-violet-500 bg-white dark:bg-slate-900'
                    : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <i className={`fas ${t.icon} text-xs`}></i>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* ── SAVED DETAIL VIEW ── */}
        {viewingPortfolio && (
          <SavedPortfolioDetail
            portfolio={viewingPortfolio}
            es={es}
            onAnalyze={onAnalyze}
            onClose={onClose}
            onBack={() => { setViewingPortfolio(null); setTab('saved'); }}
            onDelete={() => { handleDelete(viewingPortfolio.id); setViewingPortfolio(null); setTab('saved'); }}
          />
        )}

        {/* ── SAVED LIST TAB ── */}
        {!viewingPortfolio && tab === 'saved' && (
          <SavedPortfoliosList
            portfolios={portfolios}
            loading={loadingSaved}
            es={es}
            onView={setViewingPortfolio}
            onDelete={handleDelete}
          />
        )}

        {/* ── GENERATOR TAB ── */}
        {!viewingPortfolio && tab === 'generate' && (
          <>
            {/* Controls */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-4">
              <Disclaimer es={es} />
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{es ? 'Divisa' : 'Currency'}</label>
                  <div className="flex bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 gap-1">
                    {(['EUR','USD'] as const).map(c => (
                      <button key={c} onClick={() => handleCurrencyChange(c)}
                        className={`px-5 py-2 rounded-lg text-sm font-black transition-all ${currency === c ? 'bg-violet-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                        {c === 'EUR' ? '€ EUR' : '$ USD'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{es ? 'Capital de referencia' : 'Reference capital'}</label>
                  <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <span className="px-3 text-slate-400 font-bold text-sm border-r border-slate-200 dark:border-slate-700">{currency === 'EUR' ? '€' : '$'}</span>
                    <input type="text" inputMode="numeric"
                      className="px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white bg-transparent w-32 outline-none"
                      value={amountInput}
                      onChange={e => { setAmountInput(e.target.value); const n = parseInt(e.target.value.replace(/\D/g,'')); if(!isNaN(n)&&n>=1000) setAmount(n); }} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{es ? 'Índices' : 'Indices'}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {INDEX_OPTIONS.map(idx => (
                      <button key={idx.id} onClick={() => toggleIndex(idx.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${selectedIndices.includes(idx.id) ? 'bg-violet-500 text-white border-violet-400' : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-violet-300'}`}>
                        {idx.flag} {idx.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={generate} disabled={generating}
                  className="ml-auto px-8 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-black rounded-xl transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2">
                  {generating ? <><i className="fas fa-circle-notch animate-spin"></i>{es ? 'GENERANDO…' : 'GENERATING…'}</> : <><i className="fas fa-wand-magic-sparkles"></i>{es ? 'GENERAR' : 'GENERATE'}</>}
                </button>
              </div>
            </div>

            {/* Generating */}
            {generating && (
              <div className="flex flex-col items-center justify-center py-20 gap-5">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 border-4 border-violet-500/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-4 flex items-center justify-center"><i className="fas fa-chart-pie text-violet-500 text-xl animate-pulse"></i></div>
                </div>
                <div className="text-center">
                  <p className="font-black text-slate-900 dark:text-white text-lg uppercase tracking-tighter">{es ? 'Construyendo cartera…' : 'Building portfolio…'}</p>
                  <p className="text-sm text-slate-500 mt-1">{es ? `Escaneando ${selectedIndices.join(', ')}…` : `Scanning ${selectedIndices.join(', ')}…`}</p>
                  <p className="text-xs text-slate-400 mt-2 italic">{es ? '(puede tardar 30–60 segundos)' : '(may take 30–60 seconds)'}</p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && !generating && (
              <div className="m-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-3 text-rose-700 dark:text-rose-400">
                <i className="fas fa-circle-exclamation text-xl flex-shrink-0"></i>
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Empty */}
            {!generating && !result && !error && (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
                <i className="fas fa-chart-pie text-5xl mb-4 text-slate-300 dark:text-slate-600"></i>
                <p className="text-slate-500 font-medium text-sm max-w-xs">{es ? 'Configura los parámetros y pulsa "Generar"' : 'Set parameters and press "Generate"'}</p>
              </div>
            )}

            {/* Results */}
            {result && !generating && (
              <div className="p-6 overflow-y-auto space-y-5" style={{ maxHeight: 'calc(100vh - 340px)' }}>

                {/* Save banner */}
                <div className={`flex items-center justify-between gap-4 p-4 rounded-xl border ${savedId ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' : 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/30'}`}>
                  <div className="flex items-center gap-3">
                    <i className={`fas ${savedId ? 'fa-circle-check text-emerald-500' : 'fa-floppy-disk text-violet-500'} text-lg`}></i>
                    <div>
                      <p className={`text-sm font-black ${savedId ? 'text-emerald-700 dark:text-emerald-400' : 'text-violet-700 dark:text-violet-400'}`}>
                        {savedId ? (es ? '¡Cartera guardada!' : 'Portfolio saved!') : (es ? 'Guarda esta cartera para seguir su evolución' : 'Save this portfolio to track its evolution')}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {savedId ? (es ? 'Accede desde "Guardadas" para ver el P&L actualizado' : 'Access from "Saved" to see updated P&L') : (es ? 'Podrás ver el P&L en tiempo real en cualquier momento' : 'You\'ll be able to see real-time P&L at any time')}
                      </p>
                    </div>
                  </div>
                  {!savedId ? (
                    <button onClick={handleSave} disabled={saving}
                      className="flex-shrink-0 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2">
                      {saving ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-floppy-disk"></i>}
                      {es ? 'Guardar cartera' : 'Save portfolio'}
                    </button>
                  ) : (
                    <button onClick={() => { setTab('saved'); }} className="flex-shrink-0 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all flex items-center gap-2">
                      <i className="fas fa-folder-open"></i>
                      {es ? 'Ver guardadas' : 'View saved'}
                    </button>
                  )}
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: es ? 'Posiciones' : 'Positions', value: result.positions.length, sub: `${es ? 'de' : 'of'} ${result.totalStage2Found} Stage 2`, color: 'text-slate-900 dark:text-white' },
                    { label: es ? 'Invertido' : 'Invested', value: `${result.totalAllocatedPct}%`, sub: fmtMoney(result.totalAllocated, result.portfolioCurrency), color: 'text-violet-700 dark:text-violet-400' },
                    { label: es ? 'Liquidez' : 'Cash', value: `${result.cashReservePct}%`, sub: fmtMoney(result.cashReserve, result.portfolioCurrency), color: 'text-blue-700 dark:text-blue-400' },
                    { label: es ? 'Riesgo máx.' : 'Max risk', value: `${result.maxPortfolioRiskPct}%`, sub: fmtMoney(result.maxPortfolioRisk, result.portfolioCurrency), color: 'text-rose-700 dark:text-rose-400' },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
                      <p className={`text-2xl font-black ${item.color}`}>{item.value}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.sub}</p>
                    </div>
                  ))}
                </div>

                <AllocationBar positions={result.positions} cashReservePct={result.cashReservePct} />

                {result.positions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <i className="fas fa-search text-3xl mb-3 opacity-40"></i>
                    <p>{es ? 'No se encontraron suficientes valores en Stage 2.' : 'Not enough Stage 2 stocks found.'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {result.positions.map((p, i) => (
                      <div key={p.symbol} className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden hover:shadow-md transition-shadow">
                        <div className="h-1.5 w-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-slate-900 dark:text-white">{p.symbol}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{p.nativeCurrency}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 truncate max-w-[170px] mt-0.5">{p.name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{REGION_LABELS[p.region] ?? p.region}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-violet-600 dark:text-violet-400">{p.allocationPct}%</p>
                              <p className="text-xs font-bold text-slate-500">{fmtMoney(p.allocationAmount, result.portfolioCurrency)}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                            {[
                              { k: es ? 'Precio' : 'Price', v: fmt(p.currentPrice) },
                              { k: es ? 'Acciones' : 'Shares', v: `~${p.approxShares}` },
                              { k: 'RS', v: p.mansfieldRS !== null ? <span className={p.mansfieldRS >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{fmt(p.mansfieldRS)}</span> : '—' },
                              { k: 'Stop', v: <span className="text-rose-600 dark:text-rose-400">{p.stopLoss ? fmt(p.stopLoss) : '—'}</span> },
                              { k: es ? 'Dist. stop' : 'Stop dist.', v: p.stopLossRiskPct ? `-${fmt(p.stopLossRiskPct)}%` : '—' },
                              { k: es ? 'Riesgo' : 'Risk', v: <span className="text-rose-600 dark:text-rose-400">-{fmt(p.positionRiskPct)}%</span> },
                            ].map(item => (
                              <div key={item.k}>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{item.k}</p>
                                <p className="font-bold text-slate-800 dark:text-slate-200">{item.v}</p>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${CONF_CONFIG[p.confidence]?.badge}`}>
                              {CONF_CONFIG[p.confidence]?.label}
                            </span>
                            <button onClick={() => setExpandedPos(expandedPos === p.symbol ? null : p.symbol)}
                              className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
                              <i className={`fas fa-chevron-${expandedPos === p.symbol ? 'up' : 'down'} text-[8px]`}></i>
                              {es ? 'Metodología' : 'Methodology'}
                            </button>
                          </div>
                          {expandedPos === p.symbol && (
                            <p className="text-[10px] text-slate-500 bg-slate-50 dark:bg-slate-900/40 rounded-lg p-2 mb-3 leading-relaxed">
                              Dist. SMA30: {p.distanceFromSMA30Pct !== null ? `${p.distanceFromSMA30Pct > 0 ? '+' : ''}${fmt(p.distanceFromSMA30Pct)}%` : '—'} · {p.extendedStage2 ? (es ? 'Stage 2 extendido' : 'Extended Stage 2') : (es ? 'Stage 2 normal' : 'Normal Stage 2')}
                            </p>
                          )}
                          <button onClick={() => { onAnalyze(p.symbol); onClose(); }}
                            className="w-full py-2 bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-xs hover:bg-slate-700 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-1.5">
                            <i className="fas fa-chart-simple"></i>
                            {es ? 'Análisis completo' : 'Full analysis'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-3 justify-between items-center">
                  <p className="text-xs text-slate-400"><i className="fas fa-clock mr-1"></i>{es ? 'Generada en' : 'Generated in'} {result.duration}s · {new Date(result.scannedAt).toLocaleString('es-ES')}</p>
                  <div className="flex gap-2">
                    <button onClick={generate} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-violet-400 hover:text-violet-500 transition-all">
                      <i className="fas fa-rotate-right"></i>{es ? 'Regenerar' : 'Regenerate'}
                    </button>
                    <button onClick={() => exportCSV(result)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-all">
                      <i className="fas fa-file-csv text-emerald-500"></i>{es ? 'Exportar CSV' : 'Export CSV'}
                    </button>
                  </div>
                </div>

                <Disclaimer es={es} compact />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VirtualPortfolioPanel;
