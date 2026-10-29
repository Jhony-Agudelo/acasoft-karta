import React, { useState } from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  User,
  Phone,
  MapPin,
  ExternalLink,
  Copy,
  Receipt,
  FileText,
  RotateCcw,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { formatMoneyCop, OrderStatus } from '@restaurante-saas/shared';

interface OrderHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
}

export const OrderHistoryDrawer: React.FC<OrderHistoryDrawerProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !order) return null;

  const customerSnapshot = order.customer_snapshot_json || {};
  const isPickup = order.fulfillment_type === 'PICKUP';
  const trackingUrl = `${window.location.origin}/t/${order.public_token}`;

  const handleCopyTrackingLink = () => {
    navigator.clipboard.writeText(trackingUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Combinar eventos de estado y pagos en una sola cronología unificada
  const timelineEvents: Array<{
    type: 'STATUS' | 'PAYMENT' | 'VOID' | 'EDIT' | 'RESOLUTION';
    title: string;
    description?: string;
    timestamp: string;
    badgeColor: string;
    actor?: string;
  }> = [];

  // 1. Eventos de estado operativo
  if (order.status_events) {
    order.status_events.forEach((ev: any) => {
      timelineEvents.push({
        type: 'STATUS',
        title: `Estado cambiado a ${ev.to_status}`,
        description: ev.reason ? `Motivo: ${ev.reason}` : undefined,
        timestamp: ev.occurred_at,
        badgeColor: 'bg-stone-100 text-stone-800 border-stone-200',
        actor: ev.actor_id ? `Usuario ID: ${ev.actor_id.slice(0, 8)}` : undefined,
      });
    });
  }

  // 2. Pagos
  if (order.payments) {
    order.payments.forEach((p: any) => {
      timelineEvents.push({
        type: 'PAYMENT',
        title: `Pago registrado: ${formatMoneyCop(p.amount_cop)} (${p.method})`,
        description:
          p.method === 'CASH' && p.cash_received_cop
            ? `Efectivo: ${formatMoneyCop(p.cash_received_cop)} • Cambio: ${formatMoneyCop(p.cash_change_cop || 0)}`
            : p.external_reference
            ? `Ref: ${p.external_reference}`
            : undefined,
        timestamp: p.created_at,
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        actor: p.recorded_by?.name,
      });

      if (p.status === 'VOIDED') {
        timelineEvents.push({
          type: 'VOID',
          title: `Pago anulado: ${formatMoneyCop(p.amount_cop)}`,
          description: p.void_reason ? `Motivo: ${p.void_reason}` : 'Sin motivo registrado',
          timestamp: p.updated_at || p.created_at,
          badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
        });
      }
    });
  }

  // 3. Ajustes de pedido
  if (order.edits) {
    order.edits.forEach((edit: any) => {
      timelineEvents.push({
        type: 'EDIT',
        title: `Pedido ajustado por el restaurante`,
        description: edit.reason
          ? `Motivo: ${edit.reason}`
          : undefined,
        timestamp: edit.occurred_at,
        badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
      });
    });
  }

  // Ordenar cronología por fecha ascendente
  timelineEvents.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-stone-900/60 backdrop-blur-2xs flex justify-end">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-stone-200 animate-slide-left overflow-hidden">
        {/* Header Drawer */}
        <div className="px-6 py-4 border-b border-stone-200 bg-stone-50/80 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-stone-900">
                Detalle y Auditoría
              </h2>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-stone-200 text-stone-800">
                #{order.order_code}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Creado el {new Date(order.created_at).toLocaleString('es-CO')}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tarjeta de Resumen Financiero y Operativo */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-stone-50 to-orange-50/30 border border-stone-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500">Estado Operativo</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white border border-stone-200 text-stone-800 shadow-2xs">
                {order.status}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-500">Estado Financiero</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  order.payment_status === 'PAID'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : order.payment_status === 'PARTIALLY_PAID'
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : order.payment_status === 'COURTESY'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : order.payment_status === 'WRITTEN_OFF'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                {order.payment_status}
              </span>
            </div>

            <div className="pt-2 border-t border-stone-200/60 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-[10px] text-stone-400 block font-bold">TOTAL</span>
                <span className="font-extrabold text-stone-900">
                  {formatMoneyCop(order.grand_total_cop)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-stone-400 block font-bold">PAGADO</span>
                <span className="font-extrabold text-emerald-600">
                  {formatMoneyCop(order.paid_total_cop || 0)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-stone-400 block font-bold">SALDO</span>
                <span className="font-extrabold text-amber-600">
                  {formatMoneyCop(
                    Math.max(0, order.grand_total_cop - (order.paid_total_cop || 0)),
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Datos del Cliente y Entrega */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-orange-600" />
              <span>Cliente y Entrega</span>
            </h3>

            <div className="text-xs space-y-1.5 text-stone-700">
              <div className="flex justify-between">
                <span className="text-stone-400">Nombre:</span>
                <span className="font-bold text-stone-900">
                  {customerSnapshot.name || order.customer?.name || 'Cliente sin nombre'}
                </span>
              </div>

              {(customerSnapshot.phone_e164 || order.customer?.phone_e164) && (
                <div className="flex justify-between items-center">
                  <span className="text-stone-400">Teléfono:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-stone-800">
                      {customerSnapshot.phone_e164 || order.customer?.phone_e164}
                    </span>
                    <a
                      href={`https://wa.me/${(
                        customerSnapshot.phone_e164 || order.customer?.phone_e164
                      ).replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:text-emerald-700 font-bold"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-stone-400">Modalidad:</span>
                <span className="font-semibold text-stone-800">
                  {isPickup ? '📦 Para Recoger' : '🛵 Domicilio'}
                </span>
              </div>

              {!isPickup && customerSnapshot.address_line && (
                <div className="pt-1 border-t border-stone-100 flex items-start gap-1 text-stone-600">
                  <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                  <span>
                    {customerSnapshot.address_line}
                    {customerSnapshot.neighborhood && `, ${customerSnapshot.neighborhood}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Enlace de Seguimiento en Vivo */}
          <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between gap-3">
            <div className="overflow-hidden">
              <span className="text-[10px] text-stone-400 font-bold uppercase block">
                Link Público de Seguimiento
              </span>
              <span className="text-xs text-stone-600 font-mono truncate block">
                {trackingUrl}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCopyTrackingLink}
                className="p-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 shadow-2xs"
                title="Copiar enlace"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-2xs"
                title="Abrir enlace"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Ítems del Pedido */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Ítems Ordenados ({order.items?.length || 0})
            </h3>
            <div className="divide-y divide-stone-100 text-xs">
              {order.items?.map((it: any) => (
                <div key={it.id} className="py-2 flex justify-between gap-2">
                  <div>
                    <p className="font-bold text-stone-900">
                      <span className="text-orange-600 mr-1">{it.quantity}x</span>
                      {it.product_snapshot_json?.name || it.product_name || 'Producto'}
                      {it.variant_name && (
                        <span className="font-normal text-stone-500"> ({it.variant_name})</span>
                      )}
                    </p>
                    {it.notes && (
                      <p className="text-[11px] text-stone-500 italic mt-0.5">Nota: {it.notes}</p>
                    )}
                  </div>
                  <span className="font-bold text-stone-800 shrink-0">
                    {formatMoneyCop(it.line_total_cop || it.unit_price_cop * it.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Línea de Tiempo y Auditoría */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              <span>Auditoría de Eventos en Tiempo Real</span>
            </h3>

            <div className="relative pl-5 space-y-4 border-l-2 border-stone-100 ml-1.5">
              {timelineEvents.map((ev, idx) => (
                <div key={idx} className="relative">
                  {/* Punto en línea */}
                  <span className="absolute -left-[25px] top-1 w-2.5 h-2.5 rounded-full bg-stone-300 border-2 border-white" />
                  <div>
                    <p className="text-xs font-bold text-stone-900">{ev.title}</p>
                    {ev.description && (
                      <p className="text-[11px] text-stone-600 mt-0.5">{ev.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-stone-400">
                      <span>{new Date(ev.timestamp).toLocaleTimeString('es-CO')}</span>
                      {ev.actor && <span>• {ev.actor}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
