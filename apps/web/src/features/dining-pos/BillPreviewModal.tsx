import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { formatMoneyCop } from '@restaurante-saas/shared';
import {
  printThermalContent,
  formatDiningPreCuentaText,
  formatDiningPaymentReceiptText,
} from '../../services/print-receipt';
import { useBrandStore } from '../../stores/brand.store';
import { useAuthStore } from '../../stores/auth.store';
import { DiningAccountDetail } from './types';
import { OpenShiftModal } from '../cash-shifts/OpenShiftModal';
import { useCashShift } from '../cash-shifts/use-cash-shift';
import { ElectronicInvoiceModal } from '../invoicing/ElectronicInvoiceModal';
import {
  X,
  Plus,
  Printer,
  CreditCard,
  Banknote,
  Divide,
  ArrowRightLeft,
  AlertCircle,
  CheckCircle2,
  Receipt,
  FileText,
  Clock,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';

interface BillPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  tableCode: string;
  onOpenSplitDrawer: () => void;
  onOpenTransferModal: () => void;
  onSuccess: () => void;
}

export const BillPreviewModal: React.FC<BillPreviewModalProps> = ({
  isOpen,
  onClose,
  accountId,
  tableCode,
  onOpenSplitDrawer,
  onOpenTransferModal,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { settings } = useBrandStore();
  const { user } = useAuthStore();
  const isManager =
    user?.roleKey === 'TENANT_ADMIN' ||
    user?.roleKey === 'BRANCH_MANAGER' ||
    (user as any)?.role === 'TENANT_ADMIN' ||
    (user as any)?.role === 'BRANCH_MANAGER';

  // Solo roles de Caja y Administración tienen potestad para registrar cobros
  const canRecordPayment =
    user?.roleKey === 'CASHIER' ||
    user?.roleKey === 'BRANCH_MANAGER' ||
    user?.roleKey === 'TENANT_ADMIN' ||
    user?.roleKey === 'PLATFORM_ADMIN' ||
    (user as any)?.role === 'CASHIER' ||
    (user as any)?.role === 'BRANCH_MANAGER' ||
    (user as any)?.role === 'TENANT_ADMIN' ||
    (user as any)?.role === 'PLATFORM_ADMIN';

  // Formulario de Pre-cuenta
  const [tipCop, setTipCop] = useState<number>(0);
  const [discountTotalCop, setDiscountTotalCop] = useState<number>(0);
  const [isUpdatingBill, setIsUpdatingBill] = useState(false);

  // Formulario de Cobro
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'POS_TERMINAL' | 'MANUAL_TRANSFER'>('CASH');
  const [paymentAmountCop, setPaymentAmountCop] = useState<number>(0);
  const [cashReceivedCop, setCashReceivedCop] = useState<number | ''>('');
  const [paymentReference, setPaymentReference] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [lastPaymentInfo, setLastPaymentInfo] = useState<any | null>(null);
  const [thermalWidth, setThermalWidth] = useState<'80mm' | '58mm'>(() => {
    try {
      const saved = localStorage.getItem('karta_pos_thermal_paper_width');
      return saved === '58mm' || saved === '80mm' ? saved : '80mm';
    } catch {
      return '80mm';
    }
  });

  const handleSetThermalWidth = (width: '80mm' | '58mm') => {
    setThermalWidth(width);
    try {
      localStorage.setItem('karta_pos_thermal_paper_width', width);
    } catch {
      // ignore
    }
  };

  // Formulario de Cierre Especial
  const [showSpecialClose, setShowSpecialClose] = useState(false);
  const [resolutionType, setResolutionType] = useState<'COURTESY' | 'WRITTEN_OFF'>('COURTESY');
  const [resolutionReason, setResolutionReason] = useState('');
  const [isClosingSpecial, setIsClosingSpecial] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  // Consulta de la cuenta
  const {
    data: account,
    isLoading,
    refetch,
  } = useQuery<DiningAccountDetail>({
    queryKey: ['dining-account-detail', accountId],
    queryFn: () => apiClient.get(`/accounts/${accountId}`),
    enabled: isOpen && !!accountId,
  });

  // Estado del turno de caja para la sucursal de la cuenta
  const { currentShift, isModuleActive: isCashShiftModuleActive } = useCashShift(account?.branch_id);

  // Inicializar propina y descuento
  useEffect(() => {
    if (account) {
      setTipCop(account.tip_cop || 0);
      setDiscountTotalCop(account.discount_total_cop || 0);
      const pending = Math.max(0, account.grand_total_cop - account.paid_total_cop);
      setPaymentAmountCop(pending);
    }
  }, [account]);

  if (!isOpen) return null;

  const pendingBalanceCop = account
    ? Math.max(0, account.grand_total_cop - account.paid_total_cop)
    : 0;

  // Cálculo de cambio en efectivo
  const cashChangeCop =
    paymentMethod === 'CASH' && typeof cashReceivedCop === 'number' && cashReceivedCop >= paymentAmountCop
      ? cashReceivedCop - paymentAmountCop
      : 0;

  // Actualizar pre-cuenta (Propina / Descuento)
  const handleUpdateBillPreview = async () => {
    if (!account) return;
    setFeedback(null);
    setIsUpdatingBill(true);

    try {
      await apiClient.patch(`/accounts/${accountId}/bill-preview`, {
        expected_account_version: account.version,
        discount_total_cop: discountTotalCop,
        tip_cop: tipCop,
      });

      setFeedback({
        type: 'success',
        message: 'Pre-cuenta actualizada y mesa pasada a estado Por Cobrar.',
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      onSuccess();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.message ||
          err?.message ||
          'Error al actualizar pre-cuenta.',
      });
    } finally {
      setIsUpdatingBill(false);
    }
  };

  // Registrar cobro manual
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || paymentAmountCop <= 0) return;
    setFeedback(null);
    setIsSubmittingPayment(true);

    try {
      const idempotencyKey = crypto.randomUUID();
      const payload: any = {
        expected_account_version: account.version,
        idempotency_key: idempotencyKey,
        method: paymentMethod,
        amount_cop: paymentAmountCop,
        reference: paymentReference.trim() || undefined,
      };

      if (paymentMethod === 'CASH' && typeof cashReceivedCop === 'number' && cashReceivedCop > 0) {
        payload.cash_tendered_cop = cashReceivedCop;
        payload.cash_received_cop = cashReceivedCop;
        payload.cash_change_cop = cashChangeCop;
      }

      const res = await apiClient.post(
        `/accounts/${accountId}/payments/manual`,
        payload,
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
            'x-idempotency-key': idempotencyKey,
          },
        },
      );

      const record = {
        id: res.payment?.id || idempotencyKey,
        method: paymentMethod,
        amountCop: paymentAmountCop,
        cashReceivedCop: typeof cashReceivedCop === 'number' ? cashReceivedCop : null,
        cashChangeCop: cashChangeCop,
        reference: paymentReference.trim() || null,
        paidAt: new Date(),
        isClosed: res.account?.status === 'CLOSED',
      };
      setLastPaymentInfo(record);

      setPaymentReference('');
      setCashReceivedCop('');

      if (res.account?.status === 'CLOSED') {
        setFeedback({
          type: 'success',
          message: `¡Mesa ${tableCode} pagada al 100%! La cuenta ha sido cerrada. Puedes imprimir el comprobante de pago abajo.`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `Abono de ${formatMoneyCop(paymentAmountCop)} registrado exitosamente para Mesa ${tableCode}.`,
        });
      }

      refetch();
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      onSuccess();
    } catch (err: any) {
      const errorCode = err?.data?.errorCode || err?.response?.data?.errorCode;
      if (errorCode === 'OPEN_CASH_SHIFT_REQUIRED') {
        setFeedback({
          type: 'error',
          message: 'Se requiere un turno de caja abierto para registrar pagos en efectivo. Por favor abre el turno primero.',
        });
        setOpenShiftModalOpen(true);
        return;
      }

      const fieldErrors = err?.response?.data?.errors;
      let errorMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Error al registrar el pago.';

      if (fieldErrors && typeof fieldErrors === 'object') {
        const details = Object.entries(fieldErrors)
          .map(([field, errs]: [string, any]) => `${field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
          .join(' | ');
        if (details) {
          errorMsg = `${errorMsg} (${details})`;
        }
      }

      setFeedback({
        type: 'error',
        message: errorMsg,
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Anular pago (Manager)
  const handleVoidPayment = async (paymentId: string) => {
    if (!window.confirm('¿Estás seguro de anular este cobro registrado?')) return;
    setFeedback(null);

    try {
      await apiClient.post(`/payments/${paymentId}/void`, {
        reason: 'Anulación autorizada en caja de salón',
      });
      setFeedback({ type: 'success', message: 'Cobro anulado correctamente.' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      onSuccess();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.message || err?.message || 'Error al anular cobro.',
      });
    }
  };

  // Cierre especial (Cortesía o Saldo Incobrable)
  const handleSpecialClose = async () => {
    if (!account || !resolutionReason.trim()) {
      alert('Debes ingresar el motivo de la resolución especial.');
      return;
    }
    setFeedback(null);
    setIsClosingSpecial(true);

    try {
      await apiClient.post(`/accounts/${accountId}/close`, {
        expected_account_version: account.version,
        resolution_type: resolutionType,
        reason: resolutionReason.trim(),
      });

      setFeedback({
        type: 'success',
        message: `Cuenta cerrada exitosamente bajo resolución ${resolutionType}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.message ||
          err?.message ||
          'No se pudo realizar el cierre con resolución.',
      });
    } finally {
      setIsClosingSpecial(false);
    }
  };

  // Helper para extraer nombre y variante real del producto
  const getItemDisplayName = (it: any): string => {
    let snap = it.product_snapshot_json as any;
    if (typeof snap === 'string') {
      try {
        snap = JSON.parse(snap);
      } catch {
        snap = {};
      }
    }
    const baseName =
      snap?.product_name ||
      snap?.name ||
      it.product?.name ||
      it.product_name ||
      it.name ||
      'Producto';
    const variant = snap?.variant_name
      ? ` (${snap.variant_name})`
      : it.variant_name
        ? ` (${it.variant_name})`
        : '';
    return `${baseName}${variant}`;
  };

  // Imprimir pre-cuenta térmica
  const handlePrintPreCuenta = () => {
    if (!account) return;

    const allItems = account.orders.flatMap((o) =>
      o.items.map((i) => ({
        name: getItemDisplayName(i),
        quantity: i.quantity,
        unitPriceCop: i.unit_price_cop,
        lineTotalCop: i.line_total_cop,
        notes: i.notes,
      })),
    );

    const accountTenantName = (account as any)?.tenant?.name;
    const accountBranchName = (account as any)?.branch?.name;
    const accountBranchAddress = (account as any)?.branch?.address;
    const accountBranchPhone = (account as any)?.branch?.phone_whatsapp_e164;

    const receiptContent = formatDiningPreCuentaText(
      {
        restaurantName: accountTenantName || settings.display_name || 'Karta Bistro',
        branchName: accountBranchName || 'Sede Principal',
        branchAddress: accountBranchAddress,
        branchPhone: accountBranchPhone,
        tableCode: tableCode,
        accountCode: account.account_code,
        guestCount: account.guest_count,
        openedAt: account.opened_at,
        items: allItems,
        subtotalProductsCop: account.subtotal_products_cop,
        discountTotalCop: account.discount_total_cop,
        tipCop: account.tip_cop,
        grandTotalCop: account.grand_total_cop,
        paidTotalCop: account.paid_total_cop,
        payments: account.payments.map((p) => ({
          method: p.method,
          amountCop: p.amount_cop,
          reference: p.reference,
        })),
      },
      { width: thermalWidth },
    );

    printThermalContent({ content: receiptContent, width: thermalWidth });
  };

  // Imprimir comprobante de pago formal en caja
  const handlePrintPaymentReceipt = (payment: any) => {
    if (!account) return;

    const allItems = account.orders.flatMap((o) =>
      o.items.map((i) => ({
        name: getItemDisplayName(i),
        quantity: i.quantity,
        unitPriceCop: i.unit_price_cop,
        lineTotalCop: i.line_total_cop,
        notes: i.notes,
      })),
    );

    const paymentAmount = payment.amountCop ?? payment.amount_cop ?? 0;
    const paidAt = payment.paidAt || payment.created_at || new Date();

    const accountTenantName = (account as any)?.tenant?.name;
    const accountBranchName = (account as any)?.branch?.name;
    const accountBranchAddress = (account as any)?.branch?.address;
    const accountBranchPhone = (account as any)?.branch?.phone_whatsapp_e164;

    const receiptContent = formatDiningPaymentReceiptText(
      {
        restaurantName: accountTenantName || settings.display_name || 'Karta Bistro',
        branchName: accountBranchName || 'Sede Principal',
        branchAddress: accountBranchAddress,
        branchPhone: accountBranchPhone,
        tableCode: tableCode,
        accountCode: account.account_code,
        cashierName: user?.name || 'Cajero Salón',
        paidAt,
        items: allItems,
        subtotalProductsCop: account.subtotal_products_cop,
        discountTotalCop: account.discount_total_cop,
        tipCop: account.tip_cop,
        grandTotalCop: account.grand_total_cop,
        payment: {
          method: payment.method,
          amountCop: paymentAmount,
          cashReceivedCop: payment.cashReceivedCop ?? payment.cash_received_cop,
          cashChangeCop: payment.cashChangeCop ?? payment.cash_change_cop,
          reference: payment.reference,
        },
        totalPaidCop: account.paid_total_cop,
        pendingBalanceCop: Math.max(0, account.grand_total_cop - account.paid_total_cop),
        isClosed: account.status === 'CLOSED' || account.paid_total_cop >= account.grand_total_cop,
      },
      { width: thermalWidth },
    );

    printThermalContent({ content: receiptContent, width: thermalWidth });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 backdrop-blur-xs p-3 sm:p-6 overflow-hidden">
      <div className="bg-white rounded-3xl max-w-5xl w-full h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
        {/* TopBar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-violet-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-violet-500/20">
              {tableCode}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-stone-900 text-base">
                  Pre-Cuenta y Caja — Mesa {tableCode}
                </h3>
                {account && (
                  <>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 font-mono">
                      {account.account_code}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-mono">
                      v{account.version}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        account.status === 'CLOSED'
                          ? 'bg-stone-200 text-stone-700'
                          : account.status === 'REOPENED_ACCOUNTING'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {account.status}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-stone-500">
                Ajuste de propina, registro de cobros únicos o combinados y cierre de mesa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Selector de Ancho Térmico */}
            <div className="flex items-center rounded-lg bg-stone-100 p-0.5 border border-stone-200 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => handleSetThermalWidth('80mm')}
                className={`px-2 py-1 rounded-md transition ${thermalWidth === '80mm' ? 'bg-white shadow-xs text-stone-900 font-extrabold' : 'text-stone-500 hover:text-stone-700'}`}
                title="Papel 80mm (Estándar)"
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => handleSetThermalWidth('58mm')}
                className={`px-2 py-1 rounded-md transition ${thermalWidth === '58mm' ? 'bg-white shadow-xs text-stone-900 font-extrabold' : 'text-stone-500 hover:text-stone-700'}`}
                title="Papel 58mm (Compacto)"
              >
                58mm
              </button>
            </div>

            <button
              onClick={handlePrintPreCuenta}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 font-bold text-xs shadow-xs transition"
              title={`Imprimir Pre-cuenta Térmica (${thermalWidth})`}
            >
              <Printer className="h-4 w-4 text-stone-500" />
              <span className="hidden sm:inline">Imprimir Pre-cuenta</span>
            </button>

            {account && account.payments.length > 0 && (
              <button
                type="button"
                onClick={() => handlePrintPaymentReceipt(account.payments[account.payments.length - 1])}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 font-bold text-xs shadow-xs transition"
                title="Imprimir Último Comprobante de Pago en Caja"
              >
                <Printer className="h-4 w-4 text-emerald-600" />
                <span className="hidden sm:inline">Comprobante de Caja</span>
              </button>
            )}

            {account && account.payments.length > 0 && (
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-50 border border-orange-200 hover:bg-orange-100 text-orange-800 font-bold text-xs shadow-xs transition"
                title="Emitir Factura Electrónica DIAN Factus v2"
              >
                <FileText className="h-4 w-4 text-orange-600" />
                <span className="hidden sm:inline">Factura DIAN</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
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

        {/* Dual Panel Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Panel Izquierdo: Comandas y Detalle de la Cuenta */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-stone-200 bg-white">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0 bg-stone-50/50">
              <h4 className="font-extrabold text-stone-900 text-xs flex items-center gap-2">
                <Receipt className="h-4 w-4 text-violet-600" />
                <span>Comandas Activas de la Mesa ({account?.orders?.length || 0})</span>
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenSplitDrawer}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] border border-amber-200 transition"
                >
                  <Divide className="h-3.5 w-3.5" />
                  <span>División x Persona</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenTransferModal}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] transition"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>Trasladar</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading || !account ? (
                <div className="text-center py-12 text-stone-400 text-xs">
                  Cargando detalle de la cuenta...
                </div>
              ) : account.orders.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-xs">
                  Esta mesa no tiene comandas registradas aún.
                </div>
              ) : (
                account.orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs border-b border-stone-200/60 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-stone-800 font-mono">
                          {ord.order_code?.startsWith('#') ? ord.order_code : `#${ord.order_code}`}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-600">
                          {ord.origin}
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-400">
                        {new Date(ord.created_at).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="space-y-2 pt-1 divide-y divide-stone-100">
                      {ord.items.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-start justify-between text-xs pt-1.5"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <span className="text-stone-800 font-medium">
                              <span className="font-bold text-stone-900 mr-1.5">
                                {it.quantity}x
                              </span>
                              <strong className="text-stone-900">{getItemDisplayName(it)}</strong>
                            </span>
                            {Array.isArray((it as any).modifiers_snapshot_json) && (it as any).modifiers_snapshot_json.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(it as any).modifiers_snapshot_json.map((m: any, mIdx: number) => (
                                  <span
                                    key={mIdx}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200"
                                  >
                                    + {m.option_name || m.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {it.notes && (
                              <p className="text-[10px] text-amber-700 italic mt-0.5">
                                Nota: {it.notes}
                              </p>
                            )}
                          </div>
                          <span className="font-mono font-bold text-stone-900 shrink-0">
                            {formatMoneyCop(it.line_total_cop)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Ajustes de Pre-Cuenta: Propina y Descuento */}
            {account && (
              <div className="p-4 border-t border-stone-200 bg-stone-50/70 space-y-3 shrink-0">
                <div className="flex items-center justify-between text-xs font-bold text-stone-700">
                  <span>Ajustes de Pre-Cuenta:</span>
                  <button
                    type="button"
                    onClick={handleUpdateBillPreview}
                    disabled={isUpdatingBill}
                    className="text-violet-600 hover:underline font-bold disabled:opacity-50"
                  >
                    {isUpdatingBill ? 'Guardando...' : 'Aplicar Cambios'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Descuento global */}
                  <div>
                    <label className="text-[11px] font-semibold text-stone-500 block mb-1">
                      Descuento Global COP:
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={discountTotalCop}
                      onChange={(e) =>
                        setDiscountTotalCop(Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-800 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>

                  {/* Propina voluntaria */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-stone-500">
                        Propina (Ley 1935):
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setTipCop(
                            Math.round((account.subtotal_products_cop * 0.1) / 100) * 100,
                          )
                        }
                        className="text-[10px] font-bold text-violet-600 hover:underline"
                      >
                        10%
                      </button>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={tipCop}
                      onChange={(e) => setTipCop(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-800 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Panel Derecho: Totales y Registro de Pagos */}
          <div className="w-96 flex flex-col bg-stone-50/80 shrink-0">
            {/* Header Totales */}
            <div className="p-5 border-b border-stone-200 bg-white space-y-2 shrink-0">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>Subtotal Productos:</span>
                <span className="font-mono font-bold text-stone-800">
                  {formatMoneyCop(account?.subtotal_products_cop || 0)}
                </span>
              </div>
              {account?.discount_total_cop ? (
                <div className="flex items-center justify-between text-xs text-emerald-600">
                  <span>Descuento Aplicado:</span>
                  <span className="font-mono font-bold">
                    -{formatMoneyCop(account.discount_total_cop)}
                  </span>
                </div>
              ) : null}
              {account?.tip_cop ? (
                <div className="flex items-center justify-between text-xs text-amber-600">
                  <span>Propina Voluntaria:</span>
                  <span className="font-mono font-bold">
                    +{formatMoneyCop(account.tip_cop)}
                  </span>
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-2 border-t border-stone-200 text-base font-black text-stone-900">
                <span>Total Cuenta:</span>
                <span className="font-mono text-lg text-violet-700">
                  {formatMoneyCop(account?.grand_total_cop || 0)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 text-stone-500">
                <span>Pagado / Recaudado:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatMoneyCop(account?.paid_total_cop || 0)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 text-sm font-extrabold text-stone-900">
                <span>Saldo Pendiente:</span>
                <span className="font-mono text-rose-600">
                  {formatMoneyCop(pendingBalanceCop)}
                </span>
              </div>
            </div>

            {/* Pagos Realizados */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {account?.payments && account.payments.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    Abonos y Cobros Registrados ({account.payments.length})
                  </span>
                  {account.payments.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-xl bg-white border border-stone-200 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-extrabold text-stone-800">
                          {p.method === 'CASH'
                            ? 'Efectivo'
                            : p.method === 'POS_TERMINAL'
                              ? 'Datáfono'
                              : 'Transferencia'}{' '}
                          — {formatMoneyCop(p.amount_cop)}
                        </div>
                        {p.reference && (
                          <div className="text-[10px] text-stone-400">
                            Ref: {p.reference}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePrintPaymentReceipt(p)}
                          className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition"
                          title="Imprimir Comprobante de Pago Térmico"
                        >
                          <Printer className="h-3.5 w-3.5 text-stone-600" />
                        </button>

                        {isManager && account.status !== 'CLOSED' && (
                          <button
                            type="button"
                            onClick={() => handleVoidPayment(p.id)}
                            className="text-[10px] font-bold text-rose-600 hover:underline p-1 rounded hover:bg-rose-50"
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tarjeta de Confirmación e Impresión del Último Pago Registrado */}
              {lastPaymentInfo && (
                <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 space-y-3 animate-slide-up shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-800">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span className="font-black text-xs">
                        ¡Pago de Mesa {tableCode} Registrado!
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLastPaymentInfo(null)}
                      className="text-stone-400 hover:text-stone-700 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-emerald-200 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-stone-500 font-bold">Mesa:</span>
                      <span className="font-extrabold text-stone-900">Mesa {tableCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500 font-bold">Cuenta:</span>
                      <span className="font-mono text-stone-700">{account?.account_code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500 font-bold">Monto Cobrado:</span>
                      <span className="font-mono font-black text-emerald-700">
                        {formatMoneyCop(lastPaymentInfo.amountCop)}
                      </span>
                    </div>
                    {lastPaymentInfo.cashReceivedCop && (
                      <>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-stone-500">Recibido:</span>
                          <span className="font-mono text-stone-800">
                            {formatMoneyCop(lastPaymentInfo.cashReceivedCop)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-stone-500">Cambio a devolver:</span>
                          <span className="font-mono font-bold text-emerald-700">
                            {formatMoneyCop(lastPaymentInfo.cashChangeCop || 0)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintPaymentReceipt(lastPaymentInfo)}
                      className="py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition"
                    >
                      <Printer className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Imprimir Recibo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLastPaymentInfo(null);
                        if (account?.status === 'CLOSED') onClose();
                      }}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center justify-center"
                    >
                      <span>{account?.status === 'CLOSED' ? 'Finalizar y Cerrar' : 'Continuar'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Formulario de Pago (solo para Cajero y Administradores) */}
              {pendingBalanceCop > 0 && account?.status !== 'CLOSED' && (
                canRecordPayment ? (
                  <form
                    onSubmit={handleRecordPayment}
                    className="p-4 rounded-2xl bg-white border border-stone-200/90 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h5 className="font-extrabold text-stone-900 text-xs flex items-center gap-1.5">
                        <Banknote className="h-4 w-4 text-emerald-600" />
                        <span>Registrar Cobro en Caja</span>
                      </h5>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
                        Mesa {tableCode}
                      </span>
                    </div>

                    {/* Resumen contextual de mesa y productos a liquidar */}
                    <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-stone-600">
                        <span>Cuenta:</span>
                        <span className="font-mono text-stone-800">{account?.account_code}</span>
                      </div>
                      <div className="border-t border-stone-200/60 pt-1.5 space-y-1">
                        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                          Productos a liquidar:
                        </span>
                        <div className="max-h-24 overflow-y-auto divide-y divide-stone-100 pr-1">
                          {account?.orders.flatMap((o) => o.items).map((it) => (
                            <div key={it.id} className="flex items-center justify-between py-0.5 text-[11px]">
                              <span className="text-stone-700 truncate max-w-[170px]">
                                <span className="font-bold text-stone-900 mr-1">{it.quantity}x</span>
                                {getItemDisplayName(it)}
                              </span>
                              <span className="font-mono font-bold text-stone-800">
                                {formatMoneyCop(it.line_total_cop)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Método */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['CASH', 'POS_TERMINAL', 'MANUAL_TRANSFER'] as const).map(
                        (m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMethod(m)}
                            className={`py-1.5 rounded-xl text-[10px] font-bold border transition ${
                              paymentMethod === m
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-400 ring-1 ring-emerald-400'
                                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            {m === 'CASH'
                              ? 'Efectivo'
                              : m === 'POS_TERMINAL'
                                ? 'Datáfono'
                                : 'Transferencia'}
                          </button>
                        ),
                      )}
                    </div>

                    {/* Monto a pagar */}
                    <div>
                      <label className="text-[10px] font-bold text-stone-500 block mb-1">
                        Monto a Cobrar COP:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={pendingBalanceCop}
                        value={paymentAmountCop}
                        onChange={(e) =>
                          setPaymentAmountCop(
                            Math.min(
                              pendingBalanceCop,
                              Math.max(0, parseInt(e.target.value) || 0),
                            ),
                          )
                        }
                        className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Aviso si Efectivo requiere turno y no hay turno abierto */}
                    {paymentMethod === 'CASH' && isCashShiftModuleActive && !currentShift && (
                      <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span className="font-bold text-[11px]">
                            Se requiere turno de caja abierto para registrar efectivo.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpenShiftModalOpen(true)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-sm transition shrink-0 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Abrir Turno</span>
                        </button>
                      </div>
                    )}

                    {/* Cambio si es Efectivo */}
                    {paymentMethod === 'CASH' && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-bold text-stone-500 shrink-0">
                            Recibido:
                          </label>
                          <input
                            type="number"
                            placeholder="Monto entregado..."
                            value={cashReceivedCop}
                            onChange={(e) =>
                              setCashReceivedCop(
                                e.target.value === '' ? '' : parseInt(e.target.value) || 0,
                              )
                            }
                            className="flex-1 px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-stone-50 border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                        {typeof cashReceivedCop === 'number' && cashReceivedCop > 0 && (
                          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
                            <span>Cambio a devolver:</span>
                            <span className="font-mono font-black text-sm">
                              {formatMoneyCop(cashChangeCop)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Referencia opcional */}
                    <input
                      type="text"
                      placeholder="Referencia o voucher (opcional)..."
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="w-full px-3 py-1.5 text-[11px] rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />

                    <button
                      type="submit"
                      disabled={isSubmittingPayment || paymentAmountCop <= 0}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/20 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        {isSubmittingPayment
                          ? 'Procesando pago...'
                          : `Cobrar Mesa ${tableCode} — ${formatMoneyCop(paymentAmountCop)}`}
                      </span>
                    </button>
                  </form>
                ) : (
                  <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-stone-800 space-y-2">
                    <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                      <Receipt className="h-4 w-4 text-amber-600" />
                      <span>Cuenta Lista para Cobro en Caja</span>
                    </div>
                    <p className="text-[11px] text-stone-600 leading-relaxed">
                      El cobro y registro de pagos corresponde exclusivamente al <strong>Cajero</strong> o <strong>Administrador</strong>.
                      Imprime la pre-cuenta para entregar al comensal o dirígelo a la caja.
                    </p>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-amber-200/80 font-bold">
                      <span className="text-stone-600">Saldo a liquidar en caja:</span>
                      <span className="font-mono text-stone-900 font-black text-sm">
                        {formatMoneyCop(pendingBalanceCop)}
                      </span>
                    </div>
                  </div>
                )
              )}

              {/* Opción de Cierre Especial para Gerentes */}
              {isManager && pendingBalanceCop > 0 && account?.status !== 'CLOSED' && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSpecialClose(!showSpecialClose)}
                    className="text-[11px] font-bold text-stone-500 hover:text-stone-800 flex items-center gap-1"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                    <span>Cierre Administrativo con Resolución Especial</span>
                  </button>

                  {showSpecialClose && (
                    <div className="mt-2 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-2.5">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-amber-900">
                          Resolución:
                        </label>
                        <select
                          value={resolutionType}
                          onChange={(e) => setResolutionType(e.target.value as any)}
                          className="flex-1 py-1 px-2 rounded-lg bg-white border border-amber-300 text-xs font-bold"
                        >
                          <option value="COURTESY">Cortesía de la Casa (COURTESY)</option>
                          <option value="WRITTEN_OFF">Saldo Incobrable (WRITTEN_OFF)</option>
                        </select>
                      </div>

                      <textarea
                        rows={2}
                        placeholder="Motivo obligatorio del cierre especial..."
                        value={resolutionReason}
                        onChange={(e) => setResolutionReason(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white border border-amber-300 text-xs placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />

                      <button
                        type="button"
                        disabled={isClosingSpecial || !resolutionReason.trim()}
                        onClick={handleSpecialClose}
                        className="w-full py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs transition disabled:opacity-50"
                      >
                        {isClosingSpecial ? 'Cerrando cuenta...' : 'Confirmar Cierre Especial'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal para abrir turno si el cobro en efectivo lo requiere */}
      {openShiftModalOpen && (
        <OpenShiftModal
          isOpen={openShiftModalOpen}
          branchId={account?.branch_id}
          onClose={() => setOpenShiftModalOpen(false)}
          onSuccess={() => {
            setFeedback({
              type: 'success',
              message: '¡Turno de caja abierto exitosamente! Ahora puedes confirmar el cobro.',
            });
            setOpenShiftModalOpen(false);
          }}
        />
      )}

      {/* Modal de Factura Electrónica DIAN Factus v2 */}
      {isInvoiceModalOpen && account && (
        <ElectronicInvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          accountId={account.id}
          orderCode={`Mesa ${tableCode}`}
          totalCop={account.grand_total_cop}
          onSuccess={() => {
            refetch();
            onSuccess();
          }}
        />
      )}
    </div>
  );
};
