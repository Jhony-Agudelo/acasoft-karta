import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Key,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building,
  Sliders,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';

export const InvoicingSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId } = useAuthStore();

  // Configuración Factus
  const [baseUrl, setBaseUrl] = useState('https://api-sandbox.factus.com.co');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invoicingTriggerMode, setInvoicingTriggerMode] = useState<'AUTOMATIC_ON_PAYMENT' | 'CASHIER_CHOICE' | 'MANUAL_ONLY'>('CASHIER_CHOICE');
  const [isActive, setIsActive] = useState(true);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingRanges, setIsSyncingRanges] = useState(false);

  // Consultar configuración existente
  const { data: config, isLoading: isLoadingConfig } = useQuery<any>({
    queryKey: ['factus-config'],
    queryFn: () => apiClient.get('/admin/factus/config'),
  });

  // Consultar rangos de numeración de la sucursal activa
  const { data: ranges = [], isLoading: isLoadingRanges } = useQuery<any[]>({
    queryKey: ['branch-numbering-ranges', currentBranchId],
    queryFn: () => apiClient.get(`/branches/${currentBranchId}/numbering-ranges`),
    enabled: !!currentBranchId,
  });

  useEffect(() => {
    if (config) {
      if (config.base_url) setBaseUrl(config.base_url);
      if (config.client_id) setClientId(config.client_id);
      if (config.username) setUsername(config.username);
      if (config.invoicing_trigger_mode) setInvoicingTriggerMode(config.invoicing_trigger_mode);
      if (config.is_active !== undefined) setIsActive(config.is_active);
    }
  }, [config]);

  // Guardar configuración
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      const payload: any = {
        base_url: baseUrl.trim(),
        client_id: clientId.trim(),
        username: username.trim(),
        invoicing_trigger_mode: invoicingTriggerMode,
        is_active: isActive,
      };
      if (clientSecret.trim()) payload.client_secret = clientSecret.trim();
      if (password.trim()) payload.password = password.trim();

      await apiClient.put('/admin/factus/config', payload);
      setFeedback({ type: 'success', message: 'Credenciales de Factus API v2 guardadas exitosamente.' });
      queryClient.invalidateQueries({ queryKey: ['factus-config'] });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al guardar la configuración de Factus.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Sincronizar Rangos de Factus v2
  const handleSyncRanges = async () => {
    setIsSyncingRanges(true);
    setFeedback(null);
    try {
      const res = await apiClient.post<any>('/admin/factus/numbering-ranges/sync');
      setFeedback({
        type: 'success',
        message: `¡Rangos de numeración sincronizados exitosamente con la DIAN! (${res.synced_count || 0} rangos actualizados)`,
      });
      queryClient.invalidateQueries({ queryKey: ['branch-numbering-ranges', currentBranchId] });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al sincronizar rangos desde Factus API v2.',
      });
    } finally {
      setIsSyncingRanges(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-stone-900">
              Facturación Electrónica DIAN (Factus v2)
            </h1>
            <p className="text-xs text-stone-500">
              Integración oficial con Factus API v2: Facturas, Notas Crédito, Documento Soporte y Nómina
            </p>
          </div>
        </div>
      </div>

      {/* Global Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Config Form */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs space-y-5">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-orange-600" />
            <h2 className="font-extrabold text-stone-900 text-sm">Credenciales de API Factus v2</h2>
          </div>
          <span className="text-[11px] font-semibold text-stone-400">
            Almacenadas bajo cifrado de grado militar AES-256-GCM
          </span>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-stone-700 block mb-1">Entorno / Endpoint Factus *</label>
              <select
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full rounded-xl border border-stone-200 p-2 font-mono"
              >
                <option value="https://api-sandbox.factus.com.co">
                  🧪 Sandbox de Pruebas (https://api-sandbox.factus.com.co)
                </option>
                <option value="https://api.factus.com.co">
                  🚀 Producción Oficial DIAN (https://api.factus.com.co)
                </option>
              </select>
            </div>

            <div>
              <label className="font-bold text-stone-700 block mb-1">
                Modo de Disparo en Caja POS
              </label>
              <select
                value={invoicingTriggerMode}
                onChange={(e) => setInvoicingTriggerMode(e.target.value as any)}
                className="w-full rounded-xl border border-stone-200 p-2 font-bold"
              >
                <option value="CASHIER_CHOICE">
                  🎯 Elección del Cajero (Consumidor Final / Con Datos / Recibo Interno)
                </option>
                <option value="AUTOMATIC_ON_PAYMENT">
                  ⚡ Automático al cobrar (Siempre emite Consumidor Final)
                </option>
                <option value="MANUAL_ONLY">
                  ✋ Solo Manual (Bajo demanda explícita)
                </option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-stone-700 block mb-1">Client ID (UUID) *</label>
              <input
                type="text"
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="a3274fed-4683-4a53-a60e-893cf9b29b75"
                className="w-full rounded-xl border border-stone-200 p-2 font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-stone-700 block mb-1">
                Client Secret {config?.is_active && '(Dejar vacío para mantener el actual)'}
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="w-full rounded-xl border border-stone-200 p-2 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-stone-700 block mb-1">Usuario / Correo Factus *</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sandboxv2@factus.com.co"
                className="w-full rounded-xl border border-stone-200 p-2"
              />
            </div>
            <div>
              <label className="font-bold text-stone-700 block mb-1">
                Contraseña Factus {config?.is_active && '(Dejar vacío para mantener la actual)'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full rounded-xl border border-stone-200 p-2 font-mono"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-stone-100">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-stone-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
              />
              Habilitar Facturación Electrónica DIAN para este restaurante
            </label>

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-orange-600 px-5 py-2 font-bold text-white hover:bg-orange-700 shadow-sm transition disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Guardar Credenciales'}
            </button>
          </div>
        </form>
      </div>

      {/* Numbering Ranges Table */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <h2 className="font-extrabold text-stone-900 text-sm">
              Rangos de Numeración DIAN Activos
            </h2>
            <p className="text-xs text-stone-500">
              Prefijos y consecutivos autorizados por la DIAN sincronizados para la sucursal activa
            </p>
          </div>

          <button
            type="button"
            onClick={handleSyncRanges}
            disabled={isSyncingRanges}
            className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100 shadow-2xs transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-orange-600 ${isSyncingRanges ? 'animate-spin' : ''}`} />
            {isSyncingRanges ? 'Sincronizando...' : 'Sincronizar Rangos con Factus'}
          </button>
        </div>

        {isLoadingRanges ? (
          <div className="p-8 text-center text-xs text-stone-400">Cargando rangos...</div>
        ) : ranges.length === 0 ? (
          <div className="p-8 text-center space-y-2 text-xs">
            <p className="font-bold text-stone-600">No hay rangos de numeración configurados</p>
            <p className="text-stone-400 max-w-sm mx-auto">
              Presiona "Sincronizar Rangos con Factus" para descargar automáticamente los prefijos DIAN autorizados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-2.5 px-3">Tipo de Documento</th>
                  <th className="py-2.5 px-3">ID Factus</th>
                  <th className="py-2.5 px-3">Prefijo</th>
                  <th className="py-2.5 px-3">Último Consecutivo</th>
                  <th className="py-2.5 px-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {ranges.map((r) => {
                  let docName = 'Factura Electrónica (21)';
                  if (r.document_type_code === '22') docName = 'Nota Crédito (22)';
                  if (r.document_type_code === '23') docName = 'Nota Débito (23)';
                  if (r.document_type_code === '24') docName = 'Documento Soporte (24)';
                  if (r.document_type_code === '25') docName = 'Nota Ajuste Doc Soporte (25)';
                  if (r.document_type_code === '26') docName = 'Nómina Electrónica (26 - ULID)';

                  return (
                    <tr key={r.id} className="hover:bg-stone-50/70">
                      <td className="py-2.5 px-3 font-bold text-stone-900">{docName}</td>
                      <td className="py-2.5 px-3 font-mono text-stone-600">{r.factus_range_id}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-orange-600">
                        {r.prefix || '(Sin prefijo)'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {r.current_consecutive?.toString() || '0'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          {r.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

