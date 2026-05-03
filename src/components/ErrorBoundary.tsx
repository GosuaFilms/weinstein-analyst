import React from 'react';

interface State { hasError: boolean; error: Error | null }

/**
 * Catches runtime errors in the component tree and shows a friendly
 * fallback instead of blanking the entire app.
 * Wrap each lazy-loaded panel with this so one crash stays isolated.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl border border-rose-200 dark:border-rose-500/30 shadow-2xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mx-auto">
            <i className="fas fa-triangle-exclamation text-rose-500 text-2xl"></i>
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">
            {this.props.label ?? 'Algo ha ido mal'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {this.state.error?.message ?? 'Error inesperado en este módulo.'}
          </p>
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-xl text-sm transition-all"
          >
            <i className="fas fa-rotate-right text-xs"></i>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}
