import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { isPathAllowedForRole, ROLE_DEFAULT_ROUTES } from '../../config/role-navigation.config';

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const RoleRoute: React.FC<RoleRouteProps> = ({ children, allowedRoles }) => {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 1. Si se especificaron roles explícitos, verificar membresía
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(user.roleKey)) {
      const fallbackRoute = ROLE_DEFAULT_ROUTES[user.roleKey] || '/dashboard';
      return <Navigate to={fallbackRoute} replace />;
    }
  }

  // 2. Validación por matriz centralizada de rutas
  const isAllowed = isPathAllowedForRole(location.pathname, user.roleKey);
  if (!isAllowed) {
    const fallbackRoute = ROLE_DEFAULT_ROUTES[user.roleKey] || '/dashboard';
    return <Navigate to={fallbackRoute} replace />;
  }

  return <>{children}</>;
};

