
import React from 'react';

const StageInfo: React.FC = () => {
  const stages = [
    {
      num: 1,
      title: "Base (Basing)",
      desc: "El precio se mueve lateralmente tras una caída. La SMA30 se aplana.",
      color: "border-blue-500 bg-blue-500/5 dark:bg-blue-500/10",
      icon: "fa-grip-lines"
    },
    {
      num: 2,
      title: "Avance (Advancing)",
      desc: "Ruptura de resistencia con volumen. SMA30 ascendente. Zona de compra.",
      color: "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
      icon: "fa-chart-line"
    },
    {
      num: 3,
      title: "Cúspide (Topping)",
      desc: "Distribución. El precio lateraliza tras el avance. SMA30 se aplana.",
      color: "border-amber-500 bg-amber-500/5 dark:bg-amber-500/10",
      icon: "fa-mountain"
    },
    {
      num: 4,
      title: "Declive (Declining)",
      desc: "Ruptura de soporte. SMA30 descendente. Tendencia bajista.",
      color: "border-rose-500 bg-rose-500/5 dark:bg-rose-500/10",
      icon: "fa-chart-area"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 my-8">
      {stages.map((s) => (
        <div key={s.num} className={`stage-card p-4 rounded-xl border-l-4 shadow-sm dark:shadow-none ${s.color}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl font-bold opacity-30 dark:opacity-50">#0{s.num}</span>
            <i className={`fas ${s.icon} text-lg`}></i>
          </div>
          <h3 className="font-bold mb-1 text-slate-800 dark:text-white">{s.title}</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{s.desc}</p>
        </div>
      ))}
    </div>
  );
};

export default StageInfo;
