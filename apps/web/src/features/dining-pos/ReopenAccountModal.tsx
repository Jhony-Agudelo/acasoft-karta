import React, { useState } from 'react';
import { apiClient } from '../../services/api-client';
import { AccountReopenMode } from '@restaurante-saas/shared';
import {
  X,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Receipt,
  UtensilsCrossed,
  ShieldCheck,
} from 'lucide-react';

interface ReopenAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accountCode: string;
  tableCode: string;
  isTableFree: boolean;
  onSuccess: () => void;
}

export const ReopenAccountModal: React.FC<ReopenAccountModalProps> = ({
  isOpen,
  onClose,
  accountId,
  accountCode,
  tableCode,
  isTableFree,
  onSuccess,
}) => {
  const [mode, setMode] = useState<AccountReopenMode>('ACCOUNTING_ONLY');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('Debes ingresar un motivo detallado de la reapertura (mínimo 5 caracteres).');
      return;
    }

    if (mode === 'FULL_TABLE' && !isTableFree) {
      setError(
        `La mesa física ${tableCode} está actualmente ocupada. Para corregir cobros sin desalojar a los clientes actuales, usa el modo "Reapertura Contable en Caja".`,
      );
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await apiClient.post(`/accounts/${accountId}/reopen`, {
        mode,
        reason: reason.trim(),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'No se pudo reabrir la cuenta.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/60">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-stone-900 text-base">
                Reapertura de Cuenta — Mesa {tableCode}
              </h3>
              <p className="text-xs text-stone-500 font-mono font-bold">
                {accountCode}
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
        <form onSubmit={handleReopen} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Selector de Modo */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-stone-800 uppercase tracking-wider block">
              Modo de Reapertura:
            </label>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMode('ACCOUNTING_ONLY')}
                className={`w-full p-3.5 rounded-2xl border text-left transition ${
                  mode === 'ACCOUNTING_ONLY'
                    ? 'bg-violet-50 border-violet-500 ring-2 ring-violet-500/20 shadow-xs'
                    : 'bg-white border-stone-200 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black text-xs text-stone-900">
                    <Receipt className="h-4 w-4 text-violet-600" />
                    <span>Reapertura Contable en Caja (ACCOUNTING_ONLY)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Recomendado
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  Permite anular un cobro mal digitado o cobrar un saldo pendiente en caja.
                  <strong> No ocupa la mesa física</strong> y funciona aunque la mesa ya esté ocupada por otros clientes.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('FULL_TABLE')}
                className={`w-full p-3.5 rounded-2xl border text-left transition ${
                  mode === 'FULL_TABLE'
                    ? 'bg-violet-50 border-violet-500 ring-2 ring-violet-500/20 shadow-xs'
                    : 'bg-white border-stone-200 hover:bg-stone-50'
                } ${!isTableFree ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black text-xs text-stone-900">
                    <UtensilsCrossed className="h-4 w-4 text-orange-600" />
                    <span>Reapertura Operativa de Mesa (FULL_TABLE)</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isTableFree
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {isTableFree ? 'Mesa Libre' : 'Mesa Ocupada'}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  Regresa la cuenta a estado OPEN y ocupa la mesa física para seguir agregando comandas de comida.
                  Exige que la mesa {tableCode} esté actualmente libre.
                </p>
              </button>
            </div>
          </div>

          {/* Motivo de Auditoría */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700 block">
              Motivo de la Reapertura (Auditoría):
            </label>
            <textarea
              rows={3}
              placeholder="Ej. Corrección de pago en datáfono registrado erróneamente en efectivo..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 text-xs rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-stone-50 text-[11px] text-stone-500 border border-stone-200/70 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-stone-400 shrink-0 mt-0.5" />
            <span>
              Esta operación queda registrada en el registro de auditoría (`AuditEvent`) con tu usuario y marca temporal.
            </span>
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
              disabled={isSubmitting || (mode === 'FULL_TABLE' && !isTableFree)}
              className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md shadow-violet-600/20 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Reabriendo...' : 'Confirmar Reapertura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
