
export enum Language {
  ES = 'es',
  EN = 'en'
}

export enum MarketStage {
  STAGE_1 = 'Etapa 1: Fase de Base (Lateralización)',
  STAGE_2 = 'Etapa 2: Fase de Avance (Tendencia Alcista)',
  STAGE_3 = 'Etapa 3: Fase de Cúspide (Distribución)',
  STAGE_4 = 'Etapa 4: Fase de Declive (Tendencia Bajista)',
}

export enum Verdict {
  BUY = 'Compra',
  WAIT = 'Espera',
  SELL = 'Venta',
  CLOSE = 'Cierre de posición',
}

export enum AlertCondition {
  PRICE_CROSS_SMA30_UP = 'Precio cruza al alza SMA30',
  PRICE_CROSS_SMA30_DOWN = 'Precio cruza a la baja SMA30',
  VOLUME_SURGE = 'Explosión de volumen (>2x)',
  RESISTANCE_BREAKOUT = 'Ruptura de Resistencia',
  SUPPORT_BREAKDOWN = 'Ruptura de Soporte',
}

export interface Settings {
  smaPeriod: number;
  volumeMultiplier: number;
  language: Language;
}

export interface User {
  id: string;
  name: string;
  email: string;
  joinedDate: number;
  avatarColor: string;
}

export interface AnalysisResult {
  companyName?: string;
  tickerSymbol?: string;
  currentPrice: string;
  priceTimestamp?: string; // Nuevo campo para precisión temporal
  stage: string;
  sma30Analysis: string;
  relativeStrength: string;
  volumeAnalysis: string;
  support: string;
  resistance: string;
  entryPrice: string;
  stopLoss: string;
  verdict: string;
  verdictType: 'BUY' | 'SELL' | 'WAIT' | 'CLOSE';
  suggestedStrategy: string;
  groundingSources?: Array<{ title: string; uri: string }>;
}

export interface OperationAnalysisResult {
  companyName?: string;
  tickerSymbol?: string;
  currentPrice: string;
  priceTimestamp?: string;
  purchasePrice: string;
  purchaseDate: string;
  shares: number;
  profitPercentage: string;
  profitAmount: string;
  stage: string;
  verdict: string;
  verdictType: 'BUY' | 'SELL' | 'WAIT' | 'CLOSE';
  suggestedStrategy: string;
  technicalAnalysis: string;
}

export interface SavedAnalysis {
  id: string;
  timestamp: number;
  label: string;
  result: AnalysisResult;
  previewUrls?: string[];
}

export interface Alert {
  id: string;
  ticker: string;
  condition: AlertCondition;
  status: 'active' | 'triggered';
  createdAt: number;
  lastChecked?: number;
  triggeredAt?: number;
  triggerMessage?: string;
}

export interface AnalysisState {
  isAnalyzing: boolean;
  result: AnalysisResult | null;
  error: string | null;
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}
