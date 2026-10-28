import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Lock,
  Unlock,
  AlertTriangle,
  Clock,
  ShoppingBag,
  X,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';

interface CustomerItem {
  id: string;
  name: string;
  phone_e164: string;
  privacy_consent_at: string;
  is_blocked: boolean;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  anonymized_at?: string | null;
  last_order_at?: string | null;
  created_at: string;
  orders_count: number;
}

interface CustomersResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  items: CustomerItem[];
}

export const CustomersDirectoryPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterBlocked, setFilterBlocked] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Modales
  const [blockModalCustomer, setBlockModalCustomer] = useState<CustomerItem | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [anonymizeModalCustomer, setAnonymizeModalCustomer] = useState<CustomerItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Consulta de Clientes
  const { data, isLoading } = useQuery<CustomersResponse>({
    queryKey: ['admin-customers', searchQuery, filterBlocked, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (filterBlocked === 'blocked') params.append('is_blocked', 'true');
      if (filterBlocked === 'active') params.append('is_blocked', 'false');
      params.append('page', String(page));
      params.append('limit', '15');
      return apiClient.get(`/admin/customers?${params.toString()}`);
    },
  });

  // Mutación Bloquear / Desbloquear
  const blockMutation = useMutation({
    mutationFn: async ({ customerId, isBlocked, reason }: { customerId: string; isBlocked: boolean; reason: string }) => {
      return apiClient.patch(`/admin/customers/${customerId}/block`, {
        is_blocked: isBlocked,
        reason: reason || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      setBlockModalCustomer(null);
      setBlockReason('');
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message || err?.message || 'Error al cambiar estado de bloqueo.');
    },
  });

  // Mutación Anonimizar (Ley 1581)
  const anonymizeMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return apiClient.post(`/admin/customers/${customerId}/anonymize`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      setAnonymizeModalCustomer(null);
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message || err?.message || 'Error al anonimizar cliente.');
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-black text-stone-900">Directorio de Clientes</h1>
          </div>
          <p className="text-xs text-stone-500 max-w-xl">
            Gestión de clientes, historial de pedidos, moderación antifraude y cumplimiento del régimen de Habeas Data (Ley 1581 de 2012).
          </p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre o celular..."
            className="w-full pl-10 pr-3 py-2 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-stone-400 font-bold shrink-0">Filtrar:</span>
          <select
            value={filterBlocked}
            onChange={(e) => {
              setFilterBlocked(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">Todos los clientes</option>
            <option value="active">Solo habilitados</option>
            <option value="blocked">Bloqueados por fraude</option>
          </select>
        </div>
      </div>

      {/* Tabla de Clientes */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50/70 border-b border-stone-100 text-[10px] font-extrabold uppercase tracking-wider text-stone-400">
              <tr>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Teléfono Móvil</th>
                <th className="px-6 py-4">Pedidos Realizados</th>
                <th className="px-6 py-4">Último Pedido</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-400 font-bold">
                    Cargando directorio de clientes...
                  </td>
                </tr>
              ) : !data?.items || data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-400 font-bold">
                    No se encontraron clientes registrados con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                data.items.map((c) => {
                  const isAnon = !!c.anonymized_at || c.phone_e164.startsWith('ANON_');
                  return (
                    <tr key={c.id} className="hover:bg-stone-50/50 transition">
                      <td className="px-6 py-4 font-bold text-stone-900">
                        {c.name}
                      </td>
                      <td className="px-6 py-4 font-mono text-stone-600">
                        {isAnon ? (
                          <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg border border-purple-200">
                            Anonimizado (Ley 1581)
                          </span>
                        ) : (
                          c.phone_e164
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 font-bold text-stone-800">
                          <ShoppingBag className="h-3.5 w-3.5 text-stone-400" />
                          {c.orders_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-stone-500">
                        {c.last_order_at
                          ? new Date(c.last_order_at).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Sin pedidos'}
                      </td>
                      <td className="px-6 py-4">
                        {c.is_blocked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                            <ShieldAlert className="h-3 w-3" />
                            Bloqueado
                          </span>
                        ) : isAnon ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                            Suprimido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <ShieldCheck className="h-3 w-3" />
                            Habilitado
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {/* Botón Bloquear / Desbloquear */}
                        <button
                          onClick={() => {
                            setBlockModalCustomer(c);
                            setBlockReason(c.blocked_reason || '');
                            setActionError(null);
                          }}
                          className={`p-1.5 rounded-xl transition ${
                            c.is_blocked
                              ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                              : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                          }`}
                          title={c.is_blocked ? 'Desbloquear cliente' : 'Bloquear por fraude'}
                        >
                          {c.is_blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </button>

                        {/* Botón Anonimizar Ley 1581 */}
                        {!isAnon && (
                          <button
                            onClick={() => {
                              setAnonymizeModalCustomer(c);
                              setActionError(null);
                            }}
                            className="p-1.5 rounded-xl text-stone-400 hover:text-purple-700 hover:bg-purple-50 transition"
                            title="Anonimizar conforme a Ley 1581 (Habeas Data)"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Bloqueo Antifraude */}
      {blockModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-extrabold text-stone-900 text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                <span>
                  {blockModalCustomer.is_blocked ? 'Desbloquear Cliente' : 'Bloquear por Antifraude'}
                </span>
              </h3>
              <button
                onClick={() => setBlockModalCustomer(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {actionError}
              </div>
            )}

            <p className="text-xs text-stone-600">
              {blockModalCustomer.is_blocked
                ? `¿Deseas levantar el bloqueo para ${blockModalCustomer.name} (${blockModalCustomer.phone_e164})? Podrá volver a solicitar pedidos.`
                : `Al bloquear a ${blockModalCustomer.name} (${blockModalCustomer.phone_e164}), el sistema calculará una firma HMAC irreversible de su número telefónico y rechazará automáticamente futuros pedidos.`}
            </p>

            {!blockModalCustomer.is_blocked && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700">Motivo del bloqueo</label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Ej. Pedidos falsos reiterados / bromas"
                  className="w-full text-xs rounded-xl border border-stone-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setBlockModalCustomer(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 text-xs font-bold hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() =>
                  blockMutation.mutate({
                    customerId: blockModalCustomer.id,
                    isBlocked: !blockModalCustomer.is_blocked,
                    reason: blockReason,
                  })
                }
                disabled={blockMutation.isPending}
                className={`px-4 py-2 rounded-xl text-white text-xs font-extrabold shadow-sm ${
                  blockModalCustomer.is_blocked
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {blockMutation.isPending
                  ? 'Procesando...'
                  : blockModalCustomer.is_blocked
                  ? 'Confirmar Desbloqueo'
                  : 'Confirmar Bloqueo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Anonimización Ley 1581 (Habeas Data) */}
      {anonymizeModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-extrabold text-stone-900 text-sm flex items-center gap-2">
                <UserX className="h-4 w-4 text-purple-600" />
                <span>Supresión de Datos (Ley 1581 de 2012)</span>
              </h3>
              <button
                onClick={() => setAnonymizeModalCustomer(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {actionError}
              </div>
            )}

            <div className="space-y-2 text-xs text-stone-600">
              <p>
                El titular <strong className="text-stone-900">{anonymizeModalCustomer.name}</strong> ha ejercido su derecho de supresión de datos conforme a la legislación colombiana.
              </p>
              <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 space-y-1.5 text-purple-900 text-[11px]">
                <p className="font-bold flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Efectos irreversibles de esta acción:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-purple-800">
                  <li>El número celular se reemplazará por un UUID v4 puro y aleatorio.</li>
                  <li>Se borrarán todas las direcciones de entrega registradas.</li>
                  <li>Los pedidos históricos mostrarán "REDACTED" sin alterar los montos contables.</li>
                  <li>Si el cliente estaba bloqueado, se preservará la firma HMAC antifraude.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setAnonymizeModalCustomer(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 text-xs font-bold hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => anonymizeMutation.mutate(anonymizeModalCustomer.id)}
                disabled={anonymizeMutation.isPending}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold shadow-sm"
              >
                {anonymizeMutation.isPending ? 'Anonimizando...' : 'Confirmar Supresión Irreversible'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
