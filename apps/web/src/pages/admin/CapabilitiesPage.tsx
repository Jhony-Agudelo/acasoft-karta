import React, { useState, useEffect } from 'react';
import { useBranchCapabilities } from '../../hooks/use-branch-capabilities';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient, ApiError } from '../../services/api-client';
import {
  MODULES_CATALOG,
  OPERATING_PROFILES,
  validateModuleSetAtomically,
  type ModuleKey,
  type OperatingProfileKey,
} from '@restaurante-saas/shared';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export const CapabilitiesPage: React.FC = () => {
  const { currentBranchId } = useAuthStore();
  const { capabilities, operatingProfile, refetch, isLoading } = useBranchCapabilities();

  // Estado local para edición de módulos
  const [activeModules, setActiveModules] = useState<Record<string, boolean>>({});
  const [selectedProfile, setSelectedProfile] = useState<string>('FULL_PANEL');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sincronizar estado inicial
  useEffect(() => {
    if (capabilities) {
      setActiveModules({ ...capabilities });
    }
    if (operatingProfile) {
      setSelectedProfile(operatingProfile);
    }
  }, [capabilities, operatingProfile]);

  // Validar atómicamente cuando cambian los módulos
  const validateModules = (mods: Record<string, boolean>) => {
    const enabledKeys = Object.entries(mods)
      .filter(([_, val]) => val)
      .map(([k]) => k as ModuleKey);

    const validation = validateModuleSetAtomically(enabledKeys);
    if (!validation.valid) {
      setValidationErrors([validation.message]);
    } else {
      setValidationErrors([]);
    }
    return validation.valid;
  };

  const handleToggleModule = (moduleKey: string) => {
    const updated = {
      ...activeModules,
      [moduleKey]: !activeModules[moduleKey],
    };
    setActiveModules(updated);
    validateModules(updated);
    setSaveSuccess(false);
  };

  const handleApplyProfile = async (profileKey: OperatingProfileKey) => {
    if (!currentBranchId) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await apiClient.put(`/admin/branches/${currentBranchId}/profile/${profileKey}`, {});
      await refetch();
      setSelectedProfile(profileKey);
      setSaveSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.data.message);
      } else {
        setErrorMessage('Error al aplicar perfil operativo');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBatchModules = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    const isValid = validateModules(activeModules);
    if (!isValid) {
      setIsSaving(false);
      return;
    }

    try {
      const payload = {
        branch_id: currentBranchId || undefined,
        modules: Object.entries(activeModules).map(([module_key, enabled]) => ({
          module_key,
          enabled,
        })),
      };

      await apiClient.patch('/admin/modules', payload);
      await refetch();
      setSaveSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.data.message);
      } else {
        setErrorMessage('Error al guardar capacidades de módulos');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Módulos agrupados por categoría según catálogo oficial
  const categories: Record<string, (typeof MODULES_CATALOG)[ModuleKey][]> = {
    'Recepción de Pedidos y Canales': [
      MODULES_CATALOG['ordering'],
      MODULES_CATALOG['channel.pickup'],
      MODULES_CATALOG['channel.delivery'],
      MODULES_CATALOG['tracking'],
    ],
    'Salón & Mesas': [
      MODULES_CATALOG['dining'],
      MODULES_CATALOG['channel.dine_in_qr'],
      MODULES_CATALOG['dining.consumption_split'],
    ],
    'Operación de Cocina & Panel': [
      MODULES_CATALOG['order_panel'],
      MODULES_CATALOG['kitchen'],
      MODULES_CATALOG['reporting'],
    ],
    'Cobro Manual & Notificaciones': [
      MODULES_CATALOG['payments.manual'],
      MODULES_CATALOG['notifications.whatsapp_click'],
      MODULES_CATALOG['notifications.email'],
    ],
    'Módulos Reservados Post-MVP': [
      MODULES_CATALOG['payments.online'],
      MODULES_CATALOG['payments.links'],
      MODULES_CATALOG['notifications.whatsapp_api'],
    ],
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400 mb-2 border border-sky-500/20">
            <Sliders className="h-3.5 w-3.5" />
            Motor de Capacidades Dinámicas
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Perfiles Operativos y Módulos
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Activa o desactiva módulos por sucursal. Los cambios recalculan los canales activos y la interfaz en tiempo real.
          </p>
        </div>

        <button
          onClick={handleSaveBatchModules}
          disabled={isSaving || validationErrors.length > 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 transition disabled:opacity-50"
        >
          {isSaving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Guardar Cambios en Lote
            </>
          )}
        </button>
      </div>

      {/* Alertas */}
      {saveSuccess && (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs text-emerald-400">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>Capacidades de módulos actualizadas exitosamente en la sucursal.</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs text-rose-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-400 space-y-1">
          <div className="flex items-center gap-2 font-bold mb-1">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Incompatibilidad de dependencias entre módulos:
          </div>
          {validationErrors.map((err, i) => (
            <div key={i} className="pl-6">
              • {err}
            </div>
          ))}
        </div>
      )}

      {/* Sección Perfiles Rápidos */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-sky-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Aplicar Perfil Preconfigurado
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Aplica en bloque el conjunto de módulos y canales recomendado para cada formato de restaurante:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.entries(OPERATING_PROFILES).map(([key, prof]) => {
            const isCurrent = selectedProfile === key;
            return (
              <button
                key={key}
                onClick={() => handleApplyProfile(key as OperatingProfileKey)}
                disabled={isSaving}
                className={`text-left p-3.5 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'bg-sky-500/15 border-sky-500/50 shadow-md ring-1 ring-sky-500/30'
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white truncate">{prof.name}</span>
                  {isCurrent && <ShieldCheck className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {prof.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Matriz de los 16 Módulos */}
      <div className="space-y-6">
        {Object.entries(categories).map(([catTitle, modules]) => (
          <div key={catTitle} className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              {catTitle}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {modules.map((mod) => {
                const isEnabled = !!activeModules[mod.key];
                const isCore = mod.is_core;
                return (
                  <div
                    key={mod.key}
                    className={`rounded-2xl p-4 border transition-all ${
                      isEnabled
                        ? 'bg-slate-800/60 border-slate-700 shadow-sm'
                        : 'bg-slate-900/30 border-slate-800/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{mod.name}</span>
                          {isCore && (
                            <span className="rounded bg-sky-500/20 text-sky-400 px-1.5 py-0.5 text-[9px] font-bold">
                              CORE
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 block mb-1">
                          {mod.key}
                        </span>
                        <p className="text-xs text-slate-400 leading-snug">{mod.description}</p>
                      </div>

                      <button
                        type="button"
                        disabled={isCore}
                        onClick={() => handleToggleModule(mod.key)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isEnabled ? 'bg-sky-500' : 'bg-slate-700'
                        } ${isCore ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {(mod.depends_on_all.length > 0 || mod.depends_on_any.length > 0) && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center gap-1.5 text-[10px] text-slate-500">
                        <Info className="h-3 w-3 shrink-0" />
                        <span>
                          Requiere: {[...mod.depends_on_all, ...(mod.depends_on_any.length ? [`uno de: (${mod.depends_on_any.join(', ')})`] : [])].join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
