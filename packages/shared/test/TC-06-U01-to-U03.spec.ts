import { describe, it, expect } from 'vitest';
import {
  canTransitionTableStatus,
  canTransitionDiningAccountStatus,
  isActionAllowedOnAccount,
  calculateConsumptionDistribution,
  CloseDiningAccountSchema,
  ReopenDiningAccountSchema,
  TransferTableSchema,
  AddOrderToAccountSchema,
  PutConsumptionDistributionSchema,
} from '../src';

describe('Fase 06 — Pruebas Unitarias (TC-06-U01 a TC-06-U03)', () => {
  describe('TC-06-U01: División Exacta de Plato Compartido entre 3 Personas al Peso (Criterio #12)', () => {
    it('debe repartir una picada de $50.000 COP entre 3 personas en partes iguales asignando $16.667, $16.667 y $16.666 con residuo de 0', () => {
      const items = [
        {
          id: 'item-picada-uuid',
          line_total_cop: 50000,
          product_name: 'Picada Criolla Familiar',
        },
      ];

      const diners = [
        { id: 'diner-1', label: 'Persona 1', sort_order: 1 },
        { id: 'diner-2', label: 'Persona 2', sort_order: 2 },
        { id: 'diner-3', label: 'Persona 3', sort_order: 3 },
      ];

      const assignments = [
        { diner_id: 'diner-1', order_item_id: 'item-picada-uuid', share_units: 1, total_item_shares: 3 },
        { diner_id: 'diner-2', order_item_id: 'item-picada-uuid', share_units: 1, total_item_shares: 3 },
        { diner_id: 'diner-3', order_item_id: 'item-picada-uuid', share_units: 1, total_item_shares: 3 },
      ];

      const result = calculateConsumptionDistribution({
        items,
        diners,
        assignments,
        discount_total_cop: 0,
        tip_cop: 0,
        grand_total_cop: 50000,
        split_rule: 'PROPORTIONAL',
      });

      expect(result.assignments).toHaveLength(3);

      const d1Assign = result.assignments.find((a) => a.diner_id === 'diner-1');
      const d2Assign = result.assignments.find((a) => a.diner_id === 'diner-2');
      const d3Assign = result.assignments.find((a) => a.diner_id === 'diner-3');

      // Residuo determinista de 2 COP: 1 COP a Persona 1, 1 COP a Persona 2
      expect(d1Assign?.assigned_amount_cop).toBe(16667);
      expect(d2Assign?.assigned_amount_cop).toBe(16667);
      expect(d3Assign?.assigned_amount_cop).toBe(16666);

      // Verificación de totales de comensal
      const d1Summary = result.diners.find((d) => d.diner_id === 'diner-1');
      const d2Summary = result.diners.find((d) => d.diner_id === 'diner-2');
      const d3Summary = result.diners.find((d) => d.diner_id === 'diner-3');

      expect(d1Summary?.diner_total_cop).toBe(16667);
      expect(d2Summary?.diner_total_cop).toBe(16667);
      expect(d3Summary?.diner_total_cop).toBe(16666);

      // Cero monto sin asignar y conciliación exacta
      expect(result.unassigned_amount_cop).toBe(0);
      expect(result.is_reconciled).toBe(true);
      expect(
        d1Summary!.diner_total_cop + d2Summary!.diner_total_cop + d3Summary!.diner_total_cop,
      ).toBe(50000);
    });
  });

  describe('TC-06-U02: Asignación Parcial e Invariante con Propina y Descuento', () => {
    const items = [
      { id: 'item-1', line_total_cop: 80000, product_name: 'Platos Asignados' },
      { id: 'item-2', line_total_cop: 40000, product_name: 'Plato Sin Asignar' },
    ];

    const diners = [
      { id: 'diner-a', label: 'Comensal A', sort_order: 1 },
      { id: 'diner-b', label: 'Comensal B', sort_order: 2 },
    ];

    // Asignamos solo item-1 entre diner-a y diner-b ($40.000 cada uno)
    const assignments = [
      { diner_id: 'diner-a', order_item_id: 'item-1', share_units: 1, total_item_shares: 2 },
      { diner_id: 'diner-b', order_item_id: 'item-1', share_units: 1, total_item_shares: 2 },
    ];

    const discount_total_cop = 10000;
    const tip_cop = 11000;
    const grand_total_cop = 120000 - discount_total_cop + tip_cop; // 121000 COP

    it('cumple el invariante matemático en modo PROPORTIONAL', () => {
      const result = calculateConsumptionDistribution({
        items,
        diners,
        assignments,
        discount_total_cop,
        tip_cop,
        grand_total_cop,
        split_rule: 'PROPORTIONAL',
      });

      const sumDiners = result.diners.reduce((acc, d) => acc + d.diner_total_cop, 0);
      expect(sumDiners + result.unassigned_amount_cop).toBe(grand_total_cop);
      expect(result.is_reconciled).toBe(true);
      expect(grand_total_cop).toBe(121000);
    });

    it('cumple el invariante matemático en modo EQUAL', () => {
      const result = calculateConsumptionDistribution({
        items,
        diners,
        assignments,
        discount_total_cop,
        tip_cop,
        grand_total_cop,
        split_rule: 'EQUAL',
      });

      const sumDiners = result.diners.reduce((acc, d) => acc + d.diner_total_cop, 0);
      expect(sumDiners + result.unassigned_amount_cop).toBe(grand_total_cop);
      expect(result.is_reconciled).toBe(true);
      expect(grand_total_cop).toBe(121000);
    });

    it('cumple el invariante matemático en modo UNASSIGNED', () => {
      const result = calculateConsumptionDistribution({
        items,
        diners,
        assignments,
        discount_total_cop,
        tip_cop,
        grand_total_cop,
        split_rule: 'UNASSIGNED',
      });

      const sumDiners = result.diners.reduce((acc, d) => acc + d.diner_total_cop, 0);
      expect(sumDiners + result.unassigned_amount_cop).toBe(grand_total_cop);
      expect(result.is_reconciled).toBe(true);
      expect(grand_total_cop).toBe(121000);
    });
  });

  describe('TC-06-U03: Validación de Transiciones de DiningAccount, Table y Esquemas Zod', () => {
    it('valida transiciones permitidas y prohibidas de mesa física', () => {
      expect(canTransitionTableStatus('FREE', 'OCCUPIED')).toBe(true);
      expect(canTransitionTableStatus('FREE', 'RESERVED')).toBe(true);
      expect(canTransitionTableStatus('FREE', 'PENDING_PAYMENT')).toBe(false);

      expect(canTransitionTableStatus('OCCUPIED', 'PENDING_PAYMENT')).toBe(true);
      expect(canTransitionTableStatus('OCCUPIED', 'FREE')).toBe(true);
      expect(canTransitionTableStatus('OCCUPIED', 'RESERVED')).toBe(false);

      expect(canTransitionTableStatus('PENDING_PAYMENT', 'FREE')).toBe(true);
      expect(canTransitionTableStatus('PENDING_PAYMENT', 'OCCUPIED')).toBe(true);
    });

    it('valida transiciones de estado de DiningAccount y restricciones de REOPENED_ACCOUNTING', () => {
      expect(canTransitionDiningAccountStatus('OPEN', 'CLOSED')).toBe(true);
      expect(canTransitionDiningAccountStatus('OPEN', 'CANCELLED')).toBe(true);
      expect(canTransitionDiningAccountStatus('OPEN', 'REOPENED_ACCOUNTING')).toBe(false);

      expect(canTransitionDiningAccountStatus('CLOSED', 'REOPENED_ACCOUNTING')).toBe(true);
      expect(canTransitionDiningAccountStatus('CLOSED', 'OPEN')).toBe(true);
      expect(canTransitionDiningAccountStatus('CANCELLED', 'OPEN')).toBe(false);

      // En REOPENED_ACCOUNTING no se permite ADD_ORDER ni TRANSFER_TABLE
      expect(isActionAllowedOnAccount('REOPENED_ACCOUNTING', 'ADD_ORDER')).toBe(false);
      expect(isActionAllowedOnAccount('REOPENED_ACCOUNTING', 'TRANSFER_TABLE')).toBe(false);
      expect(isActionAllowedOnAccount('REOPENED_ACCOUNTING', 'PAYMENT')).toBe(true);
      expect(isActionAllowedOnAccount('REOPENED_ACCOUNTING', 'VOID_PAYMENT')).toBe(true);
      expect(isActionAllowedOnAccount('REOPENED_ACCOUNTING', 'CLOSE')).toBe(true);

      // En OPEN todo está permitido
      expect(isActionAllowedOnAccount('OPEN', 'ADD_ORDER')).toBe(true);
      expect(isActionAllowedOnAccount('OPEN', 'TRANSFER_TABLE')).toBe(true);

      // En CLOSED ninguna acción directa está permitida
      expect(isActionAllowedOnAccount('CLOSED', 'PAYMENT')).toBe(false);
      expect(isActionAllowedOnAccount('CLOSED', 'ADD_ORDER')).toBe(false);
    });

    it('valida esquema CloseDiningAccountSchema exigiendo reason si hay resolution_type', () => {
      // Sin resolución especial: motivo no es obligatorio
      const validNormalClose = CloseDiningAccountSchema.safeParse({
        expected_account_version: 2,
      });
      expect(validNormalClose.success).toBe(true);

      // Con resolución COURTESY pero sin reason: debe fallar
      const invalidSpecialClose = CloseDiningAccountSchema.safeParse({
        expected_account_version: 2,
        resolution_type: 'COURTESY',
      });
      expect(invalidSpecialClose.success).toBe(false);

      // Con resolución COURTESY y reason válido: debe ser exitoso
      const validSpecialClose = CloseDiningAccountSchema.safeParse({
        expected_account_version: 2,
        resolution_type: 'COURTESY',
        reason: 'Cortesía autorizada por gerencia por visita de prensa gastronómica',
      });
      expect(validSpecialClose.success).toBe(true);
    });

    it('valida esquema ReopenDiningAccountSchema rechazando modos inválidos o motivos cortos', () => {
      const invalidMode = ReopenDiningAccountSchema.safeParse({
        mode: 'INVALID_MODE',
        reason: 'Motivo de prueba',
      });
      expect(invalidMode.success).toBe(false);

      const shortReason = ReopenDiningAccountSchema.safeParse({
        mode: 'ACCOUNTING_ONLY',
        reason: 'abc', // < 5 caracteres
      });
      expect(shortReason.success).toBe(false);

      const validReopen = ReopenDiningAccountSchema.safeParse({
        mode: 'ACCOUNTING_ONLY',
        reason: 'Corrección de medio de pago digitado erróneamente en caja',
      });
      expect(validReopen.success).toBe(true);
    });

    it('valida esquema TransferTableSchema', () => {
      const validTransfer = TransferTableSchema.safeParse({
        target_table_id: 'c2e88a38-c645-4df6-8ef3-289d0f77259f',
        expected_account_version: 1,
        reason: 'Clientes solicitaron mesa junto a la ventana',
      });
      expect(validTransfer.success).toBe(true);
    });

    it('valida esquema PutConsumptionDistributionSchema', () => {
      const validSplit = PutConsumptionDistributionSchema.safeParse({
        expected_account_version: 1,
        split_rule: 'PROPORTIONAL',
        diners: [
          { label: 'Persona 1', sort_order: 0 },
          { label: 'Persona 2', sort_order: 1 },
        ],
        assignments: [
          {
            diner_id: 'a1e88a38-c645-4df6-8ef3-289d0f77259a',
            order_item_id: 'b2e88a38-c645-4df6-8ef3-289d0f77259b',
            share_units: 1,
            total_item_shares: 2,
          },
        ],
      });
      expect(validSplit.success).toBe(true);

      // Asignación con share_units > total_item_shares debe fallar
      const invalidSplit = PutConsumptionDistributionSchema.safeParse({
        expected_account_version: 1,
        split_rule: 'PROPORTIONAL',
        diners: [{ label: 'Persona 1', sort_order: 0 }],
        assignments: [
          {
            diner_id: 'a1e88a38-c645-4df6-8ef3-289d0f77259a',
            order_item_id: 'b2e88a38-c645-4df6-8ef3-289d0f77259b',
            share_units: 3,
            total_item_shares: 2,
          },
        ],
      });
      expect(invalidSplit.success).toBe(false);
    });
  });
});
