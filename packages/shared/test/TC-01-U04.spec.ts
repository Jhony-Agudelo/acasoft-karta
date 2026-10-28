import { describe, it, expect } from 'vitest';
import { BranchChannelPolicySchema } from '../src/schemas/foundation.schema';

describe('TC-01-U04: Validación de require_payment_before_preparation en Esquema de Canal', () => {
  it('debe rechazar require_payment_before_preparation = true cuando payment_policy es NONE', () => {
    const policy = {
      fulfillment_type: 'DELIVERY',
      enabled: true,
      payment_policy: 'NONE',
      require_payment_before_preparation: true,
    };

    const result = BranchChannelPolicySchema.safeParse(policy);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('require_payment_before_preparation'));
      expect(issue).toBeDefined();
    }
  });

  it('debe rechazar require_payment_before_preparation = true cuando fulfillment_type es DINE_IN', () => {
    const policy = {
      fulfillment_type: 'DINE_IN',
      enabled: true,
      payment_policy: 'OFFLINE_ONLY',
      require_payment_before_preparation: true,
    };

    const result = BranchChannelPolicySchema.safeParse(policy);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('require_payment_before_preparation'));
      expect(issue).toBeDefined();
    }
  });

  it('debe rechazar DINE_IN con payment_policy = NONE', () => {
    const policy = {
      fulfillment_type: 'DINE_IN',
      enabled: false,
      payment_policy: 'NONE',
      require_payment_before_preparation: false,
    };

    const result = BranchChannelPolicySchema.safeParse(policy);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('payment_policy'));
      expect(issue).toBeDefined();
    }
  });

  it('debe aceptar require_payment_before_preparation = true con OFFLINE_ONLY en DELIVERY', () => {
    const policy = {
      fulfillment_type: 'DELIVERY',
      enabled: true,
      payment_policy: 'OFFLINE_ONLY',
      require_payment_before_preparation: true,
      payment_instructions_json: {
        accepts_cash: true,
        accepts_pos: true,
        transfer_instructions: [
          {
            provider: 'NEQUI',
            account_number_or_key: '3001234567',
            account_holder_name: 'Restaurante Demo',
          },
        ],
      },
    };

    const result = BranchChannelPolicySchema.safeParse(policy);
    expect(result.success).toBe(true);
  });

  it('debe aceptar require_payment_before_preparation = true con OFFLINE_ONLY en PICKUP', () => {
    const policy = {
      fulfillment_type: 'PICKUP',
      enabled: true,
      payment_policy: 'OFFLINE_ONLY',
      require_payment_before_preparation: true,
    };

    const result = BranchChannelPolicySchema.safeParse(policy);
    expect(result.success).toBe(true);
  });
});
