import React, { useEffect, useRef, memo } from 'react';

interface Props {
  symbol: string;
  theme: 'light' | 'dark';
}

const TradingViewWidget: React.FC<Props> = ({ symbol, theme }) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';
    
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    
    const cleanSymbol = symbol.trim().toUpperCase();

    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: cleanSymbol,
      interval: "W",
      timezone: "Etc/UTC",
      theme: theme,
      style: "1",
      locale: "es",
      enable_publishing: false,
      backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
      gridColor: theme === 'dark' ? '#1e293b' : '#f1f5f9',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      container_id: "tradingview_widget_" + Math.random().toString(36).substring(7),
      support_host: "https://www.tradingview.com",
      studies: [
        "STD;SMA"
      ]
    });
    
    container.current.appendChild(script);
  }, [symbol, theme]);

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: "600px", width: "100%" }}>
      <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }}></div>
    </div>
  );
};

export default memo(TradingViewWidget);
