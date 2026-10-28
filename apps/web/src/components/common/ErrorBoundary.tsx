import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturó un error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-stone-900 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-stone-200/80 shadow-xl shadow-stone-200/50 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 mb-4">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold font-display text-stone-900">
              Algo no salió como esperábamos
            </h1>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Ocurrió un error inesperado al renderizar esta sección. Puedes recargar la página para reanudar la operación.
            </p>
            {this.state.error && (
              <div className="mt-4 p-3 bg-stone-100 rounded-xl text-left font-mono text-[11px] text-stone-700 overflow-x-auto max-h-32 border border-stone-200">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 py-3 px-4 text-xs font-bold text-white shadow-md shadow-orange-500/25 transition"
            >
              <RefreshCw className="h-4 w-4" />
              Recargar Karta
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
