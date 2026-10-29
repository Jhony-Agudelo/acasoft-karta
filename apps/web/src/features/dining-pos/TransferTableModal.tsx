import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { TablePlanResponse } from './types';
import {
  X,
  ArrowRightLeft,
  AlertCircle,
  CheckCircle2,
  Table as TableIcon,
} from 'lucide-react';

interface TransferTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  currentTableCode: string;
  accountVersion: number;
  branchId: string;
  onSuccess: () => void;
}

export const TransferTableModal: React.FC<TransferTableModalProps> = ({
  isOpen,
  onClose,
  accountId,
  currentTableCode,
  accountVersion,
  branchId,
  onSuccess,
}) => {
  const [targetTableId, setTargetTableId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Consultar mesas disponibles
  const { data: planData } = useQuery<TablePlanResponse>({
    queryKey: ['dining-table-plan', branchId],
    queryFn: () => apiClient.get(`/branches/${branchId}/tables`),
    enabled: isOpen && !!branchId,
  });

  if (!isOpen) return null;

  // Filtrar mesas en estado FREE
  const freeTables =
    planData?.areas.flatMap((area) =>
      area.tables
        .filter((t) => t.status === 'FREE')
        .map((t) => ({ ...t, areaName: area.name })),
    ) || [];

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetTableId) {
      setError('Debes seleccionar una mesa de destino libre.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Ingresa el motivo del traslado (mínimo 3 caracteres).');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await apiClient.post(`/accounts/${accountId}/transfer-table`, {
        target_table_id: targetTableId,
        expected_account_version: accountVersion,
        reason: reason.trim(),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Error al realizar el traslado de mesa.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/60">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-stone-900 text-base">
                Trasladar Mesa
              </h3>
              <p className="text-xs text-stone-500">
                Mesa actual: <span className="font-bold text-stone-800">{currentTableCode}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleTransfer} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Selección de Mesa Destino */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700 block">
              Mesa de Destino (Solo mesas libres):
            </label>
            {freeTables.length === 0 ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                No hay ninguna otra mesa libre en esta sucursal en este momento.
              </div>
            ) : (
              <select
                value={targetTableId}
                onChange={(e) => setTargetTableId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-bold rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">-- Seleccionar mesa libre --</option>
                {freeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Mesa {t.code} ({t.capacity} personas — {t.areaName})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Motivo */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700 block">
              Motivo del Traslado:
            </label>
            <textarea
              rows={3}
              placeholder="Ej. Clientes solicitaron cambio de mesa a terraza exterior..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 text-xs rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-stone-50 text-[11px] text-stone-500 border border-stone-200/70">
            Todas las órdenes, ítems y abonos de la cuenta serán transferidos de inmediato a la nueva mesa, y la mesa {currentTableCode} quedará libre.
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || freeTables.length === 0}
              className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Trasladando...' : 'Confirmar Traslado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
