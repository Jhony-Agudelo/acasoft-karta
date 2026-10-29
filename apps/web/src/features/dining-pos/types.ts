import {
  TableStatus,
  DiningAccountStatus,
  AccountReopenMode,
  ConsumptionSplitRule,
} from '@restaurante-saas/shared';

export interface TableAccountSummary {
  id: string;
  account_code: string;
  status: DiningAccountStatus;
  payment_status: string;
  guest_count: number;
  table_session_pin: string | null;
  grand_total_cop: number;
  paid_total_cop: number;
  uncollected_amount_cop: number;
  opened_at: string;
  version: number;
  orders_count: number;
}

export interface PendingQrOrderItem {
  id: string;
  order_code: string;
  created_at: string;
  grand_total_cop: number;
}

export interface DiningTableItem {
  id: string;
  code: string;
  capacity: number;
  status: TableStatus;
  account: TableAccountSummary | null;
  pending_qr_orders: PendingQrOrderItem[];
}

export interface DiningAreaItem {
  id: string;
  name: string;
  sort_order: number;
  tables: DiningTableItem[];
}

export interface ReopenedAccountingAccountItem {
  id: string;
  account_code: string;
  status: DiningAccountStatus;
  payment_status: string;
  grand_total_cop: number;
  paid_total_cop: number;
  table: {
    id: string;
    code: string;
  };
  opened_at: string;
  reopened_at: string | null;
  reopen_reason: string | null;
  version: number;
}

export interface TablePlanResponse {
  areas: DiningAreaItem[];
  reopened_accounting_accounts: ReopenedAccountingAccountItem[];
}

export interface OrderItemSnapshot {
  id: string;
  product_id: string;
  product_name?: string;
  variant_name?: string | null;
  product_snapshot_json?: any;
  quantity: number;
  unit_price_cop: number;
  line_total_cop: number;
  notes?: string | null;
}

export interface AccountOrderItem {
  id: string;
  order_code: string;
  status: string;
  fulfillment_type: string;
  origin: string;
  subtotal_products_cop: number;
  grand_total_cop: number;
  notes?: string | null;
  created_at: string;
  items: OrderItemSnapshot[];
}

export interface AccountPaymentItem {
  id: string;
  method: string;
  amount_cop: number;
  status: string;
  cash_received_cop?: number | null;
  cash_change_cop?: number | null;
  reference?: string | null;
  created_at: string;
}

export interface AccountDinerAssignment {
  id: string;
  account_id: string;
  diner_id: string;
  order_item_id: string;
  share_units: number;
  total_item_shares: number;
  assigned_amount_cop: number;
}

export interface AccountDinerItem {
  id: string;
  account_id: string;
  label: string;
  sort_order: number;
  assignments: AccountDinerAssignment[];
}

export interface DiningAccountDetail {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  account_code: string;
  status: DiningAccountStatus;
  payment_status: string;
  guest_count: number;
  table_session_pin: string | null;
  subtotal_products_cop: number;
  discount_total_cop: number;
  tax_total_cop: number;
  tip_cop: number;
  grand_total_cop: number;
  paid_total_cop: number;
  uncollected_amount_cop: number;
  split_rule: ConsumptionSplitRule;
  opened_at: string;
  closed_at: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  version: number;
  table: {
    id: string;
    code: string;
    capacity: number;
    status: TableStatus;
  };
  orders: AccountOrderItem[];
  payments: AccountPaymentItem[];
  diners: AccountDinerItem[];
  opener?: {
    id: string;
    name: string;
  };
}
