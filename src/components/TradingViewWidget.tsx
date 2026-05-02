import React, { useEffect, useRef, memo } from 'react';

interface Props {
  symbol: string;
  theme: 'light' | 'dark';
}

// Convert Yahoo/TwelveData ticker format to TradingView exchange:SYMBOL format
function toTradingViewSymbol(ticker: string): string {
  const u = ticker.trim().toUpperCase();
  if (u.endsWith('.MC'))   return `BME:${u.slice(0, -3)}`;
  if (u.endsWith('.L'))    return `LSE:${u.slice(0, -2)}`;
  if (u.endsWith('.PA'))   return `EURONEXT:${u.slice(0, -3)}`;
  if (u.endsWith('.AS'))   return `EURONEXT:${u.slice(0, -3)}`;
  if (u.endsWith('.DE'))   return `XETRA:${u.slice(0, -3)}`;
  if (u.endsWith('.MI'))   return `MIL:${u.slice(0, -3)}`;
  if (u.endsWith('.T'))    return `TSE:${u.slice(0, -2)}`;
  if (u.endsWith('.HK'))   return `HKEX:${u.slice(0, -3)}`;
  if (u.endsWith('.AX'))   return `ASX:${u.slice(0, -3)}`;
  if (u.endsWith('.TO'))   return `TSX:${u.slice(0, -3)}`;
  if (u.endsWith('.SA'))   return `BMFBOVESPA:${u.slice(0, -3)}`;
  if (u.endsWith('.LS'))   return `EURONEXT:${u.slice(0, -3)}`;
  if (u.endsWith('.BR'))   return `EURONEXT:${u.slice(0, -3)}`;
  if (u.endsWith('.SW'))   return `SIX:${u.slice(0, -3)}`;
  // Crypto: BTC-USD → BTCUSD, BTC/USD → BTCUSD
  if (u.includes('-') || u.includes('/')) return u.replace(/[-/]/, '');
  // US stocks: let TradingView resolve exchange automatically
  return u;
}

const TradingViewWidget: React.FC<Props> = ({ symbol, theme }) => {
  const container = useRef<HTMLDivElement>(null);
  const containerId = useRef(`tv_${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: toTradingViewSymbol(symbol),
      interval: 'W',           // Weekly — Weinstein method
      timezone: 'Etc/UTC',
      theme,
      style: '1',              // Candlestick
      locale: 'es',
      enable_publishing: false,
      backgroundColor: theme === 'dark' ? '#0f172a' : '#f8fafc',
      gridColor: theme === 'dark' ? '#1e293b' : '#e2e8f0',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      container_id: containerId.current,
      support_host: 'https://www.tradingview.com',
      // SMA30 weekly — the core Weinstein indicator
      studies: [
        {
          id: 'MASimple@tv-basicstudies',
          inputs: { length: 30 },
        },
      ],
      overrides: {
        'mainSeriesProperties.candleStyle.upColor': '#10b981',
        'mainSeriesProperties.candleStyle.downColor': '#f43f5e',
        'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.borderDownColor': '#f43f5e',
        'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.wickDownColor': '#f43f5e',
      },
    });

    container.current.appendChild(script);
  }, [symbol, theme]);

  return (
    <div
      className="tradingview-widget-container rounded-xl overflow-hidden"
      ref={container}
      style={{ height: '520px', width: '100%' }}
    >
      <div
        className="tradingview-widget-container__widget"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
};

export default memo(TradingViewWidget);
