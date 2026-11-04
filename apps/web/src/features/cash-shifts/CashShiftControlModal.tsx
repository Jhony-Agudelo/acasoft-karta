import React, { useState } from 'react';
import {
  X,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  Clock,
  User,
  ShieldCheck,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';
import { CurrentCashShift, CashShiftHistoryItem } from './types';
import { ShiftMovementModal } from './ShiftMovementModal';
import { CloseShiftModal } from './CloseShiftModal';

interface CashShiftControlModalProps {
  isOpen: boolean;
  shift: CurrentCashShift;
  onClose: () => void;
  onShiftClosed?: (closedShift: CashShiftHistoryItem) => void;
}

export const CashShiftControlModal: React.FC<CashShiftControlModalProps> = ({
  isOpen,
  shift,
  onClose,
  onShiftClosed,
}) => {
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  if (!isOpen) return null;

  const formatCOP = (val: number | null | undefined) => {
    if (val == null) return '---';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden border border-stone-200">
          {/* Header */}
          <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-stone-900">
                    Control de Turno de Caja
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">
                    {shift.shift_code} ABIERTO
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-semibold text-stone-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {shift.opener.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatDate(shift.opened_at)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {/* Financial Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Base Inicial
                </span>
                <span className="text-base font-black text-stone-800">
                  {formatCOP(shift.opening_cash_cop)}
                </span>
              </div>

              {shift.is_blind_mode ? (
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/70 flex flex-col justify-center">
                  <div className="flex items-center gap-1 text-amber-700 font-extrabold text-[11px]">
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                    <span>Arqueo Ciego</span>
                  </div>
                  <span className="text-[10px] text-amber-600 font-semibold mt-0.5">
                    Ventas protegidas
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/70">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                    Ventas Efectivo
                  </span>
                  <span className="text-base font-black text-emerald-700">
                    {formatCOP(shift.cash_sales_cop)}
                  </span>
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/60">
                <div className="flex items-center gap-1 text-emerald-700 font-extrabold text-[10px] uppercase">
                  <ArrowDownLeft className="h-3 w-3" />
                  <span>Entradas Menores</span>
                </div>
                <span className="text-sm font-black text-emerald-800">
                  +{formatCOP(shift.cash_in_total_cop)}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/60">
                <div className="flex items-center gap-1 text-rose-700 font-extrabold text-[10px] uppercase">
                  <ArrowUpRight className="h-3 w-3" />
                  <span>Salidas Menores</span>
                </div>
                <span className="text-sm font-black text-rose-800">
                  -{formatCOP(shift.cash_out_total_cop)}
                </span>
              </div>
            </div>

            {/* Total Gaveta (solo gerentes / administradores) */}
            {!shift.is_blind_mode && (
              <div className="p-4 rounded-2xl bg-stone-900 text-white flex items-center justify-between shadow-xs">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    Saldo Teórico en Gaveta
                  </span>
                  <span className="text-xl font-black text-emerald-400">
                    {formatCOP(shift.expected_cash_cop)}
                  </span>
                </div>
                <span className="text-[10px] font-extrabold bg-stone-800 text-stone-300 px-2 py-1 rounded-lg">
                  Calculado en Vivo
                </span>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMovementModalOpen(true)}
                className="p-3 rounded-2xl bg-stone-100 hover:bg-stone-200/80 text-stone-800 text-xs font-black flex items-center justify-center gap-2 transition"
              >
                <PlusCircle className="h-4 w-4 text-orange-600" />
                <span>Registrar Entrada / Salida</span>
              </button>
              <button
                type="button"
                onClick={() => setCloseModalOpen(true)}
                className="p-3 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-black flex items-center justify-center gap-2 transition"
              >
                <Lock className="h-4 w-4 text-orange-400" />
                <span>Cerrar Turno (Arqueo)</span>
              </button>
            </div>

            {/* Movements History */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-stone-600">
                  Movimientos del Turno ({shift.movements.length})
                </span>
              </div>

              {shift.movements.length === 0 ? (
                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/60 text-center text-xs text-stone-400 font-semibold">
                  No se han registrado entradas ni salidas menores aún.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {shift.movements.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-2xl bg-stone-50 border border-stone-200/70 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`h-7 w-7 rounded-xl flex items-center justify-center shrink-0 ${
                            m.type === 'CASH_OUT'
                              ? 'bg-rose-100 text-rose-600'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}
                        >
                          {m.type === 'CASH_OUT' ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="truncate">
                          <p className="font-extrabold text-stone-800 truncate">
                            {m.reason}
                          </p>
                          <p className="text-[10px] font-semibold text-stone-400">
                            {formatDate(m.created_at)}
                            {m.reference_doc ? ` • ${m.reference_doc}` : ''}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-black shrink-0 ml-2 ${
                          m.type === 'CASH_OUT'
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {m.type === 'CASH_OUT' ? '-' : '+'}
                        {formatCOP(m.amount_cop)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Movement Modal */}
      {movementModalOpen && (
        <ShiftMovementModal
          isOpen={movementModalOpen}
          shiftId={shift.id}
          onClose={() => setMovementModalOpen(false)}
        />
      )}

      {/* Close Shift Modal */}
      {closeModalOpen && (
        <CloseShiftModal
          isOpen={closeModalOpen}
          shiftId={shift.id}
          shiftCode={shift.shift_code}
          onClose={() => setCloseModalOpen(false)}
          onSuccess={(closed) => {
            setCloseModalOpen(false);
            onShiftClosed?.(closed);
            onClose();
          }}
        />
      )}
    </>
  );
};

