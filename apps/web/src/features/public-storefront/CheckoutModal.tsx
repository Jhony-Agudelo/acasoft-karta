import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  ShoppingBag,
  Truck,
  MapPin,
  Send,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Clock,
  DollarSign,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { useCartStore } from '../../stores/cart.store';
import type { CartItem } from '../../stores/cart.store';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  storeKey: string;
  cartItems: CartItem[];
  cartSummary: {
    totalItems: number;
    grossSubtotalCop: number;
    netSubtotalCop: number;
    taxAmountCop: number;
    lineTotalCop: number;
  };
  taxProfile: {
    tax_profile_mode: any;
    tax_type?: any;
    tax_rate_bp?: number;
  };
}

interface DeliveryZoneItem {
  id: string;
  name: string;
  delivery_fee_cop: number;
  min_order_cop: number;
  estimated_minutes_min: number;
  estimated_minutes_max: number;
  polygon_or_neighborhoods_json: string[] | any;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  branchId,
  storeKey,
  cartItems,
  cartSummary,
}) => {
  const cartStore = useCartStore();

  const [fulfillmentType, setFulfillmentType] = useState<'PICKUP' | 'DELIVERY'>('DELIVERY');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [referenceNotes, setReferenceNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<{
    order_code: string;
    grand_total_cop: number;
    whatsapp_redirect_url: string;
    tracking_url: string;
  } | null>(null);

  // Cargar zonas activas de la sucursal
  const { data: zones = [], isLoading: isLoadingZones } = useQuery<DeliveryZoneItem[]>({
    queryKey: ['delivery-zones', branchId],
    queryFn: () => apiClient.get(`/public/branches/${branchId}/delivery-zones`),
    enabled: isOpen && !!branchId,
  });

  // Si hay zonas y ninguna seleccionada, preseleccionar la primera
  React.useEffect(() => {
    if (zones.length > 0 && !selectedZoneId) {
      setSelectedZoneId(zones[0]!.id);
    }
  }, [zones, selectedZoneId]);

  if (!isOpen) return null;

  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const deliveryFeeCop = fulfillmentType === 'DELIVERY' ? selectedZone?.delivery_fee_cop ?? 0 : 0;
  const grandTotalCop = cartSummary.lineTotalCop + deliveryFeeCop;
  const isBelowMinOrder =
    fulfillmentType === 'DELIVERY' && selectedZone && cartSummary.lineTotalCop < selectedZone.min_order_cop;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!privacyConsent) {
      setErrorMessage('Debes aceptar la política de tratamiento de datos personales para continuar.');
      return;
    }

    if (fulfillmentType === 'DELIVERY') {
      if (!selectedZoneId) {
        setErrorMessage('Debes seleccionar una zona de cobertura de entrega.');
        return;
      }
      if (addressLine.trim().length < 5) {
        setErrorMessage('Ingresa una dirección de entrega válida (mínimo 5 caracteres).');
        return;
      }
      if (neighborhood.trim().length < 2) {
        setErrorMessage('Ingresa el barrio de entrega.');
        return;
      }
      if (isBelowMinOrder && selectedZone) {
        setErrorMessage(
          `El pedido mínimo para ${selectedZone.name} es de $${selectedZone.min_order_cop.toLocaleString('es-CO')} COP.`,
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = crypto.randomUUID();

      const payload = {
        branch_id: branchId,
        origin: 'WHATSAPP',
        fulfillment_type: fulfillmentType,
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          privacy_consent_accepted: true,
        },
        delivery:
          fulfillmentType === 'DELIVERY'
            ? {
                delivery_zone_id: selectedZoneId,
                address_line: addressLine.trim(),
                neighborhood: neighborhood.trim(),
                reference_notes: referenceNotes.trim() || null,
              }
            : null,
        notes: notes.trim() || null,
        items: cartItems.map((it) => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          quantity: it.quantity,
          modifiers: it.modifiers.map((m) => ({
            group_id: (m as any).group_id || '00000000-0000-0000-0000-000000000000',
            option_id: m.id,
          })),
          notes: it.notes || null,
        })),
      };

      const res = await apiClient.post('/public/orders', payload, {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      });

      // Limpiar carrito tras creación exitosa
      cartStore.clearCart(storeKey);

      setCreatedOrder({
        order_code: res.order_code,
        grand_total_cop: res.grand_total_cop,
        whatsapp_redirect_url: res.whatsapp_redirect_url,
        tracking_url: res.tracking_url,
      });
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Ocurrió un error al procesar el pedido.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/60 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-orange-600" />
            <h2 className="font-extrabold text-stone-900 text-base">
              {createdOrder ? '¡Pedido Generado!' : 'Finalizar Pedido'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {createdOrder ? (
            /* Pantalla de Confirmación con Enlace WhatsApp */
            <div className="text-center py-4 space-y-6">
              <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20 animate-scale-in">
                <CheckCircle2 className="h-9 w-9" />
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase font-extrabold tracking-wider text-stone-400">
                  Código de tu Pedido
                </p>
                <div className="text-4xl font-black text-stone-900 font-mono tracking-tight text-orange-600">
                  {createdOrder.order_code}
                </div>
                <p className="text-xs font-semibold text-stone-600 max-w-xs mx-auto">
                  Tu pedido ha sido registrado en el sistema. Para que la cocina comience su preparación, envía el mensaje por WhatsApp:
                </p>
              </div>

              {/* Botón WhatsApp */}
              <a
                href={createdOrder.whatsapp_redirect_url}
                target="_blank"
                rel="noreferrer"
                id="btn-finish-whatsapp"
                className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/30 transition flex items-center justify-center gap-2.5 transform active:scale-98"
              >
                <Send className="h-4 w-4" />
                <span>Abrir WhatsApp para Confirmar</span>
              </a>

              {/* Link al Tracker */}
              <div className="pt-2 border-t border-stone-100">
                <a
                  href={createdOrder.tracking_url}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>Consultar estado en vivo del pedido</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ) : (
            /* Formulario de Checkout */
            <form onSubmit={handleSubmitOrder} className="space-y-5">
              {errorMessage && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Selector de Modalidad */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-extrabold text-stone-500 uppercase tracking-wider">
                  Modalidad de Entrega
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('DELIVERY')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      fulfillmentType === 'DELIVERY'
                        ? 'bg-white text-orange-600 shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Truck className="h-4 w-4" />
                    <span>Domicilio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('PICKUP')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      fulfillmentType === 'PICKUP'
                        ? 'bg-white text-orange-600 shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    <span>Para Llevar</span>
                  </button>
                </div>
              </div>

              {/* Campos para Domicilio */}
              {fulfillmentType === 'DELIVERY' && (
                <div className="p-4 rounded-2xl bg-orange-50/50 border border-orange-200/70 space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-800 flex items-center justify-between">
                      <span>Zona de Cobertura</span>
                      {selectedZone && (
                        <span className="text-[11px] text-orange-700 font-extrabold">
                          Tarifa: ${selectedZone.delivery_fee_cop.toLocaleString('es-CO')} COP
                        </span>
                      )}
                    </label>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                      className="w-full text-xs font-semibold rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {isLoadingZones ? (
                        <option>Cargando zonas...</option>
                      ) : zones.length === 0 ? (
                        <option value="">No hay zonas configuradas</option>
                      ) : (
                        zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} — ${z.delivery_fee_cop.toLocaleString('es-CO')} (Mín: ${z.min_order_cop.toLocaleString('es-CO')})
                          </option>
                        ))
                      )}
                    </select>
                    {isBelowMinOrder && selectedZone && (
                      <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1 pt-0.5">
                        <AlertTriangle className="h-3 w-3" />
                        Pedido mínimo para esta zona: ${selectedZone.min_order_cop.toLocaleString('es-CO')} COP
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-800">Dirección completa</label>
                    <input
                      type="text"
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      placeholder="Ej. Calle 19 # 8-45 Apto 302"
                      required
                      className="w-full text-xs rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-stone-800">Barrio</label>
                      <input
                        type="text"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        placeholder="Ej. Centro Histórico"
                        required
                        className="w-full text-xs rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-stone-800">Indicaciones (opcional)</label>
                      <input
                        type="text"
                        value={referenceNotes}
                        onChange={(e) => setReferenceNotes(e.target.value)}
                        placeholder="Timbre 302, reja negra"
                        className="w-full text-xs rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Datos de Contacto */}
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-800">Tu Nombre</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Carlos Ramírez"
                      required
                      className="w-full text-xs rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-800">WhatsApp Móvil (10 dígitos)</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="300 123 4567"
                      required
                      className="w-full text-xs rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-600">Observaciones para el pedido (opcional)</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Sin salsas, enviar servilletas extra..."
                    className="w-full text-xs rounded-xl border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Casilla de Consentimiento Ley 1581 */}
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-stone-700 leading-snug">
                  <input
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={(e) => setPrivacyConsent(e.target.checked)}
                    required
                    className="h-4 w-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500 mt-0.5 shrink-0"
                  />
                  <span>
                    Acepto el tratamiento de mis datos personales para la gestión y entrega de mi pedido conforme a la{' '}
                    <strong className="text-stone-900">Ley 1581 de 2012</strong> (Habeas Data Colombia).
                  </span>
                </label>
              </div>

              {/* Resumen de Cifras */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal productos ({cartSummary.totalItems} ítems):</span>
                  <span className="font-mono font-bold">${cartSummary.lineTotalCop.toLocaleString('es-CO')} COP</span>
                </div>
                {fulfillmentType === 'DELIVERY' && (
                  <div className="flex justify-between text-stone-600">
                    <span>Costo de domicilio:</span>
                    <span className="font-mono font-bold">${deliveryFeeCop.toLocaleString('es-CO')} COP</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm text-stone-900 pt-2 border-t border-stone-200">
                  <span>Total a Pagar:</span>
                  <span className="font-mono text-orange-600">${grandTotalCop.toLocaleString('es-CO')} COP</span>
                </div>
              </div>

              {/* Botón de Envío */}
              <button
                type="submit"
                id="btn-submit-order"
                disabled={isSubmitting || (isBelowMinOrder ?? false)}
                className="w-full py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs shadow-xl shadow-orange-600/30 transition flex items-center justify-center gap-2 transform active:scale-98"
              >
                {isSubmitting ? (
                  <span>Generando pedido...</span>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Terminar pedido por WhatsApp</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
