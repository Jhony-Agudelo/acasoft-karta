import React, { useState } from 'react';
import { Receipt, AlertCircle, Plus, Lock } from 'lucide-react';
import { useCashShift } from './use-cash-shift';
import { OpenShiftModal } from './OpenShiftModal';
import { CashShiftControlModal } from './CashShiftControlModal';

export const CashShiftStatusBadge: React.FC = () => {
  const { isModuleActive, currentShift, isLoading } = useCashShift();
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [controlModalVisible, setControlModalVisible] = useState(false);

  if (!isModuleActive) return null;

  if (isLoading) {
    return (
      <div className="h-7 w-28 rounded-full bg-stone-100 animate-pulse" />
    );
  }

  return (
    <>
      {currentShift ? (
        <button
          type="button"
          onClick={() => setControlModalVisible(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black border transition bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/80 shadow-2xs cursor-pointer"
          title="Ver resumen de turno y arqueo de caja"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <Receipt className="h-3.5 w-3.5 text-emerald-600" />
          <span>{currentShift.shift_code}</span>
          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded-md bg-emerald-200/80 text-emerald-900 font-extrabold">
            Turno Abierto
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpenModalVisible(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black border transition bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100/80 shadow-2xs cursor-pointer animate-pulse"
          title="No hay turno de caja abierto para registrar pagos en efectivo"
        >
          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
          <span>Sin Turno</span>
          <span className="text-[10px] font-extrabold text-orange-600 flex items-center gap-0.5 bg-white/80 px-1.5 py-0.5 rounded-md border border-amber-200">
            <Plus className="h-3 w-3" /> Abrir
          </span>
        </button>
      )}

      {/* Modal para abrir turno */}
      {openModalVisible && (
        <OpenShiftModal
          isOpen={openModalVisible}
          onClose={() => setOpenModalVisible(false)}
        />
      )}

      {/* Modal de control y cierre de turno */}
      {controlModalVisible && currentShift && (
        <CashShiftControlModal
          isOpen={controlModalVisible}
          shift={currentShift}
          onClose={() => setControlModalVisible(false)}
        />
      )}
    </>
  );
};
