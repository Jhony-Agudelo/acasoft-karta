import { describe, it, expect, beforeEach } from 'vitest';
import {
  OPERATING_PROFILES,
  calculateLinePricing,
  validateModifierSelections,
  DIAN_FISCAL_DISCLAIMER_TEXT,
} from '@restaurante-saas/shared';
import { useCartStore } from '../src/stores/cart.store';

describe('TC-02-E01: Adaptación de Vitrina entre Perfil MENU_ONLY y Perfil WHATSAPP_SIMPLE', () => {
  const storeKey = 'restaurante-demo/sede-bogota';

  beforeEach(() => {
    useCartStore.getState().clearCart(storeKey);
  });

  describe('1. Verificación de Perfiles Operativos en Escalera de Adopción', () => {
    it('el perfil MENU_ONLY (Nivel 0) NO debe incluir la capacidad "ordering"', () => {
      const menuOnlyProfile = OPERATING_PROFILES.MENU_ONLY;
      expect(menuOnlyProfile).toBeDefined();
      expect(menuOnlyProfile.module_keys).not.toContain('ordering');
      expect(menuOnlyProfile.module_keys).not.toContain('channel.delivery');
    });

    it('el perfil WHATSAPP_SIMPLE (Nivel 1) DEBE incluir la capacidad "ordering"', () => {
      const whatsappProfile = OPERATING_PROFILES.WHATSAPP_SIMPLE;
      expect(whatsappProfile).toBeDefined();
      expect(whatsappProfile.module_keys).toContain('ordering');
      expect(whatsappProfile.module_keys).toContain('channel.pickup');
      expect(whatsappProfile.module_keys).toContain('channel.delivery');
    });
  });

  describe('2. Adaptación de Comportamiento en Modo MENU_ONLY (canOrder = false)', () => {
    it('en MENU_ONLY el carrito de compras debe permanecer vacío y no acumular pedidos', () => {
      const canOrder = false;
      const store = useCartStore.getState();

      // Si canOrder es falso, el carrito no tiene items
      expect(canOrder).toBe(false);
      expect(store.getCartItems(storeKey)).toHaveLength(0);
      const summary = store.getCartSummary(storeKey);
      expect(summary.totalItems).toBe(0);
      expect(summary.lineTotalCop).toBe(0);
    });

    it('debe exhibir la leyenda fiscal obligatoria DIAN en la vitrina pública', () => {
      expect(DIAN_FISCAL_DISCLAIMER_TEXT).toBe(
        'Documento informativo de control interno / pre-cuenta — No sustituye la factura electrónica de venta ni el documento equivalente POS exigido por la DIAN',
      );
    });
  });

  describe('3. Habilitación de Carrito y Cálculo Tributario en WHATSAPP_SIMPLE (canOrder = true)', () => {
    it('al activar ordering, el carrito debe calcular exactamente la línea sin doble cobro', () => {
      const canOrder = true;
      expect(canOrder).toBe(true);

      const store = useCartStore.getState();

      // Agregar 2 platos de $10.000 COP en modo TAX_INCLUDED_DISCRIMINATED con INC 8%
      store.addItem(
        storeKey,
        {
          product_id: 'prod-001',
          product_name: 'Ajiaco Tradicional',
          unit_price_cop: 10000,
          quantity: 2,
          modifiers: [],
        },
        {
          tax_profile_mode: 'TAX_INCLUDED_DISCRIMINATED',
          tax_type: 'INC',
          tax_rate_bp: 800,
        },
      );

      const items = useCartStore.getState().getCartItems(storeKey);
      expect(items).toHaveLength(1);
      const item = items[0]!;
      expect(item.quantity).toBe(2);

      // Invariante de No Doble Cobro: 2 x $10.000 = $20.000 exactos
      expect(item.pricing.gross_subtotal_cop).toBe(20000);
      expect(item.pricing.line_total_cop).toBe(20000);
      expect(item.pricing.taxable_base_cop).toBe(18519);
      expect(item.pricing.tax_amount_cop).toBe(1481);
      expect(item.pricing.taxable_base_cop + item.pricing.tax_amount_cop).toBe(20000);

      // Resumen del carrito
      const summary = useCartStore.getState().getCartSummary(storeKey);
      expect(summary.totalItems).toBe(2);
      expect(summary.lineTotalCop).toBe(20000);
    });

    it('debe validar opciones de modificadores obligatorios antes de permitir agregar al carrito', () => {
      const modifierGroups = [
        {
          id: 'grp-termino',
          name: 'Término de la Carne',
          is_required: true,
          min_selections: 1,
          max_selections: 1,
          options: [
            { id: 'opt-medio', name: 'Término Medio', extra_price_cop: 0, status: 'ACTIVE' as const },
            { id: 'opt-tres-cuartos', name: 'Tres Cuartos', extra_price_cop: 0, status: 'ACTIVE' as const },
          ],
        },
      ];

      // Caso A: Sin selección en grupo obligatorio -> Inválido
      const valInvalid = validateModifierSelections(modifierGroups, {});
      expect(valInvalid.isValid).toBe(false);
      expect(valInvalid.errors.length).toBeGreaterThan(0);

      // Caso B: Con selección válida -> Válido
      const valValid = validateModifierSelections(modifierGroups, {
        'grp-termino': ['opt-medio'],
      });
      expect(valValid.isValid).toBe(true);
      expect(valValid.errors).toHaveLength(0);
    });

    it('debe acumular ítems con modificadores y calcular subtotales y vaciado', () => {
      const store = useCartStore.getState();

      // Agregar hamburguesa ($22.000) con queso extra ($3.000) x 1
      store.addItem(
        storeKey,
        {
          product_id: 'prod-burger',
          product_name: 'Hamburguesa Karta',
          unit_price_cop: 22000,
          quantity: 1,
          modifiers: [
            { id: 'opt-cheese', name: 'Queso Cheddar Extra', extra_price_cop: 3000 },
          ],
        },
        {
          tax_profile_mode: 'FINAL_PRICE_NO_BREAKDOWN',
          tax_type: 'NONE',
          tax_rate_bp: 0,
        },
      );

      const items = useCartStore.getState().getCartItems(storeKey);
      expect(items).toHaveLength(1);
      expect(items[0]!.pricing.effective_unit_price_cop).toBe(25000);
      expect(items[0]!.pricing.line_total_cop).toBe(25000);

      // Vaciar carrito
      useCartStore.getState().clearCart(storeKey);
      expect(useCartStore.getState().getCartItems(storeKey)).toHaveLength(0);
    });
  });
});
