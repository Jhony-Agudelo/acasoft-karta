import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { formatMoneyCop } from '@restaurante-saas/shared';
import { PendingQrOrderItem } from './types';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Check,
  Flame,
} from 'lucide-react';

interface PendingQrOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingOrders: PendingQrOrderItem[];
  tableCode: string;
  onSuccess: () => void;
}

export const PendingQrOrdersModal: React.FC<PendingQrOrdersModalProps> = ({
  isOpen,
  onClose,
  pendingOrders,
  tableCode,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleConfirmOrder = async (orderId: string) => {
    setFeedback(null);
    setProcessingId(orderId);

    try {
      await apiClient.post(`/orders/${orderId}/process`);
      setFeedback({
        type: 'success',
        message: '¡Comanda confirmada! Enviada a Cocina KDS y sumada a la cuenta de la mesa.',
      });
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      queryClient.invalidateQueries({ queryKey: ['dining-account-detail'] });
      onSuccess();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.message ||
          err?.message ||
          'No se pudo confirmar la comanda QR.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    const reason = window.prompt('Indica el motivo del rechazo de la comanda:');
    if (!reason || reason.trim().length < 3) return;

    setFeedback(null);
    setProcessingId(orderId);

    try {
      await apiClient.patch(`/orders/${orderId}/status`, {
        next_status: 'REJECTED',
        reason: reason.trim(),
      });
      setFeedback({
        type: 'success',
        message: 'Solicitud rechazada.',
      });
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      onSuccess();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.message ||
          err?.message ||
          'No se pudo rechazar la comanda.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-amber-50/70">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-stone-900 text-base">
                Solicitudes QR — Mesa {tableCode}
              </h3>
              <p className="text-xs text-amber-900">
                {pendingOrders.length} comanda(s) pendiente(s) de confirmación
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-white/80 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-b border-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Lista de solicitudes */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {pendingOrders.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-xs">
              No hay solicitudes QR pendientes para esta mesa.
            </div>
          ) : (
            pendingOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-4 rounded-2xl bg-stone-50 border border-stone-200/90 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-stone-900">
                      {ord.order_code?.startsWith('#') ? ord.order_code : `#${ord.order_code}`}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      REQUESTED
                    </span>
                  </div>
                  <span className="text-stone-400 text-[11px] flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(ord.created_at).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200">
                  <span className="text-stone-600 font-semibold">Total Solicitado:</span>
                  <span className="font-mono font-black text-sm text-stone-900">
                    {formatMoneyCop(ord.grand_total_cop)}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={processingId === ord.id}
                    onClick={() => handleRejectOrder(ord.id)}
                    className="flex-1 py-2 rounded-xl border border-stone-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-stone-600 font-bold text-xs transition disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    disabled={processingId === ord.id}
                    onClick={() => handleConfirmOrder(ord.id)}
                    className="flex-2 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md shadow-orange-600/25 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    <span>
                      {processingId === ord.id
                        ? 'Confirmando...'
                        : 'Confirmar y Enviar a Cocina'}
                    </span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-stone-100 bg-stone-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 text-xs font-bold text-stone-700 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
