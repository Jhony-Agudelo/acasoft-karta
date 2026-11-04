export type CashShiftMovementType = 'CASH_IN' | 'CASH_OUT';
export type CashShiftMovementCategory =
  | 'SUPPLIER_PAYMENT'
  | 'PETTY_EXPENSE'
  | 'CHANGE_FUND'
  | 'OTHER';

export type CashShiftStatus = 'OPEN' | 'CLOSED';

export interface CashShiftMovement {
  id: string;
  type: CashShiftMovementType;
  category: CashShiftMovementCategory;
  amount_cop: number;
  reason: string;
  reference_doc: string | null;
  created_at: string;
  creator?: {
    id: string;
    name: string;
  };
}

export interface CurrentCashShift {
  id: string;
  shift_code: string;
  status: CashShiftStatus;
  opened_at: string;
  opening_cash_cop: number;
  opener: {
    id: string;
    name: string;
    email: string;
  };
  cash_in_total_cop: number;
  cash_out_total_cop: number;
  movements_count: number;
  movements: CashShiftMovement[];
  cash_sales_cop: number | null;
  expected_cash_cop: number | null;
  is_blind_mode: boolean;
}

export interface CashShiftHistoryItem {
  id: string;
  shift_code: string;
  status: CashShiftStatus;
  opened_at: string;
  closed_at: string | null;
  opening_cash_cop: number;
  cash_sales_cop: number;
  cash_in_total_cop: number;
  cash_out_total_cop: number;
  expected_cash_cop: number | null;
  declared_cash_cop: number | null;
  difference_cop: number | null;
  closing_notes: string | null;
  opener: {
    id: string;
    name: string;
  };
  closer?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    movements: number;
    payments: number;
  };
}

