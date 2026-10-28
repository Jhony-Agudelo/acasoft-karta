import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { apiClient } from '../../services/api-client';

interface OrderEvent {
  id: string;
  from_status: string | null;
  to_status: string;
  occurred_at: string;
  reason?: string | null;
}

interface OrderItem {
  id: string;
  quantity: number;
  unit_price_cop: number;
  line_total_cop: number;
  product_snapshot_json: any;
  modifiers_snapshot_json: any[];
}

interface OrderDetails {
  order_id: string;
  order_code: string;
  origin: string;
  fulfillment_type: string;
  status: string;
  payment_policy: string;
  payment_status: string;
  subtotal_products_cop: number;
  delivery_fee_cop: number;
  tax_total_cop: number;
  grand_total_cop: number;
  paid_total_cop: number;
  customer_snapshot: any;
  created_at: string;
  branch_name: string;
  items: OrderItem[];
  events: OrderEvent[];
}

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
    label: 'Pedido Aceptado',
    description: 'El restaurante aceptó tu pedido y pasará a cocina.',
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
    label: 'Listo para Entrega',
    description: 'Tus platos están listos y empacados.',
    color: 'bg-teal-100 text-teal-900 border-teal-300',
    icon: CheckCircle2,
  },
  OUT_FOR_DELIVERY: {
    label: 'En Camino',
    description: 'El repartidor va en camino con tu pedido.',
    color: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    icon: Truck,
  },
  DELIVERED: {
    label: 'Entregado',
    description: '¡Buen provecho! Tu pedido fue entregado con éxito.',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: CheckCircle2,
  },
  PICKED_UP: {
    label: 'Entregado en Local',
    description: '¡Gracias por visitarnos! Disfruta tu comida.',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: CheckCircle2,
  },
  REJECTED: {
    label: 'Pedido No Aceptado',
    description: 'El restaurante no pudo procesar tu pedido.',
    color: 'bg-rose-100 text-rose-900 border-rose-300',
    icon: AlertCircle,
  },
  CANCELLED: {
    label: 'Cancelado',
    description: 'El pedido fue cancelado.',
    color: 'bg-stone-200 text-stone-800 border-stone-300',
    icon: AlertCircle,
  },
  EXPIRED_UNPROCESSED: {
    label: 'Solicitud Caducada',
    description: 'La solicitud no fue confirmada dentro del tiempo estipulado.',
    color: 'bg-stone-200 text-stone-700 border-stone-300',
    icon: AlertCircle,
  },
};

export const PublicOrderTrackerPage: React.FC = () => {
  const { publicToken = '' } = useParams<{ publicToken: string }>();

  const {
    data: order,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<OrderDetails>({
    queryKey: ['public-order-track', publicToken],
    queryFn: () => apiClient.get(`/public/orders/track/${publicToken}`),
    refetchInterval: 10000, // Refrescar cada 10 segundos
    enabled: !!publicToken,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-2xl bg-orange-600 animate-pulse mx-auto" />
          <p className="text-xs font-bold text-stone-600">Localizando tu pedido...</p>
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-stone-200 text-center space-y-4 shadow-md">
          <div className="h-12 w-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-black text-stone-900">Pedido no encontrado</h2>
          <p className="text-xs text-stone-500">
            El enlace de seguimiento no es válido o ha expirado. Por favor verifica el enlace enviado en WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  const currentStatus = statusConfig[order.status] || {
    label: order.status,
    description: 'Estado actual del pedido',
    color: 'bg-stone-100 text-stone-800 border-stone-300',
    icon: Clock,
  };

  const StatusIcon = currentStatus.icon;

  return (
    <div className="min-h-screen bg-[#faf8f5] text-stone-800 font-sans py-8 px-4 selection:bg-orange-500 selection:text-white">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-stone-500">
            {order.branch_name}
          </span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-50 shadow-2xs transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin text-orange-600' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Tarjeta Principal de Estado */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/90 shadow-md text-center space-y-5">
          <div className="space-y-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
              Código del Pedido
            </p>
            <h1 className="text-4xl sm:text-5xl font-black text-orange-600 font-mono tracking-tight">
              {order.order_code}
            </h1>
          </div>

          <div
            className={`inline-flex flex-col items-center gap-2 px-5 py-3.5 rounded-2xl border ${currentStatus.color}`}
          >
            <div className="flex items-center gap-2">
              <StatusIcon className="h-5 w-5" />
              <span className="text-sm font-extrabold">{currentStatus.label}</span>
            </div>
            <p className="text-xs font-medium max-w-sm text-center">
              {currentStatus.description}
            </p>
          </div>

          <div className="pt-2 text-[11px] text-stone-400 flex items-center justify-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>Creado: {new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* Detalle de Productos */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200/90 shadow-sm space-y-4">
          <h3 className="font-extrabold text-sm text-stone-900 border-b border-stone-100 pb-3 flex items-center justify-between">
            <span>Ítems del Pedido</span>
            <span className="text-xs text-stone-400 font-semibold">{order.items.length} productos</span>
          </h3>

          <div className="divide-y divide-stone-100 space-y-2">
            {order.items.map((it) => {
              const pSnap = it.product_snapshot_json || {};
              const mSnap = it.modifiers_snapshot_json || [];
              return (
                <div key={it.id} className="pt-2 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-stone-900">
                      {it.quantity}x {pSnap.product_name || 'Producto'}
                    </span>
                    {pSnap.variant_name && (
                      <p className="text-[11px] text-stone-500 font-medium">
                        {pSnap.variant_name}
                      </p>
                    )}
                    {mSnap.length > 0 && (
                      <p className="text-[11px] text-stone-500">
                        + {mSnap.map((m: any) => m.option_name).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className="font-mono font-bold text-stone-900 shrink-0">
                    ${it.line_total_cop.toLocaleString('es-CO')}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Totales */}
          <div className="pt-4 border-t border-stone-100 space-y-1.5 text-xs">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal productos:</span>
              <span className="font-mono">${order.subtotal_products_cop.toLocaleString('es-CO')}</span>
            </div>
            {order.delivery_fee_cop > 0 && (
              <div className="flex justify-between text-stone-500">
                <span>Costo de domicilio:</span>
                <span className="font-mono">${order.delivery_fee_cop.toLocaleString('es-CO')}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm text-stone-900 pt-2 border-t border-stone-100">
              <span>Total a Pagar:</span>
              <span className="font-mono text-orange-600">
                ${order.grand_total_cop.toLocaleString('es-CO')} COP
              </span>
            </div>
          </div>
        </div>

        {/* Historial de Eventos (Timeline) */}
        {order.events && order.events.length > 0 && (
          <div className="bg-white rounded-3xl p-6 border border-stone-200/90 shadow-sm space-y-4">
            <h3 className="font-extrabold text-sm text-stone-900">Historial del Pedido</h3>
            <div className="space-y-3 relative border-l-2 border-orange-200 ml-3 pl-4">
              {order.events.map((ev, index) => {
                const conf = statusConfig[ev.to_status] || { label: ev.to_status };
                return (
                  <div key={ev.id || index} className="relative">
                    <div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-orange-600 border-2 border-white" />
                    <p className="text-xs font-bold text-stone-800">{conf.label}</p>
                    {ev.reason && (
                      <p className="text-[11px] text-stone-500">{ev.reason}</p>
                    )}
                    <span className="text-[10px] text-stone-400 font-mono">
                      {new Date(ev.occurred_at).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
