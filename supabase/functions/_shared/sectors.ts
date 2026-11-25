// Sector groups for Weinstein's "forest to the trees": market → sector → stock.
// Each group is an ETF classified like any stock (stage on the weekly MM30) with
// Mansfield RS against its region's broad index. A stock is mapped to its group
// from Twelve Data's profile (sector + industry, cached 30 days).

import { getProfile, toTdRef, type TdRef } from './marketData.ts';

export type Region = 'US' | 'EU';

export interface SectorDef {
  etf: string;       // app ticker
  region: Region;
  es: string;
  en: string;
}

export const SECTORS: SectorDef[] = [
  { etf: 'XLK', region: 'US', es: 'Tecnología', en: 'Technology' },
  { etf: 'XLF', region: 'US', es: 'Financiero', en: 'Financials' },
  { etf: 'XLE', region: 'US', es: 'Energía', en: 'Energy' },
  { etf: 'XLV', region: 'US', es: 'Salud', en: 'Health care' },
  { etf: 'XLI', region: 'US', es: 'Industria', en: 'Industrials' },
  { etf: 'XLY', region: 'US', es: 'Consumo discrecional', en: 'Consumer discretionary' },
  { etf: 'XLP', region: 'US', es: 'Consumo básico', en: 'Consumer staples' },
  { etf: 'XLB', region: 'US', es: 'Materiales', en: 'Materials' },
  { etf: 'XLC', region: 'US', es: 'Comunicaciones', en: 'Communication services' },
  { etf: 'XLRE', region: 'US', es: 'Inmobiliario', en: 'Real estate' },
  { etf: 'XLU', region: 'US', es: 'Servicios públicos', en: 'Utilities' },
  { etf: 'EXV1.DE', region: 'EU', es: 'Bancos', en: 'Banks' },
  { etf: 'EXH5.DE', region: 'EU', es: 'Seguros', en: 'Insurance' },
  { etf: 'EXH1.DE', region: 'EU', es: 'Petróleo y gas', en: 'Oil & gas' },
  { etf: 'EXV3.DE', region: 'EU', es: 'Tecnología', en: 'Technology' },
  { etf: 'EXV4.DE', region: 'EU', es: 'Salud', en: 'Health care' },
  { etf: 'EXH4.DE', region: 'EU', es: 'Industria', en: 'Industrial goods & services' },
  { etf: 'EXV8.DE', region: 'EU', es: 'Construcción y materiales', en: 'Construction & materials' },
  { etf: 'EXV6.DE', region: 'EU', es: 'Recursos básicos', en: 'Basic resources' },
  { etf: 'EXV7.DE', region: 'EU', es: 'Química', en: 'Chemicals' },
  { etf: 'EXV5.DE', region: 'EU', es: 'Automóvil', en: 'Automobiles & parts' },
  { etf: 'EXH8.DE', region: 'EU', es: 'Distribución', en: 'Retail' },
  { etf: 'EXH7.DE', region: 'EU', es: 'Bienes personales y del hogar', en: 'Personal & household goods' },
  { etf: 'EXH3.DE', region: 'EU', es: 'Alimentación y bebidas', en: 'Food & beverage' },
  { etf: 'EXV2.DE', region: 'EU', es: 'Telecomunicaciones', en: 'Telecommunications' },
  { etf: 'EXI5.DE', region: 'EU', es: 'Inmobiliario', en: 'Real estate' },
  { etf: 'EXH9.DE', region: 'EU', es: 'Servicios públicos', en: 'Utilities' },
];

/** Broad index each region's sectors are measured against (Mansfield RS). */
export const REGION_BENCHMARK: Record<Region, { ref: TdRef; symbol: string; name: string }> = {
  US: { ref: { symbol: 'SPY', country: 'United States' }, symbol: 'SPY', name: 'S&P 500' },
  EU: { ref: { symbol: 'EXSA', mic_code: 'XETR' }, symbol: 'EXSA.DE', name: 'STOXX Europe 600' },
};

export const sectorByEtf = new Map(SECTORS.map((s) => [s.etf, s]));

/** US listings have no suffix; everything with a European suffix uses the STOXX 600 groups. */
export function regionOf(ticker: string): Region {
  return /\.[A-Z]{1,3}$/.test(ticker.toUpperCase()) ? 'EU' : 'US';
}

const US_BY_SECTOR: Record<string, string> = {
  'Technology': 'XLK', 'Financial Services': 'XLF', 'Energy': 'XLE', 'Healthcare': 'XLV',
  'Industrials': 'XLI', 'Consumer Cyclical': 'XLY', 'Consumer Defensive': 'XLP',
  'Basic Materials': 'XLB', 'Communication Services': 'XLC', 'Real Estate': 'XLRE', 'Utilities': 'XLU',
};

/** Sector ETF for a Twelve Data sector/industry pair (Morningstar-style names). */
export function sectorEtfFor(region: Region, sector: string | null, industry: string | null): string | null {
  if (!sector) return null;
  if (region === 'US') return US_BY_SECTOR[sector] ?? null;
  const ind = industry ?? '';
  switch (sector) {
    case 'Financial Services': return /insurance/i.test(ind) ? 'EXH5.DE' : 'EXV1.DE';
    case 'Energy': return 'EXH1.DE';
    case 'Technology': return 'EXV3.DE';
    case 'Healthcare': return 'EXV4.DE';
    case 'Industrials': return /engineering & construction|building products|infrastructure/i.test(ind) ? 'EXV8.DE' : 'EXH4.DE';
    case 'Basic Materials':
      if (/chemical/i.test(ind)) return 'EXV7.DE';
      if (/building materials/i.test(ind)) return 'EXV8.DE';
      return 'EXV6.DE';
    case 'Consumer Cyclical':
      if (/auto/i.test(ind)) return 'EXV5.DE';
      if (/retail|department stores/i.test(ind)) return 'EXH8.DE';
      return 'EXH7.DE';
    case 'Consumer Defensive':
      if (/grocery|discount|food distribution/i.test(ind)) return 'EXH8.DE';
      if (/household|personal/i.test(ind)) return 'EXH7.DE';
      return 'EXH3.DE';
    case 'Communication Services': return 'EXV2.DE';
    case 'Real Estate': return 'EXI5.DE';
    case 'Utilities': return 'EXH9.DE';
    default: return null;
  }
}

/** Sector ETF of an app ticker (profile cached 30 days); null when unknown. */
export async function sectorEtfOf(ticker: string): Promise<string | null> {
  const ref = toTdRef(ticker);
  if (!ref) return null;
  const p = await getProfile(ref).catch(() => null);
  return p ? sectorEtfFor(regionOf(ticker), p.sector, p.industry) : null;
}

export interface SectorContext {
  etf: string; region: Region; name_es: string; name_en: string;
  stage: string; rank: number; of: number; rs: number | null; rs_trend: string | null; scan_date: string;
}

/** The ticker's sector and its latest ranking row (null when unmapped or not ranked yet). */
// deno-lint-ignore no-explicit-any
export async function getSectorContext(ticker: string, db: any): Promise<SectorContext | null> {
  const etf = await sectorEtfOf(ticker);
  if (!etf) return null;
  const { data: row } = await db.from('sector_ranking')
    .select('scan_date, etf, region, name_es, name_en, stage, rank, rs, rs_trend')
    .eq('etf', etf).order('scan_date', { ascending: false }).limit(1).maybeSingle();
  if (!row) return null;
  const { count } = await db.from('sector_ranking').select('etf', { count: 'exact', head: true })
    .eq('scan_date', row.scan_date).eq('region', row.region);
  return { ...row, of: count ?? 0 };
}
