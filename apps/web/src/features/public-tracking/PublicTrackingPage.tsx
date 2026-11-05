import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Truck,
  ShoppingBag,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Phone,
  Info,
  Calendar,
  AlertTriangle,
  Receipt,
  Copy,
  CreditCard,
  Check,
} from 'lucide-react';
import { apiClient, ApiError } from '../../services/api-client';
import { formatMoneyCop } from '@restaurante-saas/shared';
import { useSseStream } from '../../hooks/use-sse-stream';

const statusConfig: Record<
  string,
  { label: string; description: string; color: string; icon: React.ElementType }
> = {
  REQUESTED: {
    label: 'Solicitud Enviada',
    description: 'Estamos esperando la confirmación por WhatsApp para comenzar.',
    color: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: Clock,
  },
  RECEIVED: {
    label: 'Pedido Recibido',
    description: 'Tu pedido ha sido recibido en el sistema.',
    color: 'bg-blue-100 text-blue-900 border-blue-300',
    icon: ShoppingBag,
  },
  ACCEPTED: {
    label: 'Pedido Confirmado',
    description: 'El restaurante confirmó tu pedido y pasa a cocina.',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: CheckCircle2,
  },
  PREPARING: {
    label: 'En Preparación',
    description: 'Nuestros cocineros están preparando tus platos con esmero.',
    color: 'bg-orange-100 text-orange-900 border-orange-300',
    icon: ChefHat,
  },
  READY: {
    label: 'Listo para Entrega / Recoger',
    description: 'Tus platos están listos y empacados.',
    color: 'bg-teal-100 text-teal-900 border-teal-300',
    icon: CheckCircle2,
  },
  OUT_FOR_DELIVERY: {
    label: 'En Camino a tu Dirección',
    description: 'El repartidor va en camino con tu pedido.',
    color: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    icon: Truck,
  },
  DELIVERED: {
    label: 'Entregado con Éxito',
    description: '¡Buen provecho! Tu pedido fue entregado.',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: CheckCircle2,
  },
  PICKED_UP: {
    label: 'Entregado / Recogido',
    description: '¡Gracias por tu visita! Esperamos que lo disfrutes.',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: CheckCircle2,
  },
  SERVED: {
    label: 'Servido en Mesa',
    description: '¡Buen provecho!',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: CheckCircle2,
  },
  REJECTED: {
    label: 'No pudo ser procesado',
    description: 'El restaurante no pudo atender este pedido en este momento.',
    color: 'bg-rose-100 text-rose-900 border-rose-300',
    icon: AlertCircle,
  },
  CANCELLED: {
    label: 'Cancelado',
    description: 'Este pedido fue cancelado.',
    color: 'bg-stone-100 text-stone-700 border-stone-300',
    icon: AlertCircle,
  },
  EXPIRED_UNPROCESSED: {
    label: 'Expirado por Tiempo',
    description: 'La solicitud no fue confirmada dentro del tiempo límite.',
    color: 'bg-stone-100 text-stone-700 border-stone-300',
    icon: Clock,
  },
};

export const PublicTrackingPage: React.FC = () => {
  const { publicToken, publicOrderToken } = useParams<{
    publicToken?: string;
    publicOrderToken?: string;
  }>();
  const token = publicOrderToken || publicToken || '';
  const queryClient = useQueryClient();
  const [copiedAccount, setCopiedAccount] = React.useState(false);

  // Consulta de datos de la orden
  const {
    data: order,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['public-order-track', token],
    queryFn: async () => {
      const res = await apiClient.get<any>(`/public/orders/${token}`);
      return res;
    },
    enabled: !!token,
    retry: false,
  });

  // Suscripción SSE en tiempo real con fallback a polling cada 12 segundos
  const sseUrl = token ? `/api/v1/public/orders/${token}/events` : '';

  const { isConnected, lastUpdatedAt } = useSseStream({
    url: sseUrl,
    authMode: 'public_token',
    enabled: !!token,
    onMessage: (message) => {
      if (message.type === 'tracking.updated') {
        queryClient.invalidateQueries({ queryKey: ['public-order-track', token] });
      }
    },
    onFallbackPoll: () => {
      refetch();
    },
  });

  // Manejo de enlace expirado (HTTP 410)
  const isExpired =
    (error instanceof ApiError && error.statusCode === 410) ||
    (error as any)?.statusCode === 410 ||
    (error as any)?.response?.status === 410;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-stone-600 font-medium">Cargando estado del pedido...</p>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-stone-200 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto text-2xl">
            ⌛
          </div>
          <h2 className="text-xl font-bold text-stone-900">Enlace de Seguimiento Expirado</h2>
          <p className="text-sm text-stone-600">
            Este enlace de seguimiento estuvo activo durante las 24 horas posteriores a la finalización de tu pedido y ya no está disponible por políticas de privacidad.
          </p>
          <p className="text-xs text-stone-400">
            Si requieres soporte sobre este pedido, comunícate directamente con el restaurante.
          </p>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-stone-200 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-2xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-stone-900">Pedido No Encontrado</h2>
          <p className="text-sm text-stone-600">
            El enlace que abriste no corresponde a ningún pedido activo o ha sido revocado.
          </p>
          <div className="pt-2">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white font-bold text-sm hover:bg-amber-700 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Intentar Nuevamente</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStatusInfo = statusConfig[order.status] || {
    label: order.status,
    description: 'Estado actualizado en el restaurante.',
    color: 'bg-stone-100 text-stone-900 border-stone-300',
    icon: Clock,
  };
  const StatusIcon = currentStatusInfo.icon;
  const isPickup = order.fulfillment_type === 'PICKUP';

  return (
    <div className="min-h-screen bg-stone-100 pb-12">
      {/* Encabezado Mobile-First */}
      <header className="bg-white border-b border-stone-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-stone-900 leading-tight">
              {order.branch_name || 'Karta Bistro'}
            </h1>
            <p className="text-xs text-stone-500 font-mono">
              Pedido <span className="font-bold text-stone-800">{order.order_code}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="text-[11px]">{isConnected ? 'En vivo' : 'Sincronizado'}</span>
            </span>

            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
              title="Refrescar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenedor Principal */}
      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {/* Tarjeta de Estado Actual */}
        {(() => {
          const isCompleted = ['DELIVERED', 'PICKED_UP', 'SERVED'].includes(order.status);
          const isCancelled = ['CANCELLED', 'REJECTED', 'EXPIRED_UNPROCESSED'].includes(order.status);
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 text-center space-y-3">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border shadow-inner ${
                  isCompleted
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    : isCancelled
                    ? 'bg-rose-50 text-rose-600 border-rose-200'
                    : 'bg-amber-50 text-amber-600 border-amber-200/60'
                }`}
              >
                <StatusIcon className="w-8 h-8" />
              </div>

              <div>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${currentStatusInfo.color}`}>
                  {currentStatusInfo.label}
                </span>
                <p className="text-sm text-stone-600 mt-2 font-medium">
                  {currentStatusInfo.description}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3 text-xs text-stone-400">
                <span>Modalidad: <strong>{isPickup ? 'Para recoger' : 'Domicilio'}</strong></span>
                <span>•</span>
                <span>Hora: <strong>{new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</strong></span>
              </div>
            </div>
          );
        })()}

        {/* Aviso de Pedido Ajustado por el Restaurante */}
        {order.was_adjusted_by_restaurant && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <p className="font-bold">Resumen de pedido actualizado</p>
              <p className="text-amber-800 mt-0.5">
                El resumen y valor total de tu pedido fueron actualizados según lo acordado directamente con el restaurante.
              </p>
            </div>
          </div>
        )}

        {/* Línea de Tiempo Honesta (Solo si tracking_enabled === true) */}
        {order.tracking_enabled && order.timeline && order.timeline.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Cronología en Vivo
            </h3>

            <div className="relative pl-6 space-y-5 border-l-2 border-stone-200 ml-2">
              {order.timeline.map((event: any, idx: number) => {
                const isLast = idx === order.timeline.length - 1;
                const eventConfig = statusConfig[event.to_status] || { label: event.to_status };

                const isCompleted = ['DELIVERED', 'PICKED_UP', 'SERVED'].includes(event.to_status) || ['DELIVERED', 'PICKED_UP', 'SERVED'].includes(order.status);
                const isCancelled = ['CANCELLED', 'REJECTED', 'EXPIRED_UNPROCESSED'].includes(event.to_status);

                return (
                  <div key={idx} className="relative">
                    {/* Punto indicador */}
                    <span
                      className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full border-2 ${
                        isLast
                          ? isCompleted
                            ? 'bg-emerald-500 border-emerald-300 ring-4 ring-emerald-100'
                            : isCancelled
                            ? 'bg-rose-500 border-rose-300 ring-4 ring-rose-100'
                            : 'bg-amber-500 border-amber-200 ring-4 ring-amber-100 animate-pulse'
                          : 'bg-emerald-500 border-emerald-200'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-bold text-stone-900">
                        {eventConfig.label}
                      </p>
                      <p className="text-xs text-stone-400">
                        {new Date(event.occurred_at).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </p>
                      {event.reason && (
                        <p className="text-xs text-stone-600 italic mt-0.5">
                          Nota: {event.reason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Resumen de Productos y Totales */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center justify-between">
            <span>Detalle del Pedido</span>
            <span className="font-mono text-stone-700">#{order.order_code}</span>
          </h3>

          <div className="divide-y divide-stone-100 text-sm">
            {order.items?.map((item: any) => (
              <div key={item.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-stone-800">
                    <span className="font-bold text-amber-700 mr-1.5">{item.quantity}x</span>
                    {item.product_name}
                    {item.variant_name && (
                      <span className="text-xs text-stone-500 font-normal"> ({item.variant_name})</span>
                    )}
                  </p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <p className="text-xs text-stone-500">
                      {item.modifiers.map((m: any) => m.option_name).join(', ')}
                    </p>
                  )}
                </div>
                <span className="font-bold text-stone-900 shrink-0">
                  {formatMoneyCop(item.line_total_cop)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-stone-100 space-y-1.5 text-xs text-stone-600">
            <div className="flex justify-between">
              <span>Subtotal productos:</span>
              <span className="font-semibold">{formatMoneyCop(order.subtotal_products_cop)}</span>
            </div>
            {order.delivery_fee_cop > 0 && (
              <div className="flex justify-between">
                <span>Costo de domicilio:</span>
                <span className="font-semibold">{formatMoneyCop(order.delivery_fee_cop)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-stone-900 pt-2 border-t border-stone-200">
              <span>Total:</span>
              <span className="text-emerald-700">{formatMoneyCop(order.grand_total_cop)}</span>
            </div>
          </div>
        </div>

        {/* Instrucciones de Pago / Transferencia Bancaria */}
        {order.payment_instructions && order.payment_status !== 'NOT_TRACKED' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-orange-600" />
                <span>Datos para Pago / Transferencia</span>
              </h3>
              {order.payment_status === 'PAID' ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✓ Pagado
                </span>
              ) : order.payment_status === 'PARTIALLY_PAID' ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300">
                  Abono Registrado
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  Pendiente de Pago
                </span>
              )}
            </div>

            <div className="p-3.5 bg-gradient-to-br from-stone-50 to-orange-50/40 rounded-xl border border-stone-200/80 space-y-2 text-xs">
              {order.payment_instructions.bank_name && (
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">Banco / Billetera:</span>
                  <span className="font-bold text-stone-900">{order.payment_instructions.bank_name}</span>
                </div>
              )}
              {order.payment_instructions.account_holder && (
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">Titular:</span>
                  <span className="font-semibold text-stone-800">{order.payment_instructions.account_holder}</span>
                </div>
              )}
              {order.payment_instructions.account_type && (
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">Tipo de Cuenta:</span>
                  <span className="text-stone-800">{order.payment_instructions.account_type}</span>
                </div>
              )}
              {order.payment_instructions.account_number && (
                <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase font-bold">Número de Cuenta / Celular</span>
                    <span className="font-mono text-sm font-black text-stone-900 tracking-wider">
                      {order.payment_instructions.account_number}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(order.payment_instructions.account_number);
                      setCopiedAccount(true);
                      setTimeout(() => setCopiedAccount(false), 2500);
                    }}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs shrink-0 ${
                      copiedAccount
                        ? 'bg-emerald-600 text-white'
                        : 'bg-orange-600 hover:bg-orange-700 text-white'
                    }`}
                  >
                    {copiedAccount ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAccount ? '¡Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              )}
              {order.payment_instructions.notes && (
                <p className="text-[11px] text-stone-600 italic pt-1">
                  Nota: {order.payment_instructions.notes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Datos de Entrega Enmascarados (Habeas Data) */}
        {order.customer_snapshot && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-5 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Datos de Entrega (Protegidos)
            </h3>
            <div className="text-xs text-stone-700 space-y-1">
              <p>
                <strong className="text-stone-900">Cliente:</strong> {order.customer_snapshot.name}
              </p>
              <p>
                <strong className="text-stone-900">Teléfono:</strong> {order.customer_snapshot.phone_masked || order.customer_snapshot.phone_e164}
              </p>
              {!isPickup && order.customer_snapshot.address_masked && (
                <p>
                  <strong className="text-stone-900">Dirección:</strong> {order.customer_snapshot.address_masked}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Leyenda Fiscal DIAN */}
        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl text-[11px] text-stone-500 text-center leading-relaxed">
          {order.dian_fiscal_disclaimer}
        </div>
      </main>
    </div>
  );
};
