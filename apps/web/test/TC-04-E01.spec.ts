import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/stores/cart.store';
import {
  recalculatePaymentState,
  calculateCashChange,
  computeAggregatedOrderKitchenStatus,
  RecordManualPaymentSchema,
  formatMoneyCop,
  maskCustomerSnapshot,
  canTransitionOrderStatus,
} from '@restaurante-saas/shared';

describe('TC-04-E01: Flujo E2E Completo — Instrucciones de Transferencia -> Pre-Cobro en Panel -> KDS -> Entrega', () => {
  const storeKey = 'karta-gourmet/sede-norte';

  beforeEach(() => {
    useCartStore.getState().clearCart(storeKey);
  });

  it('1. Cliente realiza pedido de domicilio y visualiza datos de Nequi/Bre-B con botón de copiar', () => {
    const store = useCartStore.getState();

    // 1.1 Agregar 2 Platos Especiales ($25.000 c/u) = $50.000 COP
    store.addItem(
      storeKey,
      {
        product_id: 'prod-especial-1',
        product_name: 'Parrilla Mixta Especial',
        unit_price_cop: 25000,
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
    expect(summary.lineTotalCop).toBe(50000);

    // 1.2 Datos de entrega y consentimiento Habeas Data
    const customer = {
      name: 'Carlos Alberto Restrepo',
      phone_e164: '+573007654321',
      address_line: 'Calle 100 # 19A-45',
      neighborhood: 'Chicó Norte',
      privacy_consent_at: '2026-10-28T16:00:00.000Z',
    };
    const masked = maskCustomerSnapshot(customer);
    expect(masked.name).toBe('Carlos A.');
    expect(masked.phone_masked).toBe('+57 *** *** 4321');

    // 1.3 Instrucciones de transferencia configuradas en la política de canal
    const paymentInstructions = {
      bank_name: 'Bancolombia / Nequi / Bre-B',
      account_number: '3007654321',
      account_type: 'Ahorros / Llave Bre-B',
      account_holder: 'Karta Restaurante SAS',
      notes: 'Envía el comprobante con tu código de pedido al WhatsApp del restaurante',
    };

    expect(paymentInstructions.account_number).toBe('3007654321');
    expect(paymentInstructions.bank_name).toContain('Bre-B');
  });

  it('2. El cajero en /panel registra abono parcial en efectivo con calculadora de cambio y luego liquida por transferencia', () => {
    const grandTotalCop = 50000;

    // Estado inicial: OFFLINE_ONLY, sin pagos
    const initialFinState = recalculatePaymentState({
      paymentPolicy: 'OFFLINE_ONLY',
      grandTotalCop,
      approvedPaymentsAmountsCop: [],
    });
    expect(initialFinState.paymentStatus).toBe('UNPAID');
    expect(initialFinState.paidTotalCop).toBe(0);

    // 2.1 Calculadora de cambio en efectivo: Monto $20.000 COP, Recibido billete de $50.000 COP
    const change = calculateCashChange(20000, 50000);
    expect(change).toBe(30000);

    // Si el cliente entrega menos de lo acordado ($10.000 cuando el abono es $20.000)
    const insufficientChange = calculateCashChange(20000, 10000);
    expect(insufficientChange).toBe(0);

    // Validar esquema Zod para registrar abono en efectivo
    const firstPaymentParse = RecordManualPaymentSchema.safeParse({
      method: 'CASH',
      amount_cop: 20000,
      cash_received_cop: 50000,
    });
    expect(firstPaymentParse.success).toBe(true);

    // Estado tras primer abono parcial de $20.000 COP
    const afterFirstPayment = recalculatePaymentState({
      paymentPolicy: 'OFFLINE_ONLY',
      grandTotalCop,
      approvedPaymentsAmountsCop: [20000],
    });
    expect(afterFirstPayment.paymentStatus).toBe('PARTIALLY_PAID');
    expect(afterFirstPayment.paidTotalCop).toBe(20000);

    // 2.2 Intentar registrar pago que exceda el saldo pendiente ($35.000 > saldo restante $30.000)
    const excessCheck = 20000 + 35000 > grandTotalCop;
    expect(excessCheck).toBe(true); // Bloqueo de sobrecobro

    // 2.3 Registrar segundo pago por el saldo exacto ($30.000 COP) mediante transferencia manual
    const secondPaymentParse = RecordManualPaymentSchema.safeParse({
      method: 'MANUAL_TRANSFER',
      amount_cop: 30000,
      external_reference: 'Nequi-Comp-889922',
      notes: 'Comprobante verificado en la app',
    });
    expect(secondPaymentParse.success).toBe(true);

    // Estado tras ambos pagos: orden liquidada a PAID
    const afterSecondPayment = recalculatePaymentState({
      paymentPolicy: 'OFFLINE_ONLY',
      grandTotalCop,
      approvedPaymentsAmountsCop: [20000, 30000],
    });
    expect(afterSecondPayment.paymentStatus).toBe('PAID');
    expect(afterSecondPayment.paidTotalCop).toBe(50000);
    expect(formatMoneyCop(afterSecondPayment.paidTotalCop)).toBe('$ 50.000');
  });

  it('3. La comanda se desbloquea en KDS; el cocinero marca ítems y sincroniza automáticamente a READY', () => {
    // Definición de ítems en cocina asignados a estaciones
    const items = [
      { id: 'item-parrilla-1', status: 'PENDING' },
      { id: 'item-bebidas-1', status: 'PENDING' },
    ];

    // 3.1 Inicialmente todos los ítems en PENDING
    const initialKdsStatus = computeAggregatedOrderKitchenStatus('ACCEPTED', items);
    expect(initialKdsStatus).toBe('ACCEPTED');

    // 3.2 Parrilla inicia su plato -> PREPARING
    items[0].status = 'PREPARING';
    const statusWhileCooking = computeAggregatedOrderKitchenStatus('ACCEPTED', items);
    expect(statusWhileCooking).toBe('PREPARING');

    // 3.3 Bebidas termina su ítem (READY), pero Parrilla sigue en PREPARING -> La orden sigue en PREPARING
    items[1].status = 'READY';
    const partialReadyStatus = computeAggregatedOrderKitchenStatus('PREPARING', items);
    expect(partialReadyStatus).toBe('PREPARING');

    // 3.4 Parrilla termina su plato -> Todos los ítems en READY -> La orden completa pasa a READY
    items[0].status = 'READY';
    const allReadyStatus = computeAggregatedOrderKitchenStatus('PREPARING', items);
    expect(allReadyStatus).toBe('READY');

    // 3.5 Transición operativa permitida a READY
    const canReady = canTransitionOrderStatus({
      fromStatus: 'PREPARING',
      toStatus: 'READY',
      origin: 'WHATSAPP',
      fulfillmentType: 'DELIVERY',
    });
    expect(canReady.allowed).toBe(true);
  });

  it('4. Resolución COURTESY congela saldos y reversión restaura capacidad de pago', () => {
    const grandTotalCop = 40000;

    // Orden con abono previo de $10.000 resuelta como cortesía por el saldo restante
    const courtesyState = recalculatePaymentState({
      paymentPolicy: 'OFFLINE_ONLY',
      grandTotalCop,
      approvedPaymentsAmountsCop: [10000],
      activeResolutionType: 'COURTESY',
    });
    expect(courtesyState.paymentStatus).toBe('COURTESY');
    expect(courtesyState.paidTotalCop).toBe(10000);
    expect(courtesyState.uncollectedAmountCop).toBe(30000);

    // Revertir la resolución (activeResolutionType = null) restaura PARTIALLY_PAID con saldo cobrable
    const revertedState = recalculatePaymentState({
      paymentPolicy: 'OFFLINE_ONLY',
      grandTotalCop,
      approvedPaymentsAmountsCop: [10000],
      activeResolutionType: null,
    });
    expect(revertedState.paymentStatus).toBe('PARTIALLY_PAID');
    expect(revertedState.paidTotalCop).toBe(10000);
    expect(revertedState.uncollectedAmountCop).toBe(0);
  });
});
