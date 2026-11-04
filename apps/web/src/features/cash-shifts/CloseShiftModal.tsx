import React, { useState, useMemo } from 'react';
import {
  X,
  Lock,
  Calculator,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Coins,
  Banknote,
} from 'lucide-react';
import { useCashShift } from './use-cash-shift';
import { CashShiftHistoryItem } from './types';

interface CloseShiftModalProps {
  isOpen: boolean;
  shiftId: string;
  shiftCode: string;
  onClose: () => void;
  onSuccess?: (closedShift: CashShiftHistoryItem) => void;
}

interface Denomination {
  key: string;
  label: string;
  value: number;
  type: 'BILL' | 'COIN';
}

const DENOMINATIONS: Denomination[] = [
  { key: 'b_100k', label: '$100.000', value: 100000, type: 'BILL' },
  { key: 'b_50k', label: '$50.000', value: 50000, type: 'BILL' },
  { key: 'b_20k', label: '$20.000', value: 20000, type: 'BILL' },
  { key: 'b_10k', label: '$10.000', value: 10000, type: 'BILL' },
  { key: 'b_5k', label: '$5.000', value: 5000, type: 'BILL' },
  { key: 'b_2k', label: '$2.000', value: 2000, type: 'BILL' },
  { key: 'c_1k', label: '$1.000', value: 1000, type: 'COIN' },
  { key: 'c_500', label: '$500', value: 500, type: 'COIN' },
  { key: 'c_200', label: '$200', value: 200, type: 'COIN' },
  { key: 'c_100', label: '$100', value: 100, type: 'COIN' },
  { key: 'c_50', label: '$50', value: 50, type: 'COIN' },
];

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  isOpen,
  shiftId,
  shiftCode,
  onClose,
  onSuccess,
}) => {
  const { closeShift, isClosing } = useCashShift();
  const [useCalculator, setUseCalculator] = useState<boolean>(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [manualCountedCop, setManualCountedCop] = useState<number>(0);
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const calculatorTotalCop = useMemo(() => {
    return DENOMINATIONS.reduce((acc, denom) => {
      const qty = counts[denom.key] || 0;
      return acc + qty * denom.value;
    }, 0);
  }, [counts]);

  const finalDeclaredCop = useCalculator ? calculatorTotalCop : manualCountedCop;

  const handleDenomChange = (key: string, qty: number) => {
    setCounts((prev) => ({
      ...prev,
      [key]: Math.max(0, qty),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (finalDeclaredCop < 0) {
      setErrorMsg('El efectivo contado no puede ser negativo.');
      return;
    }

    try {
      const closedShift = await closeShift({
        shiftId,
        dto: {
          declared_cash_cop: finalDeclaredCop,
          denominations_snapshot_json: useCalculator ? counts : undefined,
          closing_notes: closingNotes.trim() || undefined,
        },
      });

      onSuccess?.(closedShift);
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err.data?.message || err.message || 'Error al procesar el cierre de turno.',
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-stone-900 text-white flex items-center justify-center">
              <Lock className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-stone-900">
                  Arqueo Ciego y Cierre de Caja
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 text-[10px] font-black">
                  {shiftCode}
                </span>
              </div>
              <p className="text-xs font-semibold text-stone-500">
                Cuenta física de efectivo al finalizar el turno
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isClosing}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Blind Close Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2.5">
            <HelpCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-amber-800">Protocolo de Arqueo Ciego</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Ingresa con exactitud el dinero físico en gaveta. El sistema calculará el saldo
                teórico esperado y las posibles diferencias tras registrar el cierre.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Toggle Between Calculator and Direct Input */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
              Método de Conteo
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUseCalculator(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  useCalculator
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                <Calculator className="h-3.5 w-3.5" />
                <span>Desglose x Denominación</span>
              </button>
              <button
                type="button"
                onClick={() => setUseCalculator(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  !useCalculator
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Total Directo
              </button>
            </div>
          </div>

          {/* Denominations Grid */}
          {useCalculator ? (
            <div className="space-y-3 p-4 bg-stone-50 rounded-2xl border border-stone-200/70">
              <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                Billetes y Monedas
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {DENOMINATIONS.map((d) => (
                  <div
                    key={d.key}
                    className="flex items-center justify-between p-2 rounded-xl bg-white border border-stone-200/80 shadow-2xs"
                  >
                    <div className="flex items-center gap-1.5">
                      {d.type === 'BILL' ? (
                        <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Coins className="h-3.5 w-3.5 text-amber-600" />
                      )}
                      <span className="text-xs font-black text-stone-800">
                        {d.label}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={counts[d.key] || ''}
                      placeholder="0"
                      onChange={(e) =>
                        handleDenomChange(d.key, parseInt(e.target.value, 10) || 0)
                      }
                      className="w-16 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 text-xs font-bold text-right text-stone-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                Efectivo Total Contado (COP)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-black text-lg">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  value={manualCountedCop}
                  onChange={(e) => setManualCountedCop(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full pl-9 pr-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-xl font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                  required
                />
              </div>
            </div>
          )}

          {/* Grand Total Counter Display */}
          <div className="p-4 rounded-2xl bg-stone-900 text-white flex items-center justify-between">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
                Total Efectivo Declarado
              </span>
              <span className="text-2xl font-black text-emerald-400">
                {formatCOP(finalDeclaredCop)}
              </span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
              Observaciones de Cierre (Opcional)
            </label>
            <textarea
              rows={2}
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Ej: Faltante de $1.000 por redondeo en cambio"
              className="w-full px-4 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isClosing}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-stone-600 hover:bg-stone-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isClosing}
              className="px-6 py-2.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-black shadow-lg shadow-stone-900/20 flex items-center gap-2 transition disabled:opacity-50"
            >
              {isClosing ? (
                <span>Cerrando turno...</span>
              ) : (
                <>
                  <Lock className="h-4 w-4 text-orange-400" />
                  <span>Realizar Cierre Definitivo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

