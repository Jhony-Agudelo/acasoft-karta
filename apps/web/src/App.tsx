import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage';
import { OnboardingWizardPage } from './pages/onboarding/OnboardingWizardPage';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { CapabilityRoute } from './components/auth/CapabilityRoute';
import { RoleRoute } from './components/auth/RoleRoute';
import { useAuthStore } from './stores/auth.store';
import { ROLE_DEFAULT_ROUTES } from './config/role-navigation.config';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { CapabilitiesPage } from './pages/admin/CapabilitiesPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { AdminCatalogPage } from './features/admin-catalog/AdminCatalogPage';
import { QrCodeCenterPage } from './features/admin-catalog/QrCodeCenterPage';
import { StorefrontPage } from './features/public-storefront/StorefrontPage';
import { QrResolverPage } from './features/public-storefront/QrResolverPage';
import { PublicTrackingPage } from './features/public-tracking/PublicTrackingPage';
import { LiteOrderPanelPage } from './features/lite-order-panel/LiteOrderPanelPage';
import { FullOrderPanelPage } from './features/full-order-panel/FullOrderPanelPage';
import { KitchenKdsPage } from './features/kitchen-kds/KitchenKdsPage';
import { DeliveryZonesPage } from './features/admin-delivery/DeliveryZonesPage';
import { CustomersDirectoryPage } from './features/admin-customers/CustomersDirectoryPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { DiningFloorPlanPage } from './features/dining-pos/DiningFloorPlanPage';
import { DiningAdminSettings } from './features/dining-pos/DiningAdminSettings';
import { CashShiftsHistoryPage } from './features/cash-shifts/CashShiftsHistoryPage';
import { ModulePlaceholderPage } from './pages/modules/ModulePlaceholderPage';
import {
  Truck,
  ShoppingBag,
  Wine,
  Boxes,
  Users2,
} from 'lucide-react';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const IndexRedirect: React.FC = () => {
  const { user } = useAuthStore();
  const defaultRoute = ROLE_DEFAULT_ROUTES[user?.roleKey || ''] || '/dashboard';
  return <Navigate to={defaultRoute} replace />;
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Rutas Públicas */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
        <Route path="/r/:restaurantSlug" element={<StorefrontPage />} />
        <Route path="/r/:restaurantSlug/b/:branchSlug" element={<StorefrontPage />} />
        <Route path="/q/:qrToken" element={<QrResolverPage />} />
        <Route path="/t/:publicOrderToken" element={<PublicTrackingPage />} />
        <Route path="/t/:publicToken" element={<PublicTrackingPage />} />

        {/* Rutas Protegidas sin Layout Principal */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingWizardPage />
            </ProtectedRoute>
          }
        />

        {/* Panel Operativo con Layout Dinámico y Aislamiento por Rol */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<IndexRedirect />} />
          <Route
            path="dashboard"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'PLATFORM_ADMIN']}>
                <DashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="admin/capabilities"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'PLATFORM_ADMIN']}>
                <CapabilitiesPage />
              </RoleRoute>
            }
          />
          <Route
            path="admin/settings"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'PLATFORM_ADMIN']}>
                <SettingsPage />
              </RoleRoute>
            }
          />
          <Route
            path="admin/menu"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER']}>
                <AdminCatalogPage />
              </RoleRoute>
            }
          />
          <Route
            path="admin/qr-codes"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER']}>
                <QrCodeCenterPage />
              </RoleRoute>
            }
          />
          <Route
            path="admin/delivery-zones"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER']}>
                <DeliveryZonesPage />
              </RoleRoute>
            }
          />
          <Route
            path="admin/customers"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER']}>
                <CustomersDirectoryPage />
              </RoleRoute>
            }
          />
          <Route
            path="admin/dining-tables"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER']}>
                <CapabilityRoute module="dining" moduleName="Mesas y Portamesas QR">
                  <DiningAdminSettings />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="admin/cash-shifts"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'PLATFORM_ADMIN']}>
                <CapabilityRoute module="payments.cash_shifts" moduleName="Turnos y Arqueo de Caja">
                  <CashShiftsHistoryPage />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="panel"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'DISPATCH_DRIVER']}>
                <CapabilityRoute module="order_panel" moduleName="Panel Operativo de Pedidos">
                  <FullOrderPanelPage />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="panel/lite"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'DISPATCH_DRIVER']}>
                <CapabilityRoute module="order_panel" moduleName="Panel Liviano de Pedidos">
                  <LiteOrderPanelPage />
                </CapabilityRoute>
              </RoleRoute>
            }
          />

          <Route
            path="reports"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'PLATFORM_ADMIN']}>
                <CapabilityRoute module="reporting" moduleName="Reportes y Conciliación">
                  <ReportsPage />
                </CapabilityRoute>
              </RoleRoute>
            }
          />

          {/* Módulos Protegidos por Motor de Capacidades y Rol */}
          <Route
            path="dining"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER']}>
                <CapabilityRoute module="dining" moduleName="Salón y Mesas">
                  <DiningFloorPlanPage />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="delivery"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'DISPATCH_DRIVER']}>
                <CapabilityRoute module="delivery" moduleName="Domicilios">
                  <ModulePlaceholderPage
                    title="Despacho de Domicilios"
                    description="Gestión de repartidores, direcciones y cobros contra entrega."
                    moduleKey="delivery"
                    phase="Fase 04 (Omnicanalidad & Domicilios)"
                    icon={Truck}
                  />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="pickup"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER']}>
                <CapabilityRoute module="channel.pickup" moduleName="Para Llevar">
                  <ModulePlaceholderPage
                    title="Pedidos Para Llevar (Takeaway)"
                    description="Mostrador de recogida rápida y control de empaque."
                    moduleKey="channel.pickup"
                    phase="Fase 04 (Omnicanalidad & Domicilios)"
                    icon={ShoppingBag}
                  />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="kds"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'KITCHEN']}>
                <CapabilityRoute module="kitchen" moduleName="Pantalla de Cocina (KDS)">
                  <KitchenKdsPage />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="bar-kds"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'KITCHEN']}>
                <CapabilityRoute module="bar.kds" moduleName="Comandas de Bar">
                  <ModulePlaceholderPage
                    title="Bar Display System"
                    description="Despacho de coctelería y bebidas independiente de cocina."
                    moduleKey="bar.kds"
                    phase="Fase 03 (Cocina KDS & Barra)"
                    icon={Wine}
                  />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="menu"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'WAITER']}>
                <AdminCatalogPage />
              </RoleRoute>
            }
          />
          <Route
            path="inventory"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER']}>
                <CapabilityRoute module="inventory.lite" moduleName="Inventario Lite">
                  <ModulePlaceholderPage
                    title="Inventario y Recetas"
                    description="Control de existencias, descuentos por venta y stock crítico."
                    moduleKey="inventory.lite"
                    phase="Fase 05 (Inventario, Mermas & Costos)"
                    icon={Boxes}
                  />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
          <Route
            path="customers"
            element={
              <RoleRoute allowedRoles={['TENANT_ADMIN', 'BRANCH_MANAGER']}>
                <CapabilityRoute module="crm.loyalty" moduleName="Clientes y Fidelidad">
                  <ModulePlaceholderPage
                    title="Clientes y Fidelización"
                    description="Historial de consumo, puntos de fidelidad y habeas data Ley 1581."
                    moduleKey="crm.loyalty"
                    phase="Fase 05 (Fidelidad, Promociones & CRM)"
                    icon={Users2}
                  />
                </CapabilityRoute>
              </RoleRoute>
            }
          />
        </Route>

        <Route path="*" element={<IndexRedirect />} />
      </Routes>
    </ErrorBoundary>
  );
};
