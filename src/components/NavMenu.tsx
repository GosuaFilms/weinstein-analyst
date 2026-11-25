import React, { useEffect, useRef, useState } from 'react';

// Small dropdown used by the main navigation and the header "more" menu.

export interface NavMenuItem {
  icon: string;          // Font Awesome class, e.g. 'fa-filter text-emerald-500'
  label: string;
  desc?: string;
  badge?: string | number | null;
  href?: string;
  onClick?: () => void;
}

interface Props {
  trigger: (open: boolean) => React.ReactNode;
  items: NavMenuItem[];
  align?: 'left' | 'right';
  triggerClassName?: string;
  ariaLabel: string;
}

const NavMenu: React.FC<Props> = ({ trigger, items, align = 'left', triggerClassName = '', ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={triggerClassName}>
        {trigger(open)}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-[60] mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-1.5 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((it) => {
            const body = (
              <>
                <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <i className={`fas ${it.icon} text-sm`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{it.label}</span>
                  {it.desc && <span className="block text-xs text-slate-500 dark:text-slate-400 leading-snug">{it.desc}</span>}
                </span>
                {it.badge != null && it.badge !== 0 && it.badge !== '' && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white shrink-0">{it.badge}</span>
                )}
              </>
            );
            const cls = 'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors';
            return it.href ? (
              <a key={it.label} role="menuitem" href={it.href} className={cls} onClick={() => setOpen(false)}>{body}</a>
            ) : (
              <button key={it.label} role="menuitem" type="button" className={cls} onClick={() => { setOpen(false); it.onClick?.(); }}>{body}</button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NavMenu;
