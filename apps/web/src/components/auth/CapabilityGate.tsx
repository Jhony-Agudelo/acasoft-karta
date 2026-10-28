import React from 'react';
import { useBranchCapabilities } from '../../hooks/use-branch-capabilities';

interface CapabilityGateProps {
  module: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const CapabilityGate: React.FC<CapabilityGateProps> = ({
  module,
  fallback = null,
  children,
}) => {
  const { hasModule, isLoading } = useBranchCapabilities();

  if (isLoading) {
    return null;
  }

  if (!hasModule(module)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
