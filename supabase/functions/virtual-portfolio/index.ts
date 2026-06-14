// POST /functions/v1/virtual-portfolio
// Body: { currency?: 'EUR'|'USD', amount?: number, indices?: string[] }
//
// Generates a diversified virtual portfolio using the Stan Weinstein method.
// Only Stage 2 stocks (bullish trend) with medium/high confidence are selected.
// Position sizing is risk-based: each position risks ~1.5% of the portfolio
// using the Weinstein stop-loss level. Max 12 positions, max 12% per position.
//
// ⚠️  NOT INVESTMENT ADVICE — educational/illustrative only.

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';

// ─── Index definitions (same as screener) ────────────────────────────────────

const INDICES: Record<string, { label: string; region: string; tickers: string[] }> = {
  IBEX35: {
    label: 'IBEX 35', region: 'ES',
    tickers: [
      'ACS.MC','ACX.MC','AENA.MC','AMS.MC','ANA.MC','BBVA.MC','BKT.MC',
      'CABK.MC','COL.MC','ENG.MC','ELE.MC','FER.MC','GRF.MC','IAG.MC',
      'IBE.MC','IDR.MC','ITX.MC','LOG.MC','MAP.MC','MEL.MC','MRL.MC',
      'NTGY.MC','PHM.MC','RED.MC','REP.MC','ROVI.MC','SAB.MC','SAN.MC',
      'SCYR.MC','SLR.MC','TEF.MC','UNI.MC','VIS.MC','AMP.MC','CLNX.MC',
    ],
  },
  SP100: {
    label: 'S&P 100', region: 'US',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM',
      'LLY','V','UNH','XOM','MA','JNJ','PG','COST','HD','ABBV','BAC',
      'KO','WMT','MRK','NFLX','CVX','CRM','AMD','ORCL','LIN','ACN',
      'MCD','CSCO','PEP','ABT','TXN','ADBE','AMGN','GE','CAT','NOW',
      'INTU','QCOM','GS','RTX','HON','BKNG','MS','DE','ISRG','PFE',
    ],
  },
  NASDAQ50: {
    label: 'NASDAQ 50', region: 'US',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','COST',
      'NFLX','AMD','ADBE','CSCO','INTU','QCOM','TXN','AMGN','ISRG',
      'BKNG','MU','LRCX','KLAC','MRVL','PANW','SNPS','CDNS','ADI',
      'CRWD','FTNT','MELI','ASML','AZN','PDD','REGN','GILD','VRTX',
      'MDLZ','CHTR','MAR','ABNB','ORLY','WDAY','CTAS','DXCM','IDXX',
    ],
  },
  DAX40: {
    label: 'DAX 40', region: 'DE',
    tickers: [
      'ADS.DE','AIR.DE','ALV.DE','BAS.DE','BAYN.DE','BMW.DE','BNR.DE',
      'CON.DE','DB1.DE','DBK.DE','DHL.DE','DTE.DE','EOAN.DE','FRE.DE',
      'HEI.DE','HEN3.DE','IFX.DE','LIN.DE','MBG.DE','MRK.DE','MTX.DE',
      'MUV2.DE','P911.DE','PUM.DE','QIA.DE','RHM.DE','RWE.DE','SAP.DE',
      'SHL.DE','SIE.DE','SRT3.DE','VNA.DE','VOW3.DE','WCH.DE','ZAL.DE',
      'ENR.DE','HNR1.DE','1COV.DE','SY1.DE','AFX.DE',
    ],
  },
  CAC40: {
    label: 'CAC 40', region: 'FR',
    tickers: [
      'AI.PA','AIR.PA','ACA.PA','ALO.PA','BN.PA','BNP.PA','CA.PA','CAP.PA',
      'CS.PA','DG.PA','DSY.PA','ENGI.PA','ERF.PA','FP.PA','GLE.PA','HO.PA',
      'KER.PA','LR.PA','MC.PA','ML.PA','MT.PA','OR.PA','ORA.PA','PUB.PA',
      'RMS.PA','RNO.PA','SAF.PA','SAN.PA','SGO.PA','SU.PA','STM.PA',
      'VIE.PA','VIV.PA','WLN.PA','EL.PA','SW.PA','TTE.PA','BVI.PA',
      'URW.AS','STLAM.MI',
    ],
  },
  FTSE100: {
    label: 'FTSE 100', region: 'UK',
    tickers: [
      'AAL.L','ABF.L','ADM.L','AHT.L','ANTO.L','AV.L','AZN.L','BA.L',
      'BARC.L','BATS.L','BEZ.L','BHP.L','BP.L','BRBY.L','BT-A.L','CCH.L',
      'CPG.L','CRH.L','DGE.L','ENT.L','EXPN.L','FRES.L','GLEN.L','GSK.L',
      'HL.L','HLMA.L','HSBA.L','IAG.L','IHG.L','III.L','IMB.L','ITRK.L',
      'ITV.L','JD.L','KGF.L','LAND.L','LGEN.L','LLOY.L','LSE.L','MKS.L',
      'MNDI.L','MNG.L','NG.L','NWG.L','OCDO.L','PHNX.L','PRU.L','PSN.L',
      'REL.L','RIO.L','RKT.L','RMV.L','RR.L','SBRY.L','SGE.L','SGRO.L',
      'SHEL.L','SMDS.L','SMIN.L','SMT.L','SN.L','SPX.L','SSE.L','STJ.L',
      'TSCO.L','TW.L','ULVR.L','UU.L','VOD.L','WPP.L','NXT.L','AUTO.L',
      'BNZL.L','CHG.L','CNA.L','DPLM.L','EMG.L','FLTR.L','IMI.L','JMAT.L',
    ],
  },
  EUROSTOXX50: {
    label: 'Euro Stoxx 50', region: 'EU',
    tickers: [
      'AI.PA','AIR.PA','BN.PA','BNP.PA','CS.PA','DG.PA','EL.PA','ENGI.PA',
      'FP.PA','GLE.PA','KER.PA','MC.PA','OR.PA','RMS.PA','SAF.PA','SAN.PA',
      'SGO.PA','SU.PA','ALV.DE','BAS.DE','BAYN.DE','BMW.DE','DTE.DE',
      'EOAN.DE','IFX.DE','MBG.DE','MUV2.DE','SAP.DE','SIE.DE','VOW3.DE',
      'ADYEN.AS','ASML.AS','ING.AS','PHIA.AS','PRX.AS',
      'BBVA.MC','IBE.MC','ITX.MC','SAN.MC',
      'ENI.MI','ENEL.MI','ISP.MI','UCG.MI','STM.MI',
      'ABI.BR','NOKIA.HE',
    ],
  },
  SP500: {
    label: 'S&P 500', region: 'US',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM','LLY',
      'V','UNH','XOM','MA','JNJ','PG','COST','HD','ABBV','BAC','KO','WMT',
      'MRK','NFLX','CVX','CRM','AMD','ORCL','LIN','ACN','MCD','CSCO','PEP',
      'ABT','TXN','ADBE','AMGN','GE','CAT','NOW','INTU','QCOM','GS','RTX',
      'HON','BKNG','MS','DE','ISRG','PFE','BLK','SCHW','AXP','COF','USB',
      'PNC','TFC','SPGI','MCO','ICE','CME','BX','KKR','BMY','GILD','BIIB',
      'VRTX','REGN','SYK','BSX','MDT','DHR','TMO','IQV','DXCM','HUM','CVS',
      'CI','ELV','WMT','TGT','LOW','SBUX','NKE','YUM','CMG','PEP','PM','MO',
      'CL','KMB','CHD','CLX','ULTA','LULU','BRK-B','ROST','TJX','AZO','ORLY',
      'CPRT','CTAS','PAYX','ADP','VRSK','MSCI','TROW','STT','BK','NEM','FCX',
      'NUE','SHW','PPG','LYB','DOW','DD','APD','ECL','VMC','MLM','MOS','CF',
      'NEE','DUK','SO','AEP','EXC','AMT','PLD','EQIX','CCI','PSA','EXR',
      'AVB','EQR','DLR','T','VZ','CHTR','TMUS','DIS','CMCSA','NFLX','EA',
      'TTWO','RBLX','SLB','EOG','PSX','VLO','MPC','OXY','DVN','HAL','BKR',
      'FANG','HES','COP','FDX','UPS','UNP','CSX','NSC','CP','CNI','JBHT',
      'LMT','NOC','GD','BA','TDG','TT','CARR','OTIS','EMR','ETN','PH','ROK',
      'PCAR','CMI','MRVL','PANW','CRWD','FTNT','SNPS','CDNS','ADI','MU',
      'LRCX','KLAC','AMAT','INTC','IBM','HPQ','DELL','EPAM','IT','GDDY',
    ],
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BreadthStats {
  scanned: number;
  aboveSMA30wPct: number;
  aboveSMA40wPct: number;
  stageDist: { stage1Pct: number; stage2Pct: number; stage3Pct: number; stage4Pct: number };
  regime: 'bull' | 'mixed' | 'bear';
  tradingSignal: 'GO' | 'CAUTION' | 'AVOID';
  breadthScore: number;
}

interface CandidateStock {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  confidence: 'low' | 'medium' | 'high';
  mansfieldRS: number | null;
  stopLoss: number | null;
  stopLossRiskPct: number | null;
  distanceFromSMA30Pct: number | null;
  extendedStage2: boolean;
  atr14Weekly: number | null;
  atr14WeeklyPct: number | null;
  region: string;
  score: number;
}

export interface VirtualPosition {
  symbol: string;
  name: string;
  nativeCurrency: string;
  currentPrice: number;
  confidence: 'low' | 'medium' | 'high';
  mansfieldRS: number | null;
  stopLoss: number | null;
  stopLossRiskPct: number | null;
  distanceFromSMA30Pct: number | null;
  extendedStage2: boolean;
  atr14Weekly: number | null;
  atr14WeeklyPct: number | null;
  sizingMethod: 'atr' | 'weinstein' | 'equal';
  region: string;
  allocationPct: number;
  allocationAmount: number;
  approxShares: number;
  positionRisk: number;
  positionRiskPct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pooledMap<T, R>(
  items: T[], concurrency: number, fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function regionOf(symbol: string): string {
  const u = symbol.toUpperCase();
  if (u.endsWith('.MC')) return 'ES';
  if (u.endsWith('.DE') || u.endsWith('.F')) return 'DE';
  if (u.endsWith('.L')) return 'UK';
  if (u.endsWith('.PA') || u.endsWith('.AS') || u.endsWith('.BR') || u.endsWith('.LS')) return 'EU';
  if (u.endsWith('.T') || u.endsWith('.HK') || u.endsWith('.AX') || u.endsWith('.TO')) return 'APAC';
  return 'US';
}

function scoreCandidate(c: CandidateStock): number {
  let s = 0;
  if (c.confidence === 'high') s += 30;
  else if (c.confidence === 'medium') s += 15;
  if (c.mansfieldRS !== null) {
    if (c.mansfieldRS > 1) s += 20;
    else if (c.mansfieldRS > 0) s += 10;
    else s -= 5;
  }
  if (c.extendedStage2) s -= 15;
  if (c.stopLossRiskPct !== null) {
    if (c.stopLossRiskPct < 6) s += 10;
    else if (c.stopLossRiskPct > 15) s -= 5;
  }
  if (c.distanceFromSMA30Pct !== null && c.distanceFromSMA30Pct > 0) {
    if (c.distanceFromSMA30Pct < 5) s += 8;
    else if (c.distanceFromSMA30Pct > 20) s -= 8;
  }
  // ATR volatility score: prefer controlled volatility (better R/R precision)
  if (c.atr14WeeklyPct !== null) {
    if (c.atr14WeeklyPct < 3) s += 10;        // Low volatility — tighter ATR stop
    else if (c.atr14WeeklyPct <= 6) s += 5;   // Moderate — typical
    else if (c.atr14WeeklyPct > 10) s -= 10;  // High volatility — wider stop, harder sizing
  }
  return s;
}

// ─── Portfolio construction ───────────────────────────────────────────────────

const MAX_POSITIONS = 12;
const MAX_PER_REGION = 4;
const RISK_PER_POSITION = 0.015; // 1.5% of portfolio per position
const ATR_MULTIPLIER = 2.0;      // ATR stop distance = ATR14w × this multiplier
const MAX_POSITION_PCT = 0.12;   // 12% cap
const MIN_POSITION_PCT = 0.03;   // 3% floor
const CASH_RESERVE_TARGET = 0.15;
const MIN_STOCK_PRICE = 2.0;

function buildPortfolio(
  candidates: CandidateStock[],
  portfolioAmount: number
): VirtualPosition[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);

  const selected: CandidateStock[] = [];
  const regionCount: Record<string, number> = {};
  for (const c of sorted) {
    if (selected.length >= MAX_POSITIONS) break;
    const region = c.region;
    const count = regionCount[region] ?? 0;
    if (count >= MAX_PER_REGION) continue;
    selected.push(c);
    regionCount[region] = count + 1;
  }

  if (selected.length === 0) return [];

  const investableAmount = portfolioAmount * (1 - CASH_RESERVE_TARGET);
  const riskBudget = portfolioAmount * RISK_PER_POSITION;

  // Risk-based sizing — prefer ATR stop (Van Tharp), fall back to Weinstein SMA30 stop
  type SizingInfo = { amount: number; method: 'atr' | 'weinstein' | 'equal' };
  const rawAllocations: SizingInfo[] = selected.map(c => {
    // ATR method: shares = riskBudget / (ATR14w × mult); positionSize = shares × price
    if (c.atr14Weekly && c.atr14Weekly > 0) {
      const riskPerShare = c.atr14Weekly * ATR_MULTIPLIER;
      const shares = riskBudget / riskPerShare;
      return { amount: shares * c.currentPrice, method: 'atr' };
    }
    // Weinstein method: positionSize = riskBudget / (stopLossRiskPct/100)
    if (c.stopLossRiskPct && c.stopLossRiskPct > 0) {
      return { amount: riskBudget / (c.stopLossRiskPct / 100), method: 'weinstein' };
    }
    // Equal weight fallback
    return { amount: investableAmount / selected.length, method: 'equal' };
  });

  // Normalise so total ≤ investableAmount, apply caps
  const rawTotal = rawAllocations.reduce((s, v) => s + v.amount, 0);
  const scale = rawTotal > investableAmount ? investableAmount / rawTotal : 1;

  const capped = rawAllocations.map(v => ({
    amount: Math.min(
      Math.max(v.amount * scale, portfolioAmount * MIN_POSITION_PCT),
      portfolioAmount * MAX_POSITION_PCT
    ),
    method: v.method,
  }));

  const cappedTotal = capped.reduce((s, v) => s + v.amount, 0);
  const finalScale = cappedTotal > investableAmount ? investableAmount / cappedTotal : 1;

  return selected.map((c, i) => {
    const amount = capped[i].amount * finalScale;
    const sizingMethod = capped[i].method;
    const pct = amount / portfolioAmount;

    // Risk $ = riskBudget (target) — always RISK_PER_POSITION × portfolio
    // Actual risk depends on stop method used
    const posRisk = c.atr14Weekly && c.atr14Weekly > 0
      ? Math.floor(riskBudget / (c.atr14Weekly * ATR_MULTIPLIER)) * c.atr14Weekly * ATR_MULTIPLIER
      : c.stopLossRiskPct
        ? amount * (c.stopLossRiskPct / 100)
        : amount * 0.08;

    const r2 = (v: number | null) => v !== null ? Math.round(v * 100) / 100 : null;
    return {
      symbol: c.symbol,
      name: c.name,
      nativeCurrency: c.currency,
      currentPrice: r2(c.currentPrice) ?? 0,
      confidence: c.confidence,
      mansfieldRS: r2(c.mansfieldRS),
      stopLoss: r2(c.stopLoss),
      stopLossRiskPct: r2(c.stopLossRiskPct),
      distanceFromSMA30Pct: r2(c.distanceFromSMA30Pct),
      extendedStage2: c.extendedStage2,
      atr14Weekly: r2(c.atr14Weekly),
      atr14WeeklyPct: r2(c.atr14WeeklyPct),
      sizingMethod,
      region: c.region,
      allocationPct: Math.round(pct * 1000) / 10,
      allocationAmount: Math.round(amount * 100) / 100,
      approxShares: c.currentPrice >= 1
        ? Math.floor(amount / c.currentPrice)
        : Math.round((amount / c.currentPrice) * 100) / 100,
      positionRisk: Math.round(posRisk * 100) / 100,
      positionRiskPct: Math.round((posRisk / portfolioAmount) * 10000) / 100,
    };
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const {
      currency = 'EUR',
      amount = 100000,
      indices: requestedIndices,
    } = await req.json() as {
      currency?: string;
      amount?: number;
      indices?: string[];
    };

    // Default index selection by currency
    const defaultIndices = currency === 'EUR'
      ? ['IBEX35', 'DAX40', 'SP100']
      : ['SP100', 'NASDAQ50', 'IBEX35'];

    const indicesToScan = (requestedIndices ?? defaultIndices).filter(k => INDICES[k]);
    if (indicesToScan.length === 0) {
      return jsonResponse({ error: 'No valid indices specified.' }, 400);
    }

    const start = Date.now();

    // Collect unique tickers across all selected indices
    const tickerToRegion = new Map<string, string>();
    for (const idxKey of indicesToScan) {
      const idxDef = INDICES[idxKey];
      for (const t of idxDef.tickers) {
        if (!tickerToRegion.has(t)) tickerToRegion.set(t, idxDef.region);
      }
    }

    const uniqueTickers = [...tickerToRegion.keys()];

    // Scan all tickers with pooled concurrency
    const snapshots = await pooledMap(uniqueTickers, 8, async (ticker) => {
      try {
        const snap = await getTechnicalSnapshot(ticker);
        const cls = classifyStage(snap);
        return { ticker, snap, cls };
      } catch {
        return null;
      }
    });

    // Filter Stage 2 stocks with medium/high confidence
    const candidates: CandidateStock[] = [];
    for (const item of snapshots) {
      if (!item) continue;
      const { ticker, snap, cls } = item;
      if (cls.stage !== 'STAGE_2') continue;
      if (cls.confidence === 'low') continue;
      if (snap.currentPrice <= 0) continue;
      // Exclude penny stocks — minimum price filter
      if (snap.currentPrice < MIN_STOCK_PRICE) continue;

      const c: CandidateStock = {
        symbol: snap.symbol,
        name: snap.name,
        currency: snap.currency,
        currentPrice: snap.currentPrice,
        confidence: cls.confidence,
        mansfieldRS: snap.mansfieldRS,
        stopLoss: snap.suggestedStopLoss,
        stopLossRiskPct: snap.stopLossRiskPct,
        distanceFromSMA30Pct: snap.distanceFromSMA30Pct,
        extendedStage2: snap.extendedStage2,
        atr14Weekly: snap.atr14Weekly,
        atr14WeeklyPct: snap.atr14WeeklyPct,
        region: tickerToRegion.get(ticker) ?? regionOf(ticker),
        score: 0,
      };
      c.score = scoreCandidate(c);
      candidates.push(c);
    }

    const positions = buildPortfolio(candidates, amount);
    const totalAllocated = positions.reduce((s, p) => s + p.allocationAmount, 0);
    const cashReserve = amount - totalAllocated;
    const maxPortfolioRisk = positions.reduce((s, p) => s + p.positionRisk, 0);

    // ── Market breadth — computed over ALL valid scanned stocks ──────────────
    const validSnaps = snapshots.filter(Boolean) as NonNullable<(typeof snapshots)[number]>[];
    const bN = validSnaps.length;
    const bPct = (n: number) => bN > 0 ? Math.round((n / bN) * 1000) / 10 : 0;
    const aboveSMA30wCount = validSnaps.filter(v => v.snap.sma30Weekly != null && v.snap.currentPrice > v.snap.sma30Weekly!).length;
    const aboveSMA40wCount = validSnaps.filter(v => v.snap.sma40Weekly != null && v.snap.currentPrice > v.snap.sma40Weekly!).length;
    const aboveSMA40wPct  = bPct(aboveSMA40wCount);
    const aboveSMA30wPct  = bPct(aboveSMA30wCount);
    const stageCounts2 = { STAGE_1: 0, STAGE_2: 0, STAGE_3: 0, STAGE_4: 0 };
    for (const v of validSnaps) stageCounts2[v.cls.stage]++;
    const stage2PctB = bPct(stageCounts2.STAGE_2);
    const breadthRegime: BreadthStats['regime'] = aboveSMA40wPct >= 60 ? 'bull' : aboveSMA40wPct >= 40 ? 'mixed' : 'bear';
    const tradingSignal: BreadthStats['tradingSignal'] =
      breadthRegime === 'bull' && stage2PctB >= 20 ? 'GO' :
      breadthRegime === 'bear' ? 'AVOID' : 'CAUTION';
    const breadth: BreadthStats = {
      scanned: bN,
      aboveSMA30wPct,
      aboveSMA40wPct,
      stageDist: {
        stage1Pct: bPct(stageCounts2.STAGE_1),
        stage2Pct: stage2PctB,
        stage3Pct: bPct(stageCounts2.STAGE_3),
        stage4Pct: bPct(stageCounts2.STAGE_4),
      },
      regime: breadthRegime,
      tradingSignal,
      breadthScore: Math.min(100, Math.round(aboveSMA40wPct * 0.5 + stage2PctB * 0.3 + aboveSMA30wPct * 0.2)),
    };

    return jsonResponse({
      portfolioCurrency: currency,
      portfolioAmount: amount,
      scannedAt: new Date().toISOString(),
      duration: Math.round((Date.now() - start) / 1000),
      indicesScanned: indicesToScan,
      totalStage2Found: candidates.length,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      totalAllocatedPct: Math.round((totalAllocated / amount) * 1000) / 10,
      cashReserve: Math.round(cashReserve * 100) / 100,
      cashReservePct: Math.round((cashReserve / amount) * 1000) / 10,
      maxPortfolioRisk: Math.round(maxPortfolioRisk * 100) / 100,
      maxPortfolioRiskPct: Math.round((maxPortfolioRisk / amount) * 1000) / 10,
      breadth,
      positions,
      methodology: {
        riskPerPosition: `${RISK_PER_POSITION * 100}%`,
        atrMultiplier: `${ATR_MULTIPLIER}×`,
        sizingPriority: 'ATR14w → Weinstein SMA30 → Equal weight',
        maxPositions: MAX_POSITIONS,
        maxPerRegion: MAX_PER_REGION,
        cashReserveTarget: `${CASH_RESERVE_TARGET * 100}%`,
      },
    });
  } catch (err) {
    console.error('virtual-portfolio error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
