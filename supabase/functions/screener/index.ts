// POST /functions/v1/screener
// Body: { index: 'IBEX35'|'SP100'|'NASDAQ50'|'DAX40', smaPeriod?: number }
// Scans all tickers in the chosen index, classifies Weinstein stage for each,
// and returns sorted results (Stage 2 first — best buy signals).

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getTechnicalSnapshot } from '../_shared/marketData.ts';
import { classifyStage } from '../_shared/weinstein.ts';

// ─── Index ticker lists ────────────────────────────────────────────────────

const INDICES: Record<string, { label: string; tickers: string[] }> = {
  IBEX35: {
    label: 'IBEX 35',
    tickers: [
      'ACS.MC','ACX.MC','AENA.MC','AMS.MC','ANA.MC','BBVA.MC','BKT.MC',
      'CABK.MC','COL.MC','ENG.MC','ELE.MC','FER.MC','GRF.MC','IAG.MC',
      'IBE.MC','IDR.MC','ITX.MC','LOG.MC','MAP.MC','MEL.MC','MRL.MC',
      'NTGY.MC','PHM.MC','RED.MC','REP.MC','ROVI.MC','SAB.MC','SAN.MC',
      'SCYR.MC','SLR.MC','TEF.MC','UNI.MC','VIS.MC','AMP.MC','CLNX.MC',
    ],
  },
  SP100: {
    label: 'S&P 100',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM',
      'LLY','V','UNH','XOM','MA','JNJ','PG','COST','HD','ABBV','BAC',
      'KO','WMT','MRK','NFLX','CVX','CRM','AMD','ORCL','LIN','ACN',
      'MCD','CSCO','PEP','ABT','TXN','ADBE','AMGN','GE','CAT','NOW',
      'INTU','QCOM','GS','RTX','HON','BKNG','MS','DE','ISRG','PFE',
    ],
  },
  NASDAQ50: {
    label: 'NASDAQ 50',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','COST',
      'NFLX','AMD','ADBE','CSCO','INTU','QCOM','TXN','AMGN','ISRG',
      'BKNG','MU','LRCX','KLAC','MRVL','PANW','SNPS','CDNS','ADI',
      'CRWD','FTNT','MELI','ASML','AZN','PDD','REGN','GILD','VRTX',
      'MDLZ','CHTR','MAR','ABNB','ORLY','WDAY','CTAS','DXCM','IDXX',
      'BIIB','ILMN','SIRI','ZM',
    ],
  },
  DAX40: {
    label: 'DAX 40',
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
    label: 'CAC 40',
    tickers: [
      'AI.PA','AIR.PA','ACA.PA','ALO.PA','BN.PA','BNP.PA','CA.PA','CAP.PA',
      'CS.PA','DG.PA','DSY.PA','ENGI.PA','ERF.PA','FP.PA','GLE.PA','HO.PA',
      'KER.PA','LR.PA','MC.PA','ML.PA','MT.PA','OR.PA','ORA.PA','PUB.PA',
      'RMS.PA','RNO.PA','SAF.PA','SAN.PA','SGO.PA','SU.PA','STM.PA',
      'VIE.PA','VIV.PA','WLN.PA','EL.PA','SW.PA','TTE.PA','STLAM.MI',
      'URW.AS','BVI.PA',
    ],
  },
  FTSE100: {
    label: 'FTSE 100',
    tickers: [
      'AAL.L','ABF.L','ADM.L','AHT.L','ANTO.L','AV.L','AZN.L','BA.L',
      'BARC.L','BATS.L','BEZ.L','BHP.L','BP.L','BRBY.L','BT-A.L','CCH.L',
      'CPG.L','CRH.L','DGE.L','ENT.L','EXPN.L','FRES.L','GLEN.L','GSK.L',
      'HL.L','HLMA.L','HSBA.L','IAG.L','IHG.L','III.L','IMB.L','INF.L',
      'ITRK.L','ITV.L','JD.L','KGF.L','LAND.L','LGEN.L','LLOY.L','LSE.L',
      'MKS.L','MNDI.L','MNG.L','NG.L','NWG.L','OCDO.L','PHNX.L','PRU.L',
      'PSN.L','REL.L','RIO.L','RKT.L','RMV.L','RR.L','SBRY.L','SGE.L',
      'SGRO.L','SHEL.L','SMDS.L','SMIN.L','SMT.L','SN.L','SPX.L','SSE.L',
      'STJ.L','TSCO.L','TW.L','ULVR.L','UU.L','VOD.L','WPP.L','WTB.L',
      'AUTO.L','AVST.L','BME.L','BNZL.L','BOO.L','CHG.L','CNA.L','DPLM.L',
      'DRX.L','ECM.L','EMG.L','FCIT.L','FLTR.L','FLTRF.L','GFTU.L','HWDN.L',
      'IMI.L','JMAT.L','MCRO.L','MGGT.L','MRCH.L','NXT.L','PETS.L','POLY.L',
      'RCP.L','SDR.L','SKG.L','SVT.L',
    ],
  },
  EUROSTOXX50: {
    label: 'Euro Stoxx 50',
    tickers: [
      // France
      'AI.PA','AIR.PA','BN.PA','BNP.PA','CS.PA','DG.PA','EL.PA','ENGI.PA',
      'FP.PA','GLE.PA','KER.PA','MC.PA','OR.PA','RMS.PA','SAF.PA','SAN.PA',
      'SGO.PA','SU.PA',
      // Germany
      'ALV.DE','BAS.DE','BAYN.DE','BMW.DE','DTE.DE','EOAN.DE','IFX.DE',
      'MBG.DE','MUV2.DE','SAP.DE','SIE.DE','VOW3.DE',
      // Netherlands
      'ADYEN.AS','ASML.AS','ING.AS','PHIA.AS','PRX.AS',
      // Spain
      'BBVA.MC','IBE.MC','ITX.MC','SAN.MC',
      // Italy
      'ENI.MI','ENEL.MI','ISP.MI','UCG.MI','STM.MI',
      // Belgium
      'ABI.BR',
      // Finland
      'NOKIA.HE',
    ],
  },
  SP500: {
    label: 'S&P 500',
    tickers: [
      // Mega-cap tech
      'AAPL','MSFT','NVDA','AMZN','GOOGL','GOOG','META','TSLA','AVGO','ORCL',
      'AMD','ADBE','CRM','INTU','QCOM','TXN','AMAT','MU','LRCX','KLAC',
      'MRVL','PANW','CRWD','FTNT','SNPS','CDNS','ADI','MCHP','NXPI','MPWR',
      'INTC','HPQ','HPE','DELL','IBM','ACN','CTSH','IT','EPAM','GDDY',
      // Financials
      'JPM','BAC','WFC','GS','MS','BLK','SCHW','AXP','V','MA','PYPL','COF',
      'USB','PNC','TFC','AIG','MET','PRU','AFL','ALL','CB','TRV','MMC',
      'AON','SPGI','MCO','ICE','CME','CBOE','NDAQ','BX','KKR','APO','CG',
      // Healthcare
      'LLY','UNH','JNJ','ABBV','MRK','PFE','BMY','AMGN','GILD','BIIB',
      'VRTX','REGN','ISRG','SYK','BSX','MDT','ABT','DHR','TMO','IDXX',
      'IQV','DXCM','HUM','CVS','CI','ELV','MOH','CNC','ZBH','BAX',
      // Consumer
      'AMZN','WMT','COST','TGT','HD','LOW','MCD','SBUX','NKE','YUM',
      'CMG','DPZ','QSR','MKC','GIS','K','CPB','HSY','MDLZ','PEP','KO',
      'PM','MO','BTI','CL','PG','KMB','CHD','CLX','EL','ULTA','LULU',
      // Energy
      'XOM','CVX','COP','SLB','EOG','PSX','VLO','MPC','OXY','DVN',
      'HAL','BKR','FANG','PXD','HES','APA','MRO','CTRA','EQT','OKE',
      // Industrials
      'GE','CAT','DE','HON','MMM','RTX','LMT','NOC','GD','BA','TDG',
      'TT','CARR','OTIS','EMR','ETN','PH','ROK','IR','PCAR','CMI',
      'CSX','UNP','NSC','CP','CNI','FDX','UPS','JBHT','XPO','SAIA',
      // Real Estate / Utilities
      'AMT','PLD','EQIX','CCI','SBAC','DLR','PSA','EXR','AVB','EQR',
      'NEE','DUK','SO','D','AEP','EXC','SRE','PCG','XEL','ES',
      // Communications
      'NFLX','GOOGL','META','DIS','CMCSA','T','VZ','CHTR','TMUS',
      'WBD','FOX','FOXA','IPG','OMC','TTWO','EA','ATVI','RBLX','U',
      // Materials
      'LIN','APD','ECL','SHW','PPG','NEM','FCX','NUE','STLD','CMC',
      'VMC','MLM','MOS','CF','FMC','ALB','CTVA','DD','DOW','LYB',
      // Other notable
      'BRK-B','BKNG','ABNB','MAR','HLT','HES','ORLY','AZO','DLTR',
      'ROST','TJX','VFC','PVH','RL','TPR','CPRT','CTAS','PAYX','ADP',
      'VRSK','MSCI','FDS','BR','WEX','TROW','BEN','IVZ','STT','BK',
    ],
  },
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ScreenerItem {
  symbol: string;
  name: string;
  currency: string;
  currentPrice: number;
  stage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4';
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  sma30: number | null;
  distanceFromSMA30Pct: number | null;
  sma30Trend: string | null;
  mansfieldRS: number | null;
  mansfieldRSTrend: string | null;
  volumeRatio: number | null;
  extendedStage2: boolean;
  benchmarkStage: string | null;
  suggestedStopLoss: number | null;
  stopLossRiskPct: number | null;
  error?: string;
}

// ─── Concurrency helper ────────────────────────────────────────────────────

async function pooledMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
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

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { index = 'IBEX35', smaPeriod = 30 } = await req.json() as {
      index?: string;
      smaPeriod?: number;
    };

    const indexDef = INDICES[index];
    if (!indexDef) {
      return jsonResponse({ error: `Unknown index "${index}". Valid: ${Object.keys(INDICES).join(', ')}` }, 400);
    }

    const start = Date.now();

    const results = await pooledMap<string, ScreenerItem>(
      indexDef.tickers,
      8, // max 8 concurrent Yahoo requests
      async (ticker) => {
        try {
          const snap = await getTechnicalSnapshot(ticker, smaPeriod);
          const cls = classifyStage(snap);
          return {
            symbol: snap.symbol,
            name: snap.name,
            currency: snap.currency,
            currentPrice: snap.currentPrice,
            stage: cls.stage,
            confidence: cls.confidence,
            reasoning: cls.reasoning,
            sma30: snap.sma30Weekly,
            distanceFromSMA30Pct: snap.distanceFromSMA30Pct,
            sma30Trend: snap.sma30Trend,
            mansfieldRS: snap.mansfieldRS,
            mansfieldRSTrend: snap.mansfieldRSTrend,
            volumeRatio: snap.volumeRatio,
            extendedStage2: snap.extendedStage2,
            benchmarkStage: snap.benchmarkStage,
            suggestedStopLoss: snap.suggestedStopLoss,
            stopLossRiskPct: snap.stopLossRiskPct,
          };
        } catch (e) {
          return {
            symbol: ticker,
            name: ticker,
            currency: '',
            currentPrice: 0,
            stage: 'STAGE_1' as const,
            confidence: 'low' as const,
            reasoning: '',
            sma30: null,
            distanceFromSMA30Pct: null,
            sma30Trend: null,
            mansfieldRS: null,
            mansfieldRSTrend: null,
            volumeRatio: null,
            extendedStage2: false,
            benchmarkStage: null,
            suggestedStopLoss: null,
            stopLossRiskPct: null,
            error: (e as Error).message,
          };
        }
      }
    );

    // Sort: Stage 2 high confidence first, then Stage 1, Stage 3, Stage 4
    const stageOrder = { STAGE_2: 0, STAGE_1: 1, STAGE_3: 2, STAGE_4: 3 };
    const confOrder = { high: 0, medium: 1, low: 2 };
    const sorted = results
      .filter(r => !r.error)
      .sort((a, b) => {
        const so = stageOrder[a.stage] - stageOrder[b.stage];
        if (so !== 0) return so;
        return confOrder[a.confidence] - confOrder[b.confidence];
      });

    const failed = results.filter(r => r.error).map(r => r.symbol);

    return jsonResponse({
      index,
      label: indexDef.label,
      scannedAt: new Date().toISOString(),
      duration: Math.round((Date.now() - start) / 1000),
      total: sorted.length,
      failed: failed.length > 0 ? failed : undefined,
      results: sorted,
    });
  } catch (err) {
    console.error('screener error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
