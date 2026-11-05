import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Ban,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  FileText,
  Clock,
  Sparkles,
} from 'lucide-react';
import { formatMoneyCop } from '@restaurante-saas/shared';
import { apiClient } from '../../services/api-client';

export interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  onSuccess?: () => void;
  onOpenPayments?: () => void;
}

const QUICK_CANCEL_REASONS = [
  'Cliente canceló por WhatsApp',
  'Falta de ingredientes / producto agotado',
  'Dirección fuera de zona de entrega',
  'Demora excesiva en la cocina',
  'Error al digitar comanda o datos',
  'Cliente no se presentó a recoger',
];

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
  onOpenPayments,
}) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasActivePayments = (order?.paid_total_cop || 0) > 0;
  const isTerminal = ['DELIVERED', 'PICKED_UP', 'SERVED', 'REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'].includes(
    order?.status,
  );

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!order?.id) throw new Error('Identificador de pedido no válido.');
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 3) {
        throw new Error('El motivo de cancelación debe tener al menos 3 caracteres.');
      }
      return apiClient.patch(`/orders/${order.id}/status`, {
        to_status: 'CANCELLED',
        reason: trimmedReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['full-branch-orders'] });
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
      queryClient.invalidateQueries({ queryKey: ['lite-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        'No se pudo cancelar el pedido.';
      setErrorMessage(msg);
    },
  });

  if (!isOpen || !order) return null;

  const customerName = order.customer_snapshot_json?.name || order.customer?.name || 'Cliente sin nombre';
  const fulfillmentLabel =
    order.fulfillment_type === 'DELIVERY'
      ? '🛵 Domicilio'
      : order.fulfillment_type === 'PICKUP'
      ? '📦 Para Recoger'
      : '🍽️ Salón / Mesa';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden text-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera Modal */}
        <div className="px-6 py-4.5 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-sm shadow-rose-600/30">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-rose-950 flex items-center gap-2">
                <span>Cancelar Pedido</span>
                <span className="font-mono text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg text-xs">
                  {order.order_code}
                </span>
              </h3>
              <p className="text-xs text-rose-800/80 font-medium">
                Esta acción cancelará la orden e informará a cocina y auditoría.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-white/80 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido del Modal */}
        <div className="p-6 space-y-4">
          {/* Ficha Resumen del Pedido */}
          <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-stone-900">{customerName}</p>
              <div className="flex items-center gap-2 text-stone-500 mt-0.5">
                <span>{fulfillmentLabel}</span>
                <span>•</span>
                <span className="font-mono font-bold text-stone-800">
                  Total: {formatMoneyCop(order.grand_total_cop || 0)}
                </span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-stone-200 text-stone-700 font-mono">
              {order.status}
            </span>
          </div>

          {/* Bloqueo si tiene pagos activos */}
          {hasActivePayments && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black text-rose-950">
                    No se puede cancelar directamente: Pedido con pagos activos
                  </p>
                  <p className="text-rose-800 leading-relaxed text-[11px]">
                    Este pedido registra recaudos en caja por un total de{' '}
                    <strong>{formatMoneyCop(order.paid_total_cop)}</strong>. Por integridad fiscal y
                    contable, debes anular o revertir los pagos primero antes de poder cancelar la orden.
                  </p>
                </div>
              </div>

              {onOpenPayments && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPayments();
                  }}
                  className="w-full py-2 rounded-xl bg-white border border-rose-300 text-rose-900 font-bold text-xs hover:bg-rose-100/70 transition shadow-xs cursor-pointer"
                >
                  Abrir Módulo de Pagos para Anular Cobros
                </button>
              )}
            </div>
          )}

          {/* Advertencia si la orden ya es terminal */}
          {isTerminal && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Este pedido ya se encuentra en estado terminal (<strong>{order.status}</strong>) y no
                admite cancelaciones.
              </span>
            </div>
          )}

          {/* Campo de Motivo */}
          {!hasActivePayments && !isTerminal && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-stone-500" />
                  <span>Motivo obligatorio de la cancelación *</span>
                </label>
                <span className="text-[10px] font-mono text-stone-400">
                  Mínimo 3 caracteres ({reason.trim().length}/500)
                </span>
              </div>

              <textarea
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                maxLength={500}
                placeholder="Describe el motivo por el cual se cancela este pedido..."
                className="w-full p-3 rounded-2xl border border-stone-200 bg-stone-50/50 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white transition"
              />

              {/* Sugerencias Rápidas */}
              <div className="space-y-1 pt-1">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Motivos frecuentes (un clic para seleccionar):</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CANCEL_REASONS.map((r, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer ${
                        reason === r
                          ? 'bg-rose-100 text-rose-800 border-rose-300 font-bold'
                          : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mensaje de Error */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Acciones */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs transition cursor-pointer"
          >
            Volver
          </button>

          {!hasActivePayments && !isTerminal && (
            <button
              type="button"
              disabled={reason.trim().length < 3 || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              <span>
                {cancelMutation.isPending ? 'Cancelando pedido...' : 'Confirmar Cancelación'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

