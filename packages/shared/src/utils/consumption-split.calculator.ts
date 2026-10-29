/**
 * Calculadora Pura de Distribución Informativa del Consumo por Persona
 * Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.4 y RNF de conciliación al peso)
 * y FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md (Sección 3.1)
 */

import type { ConsumptionSplitRule } from '../constants/dining.machine';

export interface SplitOrderItemInput {
  id: string;
  line_total_cop: number;
  product_name?: string;
}

export interface SplitDinerInput {
  id: string;
  label: string;
  sort_order: number;
}

export interface SplitAssignmentInput {
  diner_id: string;
  order_item_id: string;
  share_units: number;
  total_item_shares: number;
}

export interface CalculateConsumptionSplitInput {
  items: SplitOrderItemInput[];
  diners: SplitDinerInput[];
  assignments: SplitAssignmentInput[];
  discount_total_cop: number;
  tip_cop: number;
  grand_total_cop: number;
  split_rule: ConsumptionSplitRule;
}

export interface CalculatedAssignment {
  diner_id: string;
  order_item_id: string;
  share_units: number;
  total_item_shares: number;
  assigned_amount_cop: number;
}

export interface CalculatedDinerSummary {
  diner_id: string;
  label: string;
  sort_order: number;
  subtotal_items_cop: number;
  discount_share_cop: number;
  tip_share_cop: number;
  diner_total_cop: number;
}

export interface CalculateConsumptionSplitResult {
  assignments: CalculatedAssignment[];
  diners: CalculatedDinerSummary[];
  unassigned_amount_cop: number;
  grand_total_cop: number;
  is_reconciled: boolean;
}

/**
 * Calcula determinísticamente la distribución del consumo en pesos colombianos (COP).
 * Persiste partes enteras y concilia cualquier residuo entero de 1 COP al primer comensal
 * en orden de sort_order.
 *
 * Invariante inquebrantable:
 * sum(diners.diner_total_cop) + unassigned_amount_cop === grand_total_cop
 */
export function calculateConsumptionDistribution(
  input: CalculateConsumptionSplitInput,
): CalculateConsumptionSplitResult {
  const {
    items,
    diners,
    assignments,
    discount_total_cop,
    tip_cop,
    grand_total_cop,
    split_rule,
  } = input;

  // Mapa de comensales ordenados por sort_order ascendente
  const sortedDiners = [...diners].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  const dinerMap = new Map<string, SplitDinerInput>();
  for (const d of sortedDiners) {
    dinerMap.set(d.id, d);
  }

  // Mapa de ítems
  const itemMap = new Map<string, SplitOrderItemInput>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Agrupar asignaciones por ítem
  const assignmentsByItem = new Map<string, SplitAssignmentInput[]>();
  for (const a of assignments) {
    if (!assignmentsByItem.has(a.order_item_id)) {
      assignmentsByItem.set(a.order_item_id, []);
    }
    assignmentsByItem.get(a.order_item_id)!.push(a);
  }

  const calculatedAssignments: CalculatedAssignment[] = [];
  const dinerSubtotals = new Map<string, number>();
  for (const d of sortedDiners) {
    dinerSubtotals.set(d.id, 0);
  }

  // 1. Reparto de cada OrderItem
  for (const item of items) {
    const lineTotal = Math.trunc(item.line_total_cop);
    const itemAssignments = assignmentsByItem.get(item.id) || [];

    if (itemAssignments.length === 0) {
      continue;
    }

    // Ordenar asignaciones según el orden del comensal
    const sortedAssignments = [...itemAssignments].sort((a, b) => {
      const orderA = dinerMap.get(a.diner_id)?.sort_order ?? 9999;
      const orderB = dinerMap.get(b.diner_id)?.sort_order ?? 9999;
      return orderA - orderB;
    });

    const firstAssignment = sortedAssignments[0];
    if (!firstAssignment) {
      continue;
    }

    const totalItemShares = Math.max(1, firstAssignment.total_item_shares);
    const sumUnits = sortedAssignments.reduce((acc, curr) => acc + curr.share_units, 0);

    // Monto total asignado a este ítem (si sumUnits === totalItemShares, es exactamente lineTotal)
    const itemAssignedTotal =
      sumUnits === totalItemShares
        ? lineTotal
        : Math.floor((lineTotal * sumUnits) / totalItemShares);

    // Calcular montos base para cada asignación
    const bases: number[] = [];
    let sumBases = 0;
    for (const a of sortedAssignments) {
      const base = Math.floor((lineTotal * a.share_units) / totalItemShares);
      bases.push(base);
      sumBases += base;
    }

    // Residuo a conciliar entre los primeros R comensales
    const residue = itemAssignedTotal - sumBases;

    for (let i = 0; i < sortedAssignments.length; i++) {
      const a = sortedAssignments[i]!;
      const additionalCop = i < residue ? 1 : 0;
      const baseAmount = bases[i] ?? 0;
      const assignedCop = baseAmount + additionalCop;

      calculatedAssignments.push({
        diner_id: a.diner_id,
        order_item_id: a.order_item_id,
        share_units: a.share_units,
        total_item_shares: totalItemShares,
        assigned_amount_cop: assignedCop,
      });

      const currentSubtotal = dinerSubtotals.get(a.diner_id) ?? 0;
      dinerSubtotals.set(a.diner_id, currentSubtotal + assignedCop);
    }
  }

  // 2. Reparto de Descuentos y Propinas
  const dinerDiscountShares = new Map<string, number>();
  const dinerTipShares = new Map<string, number>();
  for (const d of sortedDiners) {
    dinerDiscountShares.set(d.id, 0);
    dinerTipShares.set(d.id, 0);
  }

  const totalAssignedConsumption = sortedDiners.reduce(
    (acc, d) => acc + (dinerSubtotals.get(d.id) ?? 0),
    0,
  );

  if (split_rule === 'PROPORTIONAL' && totalAssignedConsumption > 0) {
    // Solo los comensales que tienen consumo asignado reciben parte del descuento y propina
    const participatingDiners = sortedDiners.filter(
      (d) => (dinerSubtotals.get(d.id) ?? 0) > 0,
    );

    // Descuento proporcional
    let sumBaseDiscount = 0;
    const baseDiscounts: number[] = [];
    for (const d of participatingDiners) {
      const consumption = dinerSubtotals.get(d.id) ?? 0;
      const base = Math.floor((discount_total_cop * consumption) / totalAssignedConsumption);
      baseDiscounts.push(base);
      sumBaseDiscount += base;
    }
    const discountResidue = discount_total_cop - sumBaseDiscount;
    for (let i = 0; i < participatingDiners.length; i++) {
      const d = participatingDiners[i]!;
      const add = i < discountResidue ? 1 : 0;
      const baseDiscount = baseDiscounts[i] ?? 0;
      dinerDiscountShares.set(d.id, baseDiscount + add);
    }

    // Propina proporcional
    let sumBaseTip = 0;
    const baseTips: number[] = [];
    for (const d of participatingDiners) {
      const consumption = dinerSubtotals.get(d.id) ?? 0;
      const base = Math.floor((tip_cop * consumption) / totalAssignedConsumption);
      baseTips.push(base);
      sumBaseTip += base;
    }
    const tipResidue = tip_cop - sumBaseTip;
    for (let i = 0; i < participatingDiners.length; i++) {
      const d = participatingDiners[i]!;
      const add = i < tipResidue ? 1 : 0;
      const baseTip = baseTips[i] ?? 0;
      dinerTipShares.set(d.id, baseTip + add);
    }
  } else if (split_rule === 'EQUAL' && sortedDiners.length > 0) {
    const N = sortedDiners.length;

    // Descuento en partes iguales
    const baseDiscount = Math.floor(discount_total_cop / N);
    const discountResidue = discount_total_cop - baseDiscount * N;
    for (let i = 0; i < sortedDiners.length; i++) {
      const d = sortedDiners[i]!;
      const add = i < discountResidue ? 1 : 0;
      dinerDiscountShares.set(d.id, baseDiscount + add);
    }

    // Propina en partes iguales
    const baseTip = Math.floor(tip_cop / N);
    const tipResidue = tip_cop - baseTip * N;
    for (let i = 0; i < sortedDiners.length; i++) {
      const d = sortedDiners[i]!;
      const add = i < tipResidue ? 1 : 0;
      dinerTipShares.set(d.id, baseTip + add);
    }
  }
  // Si split_rule === 'UNASSIGNED', dinerDiscountShares y dinerTipShares permanecen en 0

  // 3. Resumen por comensal
  const dinerSummaries: CalculatedDinerSummary[] = sortedDiners.map((d) => {
    const subtotal = dinerSubtotals.get(d.id) ?? 0;
    const discount = dinerDiscountShares.get(d.id) ?? 0;
    const tip = dinerTipShares.get(d.id) ?? 0;
    const total = Math.max(0, subtotal - discount + tip);

    return {
      diner_id: d.id,
      label: d.label,
      sort_order: d.sort_order,
      subtotal_items_cop: subtotal,
      discount_share_cop: discount,
      tip_share_cop: tip,
      diner_total_cop: total,
    };
  });

  const sumDinersTotal = dinerSummaries.reduce((acc, d) => acc + d.diner_total_cop, 0);

  // Invariante de conciliación: unassigned_amount_cop = grand_total_cop - sumDinersTotal
  const unassigned_amount_cop = Math.max(0, grand_total_cop - sumDinersTotal);

  const is_reconciled = sumDinersTotal + unassigned_amount_cop === grand_total_cop;

  return {
    assignments: calculatedAssignments,
    diners: dinerSummaries,
    unassigned_amount_cop,
    grand_total_cop,
    is_reconciled,
  };
}
