import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import { useAuthStore } from '../stores/auth.store';

export interface BranchCapabilitiesResponse {
  branchId?: string;
  operatingProfile?: string;
  modules: Record<string, boolean>;
  activeFulfillments: Array<'DINE_IN' | 'PICKUP' | 'DELIVERY'>;
}

export function useBranchCapabilities(customBranchId?: string) {
  const storeBranchId = useAuthStore((s) => s.currentBranchId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const branchId = customBranchId || storeBranchId;

  const query = useQuery<BranchCapabilitiesResponse>({
    queryKey: ['branch-capabilities', branchId],
    queryFn: async () => {
      if (branchId) {
        return apiClient.get<BranchCapabilitiesResponse>(
          `/admin/branches/${branchId}/capabilities`,
        );
      }
      return apiClient.get<BranchCapabilitiesResponse>('/admin/capabilities');
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const hasModule = (moduleKey: string): boolean => {
    if (!query.data?.modules) return false;
    return !!query.data.modules[moduleKey];
  };

  const hasFulfillment = (fulfillmentType: 'DINE_IN' | 'PICKUP' | 'DELIVERY'): boolean => {
    if (!query.data?.activeFulfillments) return false;
    return query.data.activeFulfillments.includes(fulfillmentType);
  };

  return {
    ...query,
    capabilities: query.data?.modules || {},
    activeFulfillments: query.data?.activeFulfillments || [],
    operatingProfile: query.data?.operatingProfile,
    hasModule,
    hasFulfillment,
  };
}
