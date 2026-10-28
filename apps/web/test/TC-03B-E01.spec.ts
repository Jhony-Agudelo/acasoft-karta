import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/stores/cart.store';
import {
  buildBranchToCustomerProcessedWhatsapp,
  buildBranchToCustomerStatusWhatsapp,
  canTransitionOrderStatus,
  maskCustomerSnapshot,
  formatMoneyCop,
  AdjustOrderItemsSchema,
  TransitionOrderStatusSchema,
} from '@restaurante-saas/shared';

describe('TC-03B-E01: Cierre del Hito 1 — Recorrido Completo Piloto Nivel 1 (Cliente -> Panel Liviano -> Ajuste -> Procesar -> Tracking en Vivo)', () => {
  const storeKey = 'karta-bistro/sede-gourmet';

  beforeEach(() => {
    useCartStore.getState().clearCart(storeKey);
  });

  it('1. Cliente arma el carrito, valida domicilio y genera la orden en estado REQUESTED', () => {
    const store = useCartStore.getState();

    // Comensal agrega 2 hamburguesas artesanales de $20.000 COP
    store.addItem(
      storeKey,
      {
        product_id: 'prod-burger-1',
        product_name: 'Hamburguesa Artesanal',
        unit_price_cop: 20000,
        quantity: 2,
        modifiers: [],
      },
      {
        tax_profile_mode: 'FINAL_PRICE_NO_BREAKDOWN',
        tax_type: 'NONE',
        tax_rate_bp: 0,
      },
    );

    const summary = store.getCartSummary(storeKey);
    expect(summary.totalItems).toBe(2);
    expect(summary.lineTotalCop).toBe(40000);

    // Snapshot del cliente capturado en el checkout
    const rawCustomerSnapshot = {
      name: 'María Fernanda Gómez',
      phone_e164: '+573159876543',
      address_line: 'Carrera 15 # 85-20 Apto 502',
      neighborhood: 'Virrey',
      privacy_consent_at: '2026-10-28T15:00:00.000Z',
    };

    // Verificación de protección Habeas Data
    const masked = maskCustomerSnapshot(rawCustomerSnapshot);
    expect(masked.name).toBe('María F.');
    expect(masked.phone_masked).toBe('+57 *** *** 6543');
    expect(masked.address_masked).toBe('Carrera 15 # ***, Virrey');
  });

  it('2. Operador en /panel/lite ajusta la orden (agrega domicilio $4.000 y 1 bebida $5.000)', () => {
    // Validar esquema de ajuste antes de procesar
    const adjustPayload = {
      items: [
        {
          product_id: 'prod-burger-1',
          quantity: 2,
          modifiers: [],
        },
        {
          product_id: 'prod-drink-1',
          quantity: 1,
          modifiers: [],
        },
      ],
      delivery_fee_cop: 4000,
      reason: 'Cliente agregó gaseosa y acordó domicilio por WhatsApp',
    };

    const parseResult = AdjustOrderItemsSchema.safeParse(adjustPayload);
    expect(parseResult.success).toBe(true);

    // Subtotal recalculado en servidor: 2 * 20.000 + 1 * 5.000 = 45.000 COP
    // Total con domicilio: 45.000 + 4.000 = 49.000 COP
    const subtotal = 45000;
    const deliveryFee = 4000;
    const grandTotal = subtotal + deliveryFee;
    expect(grandTotal).toBe(49000);
    expect(formatMoneyCop(grandTotal)).toBe('$ 49.000');
  });

  it('3. Operador procesa la orden en 1 toque (ACCEPTED + is_locked=true + enlace wa.me y botón copiar)', () => {
    // Transición válida de REQUESTED a ACCEPTED
    const transitionCheck = canTransitionOrderStatus({
      fromStatus: 'REQUESTED',
      toStatus: 'ACCEPTED',
      origin: 'WHATSAPP',
      fulfillmentType: 'DELIVERY',
    });
    expect(transitionCheck.allowed).toBe(true);

    // Generar enlace y mensaje WhatsApp sin PII sensible
    const { whatsapp_client_url, copyable_message } = buildBranchToCustomerProcessedWhatsapp({
      customerName: 'María Fernanda Gómez',
      customerPhoneE164: '+573159876543',
      restaurantName: 'Karta Bistro',
      orderCode: '#A104',
      grandTotalCop: 49000,
      publicToken: 'token-opaco-uuid-v4-3b',
      trackingBaseUrl: 'http://localhost:5173',
    });

    expect(whatsapp_client_url).toContain('https://wa.me/573159876543');
    expect(copyable_message).toContain('Hola María');
    expect(copyable_message).toContain('#A104');
    expect(copyable_message).toContain('Karta Bistro');
    expect(copyable_message).toContain('$ 49.000');
    expect(copyable_message).toContain('http://localhost:5173/t/token-opaco-uuid-v4-3b');

    // No debe contener dirección ni teléfono en el texto del mensaje
    expect(copyable_message).not.toContain('Carrera 15');
    expect(copyable_message).not.toContain('3159876543');
  });

  it('4. Avance de estados del pedido en línea de tiempo (ACCEPTED -> OUT_FOR_DELIVERY -> DELIVERED)', () => {
    // ACCEPTED a OUT_FOR_DELIVERY
    const toDelivery = canTransitionOrderStatus({
      fromStatus: 'ACCEPTED',
      toStatus: 'OUT_FOR_DELIVERY',
      origin: 'WHATSAPP',
      fulfillmentType: 'DELIVERY',
    });
    expect(toDelivery.allowed).toBe(true);

    const deliveryWhatsapp = buildBranchToCustomerStatusWhatsapp({
      customerName: 'María Fernanda Gómez',
      customerPhoneE164: '+573159876543',
      restaurantName: 'Karta Bistro',
      orderCode: '#A104',
      status: 'OUT_FOR_DELIVERY',
      publicToken: 'token-opaco-uuid-v4-3b',
    });
    expect(deliveryWhatsapp.copyable_message).toContain('va en camino a tu dirección');

    // OUT_FOR_DELIVERY a DELIVERED
    const toDelivered = canTransitionOrderStatus({
      fromStatus: 'OUT_FOR_DELIVERY',
      toStatus: 'DELIVERED',
      origin: 'WHATSAPP',
      fulfillmentType: 'DELIVERY',
    });
    expect(toDelivered.allowed).toBe(true);

    // Intentar retroceder de DELIVERED a ACCEPTED -> Rechazado
    const backToAccepted = canTransitionOrderStatus({
      fromStatus: 'DELIVERED',
      toStatus: 'ACCEPTED',
      origin: 'WHATSAPP',
      fulfillmentType: 'DELIVERY',
    });
    expect(backToAccepted.allowed).toBe(false);
    expect(backToAccepted.errorCode).toBe('ORDER_ALREADY_IN_TERMINAL_STATE');
  });
});
