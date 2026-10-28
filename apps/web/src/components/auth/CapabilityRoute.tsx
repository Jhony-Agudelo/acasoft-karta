import React from 'react';
import { Link } from 'react-router-dom';
import { useBranchCapabilities } from '../../hooks/use-branch-capabilities';
import { ShieldAlert, Sparkles, ArrowRight } from 'lucide-react';

interface CapabilityRouteProps {
  module: string;
  moduleName?: string;
  children: React.ReactNode;
}

export const CapabilityRoute: React.FC<CapabilityRouteProps> = ({
  module,
  moduleName = 'este módulo',
  children,
}) => {
  const { hasModule, isLoading } = useBranchCapabilities();

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  if (!hasModule(module)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-8 ring-amber-500/5">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Módulo Inactivo en esta Sucursal
        </h2>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          La funcionalidad de <strong className="text-slate-900 dark:text-slate-200">{moduleName}</strong> ({module}) no está habilitada en el perfil operativo actual de esta sede.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/admin/capabilities"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:shadow-sky-500/40"
          >
            <Sparkles className="h-4 w-4" />
            Configurar Módulos y Perfiles
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            Volver al Inicio
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
