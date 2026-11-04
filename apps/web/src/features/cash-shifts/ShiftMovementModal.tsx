import React, { useState } from 'react';
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { useCashShift } from './use-cash-shift';
import {
  CashShiftMovementType,
  CashShiftMovementCategory,
} from './types';

interface ShiftMovementModalProps {
  isOpen: boolean;
  shiftId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ShiftMovementModal: React.FC<ShiftMovementModalProps> = ({
  isOpen,
  shiftId,
  onClose,
  onSuccess,
}) => {
  const { addMovement, isAddingMovement } = useCashShift();
  const [type, setType] = useState<CashShiftMovementType>('CASH_OUT');
  const [category, setCategory] = useState<CashShiftMovementCategory>('SUPPLIER_PAYMENT');
  const [amountCop, setAmountCop] = useState<number>(20000);
  const [reason, setReason] = useState<string>('');
  const [referenceDoc, setReferenceDoc] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTypeChange = (newType: CashShiftMovementType) => {
    setType(newType);
    if (newType === 'CASH_IN') {
      setCategory('CHANGE_FUND');
    } else {
      setCategory('SUPPLIER_PAYMENT');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (amountCop <= 0) {
      setErrorMsg('El monto debe ser superior a $0 COP.');
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('Debes especificar el motivo del movimiento.');
      return;
    }

    try {
      await addMovement({
        shiftId,
        dto: {
          type,
          category,
          amount_cop: amountCop,
          reason: reason.trim(),
          reference_doc: referenceDoc.trim() || undefined,
        },
      });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err.data?.message || err.message || 'Error al registrar el movimiento.',
      );
    }
  };

  const formatCOP = (val: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-2xl flex items-center justify-center ${
                type === 'CASH_OUT'
                  ? 'bg-rose-100 text-rose-600'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {type === 'CASH_OUT' ? (
                <ArrowUpRight className="h-5 w-5" />
              ) : (
                <ArrowDownLeft className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-black text-stone-900">
                Movimiento Menor de Caja
              </h3>
              <p className="text-xs font-semibold text-stone-500">
                Registra salidas (proveedores, gastos) o entradas (sencillo)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isAddingMovement}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Type Toggle Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-2xl">
            <button
              type="button"
              onClick={() => handleTypeChange('CASH_OUT')}
              className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition ${
                type === 'CASH_OUT'
                  ? 'bg-white text-rose-600 shadow-sm border border-stone-200'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>Salida (Egreso)</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('CASH_IN')}
              className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition ${
                type === 'CASH_IN'
                  ? 'bg-white text-emerald-600 shadow-sm border border-stone-200'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>Entrada (Ingreso)</span>
            </button>
          </div>

          {/* Category Dropdown */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as CashShiftMovementCategory)
              }
              className="w-full px-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
            >
              {type === 'CASH_OUT' ? (
                <>
                  <option value="SUPPLIER_PAYMENT">
                    Pago a Proveedor de Paso (cilantro, panadería, etc.)
                  </option>
                  <option value="PETTY_EXPENSE">
                    Gasto Menor Operativo (hielo, aseo, taxi)
                  </option>
                  <option value="OTHER">Otro Egreso Menor</option>
                </>
              ) : (
                <>
                  <option value="CHANGE_FUND">
                    Dotación de Cambio / Sencillo (monedas, billetes)
                  </option>
                  <option value="OTHER">Otro Ingreso Menor</option>
                </>
              )}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
              Monto en Efectivo (COP)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-black text-lg">
                $
              </span>
              <input
                type="number"
                min="100"
                step="500"
                value={amountCop}
                onChange={(e) => setAmountCop(Number(e.target.value) || 0)}
                className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-lg font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                required
              />
            </div>
            <p className="mt-1 text-xs font-bold text-stone-500">
              {formatCOP(amountCop)}
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
              Motivo o Justificación
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Pago de cilantro y limones al proveedor de paso"
              className="w-full px-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
              required
            />
          </div>

          {/* Reference doc */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
              Nº Recibo / Remisión (Opcional)
            </label>
            <input
              type="text"
              value={referenceDoc}
              onChange={(e) => setReferenceDoc(e.target.value)}
              placeholder="Ej: FAC-0492 o Recibo de caja menor"
              className="w-full px-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isAddingMovement}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-stone-600 hover:bg-stone-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isAddingMovement}
              className={`px-6 py-2.5 rounded-2xl text-white text-xs font-black shadow-md flex items-center gap-2 transition disabled:opacity-50 ${
                type === 'CASH_OUT'
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
            >
              {isAddingMovement ? (
                <span>Registrando...</span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    Registrar {type === 'CASH_OUT' ? 'Salida' : 'Entrada'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
