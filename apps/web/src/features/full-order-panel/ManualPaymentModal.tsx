import React, { useState } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Receipt,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RotateCcw,
  ShieldAlert,
  HelpCircle,
  FileText,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { formatMoneyCop, PaymentMethod } from '@restaurante-saas/shared';
import { OpenShiftModal } from '../cash-shifts/OpenShiftModal';
import { ElectronicInvoiceModal } from '../invoicing/ElectronicInvoiceModal';

interface PaymentRecord {
  id: string;
  method: string;
  amount_cop: number;
  cash_received_cop?: number | null;
  cash_change_cop?: number | null;
  status: string;
  external_reference?: string | null;
  notes?: string | null;
  void_reason?: string | null;
  created_at: string;
  recorded_by?: { name: string; email: string } | null;
}

interface ManualPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
    branch_id?: string;
    order_code: string;
    status: string;
    grand_total_cop: number;
    paid_total_cop: number;
    payment_status: string;
    uncollected_amount_cop?: number;
    resolution_type?: string | null;
    resolution_reason?: string | null;
    customer_snapshot_json?: any;
    payments?: PaymentRecord[];
  };
  onSuccess: () => void;
}

export const ManualPaymentModal: React.FC<ManualPaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'pay' | 'history' | 'resolve'>('pay');

  // Formulario de Cobro
  const clientSnapshot = (order.customer_snapshot_json as any) || {};
  const balanceCop = Math.max(0, order.grand_total_cop - order.paid_total_cop);
  const [method, setMethod] = useState<PaymentMethod>(() => {
    return clientSnapshot?.payment_method === 'TRANSFER' ? 'MANUAL_TRANSFER' : 'CASH';
  });
  const [amountCop, setAmountCop] = useState<number>(balanceCop);
  const [cashReceivedCop, setCashReceivedCop] = useState<number>(() => {
    return clientSnapshot?.cash_amount_delivered_cop || balanceCop;
  });
  const [selectedDigitalChannel, setSelectedDigitalChannel] = useState<string>(() => {
    return clientSnapshot?.transfer_channel || 'NEQUI';
  });
  const [externalReference, setExternalReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState<boolean>(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);

  // Anulación de Pago
  const [voidingPaymentId, setVoidingPaymentId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [isVoiding, setIsVoiding] = useState<boolean>(false);

  // Resolución / Reversión
  const [resolutionType, setResolutionType] = useState<'COURTESY' | 'WRITTEN_OFF'>('COURTESY');
  const [resolutionReason, setResolutionReason] = useState<string>('');
  const [revertReason, setRevertReason] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(false);

  if (!isOpen) return null;

  const isResolved =
    order.payment_status === 'COURTESY' || order.payment_status === 'WRITTEN_OFF';
  const paymentsList = order.payments || [];

  // Cambio en efectivo
  const cashChangeCop =
    method === 'CASH' && cashReceivedCop >= amountCop
      ? cashReceivedCop - amountCop
      : 0;
  const isCashInsufficient =
    method === 'CASH' && amountCop > 0 && cashReceivedCop < amountCop;

  // Registrar cobro
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (amountCop <= 0) {
      setErrorMessage('El monto a cobrar debe ser mayor a cero.');
      return;
    }
    if (amountCop > balanceCop) {
      setErrorMessage(
        `El monto ($${amountCop.toLocaleString('es-CO')}) excede el saldo pendiente ($${balanceCop.toLocaleString('es-CO')}).`,
      );
      return;
    }
    if (method === 'CASH' && isCashInsufficient) {
      setErrorMessage('El efectivo recibido no puede ser inferior al monto a cobrar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = `pay-${order.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await apiClient.post(
        `/orders/${order.id}/payments/manual`,
        {
          method,
          amount_cop: amountCop,
          cash_received_cop: method === 'CASH' ? cashReceivedCop : undefined,
          external_reference: externalReference.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        },
      );

      setSuccessMessage('Pago registrado exitosamente.');
      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (err: any) {
      const errorCode = err?.data?.errorCode || err?.response?.data?.errorCode;
      if (errorCode === 'OPEN_CASH_SHIFT_REQUIRED') {
        setErrorMessage(
          'Se requiere un turno de caja abierto para registrar pagos en efectivo. Por favor abre el turno primero.',
        );
        setOpenShiftModalOpen(true);
        return;
      }
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Error al registrar el pago.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Anular pago
  const handleVoidPayment = async (paymentId: string) => {
    if (!voidReason.trim()) {
      setErrorMessage('Debes indicar el motivo de la anulación del pago.');
      return;
    }

    setIsVoiding(true);
    setErrorMessage(null);
    try {
      await apiClient.post(`/payments/${paymentId}/void`, {
        reason: voidReason.trim(),
      });
      setVoidingPaymentId(null);
      setVoidReason('');
      setSuccessMessage('Pago anulado exitosamente.');
      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Error al anular el pago.',
      );
    } finally {
      setIsVoiding(false);
    }
  };

  // Resolver saldo
  const handleResolveUncollected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionReason.trim()) {
      setErrorMessage('El motivo de la resolución es obligatorio.');
      return;
    }

    setIsResolving(true);
    setErrorMessage(null);
    try {
      await apiClient.post(`/orders/${order.id}/resolve-uncollected`, {
        resolution_type: resolutionType,
        reason: resolutionReason.trim(),
      });
      setSuccessMessage('Saldo de la orden resuelto exitosamente.');
      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Error al resolver el saldo.',
      );
    } finally {
      setIsResolving(false);
    }
  };

  // Revertir resolución
  const handleRevertResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revertReason.trim()) {
      setErrorMessage('El motivo de la reversión es obligatorio.');
      return;
    }

    setIsResolving(true);
    setErrorMessage(null);
    try {
      await apiClient.post(`/orders/${order.id}/revert-resolution`, {
        reason: revertReason.trim(),
      });
      setSuccessMessage('Resolución revertida. La orden admite cobros nuevamente.');
      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Error al revertir la resolución.',
      );
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
        {/* Header con resumen financiero */}
        <div className="px-6 py-4 border-b border-stone-100 bg-stone-50/80 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-stone-900 text-base">
                  Cobro de Pedido #{order.order_code}
                </h2>
                <p className="text-xs text-stone-500">
                  Estado Operativo: <strong className="text-stone-700">{order.status}</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold text-xs shadow-2xs transition"
                title="Emitir Factura Electrónica DIAN"
              >
                <FileText className="w-3.5 h-3.5 text-orange-600" />
                <span className="hidden sm:inline">Factura DIAN</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tarjeta de Saldos */}
          <div className="mt-3.5 grid grid-cols-3 gap-2 bg-white p-3 rounded-2xl border border-stone-200 shadow-2xs text-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                Total Orden
              </span>
              <span className="text-sm font-extrabold text-stone-900">
                {formatMoneyCop(order.grand_total_cop)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                Pagado
              </span>
              <span className="text-sm font-extrabold text-emerald-600">
                {formatMoneyCop(order.paid_total_cop)}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                Saldo Pendiente
              </span>
              <span
                className={`text-sm font-extrabold ${
                  balanceCop > 0 ? 'text-amber-600' : 'text-stone-400'
                }`}
              >
                {formatMoneyCop(balanceCop)}
              </span>
            </div>
          </div>

          {/* Pestañas */}
          <div className="flex gap-2 mt-3.5 pt-2 border-t border-stone-200/60 text-xs">
            <button
              onClick={() => {
                setActiveTab('pay');
                setErrorMessage(null);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'pay'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/50'
              }`}
            >
              Registrar Cobro
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                setErrorMessage(null);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'history'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/50'
              }`}
            >
              Historial de Pagos ({paymentsList.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('resolve');
                setErrorMessage(null);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'resolve'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/50'
              }`}
            >
              Resolución de Saldo
            </button>
          </div>
        </div>

        {/* Mensajes de Alerta */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Contenido según pestaña */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* TAB 1: REGISTRAR COBRO */}
          {activeTab === 'pay' && (
            <>
              {isResolved ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Orden con Resolución de Saldo Activa</p>
                    <p className="mt-1 leading-relaxed">
                      Esta orden fue marcada como <strong>{order.payment_status}</strong> por un
                      saldo incobrable de {formatMoneyCop(order.uncollected_amount_cop || 0)}. Para
                      registrar nuevos cobros, revierte primero la resolución en la pestaña
                      "Resolución de Saldo".
                    </p>
                  </div>
                </div>
              ) : balanceCop === 0 ? (
                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <p className="font-extrabold text-stone-900 text-base">¡Orden Totalmente Pagada!</p>
                  <p className="text-xs text-stone-600">
                    No hay saldos pendientes por recaudar sobre este pedido.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRecordPayment} className="space-y-4">
                  {/* Selector de Método de Pago */}
                  <div>
                    <label className="text-xs font-bold text-stone-700 block mb-1.5">
                      Medio de Pago
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMethod('CASH');
                          setCashReceivedCop(amountCop);
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                          method === 'CASH'
                            ? 'bg-orange-50 border-orange-500 text-orange-950 ring-2 ring-orange-500/20'
                            : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <Banknote className="w-5 h-5 text-emerald-600" />
                        <span>Efectivo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMethod('MANUAL_TRANSFER')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                          method === 'MANUAL_TRANSFER'
                            ? 'bg-orange-50 border-orange-500 text-orange-950 ring-2 ring-orange-500/20'
                            : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <Smartphone className="w-5 h-5 text-purple-600" />
                        <span>Transferencia</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMethod('POS_TERMINAL')}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                          method === 'POS_TERMINAL'
                            ? 'bg-orange-50 border-orange-500 text-orange-950 ring-2 ring-orange-500/20'
                            : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <CreditCard className="w-5 h-5 text-sky-600" />
                        <span>Datáfono POS</span>
                      </button>
                    </div>
                  </div>

                  {/* Monto a Cobrar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-stone-700">
                        Monto a Cobrar (COP)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setAmountCop(balanceCop);
                          if (method === 'CASH') setCashReceivedCop(balanceCop);
                        }}
                        className="text-[11px] font-bold text-orange-600 hover:text-orange-700"
                      >
                        Saldar Total ({formatMoneyCop(balanceCop)})
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-stone-400 font-bold text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={balanceCop}
                        value={amountCop || ''}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAmountCop(val);
                          if (method === 'CASH' && cashReceivedCop < val) {
                            setCashReceivedCop(val);
                          }
                        }}
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-stone-200 text-stone-900 font-extrabold text-base focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        placeholder="Monto en COP"
                        required
                      />
                    </div>
                  </div>

                  {/* CALCULADORA DE CAMBIO (Solo si es Efectivo) */}
                  {method === 'CASH' && (
                    <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                          <Banknote className="w-4 h-4 text-emerald-600" />
                          <span>Efectivo Recibido (COP)</span>
                        </label>
                        {/* Botones rápidos de billetes comunes */}
                        <div className="flex gap-1.5">
                          {[20000, 50000, 100000].map((bill) => (
                            <button
                              key={bill}
                              type="button"
                              onClick={() => setCashReceivedCop(bill)}
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
                            >
                              ${bill / 1000}k
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-stone-400 font-bold text-sm">
                          $
                        </span>
                        <input
                          type="number"
                          min={amountCop}
                          value={cashReceivedCop || ''}
                          onChange={(e) => setCashReceivedCop(Number(e.target.value))}
                          className="w-full pl-8 pr-4 py-2 rounded-xl border border-stone-200 text-stone-900 font-bold text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                          placeholder="Efectivo entregado por el cliente"
                        />
                      </div>

                      {/* Resultado del Cambio */}
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold ${
                          isCashInsufficient
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}
                      >
                        <span>
                          {isCashInsufficient
                            ? '⚠️ Efectivo insuficiente'
                            : '💵 Cambio a Entregar al Cliente:'}
                        </span>
                        <span className="text-sm font-extrabold">
                          {isCashInsufficient
                            ? `Faltan ${formatMoneyCop(amountCop - cashReceivedCop)}`
                            : formatMoneyCop(cashChangeCop)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Referencia o Comprobante (Transferencia / Datáfono) */}
                  {method === 'MANUAL_TRANSFER' && (
                    <div className="space-y-2 p-3 rounded-2xl bg-sky-50/70 border border-sky-200/80">
                      <label className="text-xs font-extrabold text-sky-950 block">
                        Canal Digital por el que se Recibió el Pago:
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 'NEQUI', label: '📱 Nequi' },
                          { id: 'DAVIPLATA', label: '📱 Daviplata' },
                          { id: 'BRE_B', label: '🔑 Llave Bre-B' },
                          { id: 'BANCOLOMBIA', label: '🏦 Bancolombia' },
                          { id: 'TRANSFIYA', label: '⚡ Transfiya' },
                          { id: 'OTRO', label: '💳 Otro' },
                        ].map((ch) => (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => setSelectedDigitalChannel(ch.id)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition ${
                              selectedDigitalChannel === ch.id
                                ? 'bg-sky-700 text-white border-sky-800 shadow-2xs'
                                : 'bg-white text-sky-900 border-sky-200 hover:bg-sky-100/60'
                            }`}
                          >
                            {ch.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(method === 'MANUAL_TRANSFER' || method === 'POS_TERMINAL') && (
                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1">
                        Número de Aprobación / Comprobante (Opcional)
                      </label>
                      <input
                        type="text"
                        value={externalReference}
                        onChange={(e) => setExternalReference(e.target.value)}
                        placeholder={method === 'MANUAL_TRANSFER' ? "Ej. # Comprobante M12849" : "Ej. Lote 048, Aprob 8921"}
                        className="w-full px-3.5 py-2 rounded-xl border border-stone-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      />
                    </div>
                  )}

                  {/* Notas */}
                  <div>
                    <label className="text-xs font-bold text-stone-700 block mb-1">
                      Notas Internas del Pago (Opcional)
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej. Recibido por cajero turno tarde"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>

                  {/* Botón de Enviar */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || amountCop <= 0 || isCashInsufficient}
                      className="w-full py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold text-sm shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 transition-all"
                    >
                      {isSubmitting ? (
                        <span>Registrando cobro...</span>
                      ) : (
                        <span>Confirmar Cobro de {formatMoneyCop(amountCop)}</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* TAB 2: HISTORIAL DE PAGOS */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {paymentsList.length === 0 ? (
                <div className="text-center py-8 text-stone-400 text-xs">
                  No se han registrado pagos para esta orden.
                </div>
              ) : (
                paymentsList.map((pay) => {
                  const isVoided = pay.status === 'VOIDED';

                  return (
                    <div
                      key={pay.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isVoided
                          ? 'bg-stone-50 border-stone-200 opacity-60'
                          : 'bg-white border-stone-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              isVoided
                                ? 'bg-stone-100 text-stone-500 border-stone-200 line-through'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {pay.method === 'CASH' ? '💵 Efectivo' : pay.method === 'POS_TERMINAL' ? '💳 Datáfono' : '📱 Transferencia'}
                          </span>
                          <span className="text-xs font-bold text-stone-900">
                            {formatMoneyCop(pay.amount_cop)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-stone-400">
                            {new Date(pay.created_at).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {!isVoided && !isResolved && (
                            <button
                              onClick={() => {
                                setVoidingPaymentId(pay.id);
                                setVoidReason('');
                              }}
                              className="px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Detalles de efectivo */}
                      {pay.method === 'CASH' && pay.cash_received_cop && (
                        <div className="mt-2 text-[11px] text-stone-500 flex gap-3">
                          <span>Recibido: {formatMoneyCop(pay.cash_received_cop)}</span>
                          <span>Cambio: {formatMoneyCop(pay.cash_change_cop || 0)}</span>
                        </div>
                      )}

                      {/* Referencia o notas */}
                      {pay.external_reference && (
                        <p className="mt-1 text-[11px] text-stone-600 font-mono">
                          Ref: {pay.external_reference}
                        </p>
                      )}

                      {/* Información de anulación si aplica */}
                      {isVoided && (
                        <div className="mt-2 p-2 bg-rose-50 rounded-lg text-[11px] text-rose-700">
                          <strong>Anulado:</strong> {pay.void_reason || 'Sin motivo especificado'}
                        </div>
                      )}

                      {/* Modal en línea para confirmar anulación */}
                      {voidingPaymentId === pay.id && (
                        <div className="mt-3 p-3 bg-rose-50/80 rounded-xl border border-rose-200 space-y-2">
                          <p className="text-xs font-bold text-rose-900">
                            ¿Seguro de anular este cobro de {formatMoneyCop(pay.amount_cop)}?
                          </p>
                          <input
                            type="text"
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                            placeholder="Motivo obligatorio (ej. Error en digitación, reembolso)"
                            className="w-full px-3 py-1.5 rounded-lg border border-rose-300 text-xs bg-white text-stone-900"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setVoidingPaymentId(null)}
                              className="px-2.5 py-1 text-xs text-stone-600 font-medium"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isVoiding || !voidReason.trim()}
                              onClick={() => handleVoidPayment(pay.id)}
                              className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
                            >
                              {isVoiding ? 'Anulando...' : 'Confirmar Anulación'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: RESOLUCIÓN DE SALDO */}
          {activeTab === 'resolve' && (
            <div className="space-y-4">
              {isResolved ? (
                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                    <ShieldAlert className="w-5 h-5 text-amber-600" />
                    <span>Resolución Activa: {order.payment_status}</span>
                  </div>
                  <div className="text-xs text-amber-800 space-y-1">
                    <p>
                      <strong>Monto Incobrable Congelado:</strong>{' '}
                      {formatMoneyCop(order.uncollected_amount_cop || 0)}
                    </p>
                    <p>
                      <strong>Motivo:</strong> {order.resolution_reason || 'No registrado'}
                    </p>
                  </div>

                  <form onSubmit={handleRevertResolution} className="pt-3 border-t border-amber-200 space-y-3">
                    <div>
                      <label className="text-xs font-bold text-stone-800 block mb-1">
                        Motivo para Revertir la Resolución
                      </label>
                      <input
                        type="text"
                        value={revertReason}
                        onChange={(e) => setRevertReason(e.target.value)}
                        placeholder="Ej. El cliente regresó a cancelar la cuenta pendiente"
                        className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs bg-white"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isResolving || !revertReason.trim()}
                      className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{isResolving ? 'Revirtiendo...' : 'Revertir Resolución y Permitir Cobros'}</span>
                    </button>
                  </form>
                </div>
              ) : (
                <form onSubmit={handleResolveUncollected} className="space-y-4">
                  <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-xs text-stone-600 leading-relaxed">
                    <p className="font-bold text-stone-800 mb-1">
                      Cierre Financiero sin Recaudar Dinero
                    </p>
                    <p>
                      Utiliza esta opción para justificar operativamente un saldo pendiente que no
                      será cobrado en caja (cortesía de la casa o pérdida por mesa que se fue sin
                      pagar).
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-700 block mb-1.5">
                      Tipo de Resolución
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setResolutionType('COURTESY')}
                        className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${
                          resolutionType === 'COURTESY'
                            ? 'bg-purple-50 border-purple-500 text-purple-950 ring-2 ring-purple-500/20'
                            : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <span className="block text-sm mb-0.5">🎁 Cortesía</span>
                        <span className="text-[10px] text-stone-500 font-normal">
                          Consumo autorizado por administración.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setResolutionType('WRITTEN_OFF')}
                        className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${
                          resolutionType === 'WRITTEN_OFF'
                            ? 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-500/20'
                            : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <span className="block text-sm mb-0.5">⚠️ Saldo Incobrable</span>
                        <span className="text-[10px] text-stone-500 font-normal">
                          Mesa retirada sin pagar / pérdida operativa.
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-700 block mb-1">
                      Motivo Detallado de la Resolución (Obligatorio)
                    </label>
                    <textarea
                      rows={2}
                      value={resolutionReason}
                      onChange={(e) => setResolutionReason(e.target.value)}
                      placeholder="Ej. Cortesía por demora en cocina autorizada por gerencia..."
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isResolving || !resolutionReason.trim()}
                    className="w-full py-2.5 rounded-2xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-sm"
                  >
                    {isResolving ? 'Resolviendo saldo...' : 'Aplicar Resolución de Saldo'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal para abrir turno de caja si es requerido */}
      {openShiftModalOpen && (
        <OpenShiftModal
          isOpen={openShiftModalOpen}
          branchId={order.branch_id}
          onClose={() => setOpenShiftModalOpen(false)}
          onSuccess={() => {
            setSuccessMessage(
              '¡Turno de caja abierto exitosamente! Ahora puedes confirmar el cobro en efectivo.',
            );
            setOpenShiftModalOpen(false);
          }}
        />
      )}

      {/* Modal de Facturación Electrónica DIAN Factus v2 */}
      {isInvoiceModalOpen && (
        <ElectronicInvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          orderId={order.id}
          orderCode={order.order_code}
          totalCop={order.grand_total_cop}
          onSuccess={() => {
            onSuccess();
          }}
        />
      )}
    </div>
  );
};
