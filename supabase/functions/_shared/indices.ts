// Shared index ticker lists — single source of truth for screener, virtual-portfolio,
// stage2-daily and any other function that needs to scan market indices.

export const INDICES: Record<string, { label: string; tickers: string[] }> = {
  IBEX35: {
    label: 'IBEX 35',
    tickers: [
      'ACS.MC','ACX.MC','AENA.MC','AMS.MC','ANA.MC','BBVA.MC','BKT.MC',
      'CABK.MC','COL.MC','ENG.MC','ELE.MC','FER.MC','GRF.MC','IAG.MC',
      'IBE.MC','IDR.MC','ITX.MC','LOG.MC','MAP.MC','MEL.MC','MRL.MC',
      'NTGY.MC','RED.MC','REP.MC','ROVI.MC','SAB.MC','SAN.MC','SGRE.MC',
      'SCYR.MC','SLR.MC','TEF.MC','UNI.MC','VIS.MC','AMP.MC','CLNX.MC',
    ],
  },
  SP100: {
    label: 'S&P 100',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM',
      'LLY','V','UNH','XOM','MA','JNJ','PG','COST','HD','ABBV','BAC',
      'KO','WMT','MRK','NFLX','CVX','CRM','AMD','ORCL','LIN','ACN',
      'TMO','ABT','GE','DHR','MCD','ISRG','GS','RTX','CAT','BLK',
      'INTU','QCOM','HON','BKNG','MS','DE','PFE',
    ],
  },
  NASDAQ50: {
    label: 'NASDAQ 50',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','COST',
      'NFLX','AMD','ADBE','CSCO','INTU','QCOM','TXN','AMGN','ISRG',
      'BKNG','MU','LRCX','KLAC','MRVL','PANW','SNPS','CDNS','ADI',
      'MCHP','NXPI','AMAT','ASML','ON','DXCM','ADP','MNST','KDP',
      'FAST','PAYX','ODFL','ROST','ABNB','PYPL','BIIB','ILMN','SIRI','ZM',
    ],
  },
  DAX40: {
    label: 'DAX 40',
    tickers: [
      'ADS.DE','AIR.DE','ALV.DE','BAS.DE','BAYN.DE','BMW.DE','BNR.DE',
      'CON.DE','DB1.DE','DBK.DE','DHL.DE','DTE.DE','EOAN.DE','FRE.DE',
      'HEI.DE','HEN3.DE','IFX.DE','LIN.DE','MBG.DE','MRK.DE','MTX.DE',
      'MUV2.DE','P911.DE','PAH3.DE','RWE.DE','SAP.DE','SIE.DE','SHL.DE',
      'VNA.DE','VOW3.DE','ZAL.DE','CBK.DE','BEI.DE','SDAX.DE',
      'ENR.DE','HNR1.DE','1COV.DE','SY1.DE','AFX.DE',
    ],
  },
  CAC40: {
    label: 'CAC 40',
    tickers: [
      'AI.PA','AIR.PA','ACA.PA','ALO.PA','BN.PA','BNP.PA','CA.PA','CAP.PA',
      'CS.PA','DG.PA','DSY.PA','ENGI.PA','ERF.PA','FP.PA','GLE.PA','HO.PA',
      'KER.PA','LR.PA','MC.PA','ML.PA','MT.PA','OR.PA','ORA.PA','PUB.PA',
      'RMS.PA','SAF.PA','SAN.PA','SGO.PA','STLA.PA','STM.PA','SU.PA',
      'TEC.PA','TTE.PA','VIE.PA','VIV.PA','WLN.PA',
      'URW.AS','BVI.PA',
    ],
  },
  FTSE100: {
    label: 'FTSE 100',
    tickers: [
      'AAL.L','ABF.L','ADM.L','AHT.L','ANTO.L','AV.L','AZN.L','BA.L',
      'BARC.L','BATS.L','BEZ.L','BHP.L','BP.L','BRBY.L','BT-A.L','CCH.L',
      'CPG.L','CRH.L','DGE.L','ENT.L','EXPN.L','FRES.L','GLEN.L','GSK.L',
      'HSBA.L','IHG.L','IMB.L','INF.L','ITRK.L','JD.L','KGF.L','LAND.L',
      'LGEN.L','LLOY.L','LSE.L','MKS.L','MNDI.L','MNG.L','MRO.L','NG.L',
      'NWG.L','OCDO.L','PSON.L','PSN.L','PHNX.L','PRU.L','REL.L','RIO.L',
      'RKT.L','RMV.L','RR.L','RS1.L','SBRY.L','SDR.L','SGE.L','SGRO.L',
      'SJP.L','SKG.L','SMDS.L','SMIN.L','SMT.L','SN.L','SPX.L','SSE.L',
      'STAN.L','STJ.L','SVT.L','TSCO.L','TW.L','ULVR.L','UU.L','VOD.L',
      'WPP.L','WTB.L','HLMA.L','DCC.L',
    ],
  },
  EUROSTOXX50: {
    label: 'Euro Stoxx 50',
    tickers: [
      'AI.PA','AIR.PA','BN.PA','BNP.PA','CS.PA','DG.PA','EL.PA','ENGI.PA',
      'FP.PA','GLE.PA','KER.PA','MC.PA','OR.PA','RMS.PA','SAF.PA','SAN.PA',
      'SGO.PA','SU.PA',
      'ALV.DE','BAS.DE','BAYN.DE','BMW.DE','DTE.DE','EOAN.DE','IFX.DE',
      'MBG.DE','MUV2.DE','SAP.DE','SIE.DE','VOW3.DE',
      'ADYEN.AS','ASML.AS','ING.AS','PHIA.AS','PRX.AS',
      'BBVA.MC','IBE.MC','ITX.MC','SAN.MC',
      'ENI.MI','ENEL.MI','ISP.MI','UCG.MI','STM.MI',
      'ABI.BR',
      'NOKIA.HE',
    ],
  },
  SP500: {
    label: 'S&P 500',
    tickers: [
      'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AVGO','JPM','LLY',
      'V','UNH','XOM','MA','JNJ','PG','COST','HD','ABBV','BAC','KO','WMT',
      'MRK','NFLX','CVX','CRM','AMD','ORCL','LIN','ACN','MCD','CSCO','PEP',
      'ABT','TXN','ADBE','AMGN','GE','CAT','NOW','INTU','QCOM','GS','RTX',
      'HON','BKNG','MS','DE','ISRG','PFE','BLK','SCHW','AXP','COF','USB',
      'PNC','TFC','SPGI','MCO','ICE','CME','BX','KKR','BMY','GILD','BIIB',
      'VRTX','REGN','SYK','BSX','MDT','DHR','TMO','IQV','DXCM','HUM','CVS',
      'CI','ELV','TGT','LOW','SBUX','NKE','YUM','CMG','PM','MO','CL','KMB',
      'CHD','CLX','ULTA','LULU','ROST','TJX','AZO','ORLY','CPRT','CTAS',
      'PAYX','ADP','VRSK','MSCI','TROW','STT','BK','NEM','FCX','NUE','SHW',
      'PPG','LYB','DOW','DD','APD','ECL','VMC','MLM','NEE','DUK','SO','AEP',
      'EXC','AMT','PLD','EQIX','CCI','PSA','EXR','AVB','EQR','DLR','T','VZ',
      'CHTR','TMUS','DIS','CMCSA','EA','TTWO','SLB','EOG','PSX','VLO','MPC',
      'OXY','DVN','HAL','BKR','COP','FDX','UPS','UNP','CSX','NSC','LMT',
      'NOC','GD','BA','TDG','TT','CARR','OTIS','EMR','ETN','PH','ROK','PCAR',
      'CMI','PANW','CRWD','FTNT','SNPS','CDNS','ADI','MU','LRCX','KLAC',
      'AMAT','INTC','IBM','HPQ','DELL','IT','GDDY','MRVL',
    ],
  },
};

/** Flat list of all unique tickers across all indices */
export const ALL_TICKERS = [...new Set(Object.values(INDICES).flatMap(i => i.tickers))];
