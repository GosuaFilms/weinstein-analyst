// Rule-based Weinstein stage classifier — runs BEFORE we call Gemini so we
// always have deterministic technical anchors even if the LLM wobbles.
// Based on Stan Weinstein's "Secrets for Profiting in Bull & Bear Markets".

import type { TechnicalSnapshot } from './marketData.ts';

export type StageLabel = 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';

export interface StageClassification {
  stage: StageLabel;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

// Canonical Weinstein stage classifier. Uses the 4 filters Weinstein requires:
//   1. Price vs MM30 semanal
//   2. Slope of MM30 (ascendente / plana / descendente)
//   3. Mansfield RS vs zero line (sobre/bajo el benchmark)
//   4. Trend of Mansfield RS (subiendo / bajando)
// A "clean" Stage 2 needs all four aligned bullish; Stage 4 needs all aligned bearish.
// Stages 1 and 3 are transitions between those.
export function classifyStage(snap: TechnicalSnapshot): StageClassification {
  const {
    currentPrice,
    sma30Weekly,
    distanceFromSMA30Pct,
    sma30Trend,
    mansfieldRS,
    mansfieldRSTrend,
    weekly52High,
    weekly52Low,
    volumeRatio,
    extendedStage2,
  } = snap;
  const multiMaAlignment = snap.multiMaAlignment;
  const volumeDryUp = snap.volumeDryUp;
  const sma10 = snap.sma10Weekly;
  const sma40 = snap.sma40Weekly;

  if (sma30Weekly == null || distanceFromSMA30Pct == null || sma30Trend == null) {
    return {
      stage: 'STAGE_1',
      confidence: 'low',
      reasoning: 'Histórico semanal insuficiente para calcular MM30 y su pendiente.',
    };
  }

  const above = currentPrice > sma30Weekly;
  const dist = distanceFromSMA30Pct;
  const rsPositive = (mansfieldRS ?? 0) > 0;
  const rsRising = mansfieldRSTrend === 'rising';
  const smaRising = sma30Trend === 'rising';
  const smaFalling = sma30Trend === 'falling';

  const filters = [above, smaRising, rsPositive, rsRising];
  const bullishHits = filters.filter(Boolean).length;
  const bearishHits = [!above, smaFalling, !rsPositive, mansfieldRSTrend === 'falling'].filter(Boolean).length;

  const rsStr = mansfieldRS != null ? mansfieldRS.toFixed(2) : 'N/A';
  const benchName = snap.benchmarkName ?? 'benchmark';

  // Stage 2 — price > MM30, MM30 rising, RS > 0, RS rising. Weinstein exige los 4.
  if (above && smaRising) {
    const nearHigh = weekly52High ? currentPrice >= weekly52High * 0.95 : false;
    const volBoost = (volumeRatio ?? 0) >= 2;
    const confidence: 'low' | 'medium' | 'high' =
      bullishHits === 4 && multiMaAlignment === 'bullish' ? 'high' :
      bullishHits >= 3 && (multiMaAlignment === 'bullish' || multiMaAlignment === 'partial') ? 'medium' :
      bullishHits >= 3 ? 'medium' :
      'low';
    const extras = [
      nearHigh ? 'cerca de máximos 52sem' : null,
      volBoost ? 'volumen ≥2× la media' : null,
      extendedStage2 ? '⚠ Etapa 2 extendida (>15% sobre MM30): no es punto de compra; si ya estás dentro, protege con el stop' : null,
    ].filter(Boolean).join(', ');
    const multiMaStr = multiMaAlignment === 'bullish'
      ? ` MA10w(${sma10?.toFixed(2) ?? '?'}) > MA30w > MA40w(${sma40?.toFixed(2) ?? '?'}) alcistas alineadas ✓`
      : multiMaAlignment === 'partial'
      ? ' Medias móviles parcialmente alineadas'
      : multiMaAlignment === 'bearish'
      ? ' ⚠ Medias móviles en alineación bajista'
      : '';
    return {
      stage: 'STAGE_2',
      confidence,
      reasoning: `Etapa 2: precio ${dist.toFixed(1)}% sobre MM30 ASCENDENTE, Mansfield RS=${rsStr} vs ${benchName} ${rsRising ? 'subiendo' : rsPositive ? 'positiva pero no subiendo' : 'NEGATIVA'}. Filtros Weinstein cumplidos: ${bullishHits}/4.${extras ? ' ' + extras + '.' : ''}${multiMaStr}`,
    };
  }

  // Stage 4 — price < MM30, MM30 falling (canon).
  if (!above && smaFalling) {
    const nearLow = weekly52Low ? currentPrice <= weekly52Low * 1.05 : false;
    const confidence: 'low' | 'medium' | 'high' =
      bearishHits === 4 ? 'high' : bearishHits === 3 ? 'medium' : 'low';
    return {
      stage: 'STAGE_4',
      confidence,
      reasoning: `Etapa 4: precio ${Math.abs(dist).toFixed(1)}% bajo MM30 DESCENDENTE, Mansfield RS=${rsStr} vs ${benchName}${nearLow ? ', cerca de mínimos 52sem' : ''}.`,
    };
  }

  // Stages 1 and 3 look alike (MM30 flat, price around it); Weinstein tells them
  // apart by what came before: a base follows a decline, a top follows an advance.
  // priorTrend = MM30 change from ~30 to ~8 weeks ago (52-week range as tie-breaker).
  const prior = snap.priorTrend ?? 'sideways';
  const priorPct = snap.priorTrendPct != null ? ` (MM30 ${snap.priorTrendPct > 0 ? '+' : ''}${snap.priorTrendPct.toFixed(0)}% en los meses previos)` : '';
  const slopeWord = sma30Trend === 'rising' ? 'todavía ascendente' : sma30Trend === 'falling' ? 'descendente' : 'plana';
  const dryUpNote = volumeDryUp === true ? ' · ⚡ Volumen en contracción (posible ruptura próxima)' : '';

  // Top context: after an advance, or price already lost a still-rising MM30
  const isTop = prior === 'advance' || (prior === 'sideways' && !above && sma30Trend === 'rising');

  if (isTop) {
    return {
      stage: 'STAGE_3',
      confidence: prior === 'advance' ? 'medium' : 'low',
      reasoning: above
        ? `Etapa 3 (techo): tras una subida${priorPct}, la MM30 se ha vuelto ${slopeWord} y el precio (${dist.toFixed(1)}% sobre ella) ya no avanza. RS=${rsStr}. Weinstein: no comprar; si estás dentro, sube el stop justo bajo la MM30.`
        : `Etapa 3 (techo): tras una subida${priorPct}, el precio ha perdido la MM30 ${slopeWord} (${Math.abs(dist).toFixed(1)}% por debajo). RS=${rsStr}. Señal de aviso: si la MM30 gira a la baja, pasaría a Etapa 4.`,
    };
  }

  // Base context: after a decline, or sideways without signs of a top
  return {
    stage: 'STAGE_1',
    confidence: prior === 'decline' ? 'medium' : 'low',
    reasoning: above
      ? `Etapa 1 (base): tras una caída o lateral${priorPct}, el precio está ${dist.toFixed(1)}% sobre una MM30 ${slopeWord}. La base puede estar madurando: comprar solo en la ruptura de su resistencia con volumen ≥2× y la MM30 girando al alza.${dryUpNote}`
      : `Etapa 1 (base): tras una caída o lateral${priorPct}, el precio está ${Math.abs(dist).toFixed(1)}% bajo una MM30 ${slopeWord}. Esperar a que la MM30 se aplane y el precio rompa la base con volumen.${dryUpNote}`,
  };
}

export interface AlertEvaluation {
  triggered: boolean;
  message: string;
}

export function evaluateAlert(
  condition: string,
  snap: TechnicalSnapshot,
  referenceLevel: number | null,
  volumeMultiplier: number,
  lang: 'es' | 'en' = 'es'
): AlertEvaluation {
  const t = (es: string, en: string) => lang === 'es' ? es : en;

  switch (condition) {
    case 'PRICE_CROSS_SMA30_UP':
      if (snap.sma30Weekly == null) return { triggered: false, message: '' };
      if (snap.currentPrice > snap.sma30Weekly && (snap.previousClose <= snap.sma30Weekly)) {
        return {
          triggered: true,
          message: t(
            `Precio ${snap.currentPrice} cruzó al alza la SMA30 (${snap.sma30Weekly.toFixed(2)}).`,
            `Price ${snap.currentPrice} crossed above SMA30 (${snap.sma30Weekly.toFixed(2)}).`
          ),
        };
      }
      return { triggered: false, message: '' };

    case 'PRICE_CROSS_SMA30_DOWN':
      if (snap.sma30Weekly == null) return { triggered: false, message: '' };
      if (snap.currentPrice < snap.sma30Weekly && (snap.previousClose >= snap.sma30Weekly)) {
        return {
          triggered: true,
          message: t(
            `Precio ${snap.currentPrice} cruzó a la baja la SMA30 (${snap.sma30Weekly.toFixed(2)}).`,
            `Price ${snap.currentPrice} crossed below SMA30 (${snap.sma30Weekly.toFixed(2)}).`
          ),
        };
      }
      return { triggered: false, message: '' };

    case 'VOLUME_SURGE':
      if (snap.volumeRatio == null) return { triggered: false, message: '' };
      if (snap.volumeRatio >= volumeMultiplier) {
        return {
          triggered: true,
          message: t(
            `Volumen semanal ${snap.volumeRatio.toFixed(2)}x la media (>${volumeMultiplier}x).`,
            `Weekly volume ${snap.volumeRatio.toFixed(2)}x the average (>${volumeMultiplier}x).`
          ),
        };
      }
      return { triggered: false, message: '' };

    case 'RESISTANCE_BREAKOUT':
      if (referenceLevel == null) return { triggered: false, message: '' };
      if (snap.currentPrice > referenceLevel) {
        return {
          triggered: true,
          message: t(
            `🚀 Ruptura: precio ${snap.currentPrice} superó resistencia ${referenceLevel}.`,
            `🚀 Breakout: price ${snap.currentPrice} broke resistance ${referenceLevel}.`
          ),
        };
      }
      return { triggered: false, message: '' };

    case 'SUPPORT_BREAKDOWN':
      if (referenceLevel == null) return { triggered: false, message: '' };
      if (snap.currentPrice < referenceLevel) {
        return {
          triggered: true,
          message: t(
            `⚠️ Pérdida de soporte: precio ${snap.currentPrice} rompió soporte ${referenceLevel}.`,
            `⚠️ Support lost: price ${snap.currentPrice} broke support ${referenceLevel}.`
          ),
        };
      }
      return { triggered: false, message: '' };

    default:
      return { triggered: false, message: '' };
  }
}
