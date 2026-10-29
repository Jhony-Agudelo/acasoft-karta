import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Flame,
  Clock,
  CheckCircle2,
  RefreshCw,
  Bell,
  BellOff,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  ChefHat,
  AlertTriangle,
  Layers,
  Sparkles,
  Printer,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { useSseStream } from '../../hooks/use-sse-stream';
import { playNewOrderChime } from '../lite-order-panel/order-sound';
import { PrintReceiptModal } from '../../components/print/PrintReceiptModal';

interface KitchenItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  station_key?: string | null;
  status?: 'PENDING' | 'PREPARING' | 'READY' | 'CANCELLED';
  kitchen_station?: string | null;
  kitchen_status?: 'PENDING' | 'PREPARING' | 'READY';
  kitchen_started_at?: string | null;
  kitchen_ready_at?: string | null;
  product_snapshot_json?: any;
  modifiers_snapshot_json?: any[];
  notes?: string | null;
}

interface KitchenOrder {
  id: string;
  order_code: string;
  status: string;
  origin: string;
  fulfillment_type: string;
  created_at: string;
  notes?: string | null;
  customer?: { name: string; phone_e164: string } | null;
  customer_snapshot_json?: any;
  table_label?: string | null;
  table_code?: string | null;
  area_name?: string | null;
  server_name?: string | null;
  opener_name?: string | null;
  waiter_name?: string | null;
  table?: { id: string; code: string; area?: { name: string } } | null;
  dining_account?: {
    id: string;
    account_code: string;
    opener?: { id: string; name: string };
    table?: { code: string; area?: { name: string } };
  } | null;
  items: KitchenItem[];
}

interface KitchenStation {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
}

export const KitchenKdsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId, user } = useAuthStore();
  const activeBranchId = currentBranchId || (user?.branchScope && user.branchScope[0]) || '';

  // Filtro de estación de cocina
  const [selectedStationKey, setSelectedStationKey] = useState<string>('ALL');
  const [orderForPrint, setOrderForPrint] = useState<any | null>(null);

  // Sonido
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => {
    return localStorage.getItem('karta_kds_sound_muted') === 'true';
  });

  const toggleSound = () => {
    setIsSoundMuted((prev) => {
      const next = !prev;
      localStorage.setItem('karta_kds_sound_muted', String(next));
      if (!next) {
        playNewOrderChime();
      }
      return next;
    });
  };

  // Cargar lista de estaciones de la sucursal
  const { data: stations = [] } = useQuery<KitchenStation[]>({
    queryKey: ['kitchen-stations', activeBranchId],
    queryFn: async () => {
      if (!activeBranchId) return [];
      const res = await apiClient.get<KitchenStation[]>(
        `/admin/branches/${activeBranchId}/kitchen-stations`,
      );
      return res;
    },
    enabled: !!activeBranchId,
  });

  // Cargar comanda activa de cocina KDS
  const {
    data: orders = [],
    isLoading,
    refetch,
  } = useQuery<KitchenOrder[]>({
    queryKey: ['kitchen-orders', activeBranchId, selectedStationKey],
    queryFn: async () => {
      if (!activeBranchId) return [];
      const params = new URLSearchParams();
      params.append('branchId', activeBranchId);
      if (selectedStationKey !== 'ALL') {
        params.append('stationKey', selectedStationKey);
      }
      const res = await apiClient.get<KitchenOrder[]>(`/kitchen/orders?${params.toString()}`);
      return res;
    },
    enabled: !!activeBranchId,
    refetchInterval: 15000,
  });

  // Suscripción SSE en vivo
  const sseUrl = activeBranchId ? `/api/v1/branches/${activeBranchId}/orders/events` : '';
  const { isConnected } = useSseStream({
    url: sseUrl,
    authMode: 'jwt',
    enabled: !!activeBranchId,
    onMessage: (message) => {
      if (message.type === 'order.created' || message.type === 'order.status_changed') {
        if (!isSoundMuted) {
          playNewOrderChime();
        }
        queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
      } else if (
        message.type === 'kitchen.order_updated' ||
        message.type === 'kitchen.item_status_updated' ||
        message.type === 'kitchen.order_ready'
      ) {
        queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
      }
    },
  });

  // Mutación para actualizar estado de ítems de cocina alineado con UpdateKitchenItemStatusSchema
  const updateItemStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      itemIds,
      toStatus,
    }: {
      orderId: string;
      itemIds?: string[];
      toStatus: 'PREPARING' | 'READY';
    }) => {
      return apiClient.patch(`/kitchen/orders/${orderId}/status`, {
        item_ids: itemIds,
        to_status: toStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || err?.message || 'Error al actualizar comanda en cocina.');
    },
  });

  // Obtener estado efectivo de un ítem (apoya tanto status como kitchen_status)
  const getItemStatus = (item: KitchenItem): 'PENDING' | 'PREPARING' | 'READY' => {
    return (item.status as any) || item.kitchen_status || 'PENDING';
  };

  // Función para ciclar el estado de un ítem individual:
  // PENDING -> PREPARING -> READY -> PREPARING
  const handleCycleItemStatus = (orderId: string, item: KitchenItem) => {
    const current = getItemStatus(item);
    let next: 'PREPARING' | 'READY' = 'PREPARING';
    if (current === 'PENDING') {
      next = 'PREPARING';
    } else if (current === 'PREPARING') {
      next = 'READY';
    } else if (current === 'READY') {
      next = 'PREPARING';
    }

    updateItemStatusMutation.mutate({
      orderId,
      itemIds: [item.id],
      toStatus: next,
    });
  };

  // Iniciar preparación de toda la comanda a la vez
  const handleStartAllPreparing = (order: KitchenOrder) => {
    updateItemStatusMutation.mutate({
      orderId: order.id,
      itemIds: order.items.map((it) => it.id),
      toStatus: 'PREPARING',
    });
  };

  // Función para marcar todos los ítems de una comanda como listos
  const handleMarkAllReady = (order: KitchenOrder) => {
    updateItemStatusMutation.mutate({
      orderId: order.id,
      itemIds: order.items.map((it) => it.id),
      toStatus: 'READY',
    });
  };

  // Mutación para despachar/servir comanda terminada (SERVED / PICKED_UP / OUT_FOR_DELIVERY)
  const transitionOrderMutation = useMutation({
    mutationFn: async ({ orderId, toStatus }: { orderId: string; toStatus: string }) => {
      return apiClient.patch(`/orders/${orderId}/status`, { to_status: toStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || err?.message || 'Error al despachar orden de cocina.');
    },
  });

  // Cálculo de tiempo transcurrido y semáforo
  const getTimeElapsed = (createdAt: string) => {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.floor(diffMs / 60000);
    return minutes;
  };

  return (
    <div className="flex flex-col h-full bg-[#181615] text-stone-100 font-sans select-none">
      {/* Top Header KDS (Modo Oscuro de Alto Contraste para Cocina) */}
      <header className="bg-[#24211e] border-b border-stone-800 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-black shadow-md shadow-orange-600/30">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                KDS — Pantalla de Cocina
              </h1>
              <span
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  isConnected
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border-amber-800'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span>{isConnected ? 'En Vivo' : 'Reconectando'}</span>
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Despacho táctil de platos, control de tiempos de preparación y avance en línea.
            </p>
          </div>
        </div>

        {/* Controles de Estación y Sonido */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de Estación */}
          <div className="flex items-center gap-1.5 bg-[#181615] p-1 rounded-xl border border-stone-800">
            <button
              onClick={() => setSelectedStationKey('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedStationKey === 'ALL'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              Todas las Estaciones
            </button>
            {stations.map((st) => (
              <button
                key={st.id}
                onClick={() => setSelectedStationKey(st.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedStationKey === st.key
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                {st.name}
              </button>
            ))}
          </div>

          {/* Timbre KDS */}
          <button
            onClick={toggleSound}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              isSoundMuted
                ? 'bg-stone-900 border-stone-800 text-stone-500'
                : 'bg-orange-950 border-orange-800 text-orange-400'
            }`}
            title={isSoundMuted ? 'Activar timbre de cocina' : 'Silenciar timbre'}
          >
            {isSoundMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>

          <button
            onClick={() => refetch()}
            className="p-2.5 rounded-xl border border-stone-800 bg-[#181615] hover:bg-stone-900 text-stone-300 transition-colors"
            title="Refrescar KDS"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Grid de Comandas KDS */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-stone-500">
            <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold">Cargando comandas de cocina...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-[#24211e] rounded-3xl border border-stone-800 p-16 text-center max-w-md mx-auto my-16 shadow-xl space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-[#181615] text-stone-600 flex items-center justify-center mx-auto text-3xl">
              🍳
            </div>
            <h3 className="font-extrabold text-white text-lg">Cocina al Día</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              No hay comandas activas pendientes de preparación en este momento. Los nuevos pedidos
              autorizados entrarán automáticamente con timbre.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {orders.map((order) => {
              const customerSnapshot = order.customer_snapshot_json || {};
              const minutesElapsed = getTimeElapsed(order.created_at);
              const isPickup = order.fulfillment_type === 'PICKUP';
              const isDineIn = order.fulfillment_type === 'DINE_IN';

              const effectiveTableCode =
                order.table_code || order.table?.code || order.dining_account?.table?.code;
              const effectiveTableLabel =
                order.table_label || (effectiveTableCode ? `Mesa ${effectiveTableCode}` : null);
              const effectiveAreaName =
                order.area_name ||
                order.table?.area?.name ||
                order.dining_account?.table?.area?.name;
              const effectiveServerName =
                order.server_name ||
                order.opener_name ||
                order.waiter_name ||
                order.dining_account?.opener?.name;

              // Semáforo de tiempos
              let trafficColor = 'border-emerald-500/80 bg-emerald-950/20 text-emerald-400';
              let badgeColor = 'bg-emerald-900/60 text-emerald-300 border-emerald-700';
              if (minutesElapsed >= 30) {
                trafficColor = 'border-rose-500 bg-rose-950/30 text-rose-400 animate-pulse';
                badgeColor = 'bg-rose-900/80 text-rose-200 border-rose-600';
              } else if (minutesElapsed >= 15) {
                trafficColor = 'border-amber-500/80 bg-amber-950/20 text-amber-400';
                badgeColor = 'bg-amber-900/60 text-amber-300 border-amber-700';
              }

              const allPreparingOrReady = order.items.every(
                (it) => getItemStatus(it) === 'PREPARING' || getItemStatus(it) === 'READY',
              );
              const allReady = order.items.every(
                (it) => getItemStatus(it) === 'READY',
              );

              return (
                <div
                  key={order.id}
                  className={`bg-[#24211e] rounded-3xl border-2 flex flex-col overflow-hidden shadow-xl transition-all ${
                    allReady ? 'border-emerald-600/60 opacity-80' : trafficColor
                  }`}
                >
                  {/* Encabezado Comanda KDS */}
                  <div className="p-4 border-b border-stone-800 bg-[#1e1b19] flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-2xl font-black text-white">
                          #{order.order_code}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-800 text-stone-300">
                          {order.origin}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5 font-medium">
                        {customerSnapshot.name || order.customer?.name || 'Cliente'}
                      </p>

                      {/* Identificación de Mesa y Salón */}
                      {effectiveTableCode && (
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-xl bg-orange-950/80 border border-orange-500/70 text-orange-200 text-xs font-black flex items-center gap-1.5 shadow-xs">
                            <UtensilsCrossed className="w-3.5 h-3.5 text-orange-400" />
                            <span>{effectiveTableLabel}</span>
                            {effectiveAreaName && (
                              <span className="text-orange-300/80 font-normal">• {effectiveAreaName}</span>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Encargado / Mesero de la Mesa */}
                      {effectiveServerName && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-300/90">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          <span>Atendido por: <strong className="text-amber-200">{effectiveServerName}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Semáforo de Minutos y Modalidad */}
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black border ${badgeColor}`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{minutesElapsed} min</span>
                      </span>
                      <div className="flex items-center gap-1 justify-end text-[11px] text-stone-400 mt-1">
                        {isDineIn ? (
                          <>
                            <UtensilsCrossed className="w-3 h-3 text-orange-400" />
                            <span className="font-bold text-orange-400">Salón / Mesa</span>
                          </>
                        ) : isPickup ? (
                          <>
                            <ShoppingBag className="w-3 h-3 text-purple-400" />
                            <span>Para Llevar</span>
                          </>
                        ) : (
                          <>
                            <Truck className="w-3 h-3 text-emerald-400" />
                            <span>Domicilio</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notas de la Comanda General */}
                  {order.notes && (
                    <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-900/40 text-amber-300 text-xs flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{order.notes}</span>
                    </div>
                  )}

                  {/* Lista de Ítems Táctiles */}
                  <div className="p-4 space-y-2.5 flex-1">
                    {order.items.map((item) => {
                      const itemStatus = getItemStatus(item);
                      const isItemReady = itemStatus === 'READY';
                      const isItemPreparing = itemStatus === 'PREPARING';

                      const productName =
                        item.product_snapshot_json?.product_name ||
                        item.product_snapshot_json?.name ||
                        'Producto';
                      const variantName =
                        item.product_snapshot_json?.variant_name ||
                        item.product_snapshot_json?.variant?.name;

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleCycleItemStatus(order.id, item)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isItemReady
                              ? 'bg-emerald-950/40 border-emerald-700/60 text-stone-400'
                              : isItemPreparing
                              ? 'bg-sky-950/40 border-sky-600/80 text-white shadow-md shadow-sky-950/20'
                              : 'bg-[#1a1816] border-stone-800 text-stone-200 hover:border-stone-700'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span
                                className={`text-lg font-black ${
                                  isItemReady
                                    ? 'text-emerald-500 line-through'
                                    : isItemPreparing
                                    ? 'text-sky-400'
                                    : 'text-orange-500'
                                }`}
                              >
                                {item.quantity}x
                              </span>
                              <span
                                className={`font-bold text-sm leading-snug ${
                                  isItemReady ? 'line-through text-stone-500' : 'text-stone-100'
                                }`}
                              >
                                {productName}
                              </span>

                              {/* Variante del Producto */}
                              {variantName && (
                                <span className="px-2 py-0.5 rounded-md bg-stone-800 text-stone-300 text-[10px] font-bold border border-stone-700">
                                  {variantName}
                                </span>
                              )}
                            </div>

                            {/* Modificadores */}
                            {item.modifiers_snapshot_json &&
                              item.modifiers_snapshot_json.length > 0 && (
                                <div className="text-[11px] text-amber-400 font-medium pl-6 mt-1 flex flex-wrap gap-1">
                                  {item.modifiers_snapshot_json.map((m: any, idx: number) => (
                                    <span
                                      key={idx}
                                      className="bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded text-[10px]"
                                    >
                                      + {m.option_name || m.name}
                                    </span>
                                  ))}
                                </div>
                              )}

                            {/* Notas de Cocina específicas del plato */}
                            {item.notes && (
                              <p className="text-[11px] text-amber-200 bg-amber-950/30 border border-amber-800/40 rounded px-2 py-0.5 pl-6 mt-1 italic">
                                Nota: {item.notes}
                              </p>
                            )}
                          </div>

                          {/* Botón táctil de estado */}
                          <div className="shrink-0">
                            {isItemReady ? (
                              <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                                ✓
                              </span>
                            ) : isItemPreparing ? (
                              <span className="px-2.5 py-1 rounded-xl bg-sky-600 text-white text-xs font-bold shadow-xs flex items-center gap-1 animate-pulse">
                                <Flame className="w-3 h-3" />
                                <span>Cocinando</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl bg-stone-800 hover:bg-orange-600 text-stone-300 hover:text-white text-xs font-semibold transition-colors">
                                Iniciar
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer Comanda con Botones Iniciar, Marcar Todo Listo e Imprimir */}
                  <div className="p-3 bg-[#1e1b19] border-t border-stone-800 flex items-center gap-2">
                    {!allPreparingOrReady && (
                      <button
                        type="button"
                        onClick={() => handleStartAllPreparing(order)}
                        disabled={updateItemStatusMutation.isPending}
                        className="flex-1 py-2.5 px-3 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-md bg-orange-600 hover:bg-orange-500 text-white shadow-orange-950/40"
                      >
                        <Flame className="w-4 h-4" />
                        <span>Iniciar</span>
                      </button>
                    )}

                    {!allReady ? (
                      <button
                        type="button"
                        onClick={() => handleMarkAllReady(order)}
                        disabled={updateItemStatusMutation.isPending}
                        className="flex-1 py-2.5 px-3 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-md bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Marcar Todo Listo</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          transitionOrderMutation.mutate({
                            orderId: order.id,
                            toStatus: isDineIn ? 'SERVED' : isPickup ? 'PICKED_UP' : 'OUT_FOR_DELIVERY',
                          })
                        }
                        disabled={transitionOrderMutation.isPending}
                        className="flex-1 py-2.5 px-3 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-md bg-emerald-500 hover:bg-emerald-400 text-stone-950 shadow-emerald-950/40 animate-pulse cursor-pointer"
                        title="Despachar comida y archivar del KDS"
                      >
                        {isDineIn ? (
                          <>
                            <UtensilsCrossed className="w-4 h-4" />
                            <span>🍽️ Servido en Mesa</span>
                          </>
                        ) : isPickup ? (
                          <>
                            <ShoppingBag className="w-4 h-4" />
                            <span>📦 Entregado</span>
                          </>
                        ) : (
                          <>
                            <Truck className="w-4 h-4" />
                            <span>🛵 Despachar Domicilio</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setOrderForPrint(order)}
                      className="p-2.5 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs transition-colors shrink-0"
                      title="Imprimir Comanda Térmica"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Impresión Térmica */}
      {orderForPrint && (
        <PrintReceiptModal
          isOpen={!!orderForPrint}
          onClose={() => setOrderForPrint(null)}
          order={orderForPrint}
        />
      )}
    </div>
  );
};
