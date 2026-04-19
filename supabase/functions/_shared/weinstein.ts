// Rule-based Weinstein stage classifier — runs BEFORE we call Gemini so we
// always have deterministic technical anchors even if the LLM wobbles.
// Based on Stan Weinstein's "Secrets for Profiting in Bull & Bear Markets".

import type { TechnicalSnapshot } from './finnhub.ts';

export type StageLabel = 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';

export interface StageClassification {
  stage: StageLabel;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

export function classifyStage(snap: TechnicalSnapshot): StageClassification {
  const { currentPrice, sma30Weekly, distanceFromSMA30Pct, weekly52High, weekly52Low, volumeRatio } = snap;

  if (sma30Weekly == null || distanceFromSMA30Pct == null) {
    return {
      stage: 'STAGE_1',
      confidence: 'low',
      reasoning: 'Insufficient weekly candle history to compute SMA30.',
    };
  }

  const above = currentPrice > sma30Weekly;
  const dist = distanceFromSMA30Pct;

  // Stage 2 — price above rising SMA30, making higher highs
  if (above && dist > 3) {
    const nearHigh = weekly52High ? currentPrice >= weekly52High * 0.95 : false;
    return {
      stage: 'STAGE_2',
      confidence: nearHigh || (volumeRatio ?? 0) > 1.5 ? 'high' : 'medium',
      reasoning: `Price is ${dist.toFixed(1)}% above SMA30 weekly${nearHigh ? ', near 52-week highs' : ''}.`,
    };
  }

  // Stage 4 — price below falling SMA30
  if (!above && dist < -3) {
    const nearLow = weekly52Low ? currentPrice <= weekly52Low * 1.05 : false;
    return {
      stage: 'STAGE_4',
      confidence: nearLow ? 'high' : 'medium',
      reasoning: `Price is ${Math.abs(dist).toFixed(1)}% below SMA30 weekly${nearLow ? ', near 52-week lows' : ''}.`,
    };
  }

  // Transition zones — Stage 1 (basing) or Stage 3 (distribution)
  // Heuristic: if price was above SMA30 and now hovering flat → Stage 3
  //            if price was below and now flat → Stage 1
  if (above && dist <= 3) {
    return {
      stage: 'STAGE_3',
      confidence: 'medium',
      reasoning: `Price is flattening ${dist.toFixed(1)}% above SMA30 — possible distribution.`,
    };
  }

  return {
    stage: 'STAGE_1',
    confidence: 'medium',
    reasoning: `Price is flattening ${Math.abs(dist).toFixed(1)}% below SMA30 — possible basing.`,
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
