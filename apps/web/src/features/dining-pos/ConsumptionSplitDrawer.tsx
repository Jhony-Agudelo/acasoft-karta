import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import {
  calculateConsumptionSplit,
  CalculatedDinerSummary,
  ConsumptionSplitRule,
  formatMoneyCop,
} from '@restaurante-saas/shared';
import {
  printThermalContent,
  formatDiningPreCuentaText,
} from '../../services/print-receipt';
import { useBrandStore } from '../../stores/brand.store';
import {
  X,
  Users,
  Plus,
  Trash2,
  Printer,
  Save,
  CheckCircle2,
  AlertCircle,
  Divide,
  Sparkles,
} from 'lucide-react';

interface ConsumptionSplitDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  tableCode: string;
  onSuccess?: () => void;
}

interface DinerEntry {
  id: string;
  label: string;
  sort_order: number;
}

interface AssignmentEntry {
  diner_id: string;
  order_item_id: string;
  share_units: number;
  total_item_shares: number;
}

export const ConsumptionSplitDrawer: React.FC<ConsumptionSplitDrawerProps> = ({
  isOpen,
  onClose,
  accountId,
  tableCode,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { settings } = useBrandStore();

  const [diners, setDiners] = useState<DinerEntry[]>([]);
  const [assignments, setAssignments] = useState<AssignmentEntry[]>([]);
  const [splitRule, setSplitRule] = useState<ConsumptionSplitRule>('PROPORTIONAL');
  const [accountVersion, setAccountVersion] = useState<number>(1);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cargar datos de la distribución actual del backend
  const { data: serverData, isLoading } = useQuery({
    queryKey: ['dining-consumption-distribution', accountId],
    queryFn: () => apiClient.get(`/accounts/${accountId}/consumption-distribution`),
    enabled: isOpen && !!accountId,
  });

  // Cargar detalle completo de la cuenta (para imprimir pre-cuenta)
  const { data: accountDetail } = useQuery({
    queryKey: ['dining-account-detail', accountId],
    queryFn: () => apiClient.get(`/accounts/${accountId}`),
    enabled: isOpen && !!accountId,
  });

  // Inicializar estado local cuando llegan datos del servidor
  useEffect(() => {
    if (serverData) {
      setAccountVersion(serverData.account_version);
      setSplitRule(serverData.split_rule || 'PROPORTIONAL');

      if (serverData.diners && serverData.diners.length > 0) {
        setDiners(
          serverData.diners.map((d: any, idx: number) => ({
            id: d.id || `diner-${idx + 1}`,
            label: d.label,
            sort_order: d.sort_order || idx + 1,
          })),
        );
      } else {
        const count = accountDetail?.guest_count || 2;
        const initialDiners: DinerEntry[] = Array.from({ length: count }, (_, i) => ({
          id: `diner-${i + 1}`,
          label: `Persona ${i + 1}`,
          sort_order: i + 1,
        }));
        setDiners(initialDiners);
      }

      if (serverData.assignments) {
        setAssignments(
          serverData.assignments.map((a: any) => ({
            diner_id: a.diner_id,
            order_item_id: a.order_item_id,
            share_units: a.share_units,
            total_item_shares: a.total_item_shares,
          })),
        );
      }
    }
  }, [serverData, accountDetail]);

  const items = useMemo(() => serverData?.items || [], [serverData]);

  // Cálculo reactivo puro e instantáneo de la distribución
  const liveCalculation = useMemo(() => {
    if (!serverData || !items.length) {
      return {
        assignments: [],
        diners: [] as CalculatedDinerSummary[],
        unassigned_amount_cop: 0,
        grand_total_cop: 0,
        is_balanced: true,
      };
    }

    return calculateConsumptionSplit({
      items,
      diners,
      assignments,
      discount_total_cop: accountDetail?.discount_total_cop || 0,
      tip_cop: accountDetail?.tip_cop || 0,
      grand_total_cop: accountDetail?.grand_total_cop || 0,
      split_rule: splitRule,
    });
  }, [serverData, items, diners, assignments, accountDetail, splitRule]);

  if (!isOpen) return null;

  // Gestión de comensales
  const addDiner = () => {
    const nextNum = diners.length + 1;
    setDiners((prev) => [
      ...prev,
      { id: `diner-${nextNum}-${Date.now()}`, label: `Persona ${nextNum}`, sort_order: nextNum },
    ]);
  };

  const removeDiner = (index: number) => {
    if (diners.length <= 1) return;
    const removed = diners[index];
    if (!removed) return;
    const newDiners = diners.filter((_, i) => i !== index);
    setDiners(newDiners);
    setAssignments((prev) => prev.filter((a) => a.diner_id !== removed.id));
  };

  const updateDinerLabel = (index: number, newLabel: string) => {
    setDiners((prev) =>
      prev.map((d, i) => (i === index ? { ...d, label: newLabel } : d)),
    );
  };

  // Asignación de ítems
  const assignItemEquallyToAll = (itemId: string) => {
    const totalDiners = diners.length;
    if (totalDiners === 0) return;

    const filtered = assignments.filter((a) => a.order_item_id !== itemId);
    const newAssignments: AssignmentEntry[] = diners.map((d) => ({
      diner_id: d.id,
      order_item_id: itemId,
      share_units: 1,
      total_item_shares: totalDiners,
    }));

    setAssignments([...filtered, ...newAssignments]);
  };

  const toggleItemForDiner = (itemId: string, dinerId: string) => {
    const currentForItem = assignments.filter((a) => a.order_item_id === itemId);
    const exists = currentForItem.find((a) => a.diner_id === dinerId);

    let updatedForItem: AssignmentEntry[];
    if (exists) {
      updatedForItem = currentForItem.filter((a) => a.diner_id !== dinerId);
    } else {
      updatedForItem = [
        ...currentForItem,
        {
          diner_id: dinerId,
          order_item_id: itemId,
          share_units: 1,
          total_item_shares: currentForItem.length + 1,
        },
      ];
    }

    const newTotal = updatedForItem.length;
    updatedForItem = updatedForItem.map((a) => ({
      ...a,
      share_units: 1,
      total_item_shares: newTotal,
    }));

    setAssignments([
      ...assignments.filter((a) => a.order_item_id !== itemId),
      ...updatedForItem,
    ]);
  };

  const clearItemAssignments = (itemId: string) => {
    setAssignments(assignments.filter((a) => a.order_item_id !== itemId));
  };

  // Guardar en el servidor
  const handleSaveDistribution = async () => {
    setFeedback(null);
    try {
      const payload = {
        expected_account_version: accountVersion,
        split_rule: splitRule,
        diners: diners.map((d, idx) => ({
          id: d.id.startsWith('diner-') ? undefined : d.id,
          label: d.label,
          sort_order: idx + 1,
        })),
        assignments: assignments.map((a) => {
          const matchedDiner = diners.find((d) => d.id === a.diner_id);
          return {
            diner_label_or_id: matchedDiner?.label || a.diner_id,
            order_item_id: a.order_item_id,
            share_units: a.share_units,
            total_item_shares: a.total_item_shares,
          };
        }),
      };

      const res = await apiClient.put(
        `/accounts/${accountId}/consumption-distribution`,
        payload,
      );

      if (res.account_version) {
        setAccountVersion(res.account_version);
      }

      setFeedback({
        type: 'success',
        message: 'Distribución informativa guardada y conciliada exitosamente.',
      });
      queryClient.invalidateQueries({ queryKey: ['dining-consumption-distribution', accountId] });
      queryClient.invalidateQueries({ queryKey: ['dining-account-detail', accountId] });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.message ||
          err?.message ||
          'Error al guardar la distribución.',
      });
    }
  };

  // Imprimir pre-cuenta térmica con desglose
  const handlePrintReceipt = () => {
    if (!accountDetail) return;

    const receiptContent = formatDiningPreCuentaText({
      restaurantName: settings.display_name || 'Karta Bistro',
      branchName: accountDetail.branch?.name || 'Sede Principal',
      branchAddress: accountDetail.branch?.address,
      branchPhone: accountDetail.branch?.phone,
      tableCode: tableCode,
      accountCode: accountDetail.account_code,
      guestCount: diners.length,
      openedAt: accountDetail.opened_at,
      items: items.map((it: any) => ({
        name: it.product_name || 'Producto',
        quantity: 1,
        unitPriceCop: it.line_total_cop,
        lineTotalCop: it.line_total_cop,
      })),
      subtotalProductsCop: accountDetail.subtotal_products_cop,
      discountTotalCop: accountDetail.discount_total_cop,
      tipCop: accountDetail.tip_cop,
      grandTotalCop: accountDetail.grand_total_cop,
      paidTotalCop: accountDetail.paid_total_cop,
      dinerDistribution: {
        splitRule,
        diners: liveCalculation.diners.map((dt: CalculatedDinerSummary) => ({
          label: dt.label,
          subtotalItemsCop: dt.subtotal_items_cop,
          discountShareCop: dt.discount_share_cop,
          tipShareCop: dt.tip_share_cop,
          totalCop: dt.diner_total_cop,
        })),
        unassignedAmountCop: liveCalculation.unassigned_amount_cop,
      },
    });

    printThermalContent({ content: receiptContent, width: '80mm' });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/60 backdrop-blur-xs transition-opacity">
      <div className="w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-slide-left">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Divide className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-stone-900 text-base">
                  Distribución Informativa — Mesa {tableCode}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-mono">
                  v{accountVersion}
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Calcula cuánto debe pagar cada persona sin dividir la cuenta legal ni alterar el cobro en caja.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center gap-2 shrink-0 ${
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

        {/* Drawer Body Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="text-center py-12 text-stone-400 text-xs">
              Cargando distribución de comensales...
            </div>
          ) : (
            <>
              {/* Sección 1: Comensales Registrados */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <Users className="h-4 w-4 text-orange-600" />
                    <span>Comensales ({diners.length})</span>
                  </label>
                  <button
                    type="button"
                    onClick={addDiner}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-600 font-bold text-xs border border-orange-200 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Agregar Comensal</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {diners.map((diner, idx) => (
                    <div
                      key={diner.id}
                      className="flex items-center gap-2 p-2 rounded-xl bg-stone-50 border border-stone-200"
                    >
                      <input
                        type="text"
                        value={diner.label}
                        onChange={(e) => updateDinerLabel(idx, e.target.value)}
                        className="flex-1 text-xs font-bold text-stone-800 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-orange-400 rounded px-1"
                      />
                      {diners.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDiner(idx)}
                          className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Eliminar comensal"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sección 2: Regla de Descuentos y Propina */}
              <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200/80 space-y-2">
                <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Distribución de Descuentos y Propina Voluntaria:</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSplitRule('PROPORTIONAL')}
                    className={`p-2.5 rounded-xl text-left text-xs font-bold border transition ${
                      splitRule === 'PROPORTIONAL'
                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <div>Proporcional</div>
                    <div className="text-[10px] font-normal opacity-90 mt-0.5">
                      Al consumo de cada uno
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitRule('EQUAL')}
                    className={`p-2.5 rounded-xl text-left text-xs font-bold border transition ${
                      splitRule === 'EQUAL'
                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <div>Partes Iguales</div>
                    <div className="text-[10px] font-normal opacity-90 mt-0.5">
                      Dividido entre todos
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitRule('UNASSIGNED')}
                    className={`p-2.5 rounded-xl text-left text-xs font-bold border transition ${
                      splitRule === 'UNASSIGNED'
                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <div>Sin Asignar</div>
                    <div className="text-[10px] font-normal opacity-90 mt-0.5">
                      Quedan en total general
                    </div>
                  </button>
                </div>
              </div>

              {/* Sección 3: Asignación de Ítems */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                    Platos y Bebidas Pedidos ({items.length})
                  </label>
                  <span className="text-[11px] text-stone-500">
                    Marca quién consumió cada ítem
                  </span>
                </div>

                <div className="space-y-2.5">
                  {items.map((item: any) => {
                    const itemAssignments = assignments.filter(
                      (a) => a.order_item_id === item.id,
                    );
                    const isAll =
                      itemAssignments.length === diners.length && diners.length > 0;

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-2xl bg-white border border-stone-200/90 shadow-xs space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h5 className="font-extrabold text-stone-900 text-xs">
                              {item.product_name || 'Ítem de Comanda'}
                            </h5>
                            <span className="text-[11px] font-mono text-stone-500 font-bold">
                              {formatMoneyCop(item.line_total_cop)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => assignItemEquallyToAll(item.id)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                                isAll
                                  ? 'bg-orange-50 text-orange-600 border-orange-300'
                                  : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                              }`}
                            >
                              Dividir entre todos
                            </button>
                            {itemAssignments.length > 0 && (
                              <button
                                type="button"
                                onClick={() => clearItemAssignments(item.id)}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold text-stone-400 hover:text-rose-600 transition"
                              >
                                Limpiar
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Botones de comensales individuales */}
                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-stone-100">
                          {diners.map((diner) => {
                            const isAssigned = itemAssignments.some(
                              (a) => a.diner_id === diner.id,
                            );

                            return (
                              <button
                                key={diner.id}
                                type="button"
                                onClick={() => toggleItemForDiner(item.id, diner.id)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                                  isAssigned
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                                    : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'
                                }`}
                              >
                                {isAssigned ? '✓ ' : '+ '}
                                {diner.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sección 4: Resumen y Conciliación por Persona */}
              <div className="p-5 rounded-2xl bg-stone-900 text-white space-y-4 shadow-lg">
                <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <h4 className="font-extrabold text-xs uppercase tracking-wider text-stone-200">
                      Resumen Conciliado por Persona
                    </h4>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      liveCalculation.unassigned_amount_cop === 0
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {liveCalculation.unassigned_amount_cop === 0
                      ? '100% Cuadrado al Peso'
                      : `Por asignar: ${formatMoneyCop(liveCalculation.unassigned_amount_cop)}`}
                  </span>
                </div>

                <div className="space-y-2">
                  {liveCalculation.diners.map((dt: CalculatedDinerSummary) => (
                    <div
                      key={dt.diner_id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-stone-800/80 border border-stone-700 text-xs"
                    >
                      <div>
                        <div className="font-extrabold text-stone-100">
                          {dt.label}
                        </div>
                        <div className="text-[10px] text-stone-400 flex items-center gap-2 mt-0.5">
                          <span>Consumo: {formatMoneyCop(dt.subtotal_items_cop)}</span>
                          {dt.tip_share_cop > 0 && (
                            <span className="text-amber-400">
                              +Prop: {formatMoneyCop(dt.tip_share_cop)}
                            </span>
                          )}
                          {dt.discount_share_cop > 0 && (
                            <span className="text-emerald-400">
                              -Desc: {formatMoneyCop(dt.discount_share_cop)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-black text-sm text-amber-400">
                          {formatMoneyCop(dt.diner_total_cop)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {liveCalculation.unassigned_amount_cop > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-stone-800 text-xs text-stone-400">
                    <span>Monto sin asignar a comensal:</span>
                    <span className="font-mono font-bold text-amber-400">
                      {formatMoneyCop(liveCalculation.unassigned_amount_cop)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-stone-800 text-xs font-bold">
                  <span className="text-stone-300">Total General de la Cuenta:</span>
                  <span className="font-mono font-black text-base text-white">
                    {formatMoneyCop(accountDetail?.grand_total_cop || 0)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handlePrintReceipt}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold text-xs transition"
          >
            <Printer className="h-4 w-4 text-stone-500" />
            <span>Imprimir Pre-Cuenta con Desglose</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-bold text-xs hover:bg-stone-50 transition"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSaveDistribution}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/25 transition"
            >
              <Save className="h-4 w-4" />
              <span>Guardar Distribución</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
