import { describe, it, expect } from 'vitest';
import {
  canTransitionOrderStatus,
  canTransitionOrder,
  maskCustomerSnapshot,
  buildBranchToCustomerProcessedWhatsapp,
  buildBranchToCustomerStatusWhatsapp,
  AdjustOrderItemsSchema,
  TransitionOrderStatusSchema,
} from '../src';

describe('Pruebas Unitarias Fase 03B: TC-03B-U01 a TC-03B-U03', () => {
  describe('TC-03B-U01: Máquina de Estados evaluando origin y fulfillment_type', () => {
    it('una orden en REQUESTED puede transicionar a ACCEPTED, REJECTED o EXPIRED_UNPROCESSED', () => {
      const toAccepted = canTransitionOrderStatus({
        fromStatus: 'REQUESTED',
        toStatus: 'ACCEPTED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(toAccepted.allowed).toBe(true);

      const toRejected = canTransitionOrderStatus({
        fromStatus: 'REQUESTED',
        toStatus: 'REJECTED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(toRejected.allowed).toBe(true);

      const toExpired = canTransitionOrderStatus({
        fromStatus: 'REQUESTED',
        toStatus: 'EXPIRED_UNPROCESSED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(toExpired.allowed).toBe(true);
    });

    it('una orden en REQUESTED rechaza saltar directamente a PREPARING, READY, OUT_FOR_DELIVERY o DELIVERED', () => {
      const invalidStatuses: Array<'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED'> = [
        'PREPARING',
        'READY',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
      ];

      for (const target of invalidStatuses) {
        const result = canTransitionOrderStatus({
          fromStatus: 'REQUESTED',
          toStatus: target,
          origin: 'WHATSAPP',
          fulfillmentType: 'DELIVERY',
        });
        expect(result.allowed).toBe(false);
        expect(result.errorCode).toBe('ORDER_MUST_BE_ACCEPTED_FIRST');
      }
    });

    it('una orden DELIVERY en ACCEPTED puede pasar a OUT_FOR_DELIVERY y DELIVERED, pero rechaza PICKED_UP o SERVED', () => {
      const toOutForDelivery = canTransitionOrderStatus({
        fromStatus: 'ACCEPTED',
        toStatus: 'OUT_FOR_DELIVERY',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(toOutForDelivery.allowed).toBe(true);

      const toDelivered = canTransitionOrderStatus({
        fromStatus: 'OUT_FOR_DELIVERY',
        toStatus: 'DELIVERED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(toDelivered.allowed).toBe(true);

      const toPickedUp = canTransitionOrderStatus({
        fromStatus: 'ACCEPTED',
        toStatus: 'PICKED_UP',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(toPickedUp.allowed).toBe(false);
      expect(toPickedUp.errorCode).toBe('INVALID_STATUS_FOR_FULFILLMENT_TYPE');

      const toServed = canTransitionOrderStatus({
        fromStatus: 'ACCEPTED',
        toStatus: 'SERVED',
        origin: 'WHATSAPP',
        fulfillmentType: 'DELIVERY',
      });
      expect(toServed.allowed).toBe(false);
      expect(toServed.errorCode).toBe('INVALID_STATUS_FOR_FULFILLMENT_TYPE');
    });

    it('una orden PICKUP en ACCEPTED puede pasar a READY y PICKED_UP, pero rechaza OUT_FOR_DELIVERY', () => {
      const toReady = canTransitionOrderStatus({
        fromStatus: 'ACCEPTED',
        toStatus: 'READY',
        origin: 'WHATSAPP',
        fulfillmentType: 'PICKUP',
      });
      expect(toReady.allowed).toBe(true);

      const toPickedUp = canTransitionOrderStatus({
        fromStatus: 'READY',
        toStatus: 'PICKED_UP',
        origin: 'WHATSAPP',
        fulfillmentType: 'PICKUP',
      });
      expect(toPickedUp.allowed).toBe(true);

      const toOutForDelivery = canTransitionOrderStatus({
        fromStatus: 'ACCEPTED',
        toStatus: 'OUT_FOR_DELIVERY',
        origin: 'WHATSAPP',
        fulfillmentType: 'PICKUP',
      });
      expect(toOutForDelivery.allowed).toBe(false);
      expect(toOutForDelivery.errorCode).toBe('INVALID_STATUS_FOR_FULFILLMENT_TYPE');
    });
  });

  describe('TC-03B-U02: Enmascaramiento de PII en maskCustomerSnapshot', () => {
    it('debe enmascarar nombre, teléfono y dirección sin exponer datos sensibles', () => {
      const input = {
        name: 'María Fernanda Gómez',
        phone_e164: '+573159876543',
        address_line: 'Carrera 15 # 85-20 Apto 502',
        neighborhood: 'Virrey',
      };

      const result = maskCustomerSnapshot(input);

      expect(result.name).toBe('María F.');
      expect(result.phone_masked).toBe('+57 *** *** 6543');
      expect(result.address_masked).toBe('Carrera 15 # ***, Virrey');

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('3159876543');
      expect(serialized).not.toContain('85-20 Apto 502');
    });

    it('conserva nombres de una sola palabra y enmascara direcciones sin numeral', () => {
      const input = {
        name: 'Santiago',
        phone_e164: '+573001234567',
        address_line: 'Avenida 68 número 45',
        neighborhood: 'Salitre',
      };

      const result = maskCustomerSnapshot(input);
      expect(result.name).toBe('Santiago');
      expect(result.phone_masked).toBe('+57 *** *** 4567');
      expect(result.address_masked).toContain('Avenida *** número ***, Salitre');
    });
  });

  describe('TC-03B-U03: Mensaje de Retorno a WhatsApp sin Datos Sensibles', () => {
    it('buildBranchToCustomerProcessedWhatsapp genera enlace y texto correcto sin dirección ni teléfono en el mensaje', () => {
      const result = buildBranchToCustomerProcessedWhatsapp({
        customerName: 'María Fernanda Gómez',
        customerPhoneE164: '+573159876543',
        restaurantName: 'El Sabor Bistro',
        orderCode: '#A104',
        grandTotalCop: 44000,
        publicToken: 'token-opaco-12345',
        trackingBaseUrl: 'https://app.restaurantesaas.co',
      });

      expect(result.whatsapp_client_url).toContain('https://wa.me/573159876543');
      expect(result.copyable_message).toContain('Hola María');
      expect(result.copyable_message).toContain('#A104');
      expect(result.copyable_message).toContain('El Sabor Bistro');
      expect(result.copyable_message).toContain('$ 44.000');
      expect(result.copyable_message).toContain('https://app.restaurantesaas.co/t/token-opaco-12345');

      // No debe contener dirección ni teléfono en el cuerpo del mensaje
      expect(result.copyable_message).not.toContain('Carrera');
      expect(result.copyable_message).not.toContain('Calle');
      expect(result.copyable_message).not.toContain('3159876543');
    });

    it('buildBranchToCustomerStatusWhatsapp genera mensajes para READY y OUT_FOR_DELIVERY', () => {
      const readyMsg = buildBranchToCustomerStatusWhatsapp({
        customerName: 'Carlos Rodríguez',
        customerPhoneE164: '+573001234567',
        restaurantName: 'Karta Grill',
        orderCode: '#A105',
        status: 'READY',
        publicToken: 'tok-ready',
      });
      expect(readyMsg.copyable_message).toContain('listo para recoger');
      expect(readyMsg.whatsapp_client_url).toContain('573001234567');

      const deliveryMsg = buildBranchToCustomerStatusWhatsapp({
        customerName: 'Carlos Rodríguez',
        customerPhoneE164: '+573001234567',
        restaurantName: 'Karta Grill',
        orderCode: '#A105',
        status: 'OUT_FOR_DELIVERY',
        publicToken: 'tok-deliv',
      });
      expect(deliveryMsg.copyable_message).toContain('va en camino a tu dirección');
    });

    it('valida esquemas Zod AdjustOrderItemsSchema y TransitionOrderStatusSchema', () => {
      const validAdjust = AdjustOrderItemsSchema.safeParse({
        items: [
          {
            product_id: 'prod-1',
            quantity: 2,
            modifiers: [],
          },
        ],
        delivery_fee_cop: 5000,
        reason: 'Ajuste telefónico',
      });
      expect(validAdjust.success).toBe(true);

      const invalidEmptyItems = AdjustOrderItemsSchema.safeParse({
        items: [],
        delivery_fee_cop: 0,
      });
      expect(invalidEmptyItems.success).toBe(false);

      const validTransition = TransitionOrderStatusSchema.safeParse({
        to_status: 'ACCEPTED',
      });
      expect(validTransition.success).toBe(true);

      const invalidRejectWithoutReason = TransitionOrderStatusSchema.safeParse({
        to_status: 'REJECTED',
        reason: '',
      });
      expect(invalidRejectWithoutReason.success).toBe(false);

      const validRejectWithReason = TransitionOrderStatusSchema.safeParse({
        to_status: 'REJECTED',
        reason: 'Cocina saturada temporalmente',
      });
      expect(validRejectWithReason.success).toBe(true);
    });
  });
});
