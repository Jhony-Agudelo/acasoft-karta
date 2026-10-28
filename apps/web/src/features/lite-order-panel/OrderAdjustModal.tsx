import React, { useState } from 'react';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';
import { formatMoneyCop } from '@restaurante-saas/shared';

export interface OrderItemAdjustState {
  product_id: string;
  product_name: string;
  variant_id?: string | null;
  variant_name?: string | null;
  unit_price_cop: number;
  quantity: number;
  modifiers: Array<{
    option_id: string;
    option_name: string;
    extra_price_cop: number;
  }>;
  notes?: string | null;
}

interface OrderAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderCode: string;
  fulfillmentType: string;
  initialItems: OrderItemAdjustState[];
  initialDeliveryFeeCop: number;
  paidTotalCop: number;
  onSave: (payload: {
    items: Array<{
      product_id: string;
      variant_id?: string | null;
      quantity: number;
      modifiers: Array<{ option_id: string; extra_price_cop?: number }>;
      notes?: string | null;
    }>;
    delivery_fee_cop: number;
    reason: string;
  }) => Promise<void>;
}

export const OrderAdjustModal: React.FC<OrderAdjustModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderCode,
  fulfillmentType,
  initialItems,
  initialDeliveryFeeCop,
  paidTotalCop,
  onSave,
}) => {
  const [items, setItems] = useState<OrderItemAdjustState[]>(initialItems);
  const [deliveryFeeCop, setDeliveryFeeCop] = useState<number>(
    fulfillmentType === 'PICKUP' ? 0 : initialDeliveryFeeCop,
  );
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isPickup = fulfillmentType === 'PICKUP';

  const updateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      setItems((prev) => prev.filter((_, i) => i !== index));
    } else {
      setItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, quantity: newQty } : item)),
      );
    }
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const calculatedSubtotal = items.reduce((acc, item) => {
    const mods = item.modifiers.reduce((mAcc, m) => mAcc + (m.extra_price_cop || 0), 0);
    return acc + (item.unit_price_cop + mods) * item.quantity;
  }, 0);

  const calculatedGrandTotal = calculatedSubtotal + (isPickup ? 0 : deliveryFeeCop);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (items.length === 0) {
      setErrorMessage('El pedido debe tener al menos un producto.');
      return;
    }

    if (calculatedGrandTotal < paidTotalCop) {
      setErrorMessage(
        `El nuevo total ($${calculatedGrandTotal.toLocaleString('es-CO')}) no puede ser menor al monto pagado ($${paidTotalCop.toLocaleString('es-CO')}).`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        items: items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          quantity: i.quantity,
          modifiers: i.modifiers.map((m) => ({
            option_id: m.option_id,
            extra_price_cop: m.extra_price_cop,
          })),
          notes: i.notes,
        })),
        delivery_fee_cop: isPickup ? 0 : deliveryFeeCop,
        reason: reason.trim() || 'Ajuste acordado con el cliente',
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || err?.message || 'Error al guardar el ajuste.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-amber-200">
        {/* Cabecera */}
        <div className="px-6 py-4 bg-amber-50/80 border-b border-amber-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-amber-950 flex items-center gap-2">
              <span>Ajustar Pedido</span>
              <span className="font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-sm">
                {orderCode}
              </span>
            </h3>
            <p className="text-xs text-amber-800">
              Modifica productos o tarifa de domicilio antes de procesar
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo con scroll */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Lista de productos actuales */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Productos del Pedido
            </label>
            <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-stone-50/50">
              {items.map((item, index) => {
                const modsTotal = item.modifiers.reduce(
                  (acc, m) => acc + (m.extra_price_cop || 0),
                  0,
                );
                const lineTotal = (item.unit_price_cop + modsTotal) * item.quantity;

                return (
                  <div key={index} className="p-3 flex items-center justify-between gap-3 bg-white">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">
                        {item.product_name}
                        {item.variant_name && (
                          <span className="text-xs text-stone-500 font-normal">
                            {' '}
                            ({item.variant_name})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-amber-700 font-medium">
                        {formatMoneyCop(item.unit_price_cop + modsTotal)} c/u
                      </p>
                      {item.modifiers.length > 0 && (
                        <p className="text-[11px] text-stone-500 truncate">
                          {item.modifiers.map((m) => m.option_name).join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Controles de cantidad */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-100 font-bold"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-stone-800">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-100 font-bold"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 ml-1 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tarifa de domicilio */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500 block mb-1.5">
              Valor del Domicilio ($ COP)
            </label>
            {isPickup ? (
              <p className="text-xs text-stone-500 italic p-2.5 bg-stone-100 rounded-xl">
                Modalidad para recoger — tarifa fijada en $0 COP.
              </p>
            ) : (
              <input
                type="number"
                min="0"
                step="500"
                value={deliveryFeeCop}
                onChange={(e) => setDeliveryFeeCop(Number(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-stone-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Tarifa acordada (ej. 4000)"
              />
            )}
          </div>

          {/* Motivo del ajuste */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500 block mb-1.5">
              Motivo o Detalle del Ajuste
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Ej. Cliente pidió adición de tocineta y acordó envío de $4.000"
            />
          </div>

          {/* Resumen financiero */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5">
            <div className="flex justify-between text-xs text-stone-600">
              <span>Subtotal productos:</span>
              <span className="font-semibold">{formatMoneyCop(calculatedSubtotal)}</span>
            </div>
            {!isPickup && (
              <div className="flex justify-between text-xs text-stone-600">
                <span>Costo de domicilio:</span>
                <span className="font-semibold">{formatMoneyCop(deliveryFeeCop)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-amber-950 pt-1.5 border-t border-amber-200">
              <span>Nuevo Total:</span>
              <span className="text-emerald-700">{formatMoneyCop(calculatedGrandTotal)}</span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-700 font-medium hover:bg-stone-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
