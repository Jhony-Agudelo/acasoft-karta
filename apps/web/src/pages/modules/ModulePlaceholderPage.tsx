import React from 'react';
import { LucideIcon, Sparkles, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ModulePlaceholderPageProps {
  title: string;
  description: string;
  moduleKey: string;
  phase: string;
  icon: LucideIcon;
}

export const ModulePlaceholderPage: React.FC<ModulePlaceholderPageProps> = ({
  title,
  description,
  moduleKey,
  phase,
  icon: Icon,
}) => {
  return (
    <div className="space-y-6 animate-fade-in font-sans">
      <div className="border-b border-slate-800 pb-6 flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 mb-2 border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Módulo Habilitado en la Sucursal
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 sm:p-12 text-center max-w-xl mx-auto">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-4 shadow-lg shadow-sky-500/10">
          <Icon className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold text-white">Módulo Activo en el Motor de Capacidades</h2>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
          El módulo <strong className="text-sky-400 font-mono">{moduleKey}</strong> está habilitado y validado según las políticas de tu plan. Su flujo operativo especializado se integrará en la <strong>{phase}</strong>.
        </p>

        <div className="mt-8 flex justify-center gap-4">
          <Link
            to="/admin/capabilities"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            Ver Matriz de Capacidades
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-400 transition"
          >
            Volver al Panel
          </Link>
        </div>
      </div>
    </div>
  );
};
