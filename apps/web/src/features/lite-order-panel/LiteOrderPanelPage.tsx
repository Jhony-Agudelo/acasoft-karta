import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  SlidersHorizontal,
  Truck,
  ShoppingBag,
  UtensilsCrossed,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { formatMoneyCop, OrderStatus } from '@restaurante-saas/shared';
import { useSseStream } from '../../hooks/use-sse-stream';
import { playNewOrderChime } from './order-sound';
import { OrderAdjustModal, OrderItemAdjustState } from './OrderAdjustModal';

export const LiteOrderPanelPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId, user } = useAuthStore();
  const activeBranchId = currentBranchId || (user?.branchScope && user.branchScope[0]) || '';

  // Preferencias de sonido
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => {
    return localStorage.getItem('karta_sound_muted') === 'true';
  });

  // Modal de ajuste
  const [adjustingOrder, setAdjustingOrder] = useState<any | null>(null);

  // Modal de rechazo
  const [rejectingOrder, setRejectingOrder] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Notificación visual de copiado
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  // Guardar preferencia de sonido
  const toggleSound = () => {
    setIsSoundMuted((prev) => {
      const next = !prev;
      localStorage.setItem('karta_sound_muted', String(next));
      if (!next) {
        playNewOrderChime();
      }
      return next;
    });
  };

  // Cargar pedidos de la sucursal
  const {
    data: ordersData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['branch-orders', activeBranchId],
    queryFn: async () => {
      if (!activeBranchId) return { data: [], meta: { total: 0 } };
      const res = await apiClient.get(`/branches/${activeBranchId}/orders?limit=100`);
      return res;
    },
    enabled: !!activeBranchId,
    refetchInterval: 30000, // Respaldo cada 30 segundos
  });

  const orders: any[] = ordersData?.data || [];

  // Stream Server-Sent Events en tiempo real
  const sseUrl = activeBranchId ? `/api/v1/branches/${activeBranchId}/orders/events` : '';

  const { isConnected, lastUpdatedAt } = useSseStream({
    url: sseUrl,
    authMode: 'jwt',
    enabled: !!activeBranchId,
    onMessage: (message) => {
      if (message.type === 'order.created') {
        if (!isSoundMuted) {
          playNewOrderChime();
        }
        queryClient.invalidateQueries({ queryKey: ['branch-orders', activeBranchId] });
      } else if (
        message.type === 'order.adjusted' ||
        message.type === 'order.status_changed'
      ) {
        queryClient.invalidateQueries({ queryKey: ['branch-orders', activeBranchId] });
      }
    },
  });

  // Mutación para procesar pedido (1 toque)
  const processMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiClient.post(`/orders/${orderId}/process`);
      return res;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['branch-orders', activeBranchId] });
      // Abrir WhatsApp con el link de confirmación hacia el cliente
      if (data?.whatsapp_client_url) {
        window.open(data.whatsapp_client_url, '_blank');
      }
    },
  });

  // Mutación para ajustar pedido
  const adjustMutation = useMutation({
    mutationFn: async ({ orderId, payload }: { orderId: string; payload: any }) => {
      const res = await apiClient.patch(`/orders/${orderId}/items`, payload);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-orders', activeBranchId] });
    },
  });

  // Mutación para avanzar estado
  const transitionMutation = useMutation({
    mutationFn: async ({
      orderId,
      to_status,
      reason,
    }: {
      orderId: string;
      to_status: OrderStatus;
      reason?: string;
    }) => {
      const res = await apiClient.patch(`/orders/${orderId}/status`, { to_status, reason });
      return res;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['branch-orders', activeBranchId] });
      if (data?.whatsapp_status_url) {
        window.open(data.whatsapp_status_url, '_blank');
      }
    },
  });

  // Copiar mensaje con link al portapapeles
  const handleCopyLink = (order: any) => {
    const baseUrl = window.location.origin;
    const trackingUrl = `${baseUrl}/t/${order.public_token}`;
    const name = order.customer_snapshot_json?.name || 'Cliente';
    const message = `Hola ${name}, tu pedido *${order.order_code}* ha sido confirmado. Puedes ver el resumen y seguimiento aquí: ${trackingUrl}`;

    navigator.clipboard.writeText(message);
    setCopiedOrderId(order.id);
    setTimeout(() => setCopiedOrderId(null), 3000);
  };

  // Clasificación de pedidos
  const requestedOrders = orders.filter((o) => o.status === 'REQUESTED' || o.status === 'RECEIVED');
  const activeOrders = orders.filter((o) =>
    ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(o.status),
  );
  const completedOrders = orders.filter((o) =>
    ['DELIVERED', 'PICKED_UP', 'SERVED', 'REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'].includes(
      o.status,
    ),
  );

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col">
      {/* Barra Superior Compacta */}
      <header className="bg-white border-b border-stone-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-700 font-bold border border-amber-500/20">
            ⚡
          </div>
          <div>
            <h1 className="text-lg font-bold text-stone-900 leading-tight">
              Panel Liviano de Pedidos
            </h1>
            <p className="text-xs text-stone-500">Operación ágil en 1 pantalla</p>
          </div>
        </div>

        {/* Indicadores de Conexión y Sonido */}
        <div className="flex items-center gap-3">
          {/* Indicador SSE */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{isConnected ? 'En vivo (SSE)' : 'Reconectando...'}</span>
          </div>

          {/* Toggle de Sonido */}
          <button
            onClick={toggleSound}
            title={isSoundMuted ? 'Activar timbre sonoro' : 'Silenciar timbre sonoro'}
            className={`p-2 rounded-xl border transition-colors ${
              isSoundMuted
                ? 'border-stone-200 bg-stone-50 text-stone-400 hover:text-stone-700'
                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            {isSoundMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>

          {/* Botón Refrescar */}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
            title="Actualizar pedidos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Contadores Rápidos */}
      <div className="max-w-7xl w-full mx-auto px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">
              Por Procesar
            </p>
            <p className="text-3xl font-extrabold text-amber-950 mt-0.5">
              {requestedOrders.length}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-700 text-2xl">
            📬
          </div>
        </div>

        <div className="bg-sky-50 border border-sky-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-sky-800 uppercase tracking-wider">En Curso</p>
            <p className="text-3xl font-extrabold text-sky-950 mt-0.5">{activeOrders.length}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-700 text-2xl">
            🍳
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              Completados Hoy
            </p>
            <p className="text-3xl font-extrabold text-emerald-950 mt-0.5">
              {completedOrders.length}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-700 text-2xl">
            ✅
          </div>
        </div>
      </div>

      {/* Columnas Principales */}
      <main className="max-w-7xl w-full mx-auto px-6 pb-12 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna 1: Solicitudes por procesar (REQUESTED) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              <span>Solicitudes por Procesar</span>
              <span className="text-xs font-semibold text-stone-500">
                ({requestedOrders.length})
              </span>
            </h2>
          </div>

          {requestedOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-stone-500">
              <p className="text-sm font-medium">No hay solicitudes pendientes en este momento.</p>
              <p className="text-xs text-stone-400 mt-1">
                Las nuevas solicitudes de WhatsApp aparecerán aquí automáticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requestedOrders.map((order) => {
                const customer = order.customer_snapshot_json || {};
                const isPickup = order.fulfillment_type === 'PICKUP';

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm p-5 space-y-4 transition-all hover:shadow-md"
                  >
                    {/* Encabezado de la tarjeta */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black font-mono text-stone-900">
                            {order.order_code}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              isPickup
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isPickup ? '🛍️ Recoger' : '🛵 Domicilio'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {new Date(order.created_at).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </p>
                      </div>

                      {/* Monto total */}
                      <div className="text-right">
                        <p className="text-xs text-stone-400 font-medium">Total</p>
                        <p className="text-xl font-black text-emerald-700">
                          {formatMoneyCop(order.grand_total_cop)}
                        </p>
                      </div>
                    </div>

                    {/* Datos del Cliente y Teléfono Destacado */}
                    <div className="p-3 bg-stone-50 rounded-xl space-y-1.5 border border-stone-100">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-stone-800">{customer.name || 'Cliente'}</p>
                        <a
                          href={`https://wa.me/${(customer.phone_e164 || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{customer.phone_e164 || 'Sin número'}</span>
                        </a>
                      </div>

                      {!isPickup && customer.address_line && (
                        <p className="text-xs text-stone-600 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span>
                            {customer.address_line}
                            {customer.neighborhood ? `, ${customer.neighborhood}` : ''}
                          </span>
                        </p>
                      )}

                      {customer.reference_notes && (
                        <p className="text-xs text-amber-800 bg-amber-100/60 p-1.5 rounded-lg">
                          Nota: {customer.reference_notes}
                        </p>
                      )}
                    </div>

                    {/* Detalle de Productos */}
                    <div className="space-y-1 text-xs text-stone-700">
                      {order.items?.map((item: any) => (
                        <div key={item.id} className="flex justify-between py-1 border-b border-stone-100">
                          <div>
                            <span className="font-bold text-stone-900">{item.quantity}x</span>{' '}
                            <span>{item.product_snapshot_json?.product_name || item.product_snapshot_json?.name}</span>
                            {item.product_snapshot_json?.variant_name && (
                              <span className="text-stone-500"> ({item.product_snapshot_json.variant_name})</span>
                            )}
                          </div>
                          <span className="font-semibold text-stone-800">{formatMoneyCop(item.line_total_cop)}</span>
                        </div>
                      ))}
                      {order.delivery_fee_cop > 0 && (
                        <div className="flex justify-between py-1 text-stone-500">
                          <span>Tarifa domicilio</span>
                          <span>{formatMoneyCop(order.delivery_fee_cop)}</span>
                        </div>
                      )}
                    </div>

                    {/* Botones de Acción */}
                    <div className="space-y-2 pt-2 border-t border-stone-100">
                      <div className="flex gap-2">
                        {/* Botón Ajustar Pedido */}
                        <button
                          onClick={() => {
                            const initialItems: OrderItemAdjustState[] = (order.items || []).map(
                              (i: any) => ({
                                product_id: i.product_id,
                                product_name: i.product_snapshot_json?.product_name || i.product_snapshot_json?.name || 'Producto',
                                variant_id: i.product_snapshot_json?.variant_id || null,
                                variant_name: i.product_snapshot_json?.variant_name || null,
                                unit_price_cop: i.unit_price_cop,
                                quantity: i.quantity,
                                modifiers: (i.modifiers_snapshot_json || []).map((m: any) => ({
                                  option_id: m.option_id,
                                  option_name: m.option_name,
                                  extra_price_cop: m.extra_price_cop || 0,
                                })),
                                notes: i.notes,
                              }),
                            );
                            setAdjustingOrder({
                              ...order,
                              initialItems,
                            });
                          }}
                          className="px-3 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-50 font-bold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Ajustar</span>
                        </button>

                        {/* Botón Principal: Procesar Pedido (1 Toque) */}
                        <button
                          onClick={() => processMutation.mutate(order.id)}
                          disabled={processMutation.isPending}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Procesar Pedido</span>
                        </button>
                      </div>

                      {/* Botón Secundario: No puedo atender */}
                      <button
                        onClick={() => {
                          setRejectingOrder(order);
                          setRejectReason('');
                        }}
                        className="w-full text-center text-xs text-stone-400 hover:text-rose-600 transition-colors py-1"
                      >
                        No puedo atender este pedido
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Columna 2: Pedidos en Curso (ACCEPTED, PREPARING, READY, OUT_FOR_DELIVERY) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-500" />
              <span>Pedidos en Curso</span>
              <span className="text-xs font-semibold text-stone-500">
                ({activeOrders.length})
              </span>
            </h2>
          </div>

          {activeOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-stone-500">
              <p className="text-sm font-medium">No hay pedidos activos en preparación o despacho.</p>
              <p className="text-xs text-stone-400 mt-1">
                Al pulsar "Procesar Pedido", los pedidos confirmados aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeOrders.map((order) => {
                const customer = order.customer_snapshot_json || {};
                const isPickup = order.fulfillment_type === 'PICKUP';

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-black font-mono text-stone-900">
                            {order.order_code}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                            {order.status}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {customer.name} • {isPickup ? 'Para recoger' : 'Domicilio'}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-base font-bold text-emerald-700">
                          {formatMoneyCop(order.grand_total_cop)}
                        </p>
                        {order.was_adjusted_by_restaurant && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Ajustado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botón de Copiar Enlace de Seguimiento */}
                    <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-100">
                      <span className="text-xs text-stone-600 truncate mr-2">
                        /t/{order.public_token?.slice(0, 16)}...
                      </span>
                      <button
                        onClick={() => handleCopyLink(order)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                          copiedOrderId === order.id
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedOrderId === order.id ? '¡Copiado!' : 'Copiar mensaje con link'}</span>
                      </button>
                    </div>

                    {/* Botones de Avance de Estado */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
                      {order.status === 'ACCEPTED' && (
                        <>
                          <button
                            onClick={() =>
                              transitionMutation.mutate({
                                orderId: order.id,
                                to_status: 'PREPARING',
                              })
                            }
                            className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs"
                          >
                            🍳 En Preparación
                          </button>
                          <button
                            onClick={() =>
                              transitionMutation.mutate({
                                orderId: order.id,
                                to_status: isPickup ? 'READY' : 'OUT_FOR_DELIVERY',
                              })
                            }
                            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                          >
                            {isPickup ? '📦 Listo para Recoger' : '🛵 Marcar En Camino'}
                          </button>
                        </>
                      )}

                      {order.status === 'PREPARING' && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: isPickup ? 'READY' : 'OUT_FOR_DELIVERY',
                            })
                          }
                          className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                        >
                          {isPickup ? '📦 Marcar Listo' : '🛵 Enviar a Domicilio'}
                        </button>
                      )}

                      {order.status === 'READY' && isPickup && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: 'PICKED_UP',
                            })
                          }
                          className="flex-1 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs"
                        >
                          ✅ Marcar Entregado
                        </button>
                      )}

                      {order.status === 'OUT_FOR_DELIVERY' && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: 'DELIVERED',
                            })
                          }
                          className="flex-1 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs"
                        >
                          ✅ Marcar Entregado al Cliente
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Modal de Ajuste de Pedido */}
      {adjustingOrder && (
        <OrderAdjustModal
          isOpen={!!adjustingOrder}
          onClose={() => setAdjustingOrder(null)}
          orderId={adjustingOrder.id}
          orderCode={adjustingOrder.order_code}
          fulfillmentType={adjustingOrder.fulfillment_type}
          initialItems={adjustingOrder.initialItems || []}
          initialDeliveryFeeCop={adjustingOrder.delivery_fee_cop || 0}
          paidTotalCop={adjustingOrder.paid_total_cop || 0}
          onSave={async (payload) => {
            await adjustMutation.mutateAsync({
              orderId: adjustingOrder.id,
              payload,
            });
          }}
        />
      )}

      {/* Modal de Rechazo de Pedido */}
      {rejectingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-rose-200">
            <h3 className="text-lg font-bold text-rose-950 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <span>Rechazar Pedido {rejectingOrder.order_code}</span>
            </h3>
            <p className="text-xs text-stone-600">
              Indica el motivo del rechazo. Este motivo quedará registrado en la auditoría y se podrá comunicar al cliente por WhatsApp.
            </p>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm focus:ring-2 focus:ring-rose-500"
              placeholder="Ej. Cocina saturada, sin disponibilidad de repartidor..."
            />
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingOrder(null)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 font-medium text-stone-700 hover:bg-stone-50"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={rejectReason.trim().length < 3}
                onClick={async () => {
                  await transitionMutation.mutateAsync({
                    orderId: rejectingOrder.id,
                    to_status: 'REJECTED',
                    reason: rejectReason.trim(),
                  });
                  setRejectingOrder(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
