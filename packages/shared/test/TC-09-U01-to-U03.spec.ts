import { describe, it, expect } from 'vitest';
import {
  mapOrderToFactusBill,
  roundTo2Decimals,
  calculatePayrollLiquidation,
  calculateProfitAndLoss,
  FACTUS_FINAL_CONSUMER_DEFAULTS,
  CreateEmployeeProfileSchema,
} from '../src';

describe('Fase 09: Pruebas Unitarias de Facturación DIAN, Nómina y P&L', () => {
  describe('TC-09-U01: Mapeo de Ítems con INC 8 % Incluido, Propina, cash_rounding_amount y Modos de Cliente', () => {
    it('debe mapear correctamente precios base unitarios con 2 decimales, propina voluntaria en allowance_charges y cash_rounding_amount exacto', () => {
      // Caso de prueba exacto TC-09-U01:
      // Cuenta de salón con:
      // 2 productos de $16.000 c/u (INC 8 % incluido -> subtotal $32.000)
      // 1 botella de agua de $190.000 (INC 8 % incluido)
      // 1 propina voluntaria de $10.000
      // Total pagado en Karta: $232.000 COP
      const result = mapOrderToFactusBill({
        numbering_range_id: 389,
        reference_code: 'KARTA-ORD-A104',
        items: [
          {
            code_reference: 'PROD-01',
            name: 'Hamburguesa Especial',
            quantity: 2,
            line_total_cop: 32000,
            tax_type: 'INC',
            tax_rate_bp: 800,
          },
          {
            code_reference: 'PROD-02',
            name: 'Botella de Agua Premium',
            quantity: 1,
            line_total_cop: 190000,
            tax_type: 'INC',
            tax_rate_bp: 800,
          },
        ],
        tip_cop: 10000,
        paid_total_cop: 232000,
        customer_mode: 'FINAL_CONSUMER',
      });

      // 1. Verificación de precios unitarios base con 2 decimales
      expect(result.payload.items).toHaveLength(2);
      expect(result.payload.items[0].price).toBe('14814.81');
      expect(result.payload.items[0].quantity).toBe('2.00');
      expect(result.payload.items[0].taxes).toEqual([{ code: '04', rate: '8.00' }]);

      expect(result.payload.items[1].price).toBe('175925.93');
      expect(result.payload.items[1].quantity).toBe('1.00');
      expect(result.payload.items[1].taxes).toEqual([{ code: '04', rate: '8.00' }]);

      // 2. Verificación de propina en allowance_charges
      expect(result.payload.allowance_charges).toBeDefined();
      expect(result.payload.allowance_charges).toHaveLength(1);
      expect(result.payload.allowance_charges![0]).toEqual({
        concept_type: '03',
        is_surcharge: true,
        reason: 'Propina voluntaria',
        base_amount: '222000.00',
        amount: 10000,
      });

      // 3. Conciliación de cash_rounding_amount
      // Total Factus: (14814.81 * 2 * 1.08 = 31999.99) + (175925.93 * 1.08 = 190000.00) + 10000 = 231999.99
      // cash_rounding_amount = 232000 - 231999.99 = +0.01
      expect(result.cashRoundingAmount).toBe('0.01');
      expect(result.payload.cash_rounding_amount).toBe('0.01');
      expect(roundTo2Decimals(result.totalFactus + Number(result.cashRoundingAmount))).toBe(232000);

      // 4. Modo FINAL_CONSUMER
      expect(result.payload.send_email).toBe(false);
      expect(result.payload.customer).toEqual({
        identification_document_code: FACTUS_FINAL_CONSUMER_DEFAULTS.identification_document_code,
        identification: FACTUS_FINAL_CONSUMER_DEFAULTS.identification,
        names: FACTUS_FINAL_CONSUMER_DEFAULTS.names,
      });
    });

    it('debe mapear correctamente el modo NAMED_CUSTOMER con datos fiscales y send_email: true', () => {
      const result = mapOrderToFactusBill({
        numbering_range_id: 389,
        reference_code: 'KARTA-ORD-A105',
        items: [
          {
            code_reference: 'PROD-01',
            name: 'Plato del Día',
            quantity: 1,
            line_total_cop: 25000,
            tax_type: 'INC',
            tax_rate_bp: 800,
          },
        ],
        paid_total_cop: 25000,
        customer_mode: 'NAMED_CUSTOMER',
        customer: {
          identification_document_code: '13',
          identification: '123456789',
          names: 'Alan Turing',
          email: 'alan@turing.org',
          phone: '3001234567',
          address: 'Calle 100 # 15-20',
          municipality_code: '11001',
        },
        branch: {
          name: 'Karta Parrilla Poblado',
          email: 'poblado@karta.app',
          address: 'Cra 43A # 1-50',
          phone: '3009998877',
          municipality_code: '05001',
        },
      });

      expect(result.payload.send_email).toBe(true);
      expect(result.payload.customer.identification_document_code).toBe('13');
      expect(result.payload.customer.identification).toBe('123456789');
      expect(result.payload.customer.names).toBe('Alan Turing');
      expect(result.payload.customer.email).toBe('alan@turing.org');
      expect(result.payload.establishment).toBeDefined();
      expect(result.payload.establishment?.name).toBe('Karta Parrilla Poblado');
      expect(result.payload.establishment?.municipality_code).toBe('05001');
    });
  });

  describe('TC-09-U02: Liquidación de Nómina con Recargo Nocturno, Horas Extras y Deducciones', () => {
    it('debe liquidar nómina con recargos, calcular el IBC legal y deducir 4 % salud y 4 % pensión', () => {
      // Caso de prueba exacto TC-09-U02:
      // Salario base: $2.800.000 COP
      // Días trabajados: 30
      // Auxilio de transporte: $249.095 COP
      // Comisiones: $300.000 COP
      // 5 horas extra diurnas (code "1", 25 %)
      // 2 horas extra nocturnas (code "2", 75 %)
      // 3 horas de recargo nocturno (code "3", 35 %)
      const result = calculatePayrollLiquidation({
        employee: {
          employee_code: 'EMP-001',
          identification_document_code: '13',
          identification_number: '1234567890',
          first_name: 'Mateo',
          first_surname: 'Gonzales',
          second_surname: 'Forero',
          address: 'Cra 100 39-100',
          municipality_code: '68679',
          entry_date: '2023-03-15',
          base_salary_cop: 2800000,
          receives_transport_allowance: true,
          job_title: 'Mesero Jefe',
        },
        period: {
          year: 2026,
          month: 5,
          payment_date: '2026-06-05',
        },
        days_worked: 30,
        transport_allowance_monthly_cop: 249095,
        commissions_cop: 300000,
        overtime_entries: [
          {
            accrual_type_code: '1',
            quantity: 5,
          },
          {
            accrual_type_code: '2',
            quantity: 2,
          },
          {
            accrual_type_code: '3',
            quantity: 3,
          },
        ],
      });

      // Sueldo proporcional 30 días
      expect(result.workedSalaryCop).toBe(2800000);
      expect(result.transportAllowanceCop).toBe(249095);
      expect(result.commissionsCop).toBe(300000);

      // Horas extras y recargos:
      // Hourly rate: 2800000 / 220 = 12727.2727...
      // Extra diurna (5 hrs * 1.25): 79545
      // Extra nocturna (2 hrs * 1.75): 44545
      // Recargo nocturno (3 hrs * 0.35): 13364
      // Total extras/recargos: 137454
      expect(result.overtimeTotalCop).toBe(137454);

      // IBC = sueldo (2.800.000) + comisiones (300.000) + extras/recargos (137.454) = 3.237.454
      // Nota: Auxilio de transporte EXCLUIDO de IBC por ley
      expect(result.ibcCop).toBe(3237454);

      // Salud 4% = 3237454 * 0.04 = 129498
      // Pensión 4% = 3237454 * 0.04 = 129498
      expect(result.healthDeductionCop).toBe(129498);
      expect(result.pensionDeductionCop).toBe(129498);
      expect(result.totalDeductionsCop).toBe(258996);

      // Devengado bruto = 2800000 + 249095 + 300000 + 137454 = 3486549
      expect(result.grossAccruedCop).toBe(3486549);

      // Neto a pagar = 3486549 - 258996 = 3227553
      expect(result.netPayableCop).toBe(3227553);

      // Verificación de contrato Factus v2 generado
      expect(result.factusPayload.worker.salary).toBe('2800000.00');
      expect(result.factusPayload.accruals.suel.amount).toBe('2800000.00');
      expect(result.factusPayload.accruals.tra![0].amount).toBe('249095.00');
      expect(result.factusPayload.accruals.comi![0].amount).toBe('300000.00');
      expect(result.factusPayload.accruals.hora).toHaveLength(3);
      expect(result.factusPayload.deductions.salu.percentage).toBe('4');
      expect(result.factusPayload.deductions.pens.percentage).toBe('4');
    });
  });

  describe('TC-09-U03: Cálculo del Estado de Resultados Operativo (P&L)', () => {
    it('debe calcular la utilidad bruta y la utilidad operativa (EBITDA) correctamente', () => {
      // Caso de prueba exacto TC-09-U03:
      // Ingresos netos sin impuestos: $10.000.000 COP
      // Costo de insumos por recetas (COGS): $3.500.000 COP
      // Gastos operativos (OPEX): $2.000.000 COP
      // Nómina devengada: $2.500.000 COP
      const result = calculateProfitAndLoss({
        netSalesRevenueCop: 10000000,
        cogsRecipeConsumptionCop: 3500000,
        operatingExpensesCop: 2000000,
        grossPayrollCop: 2500000,
      });

      expect(result.grossProfitCop).toBe(6500000);
      expect(result.grossMarginPct).toBe(65.0);
      expect(result.totalOperatingCostsCop).toBe(4500000);
      expect(result.operatingProfitCop).toBe(2000000);
      expect(result.operatingMarginPct).toBe(20.0);
    });
  });

  describe('Requerimiento Personal Operativo sin Acceso a Sistema', () => {
    it('debe validar exitosamente el registro de personal de limpieza o logística sin user_id', () => {
      const limpiezaInput = {
        employee_code: 'EMP-LIM-01',
        user_id: null, // No requiere cuenta de sistema ni login
        job_title: 'Personal de Aseo y Limpieza',
        department: 'Servicios Generales',
        has_system_access: false,
        identification_document_code: '13',
        identification_number: '52899123',
        first_name: 'María',
        first_surname: 'Gómez',
        second_surname: 'Restrepo',
        address: 'Calle 45 # 12-30',
        municipality_code: '05001',
        base_salary_cop: 1423500,
        receives_transport_allowance: true,
        entry_date: '2026-01-15',
        payment_method_code: '42',
        bank_name: 'Bancolombia',
        account_type: 'Ahorros',
        account_number: '9876543210',
      };

      const parsed = CreateEmployeeProfileSchema.safeParse(limpiezaInput);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.user_id).toBeNull();
        expect(parsed.data.job_title).toBe('Personal de Aseo y Limpieza');
        expect(parsed.data.has_system_access).toBe(false);
      }
    });
  });
});

