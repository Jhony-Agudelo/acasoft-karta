import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { useBrandStore } from '../../stores/brand.store';
import { apiClient, ApiError } from '../../services/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Building2,
  Store,
  Wallet,
  Users2,
  Palette,
  CheckCircle2,
  AlertCircle,
  Plus,
  Share2,
  Lock,
  Phone,
  Mail,
  QrCode,
  ShieldAlert,
  Copy,
  Check,
} from 'lucide-react';
import { generateStaffInvitationLink, RoleKey } from '@restaurante-saas/shared';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId, user } = useAuthStore();
  const { settings: brandSettings, setBrandSettings } = useBrandStore();

  const [activeTab, setActiveTab] = useState<'brand' | 'branches' | 'payments' | 'team'>('brand');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Formulario Marca
  const [displayName, setDisplayName] = useState(brandSettings.display_name);
  const [primaryColor, setPrimaryColor] = useState(brandSettings.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(brandSettings.secondary_color);
  const [receiptFooter, setReceiptFooter] = useState(brandSettings.receipt_footer_text || '');

  // Modal Nueva Sucursal
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [newBranchData, setNewBranchData] = useState({
    name: '',
    address: '',
    city: 'Bogotá',
    phone_whatsapp_e164: '3001234567',
  });

  // Modal Nuevo Miembro de Equipo
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [inviteModalData, setInviteModalData] = useState<{ inviteUrl?: string; tempPassword?: string; phone?: string; name?: string } | null>(null);
  const [newStaffData, setNewStaffData] = useState({
    name: '',
    email: '',
    phone: '3001234567',
    role_key: 'CASHIER' as RoleKey,
    delivery_mode: 'WHATSAPP_INVITE_LINK' as 'WHATSAPP_INVITE_LINK' | 'TEMPORARY_PASSWORD',
    temp_password: '',
  });

  // Queries
  const { data: branches = [] } = useQuery<any[]>({
    queryKey: ['admin-branches'],
    queryFn: () => apiClient.get('/admin/branches'),
  });

  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.get('/admin/users'),
  });

  const { data: channelPolicies = [] } = useQuery<any[]>({
    queryKey: ['channel-policies', currentBranchId],
    queryFn: () => apiClient.get(`/admin/branches/${currentBranchId}/channel-policies`),
    enabled: !!currentBranchId,
  });

  // Guardar Marca
  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiClient.patch('/admin/brand', {
        display_name: displayName,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        receipt_footer_text: receiptFooter,
      });

      setBrandSettings({
        display_name: displayName,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        receipt_footer_text: receiptFooter,
      });

      setSuccessMessage('Configuración de marca guardada con éxito.');
    } catch (err: any) {
      setErrorMessage(err.data?.message || 'Error al guardar la marca');
    }
  };

  // Crear Sucursal
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      await apiClient.post('/admin/branches', newBranchData);
      queryClient.invalidateQueries({ queryKey: ['admin-branches'] });
      setIsBranchModalOpen(false);
      setSuccessMessage('Nueva sucursal creada con éxito.');
    } catch (err: any) {
      setErrorMessage(err.data?.message || 'Error al crear la sucursal');
    }
  };

  // Crear Miembro Staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const res = await apiClient.post('/admin/users', {
        ...newStaffData,
        temp_password: newStaffData.delivery_mode === 'TEMPORARY_PASSWORD' ? newStaffData.temp_password || 'ClaveTemp123!' : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setIsStaffModalOpen(false);

      if (res.inviteUrl || res.tempPassword) {
        setInviteModalData({
          inviteUrl: res.inviteUrl,
          tempPassword: res.tempPassword,
          phone: newStaffData.phone,
          name: newStaffData.name,
        });
      }

      setSuccessMessage('Usuario de personal creado con éxito.');
    } catch (err: any) {
      setErrorMessage(err.data?.message || 'Error al crear miembro del equipo');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Header */}
      <div className="border-b border-slate-800 pb-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400 mb-2 border border-sky-500/20">
          <Settings className="h-3.5 w-3.5" />
          Ajustes del Sistema
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Configuración del Restaurante</h1>
        <p className="text-xs text-slate-400 mt-1">
          Gestiona la identidad de marca, sucursales físicas, métodos de cobro digital y el equipo de trabajo.
        </p>

        {/* Tab Navigation */}
        <div className="flex gap-2 mt-6 overflow-x-auto pb-1">
          {[
            { id: 'brand', label: 'Marca & Tematización', icon: Palette },
            { id: 'branches', label: 'Sedes y Sucursales', icon: Store },
            { id: 'payments', label: 'Políticas de Pago y Canales', icon: Wallet },
            { id: 'team', label: 'Equipo y Permisos', icon: Users2 },
          ].map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSuccessMessage(null);
                  setErrorMessage(null);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Alertas */}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center gap-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-xs text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* TAB 1: MARCA */}
      {activeTab === 'brand' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-3xl">
          <form onSubmit={handleSaveBrand} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Nombre Comercial de la Marca
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-sky-400" />
                  Color Primario
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-14 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-32 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-orange-400" />
                  Color Secundario (Botones y Acentos)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-10 w-14 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-32 rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Texto al Pie de Factura / Ticket
              </label>
              <textarea
                rows={2}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="¡Gracias por su visita! Síguenos en Instagram @turestaurante"
                className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-xs text-white"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/25 transition"
            >
              <Check className="h-4 w-4" />
              Guardar Cambios de Marca
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: SUCURSALES */}
      {activeTab === 'branches' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Sedes configuradas para el restaurante:
            </span>
            <button
              onClick={() => setIsBranchModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2 text-xs font-semibold text-white shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Nueva Sucursal
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((b) => (
              <div
                key={b.id}
                className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">{b.name}</span>
                    {b.is_main && (
                      <span className="rounded bg-sky-500/20 text-sky-400 px-2 py-0.5 text-[10px] font-bold">
                        SEDE PRINCIPAL
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-1">{b.address || 'Sin dirección'}</p>
                  <p className="text-xs text-slate-400">{b.city || 'Colombia'}</p>
                  <p className="text-xs font-mono text-emerald-400 mt-2 flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {b.phone_whatsapp_e164 || 'Sin WhatsApp'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: PAGOS Y CANALES */}
      {activeTab === 'payments' && (
        <div className="space-y-6 max-w-4xl">
          <p className="text-xs text-slate-400">
            Políticas de cobro configuradas por canal en la sucursal activa:
          </p>

          <div className="space-y-4">
            {channelPolicies.map((cp) => (
              <div
                key={cp.id || cp.fulfillment_type}
                className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-white uppercase tracking-wider">
                      {cp.fulfillment_type === 'DINE_IN'
                        ? 'Salón & Mesas (Dine-In)'
                        : cp.fulfillment_type === 'PICKUP'
                        ? 'Para Llevar (Pickup)'
                        : 'Domicilios (Delivery)'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        cp.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {cp.enabled ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Política de Cobro: <strong>{cp.payment_policy}</strong>
                  </p>
                  <p className="text-xs text-slate-400">
                    Exigir pago antes de cocina:{' '}
                    <strong>{cp.require_payment_before_preparation ? 'Sí' : 'No'}</strong>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: EQUIPO */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Personal con acceso al sistema:
            </span>
            <button
              onClick={() => setIsStaffModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2 text-xs font-semibold text-white shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Invitar Empleado
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Teléfono WhatsApp</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {teamMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-semibold text-white">{m.name}</td>
                    <td className="px-4 py-3 text-slate-300">{m.email}</td>
                    <td className="px-4 py-3 font-mono text-emerald-400">{m.phone}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-sky-500/20 text-sky-400 px-2 py-0.5 text-[10px] font-bold">
                        {m.role_key}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          m.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {m.is_active ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nueva Sucursal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Nueva Sucursal</h3>
            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={newBranchData.name}
                  onChange={(e) => setNewBranchData({ ...newBranchData, name: e.target.value })}
                  placeholder="Ej. Sede Chapinero"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Dirección</label>
                <input
                  type="text"
                  required
                  value={newBranchData.address}
                  onChange={(e) => setNewBranchData({ ...newBranchData, address: e.target.value })}
                  placeholder="Calle 63 # 9-45"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Ciudad</label>
                <input
                  type="text"
                  required
                  value={newBranchData.city}
                  onChange={(e) => setNewBranchData({ ...newBranchData, city: e.target.value })}
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">WhatsApp Sede</label>
                <input
                  type="tel"
                  required
                  value={newBranchData.phone_whatsapp_e164}
                  onChange={(e) => setNewBranchData({ ...newBranchData, phone_whatsapp_e164: e.target.value })}
                  placeholder="3001234567"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-700 py-2 text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-sky-500 py-2 text-xs font-semibold text-white"
                >
                  Crear Sucursal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nuevo Miembro Staff */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Invitar Nuevo Miembro del Personal</h3>
            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={newStaffData.name}
                  onChange={(e) => setNewStaffData({ ...newStaffData, name: e.target.value })}
                  placeholder="Andrés Restrepo"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={newStaffData.email}
                  onChange={(e) => setNewStaffData({ ...newStaffData, email: e.target.value })}
                  placeholder="andres@restaurante.co"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">WhatsApp (Colombia)</label>
                <input
                  type="tel"
                  required
                  value={newStaffData.phone}
                  onChange={(e) => setNewStaffData({ ...newStaffData, phone: e.target.value })}
                  placeholder="3001234567"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Rol Operativo</label>
                <select
                  value={newStaffData.role_key}
                  onChange={(e) => setNewStaffData({ ...newStaffData, role_key: e.target.value as any })}
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white"
                >
                  <option value="CASHIER">Cajero / Mostrador</option>
                  <option value="WAITER">Mesero / Salón</option>
                  <option value="KITCHEN_STAFF">Cocinero / KDS</option>
                  <option value="MANAGER">Gerente de Sucursal</option>
                  <option value="DELIVERY_DISPATCHER">Despachador de Domicilios</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Modalidad de Envío</label>
                <select
                  value={newStaffData.delivery_mode}
                  onChange={(e) => setNewStaffData({ ...newStaffData, delivery_mode: e.target.value as any })}
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white"
                >
                  <option value="WHATSAPP_INVITE_LINK">Enlace de Activación por WhatsApp</option>
                  <option value="TEMPORARY_PASSWORD">Clave Temporal</option>
                </select>
              </div>
              {newStaffData.delivery_mode === 'TEMPORARY_PASSWORD' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Clave Temporal Asignada</label>
                  <input
                    type="text"
                    value={newStaffData.temp_password}
                    onChange={(e) => setNewStaffData({ ...newStaffData, temp_password: e.target.value })}
                    placeholder="ClaveTemp123!"
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-700 py-2 text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-sky-500 py-2 text-xs font-semibold text-white"
                >
                  Generar Invitación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Mostrar Invitación WhatsApp */}
      {inviteModalData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <h3 className="text-base font-bold text-white">Invitación Lista</h3>
            </div>
            <p className="text-xs text-slate-300">
              Comparte el enlace con {inviteModalData.name} por WhatsApp para que active su cuenta:
            </p>

            {inviteModalData.inviteUrl && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 break-all">
                {inviteModalData.inviteUrl}
              </div>
            )}

            {inviteModalData.tempPassword && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
                Clave temporal: <strong className="text-sky-400 font-mono">{inviteModalData.tempPassword}</strong>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {inviteModalData.inviteUrl && inviteModalData.phone && (
                <a
                  href={generateStaffInvitationLink(
                    `+57${inviteModalData.phone.replace(/\D/g, '')}`,
                    brandSettings.display_name,
                    inviteModalData.inviteUrl,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 py-2.5 text-xs font-semibold text-white transition"
                >
                  <Share2 className="h-4 w-4" />
                  Abrir WhatsApp Web
                </a>
              )}
              <button
                type="button"
                onClick={() => setInviteModalData(null)}
                className="px-4 rounded-xl border border-slate-700 py-2.5 text-xs text-slate-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
