import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { formatMoneyCop } from '@restaurante-saas/shared';
import { CashShiftHistoryItem } from './types';
import {
  Receipt,
  Calendar,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  ShieldCheck,
  Eye,
  X,
  FileSpreadsheet,
  Plus,
} from 'lucide-react';
import { useCashShift } from './use-cash-shift';
import { OpenShiftModal } from './OpenShiftModal';
import { CashShiftControlModal } from './CashShiftControlModal';

export const CashShiftsHistoryPage: React.FC = () => {
  const { currentBranchId } = useAuthStore();

  const getTodayStr = () => new Date().toISOString().substring(0, 10);
  const getNDaysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().substring(0, 10);
  };

  const [dateFrom, setDateFrom] = useState(getNDaysAgoStr(7));
  const [dateTo, setDateTo] = useState(getTodayStr());
  const [statusFilter, setStatusFilter] = useState<string>('CLOSED');
  const [selectedShift, setSelectedShift] = useState<CashShiftHistoryItem | null>(null);
  const { currentShift } = useCashShift();
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [controlModalVisible, setControlModalVisible] = useState(false);

  const queryKey = ['cash-shifts', 'history', currentBranchId, dateFrom, dateTo, statusFilter];

  const { data, isLoading } = useQuery<{
    data: CashShiftHistoryItem[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }>({
    queryKey,
    queryFn: async () => {
      if (!currentBranchId) return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (dateFrom) params.append('date_from', `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.append('date_to', `${dateTo}T23:59:59.999Z`);
      params.append('limit', '50');

      return apiClient.get(`/branches/${currentBranchId}/cash-shifts?${params.toString()}`);
    },
    enabled: !!currentBranchId,
  });

  const shifts = data?.data || [];

  const summary = React.useMemo(() => {
    let totalSales = 0;
    let totalDifference = 0;
    let totalIn = 0;
    let totalOut = 0;

    shifts.forEach((s) => {
      totalSales += s.cash_sales_cop || 0;
      totalDifference += s.difference_cop || 0;
      totalIn += s.cash_in_total_cop || 0;
      totalOut += s.cash_out_total_cop || 0;
    });

    return { totalSales, totalDifference, totalIn, totalOut };
  }, [shifts]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '---';
    const d = new Date(dateStr);
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <Receipt className="h-7 w-7 text-orange-600" />
            <span>Auditoría de Turnos y Arqueos de Caja</span>
          </h1>
          <p className="text-sm font-semibold text-stone-500 mt-1">
            Historial de cierres de caja, arqueos ciegos y control de discrepancias físicas
          </p>
        </div>

        <div className="flex items-center gap-3">
          {currentShift ? (
            <button
              type="button"
              onClick={() => setControlModalVisible(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <Receipt className="h-4 w-4" />
              <span>Turno Activo ({currentShift.shift_code}) — Ver Control</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpenModalVisible(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md shadow-orange-600/20 transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Abrir Nuevo Turno de Caja</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-white border border-stone-200/80 shadow-xs">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Turnos Auditados
          </span>
          <span className="text-2xl font-black text-stone-900 mt-1 block">
            {shifts.length}
          </span>
          <span className="text-[11px] font-semibold text-stone-500">
            En el periodo seleccionado
          </span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-stone-200/80 shadow-xs">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600">
            Recaudado en Efectivo
          </span>
          <span className="text-2xl font-black text-emerald-700 mt-1 block">
            {formatMoneyCop(summary.totalSales)}
          </span>
          <span className="text-[11px] font-semibold text-emerald-600">
            Ventas registradas en caja
          </span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-stone-200/80 shadow-xs">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Egresos Menores de Caja
          </span>
          <span className="text-2xl font-black text-rose-600 mt-1 block">
            -{formatMoneyCop(summary.totalOut)}
          </span>
          <span className="text-[11px] font-semibold text-stone-500">
            Pagos a proveedores y gastos
          </span>
        </div>

        <div className="p-4 rounded-3xl bg-white border border-stone-200/80 shadow-xs">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Discrepancia Neta Acumulada
          </span>
          <span
            className={`text-2xl font-black mt-1 block ${
              summary.totalDifference === 0
                ? 'text-emerald-600'
                : summary.totalDifference < 0
                ? 'text-rose-600'
                : 'text-blue-600'
            }`}
          >
            {summary.totalDifference > 0 ? '+' : ''}
            {formatMoneyCop(summary.totalDifference)}
          </span>
          <span className="text-[11px] font-semibold text-stone-500">
            {summary.totalDifference === 0
              ? 'Arqueos exactos sin faltantes'
              : summary.totalDifference < 0
              ? 'Faltante total acumulado'
              : 'Sobrante total acumulado'}
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl bg-white border border-stone-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-stone-600">
            <Calendar className="h-4 w-4 text-stone-400" />
            <span>Desde:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold text-stone-800"
            />
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-stone-600">
            <span>Hasta:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold text-stone-800"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-stone-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold text-stone-800"
          >
            <option value="CLOSED">Solo Turnos Cerrados</option>
            <option value="OPEN">Solo Turnos Abiertos</option>
            <option value="">Todos los Estados</option>
          </select>
        </div>
      </div>

      {/* Shifts History Table */}
      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200/80 text-[10px] font-black uppercase tracking-wider text-stone-500">
              <tr>
                <th className="py-3.5 px-4">Turno</th>
                <th className="py-3.5 px-4">Apertura</th>
                <th className="py-3.5 px-4">Cierre</th>
                <th className="py-3.5 px-4 text-right">Base</th>
                <th className="py-3.5 px-4 text-right">Ventas Efectivo</th>
                <th className="py-3.5 px-4 text-right">Saldo Esperado</th>
                <th className="py-3.5 px-4 text-right">Físico Contado</th>
                <th className="py-3.5 px-4 text-right">Discrepancia</th>
                <th className="py-3.5 px-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-400">
                    Cargando historial de turnos...
                  </td>
                </tr>
              ) : shifts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-400">
                    No se encontraron turnos de caja en este rango de fechas.
                  </td>
                </tr>
              ) : (
                shifts.map((shift) => {
                  const diff = shift.difference_cop ?? 0;
                  return (
                    <tr
                      key={shift.id}
                      className="hover:bg-stone-50/70 transition cursor-pointer"
                      onClick={() => setSelectedShift(shift)}
                    >
                      <td className="py-3.5 px-4 font-black text-stone-900">
                        <span className="px-2 py-0.5 rounded-lg bg-stone-100 border border-stone-200">
                          {shift.shift_code}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-stone-900">
                          {formatDate(shift.opened_at)}
                        </p>
                        <p className="text-[10px] text-stone-400 font-normal">
                          Por: {shift.opener.name}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        {shift.closed_at ? (
                          <>
                            <p className="font-bold text-stone-900">
                              {formatDate(shift.closed_at)}
                            </p>
                            <p className="text-[10px] text-stone-400 font-normal">
                              Por: {shift.closer?.name || 'Sistema'}
                            </p>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Turno Activo
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-stone-600">
                        {formatMoneyCop(shift.opening_cash_cop)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-700">
                        {formatMoneyCop(shift.cash_sales_cop)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-stone-800">
                        {shift.expected_cash_cop != null
                          ? formatMoneyCop(shift.expected_cash_cop)
                          : '---'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-stone-900">
                        {shift.declared_cash_cop != null
                          ? formatMoneyCop(shift.declared_cash_cop)
                          : '---'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {shift.status === 'CLOSED' ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                              diff === 0
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : diff < 0
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {diff === 0
                              ? 'Exacto ($0)'
                              : `${diff > 0 ? '+' : ''}${formatMoneyCop(diff)}`}
                          </span>
                        ) : (
                          <span className="text-stone-400">---</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedShift(shift);
                          }}
                          className="p-1.5 rounded-xl text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition"
                          title="Ver detalle del turno"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shift Detail Audit Modal */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-stone-200">
            <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900">
                    Detalle de Turno {selectedShift.shift_code}
                  </h3>
                  <p className="text-xs font-semibold text-stone-500">
                    Auditoría financiera y arqueo de caja
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedShift(null)}
                className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/70">
                  <span className="block text-[10px] font-bold uppercase text-stone-400">
                    Base Inicial
                  </span>
                  <span className="font-black text-stone-900 text-sm">
                    {formatMoneyCop(selectedShift.opening_cash_cop)}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/70">
                  <span className="block text-[10px] font-bold uppercase text-emerald-600">
                    Ventas en Efectivo
                  </span>
                  <span className="font-black text-emerald-700 text-sm">
                    {formatMoneyCop(selectedShift.cash_sales_cop)}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/70">
                  <span className="block text-[10px] font-bold uppercase text-stone-400">
                    Entradas Menores
                  </span>
                  <span className="font-bold text-emerald-600 text-sm">
                    +{formatMoneyCop(selectedShift.cash_in_total_cop)}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/70">
                  <span className="block text-[10px] font-bold uppercase text-stone-400">
                    Salidas Menores
                  </span>
                  <span className="font-bold text-rose-600 text-sm">
                    -{formatMoneyCop(selectedShift.cash_out_total_cop)}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-stone-900 text-white space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400 font-bold">Saldo Teórico Esperado:</span>
                  <span className="font-black text-emerald-400">
                    {selectedShift.expected_cash_cop != null
                      ? formatMoneyCop(selectedShift.expected_cash_cop)
                      : '---'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400 font-bold">Efectivo Contado Declarado:</span>
                  <span className="font-black text-white">
                    {selectedShift.declared_cash_cop != null
                      ? formatMoneyCop(selectedShift.declared_cash_cop)
                      : '---'}
                  </span>
                </div>
                <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-xs">
                  <span className="font-black text-stone-300">Diferencia de Caja:</span>
                  <span
                    className={`font-black ${
                      (selectedShift.difference_cop ?? 0) === 0
                        ? 'text-emerald-400'
                        : (selectedShift.difference_cop ?? 0) < 0
                        ? 'text-rose-400'
                        : 'text-blue-400'
                    }`}
                  >
                    {selectedShift.difference_cop != null
                      ? formatMoneyCop(selectedShift.difference_cop)
                      : '---'}
                  </span>
                </div>
              </div>

              {selectedShift.closing_notes && (
                <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/70">
                  <span className="block text-[10px] font-bold uppercase text-stone-400 mb-0.5">
                    Observaciones del Cierre
                  </span>
                  <p className="text-xs font-medium text-stone-700">
                    {selectedShift.closing_notes}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedShift(null)}
                className="px-5 py-2 rounded-2xl bg-stone-900 text-white text-xs font-black"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para apertura de turno de caja */}
      {openModalVisible && (
        <OpenShiftModal
          isOpen={openModalVisible}
          onClose={() => setOpenModalVisible(false)}
        />
      )}

      {/* Modal para control del turno activo */}
      {controlModalVisible && currentShift && (
        <CashShiftControlModal
          isOpen={controlModalVisible}
          shift={currentShift}
          onClose={() => setControlModalVisible(false)}
        />
      )}
    </div>
  );
};

