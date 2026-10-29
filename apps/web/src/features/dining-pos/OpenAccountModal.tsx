import React, { useState } from 'react';
import { apiClient } from '../../services/api-client';
import { DiningTableItem } from './types';
import {
  X,
  Users,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

interface OpenAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  table: DiningTableItem | null;
  onSuccess: () => void;
  onOpenOrderNow?: (account: any, table: DiningTableItem) => void;
}

export const OpenAccountModal: React.FC<OpenAccountModalProps> = ({
  isOpen,
  onClose,
  branchId,
  table,
  onSuccess,
  onOpenOrderNow,
}) => {
  const [guestCount, setGuestCount] = useState<number>(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] = useState<{
    id: string;
    account_code: string;
    table_session_pin: string;
    version: number;
    guest_count: number;
  } | null>(null);

  if (!isOpen || !table) return null;

  const handleOpenAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await apiClient.post(`/branches/${branchId}/accounts`, {
        table_id: table.id,
        guest_count: guestCount,
      });

      setCreatedAccount({
        id: res.id,
        account_code: res.account_code,
        table_session_pin: res.table_session_pin,
        version: res.version || 1,
        guest_count: res.guest_count || guestCount,
      });
      onSuccess();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'No se pudo abrir la cuenta para esta mesa.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = () => {
    setCreatedAccount(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/60">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black">
              {table.code}
            </div>
            <div>
              <h3 className="font-extrabold text-stone-900 text-base">
                Abrir Mesa {table.code}
              </h3>
              <p className="text-xs text-stone-500">
                Capacidad estándar: {table.capacity} comensales
              </p>
            </div>
          </div>
          <button
            onClick={createdAccount ? handleDone : onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {createdAccount ? (
            <div className="text-center py-4 space-y-5">
              <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20">
                <CheckCircle2 className="h-9 w-9" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-black text-stone-900">
                  ¡Mesa Abierta con Éxito!
                </h4>
                <p className="text-xs text-stone-500">
                  Cuenta creada: <span className="font-mono font-bold text-stone-800">{createdAccount.account_code}</span>
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 space-y-2">
                <div className="flex items-center justify-center gap-2 text-amber-800 text-xs font-bold">
                  <KeyRound className="h-4 w-4" />
                  <span>PIN de Autopedido en Mesa</span>
                </div>
                <div className="text-3xl font-black font-mono tracking-widest text-amber-900">
                  {createdAccount.table_session_pin}
                </div>
                <p className="text-[11px] text-amber-700">
                  Los comensales pueden usar este código de 4 dígitos si escanean el QR de la mesa.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                {onOpenOrderNow && (
                  <button
                    type="button"
                    onClick={() => {
                      const acc = createdAccount;
                      setCreatedAccount(null);
                      onClose();
                      onOpenOrderNow(acc, table);
                    }}
                    className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md shadow-orange-600/20 flex items-center justify-center gap-2 transition"
                  >
                    <UtensilsCrossed className="h-4 w-4" />
                    <span>Tomar Comanda Inmediatamente</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDone}
                  className="w-full py-2.5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 font-bold text-xs transition"
                >
                  Volver al Salón
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleOpenAccount} className="space-y-6">
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Selector de Comensales */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-orange-600" />
                  <span>Número de Comensales Iniciales</span>
                </label>

                {/* Botones predefinidos */}
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 4, 6, 8].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setGuestCount(num)}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${
                        guestCount === num
                          ? 'bg-orange-50 border-orange-500 text-orange-600 ring-2 ring-orange-500/20'
                          : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      {num} {num === 1 ? 'pers.' : 'pers.'}
                    </button>
                  ))}
                </div>

                {/* Input manual */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setGuestCount((c) => Math.max(1, c - 1))}
                    className="h-10 w-10 rounded-xl border border-stone-200 bg-stone-50 font-bold text-stone-700 hover:bg-stone-100 flex items-center justify-center text-lg"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={guestCount}
                    onChange={(e) => setGuestCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 text-center font-mono font-bold text-stone-900 text-base h-10 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setGuestCount((c) => Math.min(50, c + 1))}
                    className="h-10 w-10 rounded-xl border border-stone-200 bg-stone-50 font-bold text-stone-700 hover:bg-stone-100 flex items-center justify-center text-lg"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 text-[11px] text-stone-600 space-y-1">
                <p className="font-bold text-stone-800 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Operación de Salón Segura
                </p>
                <p>
                  Al abrir la mesa, el sistema generará automáticamente el código de cuenta y un PIN de 4 dígitos para permitir pedidos QR seguros desde la mesa.
                </p>
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
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Abriendo mesa...' : 'Abrir Mesa'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
