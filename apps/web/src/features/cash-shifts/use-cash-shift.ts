import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { useBranchCapabilities } from '../../hooks/use-branch-capabilities';
import { CurrentCashShift, CashShiftHistoryItem } from './types';
import {
  OpenCashShiftDto,
  CreateCashShiftMovementDto,
  CloseCashShiftDto,
} from '@restaurante-saas/shared';

export function useCashShift() {
  const queryClient = useQueryClient();
  const { currentBranchId } = useAuthStore();
  const { hasModule } = useBranchCapabilities();
  const isModuleActive = hasModule('payments.cash_shifts');

  const currentShiftQueryKey = ['cash-shifts', 'current', currentBranchId];

  // Consulta del turno actualmente abierto en la sucursal activa
  const currentShiftQuery = useQuery<CurrentCashShift | null>({
    queryKey: currentShiftQueryKey,
    queryFn: async () => {
      if (!currentBranchId || !isModuleActive) return null;
      return apiClient.get<CurrentCashShift | null>(
        `/branches/${currentBranchId}/cash-shifts/current`,
      );
    },
    enabled: !!currentBranchId && isModuleActive,
    refetchInterval: 30000, // Refrescar cada 30s
  });

  // Apertura de turno con base inicial
  const openShiftMutation = useMutation({
    mutationFn: async (dto: OpenCashShiftDto) => {
      if (!currentBranchId) throw new Error('No hay sucursal seleccionada');
      return apiClient.post<CurrentCashShift>(
        `/branches/${currentBranchId}/cash-shifts/open`,
        dto,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentShiftQueryKey });
      queryClient.invalidateQueries({ queryKey: ['cash-shifts', 'history'] });
    },
  });

  // Registro de entrada o salida menor (CASH_IN / CASH_OUT)
  const addMovementMutation = useMutation({
    mutationFn: async ({
      shiftId,
      dto,
    }: {
      shiftId: string;
      dto: CreateCashShiftMovementDto;
    }) => {
      return apiClient.post(`/cash-shifts/${shiftId}/movements`, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentShiftQueryKey });
    },
  });

  // Arqueo y cierre ciego
  const closeShiftMutation = useMutation({
    mutationFn: async ({
      shiftId,
      dto,
    }: {
      shiftId: string;
      dto: CloseCashShiftDto;
    }) => {
      return apiClient.post<CashShiftHistoryItem>(
        `/cash-shifts/${shiftId}/close`,
        dto,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: currentShiftQueryKey });
      queryClient.invalidateQueries({ queryKey: ['cash-shifts', 'history'] });
    },
  });

  return {
    isModuleActive,
    currentShift: currentShiftQuery.data ?? null,
    isLoading: currentShiftQuery.isLoading,
    isError: currentShiftQuery.isError,
    refetchCurrentShift: currentShiftQuery.refetch,
    openShift: openShiftMutation.mutateAsync,
    isOpening: openShiftMutation.isPending,
    addMovement: addMovementMutation.mutateAsync,
    isAddingMovement: addMovementMutation.isPending,
    closeShift: closeShiftMutation.mutateAsync,
    isClosing: closeShiftMutation.isPending,
  };
}
