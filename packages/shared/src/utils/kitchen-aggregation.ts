import { OrderStatus } from '../constants/order-status.machine';

export type KitchenItemStatus = 'PENDING' | 'PREPARING' | 'READY' | 'CANCELLED';

export interface KitchenItemStatusHolder {
  status: string;
}

/**
 * Función pura que calcula el estado de preparación agregado de una orden
 * a partir del estado de cada uno de sus ítems de cocina.
 *
 * Reglas:
 * 1. Los ítems con estado 'CANCELLED' se excluyen del cálculo.
 * 2. Si no hay ítems activos, mantiene el estado actual.
 * 3. Si TODOS los ítems activos están en 'READY', la orden avanza a 'READY'.
 * 4. Si al menos un ítem activo está en 'PREPARING' o 'READY' (y no todos en 'READY'),
 *    la orden transiciona a 'PREPARING' (si estaba en 'ACCEPTED', 'RECEIVED' o ya en 'PREPARING').
 * 5. En cualquier otro caso, conserva su estado actual.
 */
export function computeAggregatedOrderKitchenStatus(
  currentOrderStatus: OrderStatus,
  itemsOrStatuses: Array<KitchenItemStatusHolder | string>,
): OrderStatus {
  const statuses: string[] = itemsOrStatuses.map((item) =>
    typeof item === 'string' ? item : item.status,
  );

  const activeStatuses = statuses.filter((s) => s !== 'CANCELLED');

  if (activeStatuses.length === 0) {
    return currentOrderStatus;
  }

  const allReady = activeStatuses.every((s) => s === 'READY');
  if (allReady) {
    return 'READY';
  }

  const hasPreparingOrReady = activeStatuses.some((s) => s === 'PREPARING' || s === 'READY');
  if (hasPreparingOrReady) {
    if (
      currentOrderStatus === 'ACCEPTED' ||
      currentOrderStatus === 'RECEIVED' ||
      currentOrderStatus === 'PREPARING'
    ) {
      return 'PREPARING';
    }
  }

  return currentOrderStatus;
}
