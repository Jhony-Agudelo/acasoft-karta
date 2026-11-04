import React, { useState } from 'react';
import { X, DollarSign, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { useCashShift } from './use-cash-shift';

interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  branchId?: string;
}

const PRESET_AMOUNTS = [50000, 100000, 150000, 200000];

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  branchId,
}) => {
  const { openShift, isOpening } = useCashShift(branchId);
  const [openingCashCop, setOpeningCashCop] = useState<number>(100000);
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (openingCashCop < 0) {
      setErrorMsg('La base inicial no puede ser negativa.');
      return;
    }

    try {
      await openShift({
        opening_cash_cop: openingCashCop,
        notes: notes.trim() || undefined,
        targetBranchId: branchId,
      });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const msg =
        err?.data?.message ||
        (Array.isArray(err?.data?.errors)
          ? err.data.errors.map((e: any) => e.message).join(', ')
          : null) ||
        err?.message ||
        'Error al aperturar el turno de caja.';
      setErrorMsg(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const formatCOP = (val: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-stone-900">Apertura de Turno</h3>
              <p className="text-xs font-semibold text-stone-500">
                Ingresa la base inicial en efectivo para iniciar caja
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isOpening}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Opening Cash Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">
              Base Inicial de Efectivo (COP)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-black text-lg">
                $
              </span>
              <input
                type="number"
                min="0"
                step="1000"
                value={openingCashCop}
                onChange={(e) => setOpeningCashCop(Number(e.target.value) || 0)}
                placeholder="100.000"
                className="w-full pl-9 pr-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-xl font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                required
              />
            </div>
            <p className="mt-1.5 text-xs font-bold text-orange-600">
              {formatCOP(openingCashCop)}
            </p>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="block text-[11px] font-bold text-stone-400 mb-1.5">
              Valores sugeridos:
            </span>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setOpeningCashCop(amt)}
                  className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                    openingCashCop === amt
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                      : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  ${amt / 1000}k
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">
              Observaciones de Apertura (Opcional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Base compuesta por 10 billetes de 10k"
              className="w-full px-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isOpening}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-stone-600 hover:bg-stone-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isOpening}
              className="px-6 py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md shadow-orange-600/20 flex items-center gap-2 transition disabled:opacity-50"
            >
              {isOpening ? (
                <span>Abriendo turno...</span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirmar y Abrir Turno</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

