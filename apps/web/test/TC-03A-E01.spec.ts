import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/stores/cart.store';
import {
  buildCustomerToBranchWhatsappUrl,
  CreatePublicOrderSchema,
  calculateLinePricing,
  formatMoneyCop,
} from '@restaurante-saas/shared';

describe('TC-03A-E01: Flujo Completo en Vitrina Pública: Carrito Zustand, Validación de Zona y Confirmación WhatsApp', () => {
  const storeKey = 'karta-bistro/sede-norte';

  beforeEach(() => {
    useCartStore.getState().clearCart(storeKey);
  });

  it('1. Debe agregar un producto con variante y modificadores al carrito Zustand y calcular los totales', () => {
    const store = useCartStore.getState();

    // Agregar producto con variante y modificador
    store.addItem(
      storeKey,
      {
        product_id: '11111111-2222-3333-4444-555555555555',
        product_name: 'Hamburguesa Doble Queso',
        variant_id: 'aaaa1111-2222-3333-4444-555555555555',
        variant_name: 'Doble Carne',
        unit_price_cop: 28000,
        quantity: 2,
        modifiers: [
          {
            id: 'bbbb1111-2222-3333-4444-555555555555',
            name: 'Tocineta Ahumada',
            extra_price_cop: 4000,
          },
        ],
        notes: 'Papas bien doradas',
      },
      {
        tax_profile_mode: 'FINAL_PRICE_NO_BREAKDOWN',
        tax_type: 'NONE',
        tax_rate_bp: 0,
      },
    );

    const items = store.getCartItems(storeKey);
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(2);
    expect(items[0]?.product_name).toBe('Hamburguesa Doble Queso');
    expect(items[0]?.variant_name).toBe('Doble Carne');
    expect(items[0]?.modifiers).toHaveLength(1);

    // Precio unitario: (28000 + 4000) = 32000. Total 2 unidades = 64000
    const summary = store.getCartSummary(storeKey);
    expect(summary.totalItems).toBe(2);
    expect(summary.lineTotalCop).toBe(64000);
  });

  it('2. Valida las reglas de entrada del Checkout (Dirección, Zona y Consentimiento Ley 1581)', () => {
    const validBranchId = '11111111-1111-1111-1111-111111111111';
    const validProductId = '22222222-2222-2222-2222-222222222222';
    const validZoneId = '33333333-3333-3333-3333-333333333333';

    // Intento 1: Sin aceptar consentimiento de privacidad Ley 1581 -> Rechazo Zod
    const noConsentOrder = {
      branch_id: validBranchId,
      origin: 'WHATSAPP',
      fulfillment_type: 'DELIVERY',
      customer: {
        name: 'Carlos Ramírez',
        phone: '3001234567',
        privacy_consent_accepted: false,
      },
      delivery: {
        delivery_zone_id: validZoneId,
        address_line: 'Calle 19 # 8-45 Apto 302',
        neighborhood: 'Centro Histórico',
      },
      items: [{ product_id: validProductId, quantity: 1 }],
    };

    const resNoConsent = CreatePublicOrderSchema.safeParse(noConsentOrder);
    expect(resNoConsent.success).toBe(false);

    // Intento 2: Modalidad DELIVERY sin especificar dirección o zona -> Rechazo Zod
    const missingAddressOrder = {
      branch_id: validBranchId,
      origin: 'WHATSAPP',
      fulfillment_type: 'DELIVERY',
      customer: {
        name: 'Carlos Ramírez',
        phone: '3001234567',
        privacy_consent_accepted: true,
      },
      delivery: null,
      items: [{ product_id: validProductId, quantity: 1 }],
    };

    const resNoAddress = CreatePublicOrderSchema.safeParse(missingAddressOrder);
    expect(resNoAddress.success).toBe(false);

    // Intento 3: Formulario completo válido con Domicilio y Consentimiento -> Aceptado
    const validOrder = {
      branch_id: validBranchId,
      origin: 'WHATSAPP',
      fulfillment_type: 'DELIVERY',
      customer: {
        name: 'Carlos Ramírez',
        phone: '3001234567',
        privacy_consent_accepted: true,
      },
      delivery: {
        delivery_zone_id: validZoneId,
        address_line: 'Calle 19 # 8-45 Apto 302',
        neighborhood: 'Centro Histórico',
        reference_notes: 'Edificio esquinero',
      },
      items: [{ product_id: validProductId, quantity: 1 }],
    };

    const resValid = CreatePublicOrderSchema.safeParse(validOrder);
    expect(resValid.success).toBe(true);
  });

  it('3. Genera el enlace wa.me con #A101 prellenado, modalidad y total en COP, limpiando el carrito', () => {
    const store = useCartStore.getState();

    // Agregar producto
    store.addItem(
      storeKey,
      {
        product_id: 'p1',
        product_name: 'Pizza Artesanal',
        unit_price_cop: 35000,
        quantity: 1,
        modifiers: [],
      },
      {
        tax_profile_mode: 'FINAL_PRICE_NO_BREAKDOWN',
        tax_type: 'NONE',
        tax_rate_bp: 0,
      },
    );

    expect(store.getCartItems(storeKey)).toHaveLength(1);

    // Simular generación de enlace wa.me tras creación de orden #A101 en servidor
    const orderCode = '#A101';
    const deliveryFeeCop = 5000;
    const subtotalCop = 35000;
    const grandTotalCop = subtotalCop + deliveryFeeCop;

    const whatsappUrl = buildCustomerToBranchWhatsappUrl({
      branchWhatsAppPhone: '+573009998877',
      orderCode,
      restaurantName: 'Karta Bistro',
      customerName: 'Carlos Ramírez',
      fulfillmentType: 'DELIVERY',
      items: [
        {
          quantity: 1,
          productName: 'Pizza Artesanal',
          unitPriceCop: 35000,
          lineTotalCop: 35000,
        },
      ],
      subtotalProductsCop: subtotalCop,
      deliveryFeeCop,
      grandTotalCop,
      deliveryAddress: {
        addressLine: 'Calle 19 # 8-45 Apto 302',
        neighborhood: 'Centro',
        referenceNotes: 'Edificio esquinero',
      },
    });

    expect(whatsappUrl).toContain('https://wa.me/573009998877?text=');
    const decodedMessage = decodeURIComponent(whatsappUrl.split('text=')[1]);

    expect(decodedMessage).toContain('#A101');
    expect(decodedMessage).toContain('Karta Bistro');
    expect(decodedMessage).toContain('Domicilio (Delivery)');
    expect(decodedMessage).toContain('Pizza Artesanal');
    expect(decodedMessage).toContain(formatMoneyCop(grandTotalCop));
    expect(decodedMessage).toContain('Calle 19 # 8-45 Apto 302');

    // Al confirmarse el pedido, el carrito se limpia
    store.clearCart(storeKey);
    expect(store.getCartItems(storeKey)).toHaveLength(0);
    expect(store.getCartSummary(storeKey).totalItems).toBe(0);
  });
});
