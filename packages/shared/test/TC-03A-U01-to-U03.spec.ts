import { describe, it, expect } from 'vitest';
import {
  canTransitionOrder,
  buildCustomerToBranchWhatsappUrl,
  maskCustomerSnapshot,
  CreatePublicOrderSchema,
  CreateDeliveryZoneDtoSchema,
  type CustomerSnapshot,
} from '../src';

describe('Pruebas Unitarias Fase 03A (Motor de Pedidos, Antifraude y WhatsApp)', () => {
  // -------------------------------------------------------------------------
  // TC-03A-U01: Máquina de Estados Evaluando fulfillment_type, origin y Pre-Cobro
  // -------------------------------------------------------------------------
  describe('TC-03A-U01: Máquina de Estados canTransitionOrder', () => {
    it('Permite el flujo canónico para PICKUP (ACCEPTED -> PREPARING -> READY -> PICKED_UP)', () => {
      const step1 = canTransitionOrder({
        fromStatus: 'ACCEPTED',
        toStatus: 'PREPARING',
        origin: 'WHATSAPP',
        fulfillmentType: 'PICKUP',
      });
      expect(step1.allowed).toBe(true);

      const step2 = canTransitionOrder({
        fromStatus: 'PREPARING',
        toStatus: 'READY',
        origin: 'WHATSAPP',
        fulfillmentType: 'PICKUP',
      });
      expect(step2.allowed).toBe(true);

      const step3 = canTransitionOrder({
        fromStatus: 'READY',
        toStatus: 'PICKED_UP',
        origin: 'WHATSAPP',
        fulfillmentType: 'PICKUP',
      });
      expect(step3.allowed).toBe(true);
    });

    it('Rechaza OUT_FOR_DELIVERY y DELIVERED si fulfillmentType === PICKUP con INVALID_STATUS_FOR_FULFILLMENT_TYPE', () => {
      const resDelivery = canTransitionOrder({
        fromStatus: 'READY',
        toStatus: 'OUT_FOR_DELIVERY',
        origin: 'WHATSAPP',
        fulfillmentType: 'PICKUP',
      });
      expect(resDelivery.allowed).toBe(false);
      expect(resDelivery.errorCode).toBe('INVALID_STATUS_FOR_FULFILLMENT_TYPE');

      const resDelivered = canTransitionOrder({
        fromStatus: 'READY',
        toStatus: 'DELIVERED',
        origin: 'WHATSAPP',
        fulfillmentType: 'PICKUP',
      });
      expect(resDelivered.allowed).toBe(false);
      expect(resDelivered.errorCode).toBe('INVALID_STATUS_FOR_FULFILLMENT_TYPE');
    });

    it('Permite OUT_FOR_DELIVERY y DELIVERED en DELIVERY, pero rechaza PICKED_UP', () => {
      const resOut = canTransitionOrder({
        fromStatus: 'READY',
        toStatus: 'OUT_FOR_DELIVERY',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(resOut.allowed).toBe(true);

      const resDelivered = canTransitionOrder({
        fromStatus: 'OUT_FOR_DELIVERY',
        toStatus: 'DELIVERED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(resDelivered.allowed).toBe(true);

      const resPickedUp = canTransitionOrder({
        fromStatus: 'READY',
        toStatus: 'PICKED_UP',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(resPickedUp.allowed).toBe(false);
      expect(resPickedUp.errorCode).toBe('INVALID_STATUS_FOR_FULFILLMENT_TYPE');
    });

    it('Rechaza saltar de REQUESTED a PREPARING, READY o DELIVERED sin pasar por ACCEPTED', () => {
      const resPreparing = canTransitionOrder({
        fromStatus: 'REQUESTED',
        toStatus: 'PREPARING',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(resPreparing.allowed).toBe(false);
      expect(resPreparing.errorCode).toBe('ORDER_MUST_BE_ACCEPTED_FIRST');

      const resReady = canTransitionOrder({
        fromStatus: 'REQUESTED',
        toStatus: 'READY',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(resReady.allowed).toBe(false);
      expect(resReady.errorCode).toBe('ORDER_MUST_BE_ACCEPTED_FIRST');

      const resAccepted = canTransitionOrder({
        fromStatus: 'REQUESTED',
        toStatus: 'ACCEPTED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(resAccepted.allowed).toBe(true);
    });

    it('Rechaza PREPARING cuando requirePaymentBeforePreparation es true y paymentStatus no es PAID', () => {
      const resUnpaid = canTransitionOrder({
        fromStatus: 'ACCEPTED',
        toStatus: 'PREPARING',
        origin: 'WEB_DIRECT',
        fulfillmentType: 'DELIVERY',
        requirePaymentBeforePreparation: true,
        paymentStatus: 'UNPAID',
      });
      expect(resUnpaid.allowed).toBe(false);
      expect(resUnpaid.errorCode).toBe('PAYMENT_REQUIRED_BEFORE_PREPARATION');

      const resPaid = canTransitionOrder({
        fromStatus: 'ACCEPTED',
        toStatus: 'PREPARING',
        origin: 'WEB_DIRECT',
        fulfillmentType: 'DELIVERY',
        requirePaymentBeforePreparation: true,
        paymentStatus: 'PAID',
      });
      expect(resPaid.allowed).toBe(true);
    });

    it('Rechaza transiciones desde estados terminales con ORDER_ALREADY_IN_TERMINAL_STATE', () => {
      const res = canTransitionOrder({
        fromStatus: 'DELIVERED',
        toStatus: 'CANCELLED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe('ORDER_ALREADY_IN_TERMINAL_STATE');
    });

    it('Rechaza CANCELLED o REJECTED si el pedido tiene pagos activos (paidTotalCop > 0)', () => {
      const res = canTransitionOrder({
        fromStatus: 'ACCEPTED',
        toStatus: 'CANCELLED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
        paidTotalCop: 35000,
      });
      expect(res.allowed).toBe(false);
      expect(res.errorCode).toBe('ORDER_HAS_ACTIVE_PAYMENTS');
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-U02: Generación wa.me Cliente -> Sucursal y Enmascaramiento PII
  // -------------------------------------------------------------------------
  describe('TC-03A-U02: Enlaces WhatsApp y Enmascaramiento Ley 1581', () => {
    it('Genera URL wa.me válida conteniendo #A101, modalidad, ítems y total en COP', () => {
      const url = buildCustomerToBranchWhatsappUrl({
        branchWhatsAppPhone: '+573009998877',
        orderCode: '#A101',
        restaurantName: 'Bistro Gourmet',
        customerName: 'Carlos Ramírez',
        fulfillmentType: 'DELIVERY',
        items: [
          {
            quantity: 2,
            productName: 'Hamburguesa Artesanal',
            variantName: 'Doble Carne',
            modifiers: ['Tocineta ahumada', 'Queso Cheddar'],
            unitPriceCop: 25000,
            lineTotalCop: 50000,
          },
        ],
        subtotalProductsCop: 50000,
        deliveryFeeCop: 5000,
        grandTotalCop: 55000,
        deliveryAddress: {
          addressLine: 'Calle 19 # 8-45 Apto 302',
          neighborhood: 'Centro Histórico',
          referenceNotes: 'Edificio esquinero',
        },
        notes: 'Bien cocida por favor',
      });

      expect(url).toContain('https://wa.me/573009998877?text=');
      const decodedText = decodeURIComponent(url.split('text=')[1]);

      expect(decodedText).toContain('#A101');
      expect(decodedText).toContain('Domicilio (Delivery)');
      expect(decodedText).toContain('Hamburguesa Artesanal (Doble Carne)');
      expect(decodedText).toContain('Tocineta ahumada');
      expect(decodedText).toContain('$ 55.000');
      expect(decodedText).toContain('Calle 19 # 8-45 Apto 302');
    });

    it('Enmascara datos sensibles de CustomerSnapshot (Nombre, Teléfono E.164 y Dirección)', () => {
      const snapshot: CustomerSnapshot = {
        name: 'Carlos Ramírez',
        phone_e164: '+573001234567',
        delivery_zone_id: 'd9b2d8e4-1234-5678-9abc-def012345678',
        delivery_zone_name: 'Zona Centro',
        address_line: 'Calle 19 # 8-45 Apto 302',
        neighborhood: 'Centro Histórico',
        reference_notes: 'Llamar al timbre 302',
        privacy_consent_at: new Date().toISOString(),
      };

      const masked = maskCustomerSnapshot(snapshot);

      expect(masked.name).toBe('Carlos R.');
      expect(masked.phone_e164).toBe('+57 *** *** 4567');
      expect(masked.address_line).toBe('Calle ** # *-** Apto ***');
      expect(masked.reference_notes).toBe('Llamar al timbre ***');
      expect(masked.neighborhood).toBe('Centro Histórico');
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-U03: Validación Zod de CreatePublicOrderSchema y DeliveryZoneSchema
  // -------------------------------------------------------------------------
  describe('TC-03A-U03: Esquemas Zod de Creación de Pedido y Cobertura', () => {
    const validBranchId = '11111111-1111-1111-1111-111111111111';
    const validProductId = '22222222-2222-2222-2222-222222222222';
    const validZoneId = '33333333-3333-3333-3333-333333333333';

    it('Rechaza pedido en DELIVERY si faltan campos de dirección o zona', () => {
      const invalidDeliveryOrder = {
        branch_id: validBranchId,
        origin: 'WHATSAPP',
        fulfillment_type: 'DELIVERY',
        customer: {
          name: 'Carlos Ramírez',
          phone: '3001234567',
          privacy_consent_accepted: true,
        },
        delivery: null,
        items: [
          {
            product_id: validProductId,
            quantity: 1,
          },
        ],
      };

      const result = CreatePublicOrderSchema.safeParse(invalidDeliveryOrder);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.some((i) => i.path.includes('delivery'))).toBe(true);
      }
    });

    it('Rechaza cualquier pedido donde privacy_consent_accepted no sea true', () => {
      const noConsentOrder = {
        branch_id: validBranchId,
        origin: 'WHATSAPP',
        fulfillment_type: 'PICKUP',
        customer: {
          name: 'Carlos Ramírez',
          phone: '3001234567',
          privacy_consent_accepted: false,
        },
        items: [
          {
            product_id: validProductId,
            quantity: 1,
          },
        ],
      };

      const result = CreatePublicOrderSchema.safeParse(noConsentOrder);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('privacy_consent_accepted'))).toBe(true);
      }
    });

    it('Acepta un pedido válido en modalidad PICKUP sin información de entrega', () => {
      const validPickupOrder = {
        branch_id: validBranchId,
        origin: 'WHATSAPP',
        fulfillment_type: 'PICKUP',
        customer: {
          name: 'Carlos Ramírez',
          phone: '3001234567',
          privacy_consent_accepted: true,
        },
        items: [
          {
            product_id: validProductId,
            quantity: 2,
          },
        ],
      };

      const result = CreatePublicOrderSchema.safeParse(validPickupOrder);
      expect(result.success).toBe(true);
    });

    it('Valida CreateDeliveryZoneDtoSchema rechazando tiempos inconsistentes o tarifas negativas', () => {
      const invalidZone = {
        name: 'Zona Norte',
        polygon_or_neighborhoods_json: ['Usaquén', 'Cedritos'],
        delivery_fee_cop: -1000,
        min_order_cop: 25000,
        estimated_minutes_min: 45,
        estimated_minutes_max: 30, // Inconsistente: max < min
      };

      const result = CreateDeliveryZoneDtoSchema.safeParse(invalidZone);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('delivery_fee_cop'))).toBe(true);
        expect(result.error.issues.some((i) => i.path.includes('estimated_minutes_max'))).toBe(true);
      }
    });
  });
});
