import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { useBrandStore } from '../../stores/brand.store';
import { useSseStream } from '../../hooks/use-sse-stream';
import { formatMoneyCop, TableStatus } from '@restaurante-saas/shared';
import { Link } from 'react-router-dom';
import {
  TablePlanResponse,
  DiningTableItem,
  DiningAreaItem,
  ReopenedAccountingAccountItem,
} from './types';
import { OpenAccountModal } from './OpenAccountModal';
import { WaiterOrderModal } from './WaiterOrderModal';
import { BillPreviewModal } from './BillPreviewModal';
import { ConsumptionSplitDrawer } from './ConsumptionSplitDrawer';
import { TransferTableModal } from './TransferTableModal';
import { PendingQrOrdersModal } from './PendingQrOrdersModal';
import { ReopenAccountModal } from './ReopenAccountModal';
import {
  UtensilsCrossed,
  Users,
  Plus,
  RefreshCw,
  QrCode,
  Sliders,
  Divide,
  ArrowRightLeft,
  Receipt,
  RotateCcw,
  AlertTriangle,
  KeyRound,
  Clock,
  Sparkles,
  Flame,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export const DiningFloorPlanPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId, user } = useAuthStore();
  const { settings } = useBrandStore();

  const isManager =
    user?.roleKey === 'TENANT_ADMIN' ||
    user?.roleKey === 'BRANCH_MANAGER' ||
    (user as any)?.role === 'TENANT_ADMIN' ||
    (user as any)?.role === 'BRANCH_MANAGER';

  // Filtro de área activa
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  // Estados de modales
  const [tableToOpen, setTableToOpen] = useState<DiningTableItem | null>(null);
  const [tableForOrder, setTableForOrder] = useState<DiningTableItem | null>(null);
  const [tableForBill, setTableForBill] = useState<DiningTableItem | null>(null);
  const [tableForSplit, setTableForSplit] = useState<DiningTableItem | null>(null);
  const [tableForTransfer, setTableForTransfer] = useState<DiningTableItem | null>(null);
  const [tableForPendingQr, setTableForPendingQr] = useState<DiningTableItem | null>(null);
  const [accountToReopen, setAccountToReopen] = useState<{
    id: string;
    code: string;
    tableCode: string;
    isTableFree: boolean;
  } | null>(null);

  // Conectar SSE para actualización en tiempo real del plano
  const sseUrl = currentBranchId ? `/api/v1/branches/${currentBranchId}/orders/events` : '';
  useSseStream({
    url: sseUrl,
    authMode: 'jwt',
    enabled: !!currentBranchId,
    onMessage: (event) => {
      if (
        event.type.startsWith('dining.') ||
        event.type.startsWith('orders.') ||
        event.type === 'kitchen.order_created'
      ) {
        queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
      }
    },
  });

  // Consulta del plano de mesas en vivo
  const {
    data: planData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<TablePlanResponse>({
    queryKey: ['dining-table-plan', currentBranchId],
    queryFn: () => apiClient.get(`/branches/${currentBranchId}/tables`),
    enabled: !!currentBranchId,
    refetchInterval: 12000, // Polling de respaldo cada 12s
  });

  const areas = planData?.areas || [];
  const reopenedAccounts = planData?.reopened_accounting_accounts || [];

  // Totalizadores
  const allTables = areas.flatMap((a) => a.tables);
  const totalTables = allTables.length;
  const freeTablesCount = allTables.filter((t) => t.status === 'FREE').length;
  const occupiedTablesCount = allTables.filter((t) => t.status === 'OCCUPIED').length;
  const pendingPaymentCount = allTables.filter((t) => t.status === 'PENDING_PAYMENT').length;
  const totalPendingQrOrders = allTables.reduce(
    (sum, t) => sum + (t.pending_qr_orders?.length || 0),
    0,
  );

  // Filtrar áreas y mesas
  const filteredAreas = selectedAreaId
    ? areas.filter((a) => a.id === selectedAreaId)
    : areas;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">
              Plano de Salón y Control de Mesas
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-mono">
              En Vivo (SSE)
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Gestión interactiva de mesas, apertura de cuentas, toma de comandas móviles, cobro centralizado y división de consumo.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2.5 rounded-2xl bg-white border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition shadow-xs"
            title="Refrescar plano"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-orange-600' : ''}`} />
          </button>

          {isManager && (
            <Link
              to="/admin/dining-tables"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 font-bold text-xs shadow-xs transition"
            >
              <Sliders className="h-4 w-4 text-stone-500" />
              <span>Configurar Áreas & Mesas</span>
            </Link>
          )}
        </div>
      </div>

      {/* KPI Counters Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl bg-white border border-stone-200/90 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Total Mesas
          </span>
          <div className="text-xl font-black text-stone-900 mt-0.5">
            {totalTables}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Libres
          </span>
          <div className="text-xl font-black text-emerald-800 mt-0.5">
            {freeTablesCount}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/70 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Ocupadas
          </span>
          <div className="text-xl font-black text-amber-800 mt-0.5">
            {occupiedTablesCount}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-violet-50/70 border border-violet-200/70 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
            Por Cobrar
          </span>
          <div className="text-xl font-black text-violet-800 mt-0.5">
            {pendingPaymentCount}
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl border shadow-xs transition ${
            totalPendingQrOrders > 0
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 animate-pulse'
              : 'bg-white border-stone-200/90'
          }`}
        >
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              totalPendingQrOrders > 0 ? 'text-rose-700' : 'text-stone-400'
            }`}
          >
            Pedidos QR
          </span>
          <div
            className={`text-xl font-black mt-0.5 ${
              totalPendingQrOrders > 0 ? 'text-rose-700' : 'text-stone-900'
            }`}
          >
            {totalPendingQrOrders}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/90 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Ajustes Caja
          </span>
          <div className="text-xl font-black text-stone-800 mt-0.5">
            {reopenedAccounts.length}
          </div>
        </div>
      </div>

      {/* Banner de Cuentas en Reapertura Contable (ACCOUNTING_ONLY) */}
      {reopenedAccounts.length > 0 && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-stone-50 border border-amber-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
              <RotateCcw className="h-4 w-4 text-amber-600 animate-spin" />
              <span>
                Cuentas en Reapertura Contable en Caja ({reopenedAccounts.length})
              </span>
            </div>
            <span className="text-[11px] text-amber-700">
              No ocupan la mesa física. Pendientes de corrección de cobro.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {reopenedAccounts.map((acc) => (
              <div
                key={acc.id}
                className="p-3.5 rounded-2xl bg-white border border-amber-200/80 shadow-xs flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-stone-900 text-xs">
                      Mesa {acc.table?.code || 'Salón'}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                      {acc.account_code}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 mt-1">
                    Total: <strong className="font-mono text-stone-800">{formatMoneyCop(acc.grand_total_cop)}</strong>
                    {acc.paid_total_cop > 0 && (
                      <span className="text-emerald-600 ml-1">
                        (Pagado: {formatMoneyCop(acc.paid_total_cop)})
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() =>
                    setTableForBill({
                      id: acc.table?.id,
                      code: acc.table?.code,
                      capacity: 4,
                      status: 'OCCUPIED' as any,
                      account: {
                        id: acc.id,
                        account_code: acc.account_code,
                        status: acc.status,
                        payment_status: acc.payment_status,
                        guest_count: 2,
                        table_session_pin: null,
                        grand_total_cop: acc.grand_total_cop,
                        paid_total_cop: acc.paid_total_cop,
                        uncollected_amount_cop: 0,
                        opened_at: acc.opened_at,
                        version: acc.version,
                        orders_count: 1,
                      },
                      pending_qr_orders: [],
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition"
                >
                  Gestionar en Caja
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selector de Áreas Pills */}
      {areas.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedAreaId(null)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition ${
              selectedAreaId === null
                ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}
          >
            Todas las Zonas ({totalTables})
          </button>
          {areas.map((area) => (
            <button
              key={area.id}
              onClick={() => setSelectedAreaId(area.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition ${
                selectedAreaId === area.id
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              {area.name} ({area.tables.length})
            </button>
          ))}
        </div>
      )}

      {/* PLANO DE MESAS AGRUPADO POR ÁREAS */}
      {isLoading ? (
        <div className="text-center py-20 text-stone-400 text-xs">
          Cargando plano de salón y mesas en vivo...
        </div>
      ) : areas.length === 0 ? (
        <div className="p-12 rounded-3xl bg-white border border-stone-200 text-center space-y-4">
          <UtensilsCrossed className="h-12 w-12 text-stone-300 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-stone-800">
              No hay áreas ni mesas configuradas en esta sucursal
            </h3>
            <p className="text-xs text-stone-400 max-w-md mx-auto">
              Comienza creando tus zonas de salón (ej. Salón Principal, Terraza) y añade tus mesas para habilitar comandas presenciales y autopedido QR.
            </p>
          </div>
          <Link
            to="/admin/dining-tables"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Configurar Áreas y Mesas</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredAreas.map((area) => (
            <div key={area.id} className="space-y-4">
              {/* Header de Zona */}
              <div className="flex items-center justify-between border-b border-stone-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-stone-900 text-sm">
                    {area.name}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                    {area.tables.length} mesas
                  </span>
                </div>
              </div>

              {/* Grid de Mesas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {area.tables.map((table) => {
                  const isFree = table.status === 'FREE';
                  const isOccupied = table.status === 'OCCUPIED';
                  const isPendingPayment = table.status === 'PENDING_PAYMENT';
                  const isReserved = table.status === 'RESERVED';
                  const hasPendingQr = (table.pending_qr_orders?.length || 0) > 0;
                  const account = table.account;

                  return (
                    <div
                      key={table.id}
                      onClick={() => {
                        if (isOccupied && table.account) {
                          setTableForOrder(table);
                        }
                      }}
                      className={`p-4 rounded-3xl border flex flex-col justify-between transition-all duration-200 ${
                        isFree
                          ? 'bg-white border-stone-200/90 shadow-xs hover:border-emerald-300 hover:shadow-md'
                          : isOccupied
                            ? 'bg-gradient-to-b from-white to-amber-50/30 border-amber-300/80 shadow-md ring-1 ring-amber-400/20 cursor-pointer hover:border-amber-400 hover:shadow-lg'
                            : isPendingPayment
                              ? 'bg-gradient-to-b from-white to-violet-50/40 border-violet-300/80 shadow-md ring-1 ring-violet-400/20'
                              : 'bg-white border-blue-200 shadow-xs'
                      }`}
                    >
                      {/* Top de la Tarjeta de Mesa */}
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-10 w-10 rounded-2xl font-black text-sm flex items-center justify-center shadow-xs ${
                                isFree
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : isOccupied
                                    ? 'bg-amber-500 text-white shadow-amber-500/20'
                                    : isPendingPayment
                                      ? 'bg-violet-600 text-white shadow-violet-500/20'
                                      : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {table.code}
                            </div>
                            <div>
                              <span className="font-extrabold text-stone-900 text-xs block leading-tight">
                                Mesa {table.code}
                              </span>
                              <span className="text-[10px] text-stone-400 flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {table.capacity} pers.
                              </span>
                            </div>
                          </div>

                          {/* Badge de Estado */}
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isFree
                                ? 'bg-emerald-100 text-emerald-800'
                                : isOccupied
                                  ? 'bg-amber-100 text-amber-800'
                                  : isPendingPayment
                                    ? 'bg-violet-100 text-violet-800'
                                    : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isFree
                              ? 'Libre'
                              : isOccupied
                                ? 'Ocupada'
                                : isPendingPayment
                                  ? 'Por Cobrar'
                                  : 'Reservada'}
                          </span>
                        </div>

                        {/* Badge de Alerta QR Pendiente */}
                        {hasPendingQr && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTableForPendingQr(table);
                            }}
                            className="w-full mt-3 p-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 font-extrabold text-[11px] flex items-center justify-between transition animate-pulse"
                          >
                            <span className="flex items-center gap-1.5">
                              <Flame className="h-3.5 w-3.5 text-rose-600" />
                              {table.pending_qr_orders.length} Solicitud(es) QR
                            </span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Detalle de Cuenta Activa */}
                        {account ? (
                          <div className="mt-3.5 space-y-1.5 bg-stone-50/70 p-3 rounded-2xl border border-stone-200/60">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-mono font-bold text-stone-600">
                                {account.account_code}
                              </span>
                              {account.table_session_pin && (
                                <span className="font-mono font-black text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded text-[10px] flex items-center gap-1">
                                  <KeyRound className="h-3 w-3" />
                                  PIN: {account.table_session_pin}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-stone-500">
                                {account.orders_count} comanda(s)
                              </span>
                              <span className="font-mono font-black text-sm text-stone-900">
                                {formatMoneyCop(account.grand_total_cop)}
                              </span>
                            </div>

                            {account.paid_total_cop > 0 && (
                              <div className="flex items-center justify-between text-[10px] text-emerald-700 font-medium">
                                <span>Abonado:</span>
                                <span>{formatMoneyCop(account.paid_total_cop)}</span>
                              </div>
                            )}
                          </div>
                        ) : isFree ? (
                          <div className="mt-6 text-center text-xs text-stone-400 py-1">
                            Mesa lista para recibir clientes
                          </div>
                        ) : null}
                      </div>

                      {/* Botones de Acción */}
                      <div className="mt-4 pt-3 border-t border-stone-100">
                        {isFree ? (
                          <button
                            type="button"
                            onClick={() => setTableToOpen(table)}
                            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Abrir Mesa</span>
                          </button>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTableForOrder(table);
                                }}
                                className="py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-[11px] border border-orange-200 transition"
                              >
                                + Comanda
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTableForBill(table);
                                }}
                                className="py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold text-[11px] border border-violet-200 transition"
                              >
                                Pre-Cuenta
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTableForSplit(table);
                                }}
                                className="py-1.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-600 font-bold text-[10px] border border-stone-200 flex items-center justify-center gap-1 transition"
                                title="División informativa por persona"
                              >
                                <Divide className="h-3 w-3" />
                                <span>División</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTableForTransfer(table);
                                }}
                                className="py-1.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-600 font-bold text-[10px] border border-stone-200 flex items-center justify-center gap-1 transition"
                                title="Trasladar a otra mesa libre"
                              >
                                <ArrowRightLeft className="h-3 w-3" />
                                <span>Trasladar</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL 1: ABRIR MESA */}
      {tableToOpen && currentBranchId && (
        <OpenAccountModal
          isOpen={!!tableToOpen}
          onClose={() => setTableToOpen(null)}
          branchId={currentBranchId}
          table={tableToOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
          }}
          onOpenOrderNow={(account, openedTable) => {
            queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
            setTableToOpen(null);
            setTableForOrder({
              ...openedTable,
              status: 'OCCUPIED',
              account: {
                id: account.id,
                account_code: account.account_code,
                status: 'OPEN',
                payment_status: 'PENDING',
                guest_count: account.guest_count,
                table_session_pin: account.table_session_pin,
                orders_count: 0,
                grand_total_cop: 0,
                paid_total_cop: 0,
                uncollected_amount_cop: 0,
                version: account.version || 1,
                opened_at: new Date().toISOString(),
              },
            });
          }}
        />
      )}

      {/* MODAL 2: TOMAR COMANDA */}
      {tableForOrder && tableForOrder.account && (
        <WaiterOrderModal
          isOpen={!!tableForOrder}
          onClose={() => setTableForOrder(null)}
          accountId={tableForOrder.account.id}
          tableCode={tableForOrder.code}
          accountCode={tableForOrder.account.account_code}
          accountVersion={tableForOrder.account.version}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
          }}
        />
      )}

      {/* MODAL 3: PRE-CUENTA Y COBRO */}
      {tableForBill && tableForBill.account && (
        <BillPreviewModal
          isOpen={!!tableForBill}
          onClose={() => setTableForBill(null)}
          accountId={tableForBill.account.id}
          tableCode={tableForBill.code}
          onOpenSplitDrawer={() => {
            const current = tableForBill;
            setTableForBill(null);
            setTableForSplit(current);
          }}
          onOpenTransferModal={() => {
            const current = tableForBill;
            setTableForBill(null);
            setTableForTransfer(current);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
          }}
        />
      )}

      {/* CAJÓN 4: DIVISIÓN INFORMATIVA POR PERSONA */}
      {tableForSplit && tableForSplit.account && (
        <ConsumptionSplitDrawer
          isOpen={!!tableForSplit}
          onClose={() => setTableForSplit(null)}
          accountId={tableForSplit.account.id}
          tableCode={tableForSplit.code}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
          }}
        />
      )}

      {/* MODAL 5: TRASLADAR MESA */}
      {tableForTransfer && tableForTransfer.account && currentBranchId && (
        <TransferTableModal
          isOpen={!!tableForTransfer}
          onClose={() => setTableForTransfer(null)}
          accountId={tableForTransfer.account.id}
          currentTableCode={tableForTransfer.code}
          accountVersion={tableForTransfer.account.version}
          branchId={currentBranchId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
          }}
        />
      )}

      {/* MODAL 6: SOLICITUDES QR PENDIENTES */}
      {tableForPendingQr && (
        <PendingQrOrdersModal
          isOpen={!!tableForPendingQr}
          onClose={() => setTableForPendingQr(null)}
          pendingOrders={tableForPendingQr.pending_qr_orders}
          tableCode={tableForPendingQr.code}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
          }}
        />
      )}

      {/* MODAL 7: REAPERTURA DE CUENTA (Manager) */}
      {accountToReopen && (
        <ReopenAccountModal
          isOpen={!!accountToReopen}
          onClose={() => setAccountToReopen(null)}
          accountId={accountToReopen.id}
          accountCode={accountToReopen.code}
          tableCode={accountToReopen.tableCode}
          isTableFree={accountToReopen.isTableFree}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dining-table-plan', currentBranchId] });
          }}
        />
      )}
    </div>
  );
};
