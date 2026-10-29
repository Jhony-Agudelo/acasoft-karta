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
import { ModulePlaceholderPage } from './pages/modules/ModulePlaceholderPage';
import {
  UtensilsCrossed,
  Truck,
  ShoppingBag,
  Flame,
  Wine,
  BookOpen,
  Boxes,
  Users2,
  Zap,
} from 'lucide-react';
import { ErrorBoundary } from './components/common/ErrorBoundary';

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

      {/* Panel Operativo con Layout Dinámico */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="admin/capabilities" element={<CapabilitiesPage />} />
        <Route path="admin/settings" element={<SettingsPage />} />
        <Route path="admin/menu" element={<AdminCatalogPage />} />
        <Route path="admin/qr-codes" element={<QrCodeCenterPage />} />
        <Route path="admin/delivery-zones" element={<DeliveryZonesPage />} />
        <Route path="admin/customers" element={<CustomersDirectoryPage />} />
        <Route
          path="admin/dining-tables"
          element={
            <CapabilityRoute module="dining" moduleName="Mesas y Portamesas QR">
              <DiningAdminSettings />
            </CapabilityRoute>
          }
        />
        <Route
          path="panel"
          element={
            <CapabilityRoute module="order_panel" moduleName="Panel Operativo de Pedidos">
              <FullOrderPanelPage />
            </CapabilityRoute>
          }
        />
        <Route
          path="panel/lite"
          element={
            <CapabilityRoute module="order_panel" moduleName="Panel Liviano de Pedidos">
              <LiteOrderPanelPage />
            </CapabilityRoute>
          }
        />

        <Route
          path="reports"
          element={
            <CapabilityRoute module="reporting" moduleName="Reportes y Conciliación">
              <ReportsPage />
            </CapabilityRoute>
          }
        />

        {/* Módulos Protegidos por Motor de Capacidades */}
        <Route
          path="dining"
          element={
            <CapabilityRoute module="dining" moduleName="Salón y Mesas">
              <DiningFloorPlanPage />
            </CapabilityRoute>
          }
        />
        <Route
          path="delivery"
          element={
            <CapabilityRoute module="delivery" moduleName="Domicilios">
              <ModulePlaceholderPage
                title="Despacho de Domicilios"
                description="Gestión de repartidores, direcciones y cobros contra entrega."
                moduleKey="delivery"
                phase="Fase 04 (Omnicanalidad & Domicilios)"
                icon={Truck}
              />
            </CapabilityRoute>
          }
        />
        <Route
          path="pickup"
          element={
            <CapabilityRoute module="takeaway" moduleName="Para Llevar">
              <ModulePlaceholderPage
                title="Pedidos Para Llevar (Takeaway)"
                description="Mostrador de recogida rápida y control de empaque."
                moduleKey="takeaway"
                phase="Fase 04 (Omnicanalidad & Domicilios)"
                icon={ShoppingBag}
              />
            </CapabilityRoute>
          }
        />
        <Route
          path="kds"
          element={
            <CapabilityRoute module="kitchen" moduleName="Pantalla de Cocina (KDS)">
              <KitchenKdsPage />
            </CapabilityRoute>
          }
        />
        <Route
          path="bar-kds"
          element={
            <CapabilityRoute module="bar.kds" moduleName="Comandas de Bar">
              <ModulePlaceholderPage
                title="Bar Display System"
                description="Despacho de coctelería y bebidas independiente de cocina."
                moduleKey="bar.kds"
                phase="Fase 03 (Cocina KDS & Barra)"
                icon={Wine}
              />
            </CapabilityRoute>
          }
        />
        <Route path="menu" element={<AdminCatalogPage />} />
        <Route
          path="inventory"
          element={
            <CapabilityRoute module="inventory.lite" moduleName="Inventario Lite">
              <ModulePlaceholderPage
                title="Inventario y Recetas"
                description="Control de existencias, descuentos por venta y stock crítico."
                moduleKey="inventory.lite"
                phase="Fase 05 (Inventario, Mermas & Costos)"
                icon={Boxes}
              />
            </CapabilityRoute>
          }
        />
        <Route
          path="customers"
          element={
            <CapabilityRoute module="crm.loyalty" moduleName="Clientes y Fidelidad">
              <ModulePlaceholderPage
                title="Clientes y Fidelización"
                description="Historial de consumo, puntos de fidelidad y habeas data Ley 1581."
                moduleKey="crm.loyalty"
                phase="Fase 05 (Fidelidad, Promociones & CRM)"
                icon={Users2}
              />
            </CapabilityRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </ErrorBoundary>
);
};
