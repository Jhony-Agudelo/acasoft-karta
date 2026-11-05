import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  SlidersHorizontal,
  Truck,
  ShoppingBag,
  UtensilsCrossed,
  XCircle,
  Ban,
  AlertTriangle,
  CreditCard,
  Search,
  History,
  FileEdit,
  DollarSign,
  Filter,
  Printer,
  Calendar,
  X,
  Coins,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { formatMoneyCop, OrderStatus, OrderPaymentStatus } from '@restaurante-saas/shared';
import { useSseStream } from '../../hooks/use-sse-stream';
import { playNewOrderChime } from '../lite-order-panel/order-sound';
import { OrderAdjustModal, OrderItemAdjustState } from '../lite-order-panel/OrderAdjustModal';
import { ManualPaymentModal } from './ManualPaymentModal';
import { OrderHistoryDrawer } from './OrderHistoryDrawer';
import { PrintReceiptModal } from '../../components/print/PrintReceiptModal';
import { CancelOrderModal } from './CancelOrderModal';

export type PanelTab =
  | 'requests'
  | 'unpaid'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled'
  | 'all';

export type DatePeriodFilter =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'THIS_MONTH'
  | 'ALL'
  | 'CUSTOM';

function getDateRange(
  period: DatePeriodFilter,
  customFrom?: string,
  customTo?: string,
): { date_from?: string; date_to?: string } {
  const now = new Date();
  if (period === 'TODAY') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { date_from: start.toISOString(), date_to: end.toISOString() };
  }
  if (period === 'YESTERDAY') {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
    const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
    return { date_from: start.toISOString(), date_to: end.toISOString() };
  }
  if (period === 'LAST_7_DAYS') {
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const start = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { date_from: start.toISOString(), date_to: end.toISOString() };
  }
  if (period === 'THIS_MONTH') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { date_from: start.toISOString(), date_to: end.toISOString() };
  }
  if (period === 'CUSTOM' && customFrom) {
    const start = new Date(customFrom + 'T00:00:00');
    const end = customTo ? new Date(customTo + 'T23:59:59.999') : new Date();
    return { date_from: start.toISOString(), date_to: end.toISOString() };
  }
  return {};
}

export const FullOrderPanelPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId, user } = useAuthStore();
  const activeBranchId = currentBranchId || (user?.branchScope && user.branchScope[0]) || '';

  // Sucursales para enlace de tienda pública / WhatsApp
  const { data: rawBranches = [] } = useQuery<any[]>({
    queryKey: ['branches-list', user?.id, user?.roleKey],
    queryFn: () => apiClient.get('/admin/branches'),
    enabled: !!user,
  });

  const activeBranch = rawBranches.find((b: any) => b.id === activeBranchId);
  const tenantSlug = activeBranch?.tenant?.slug || 'karta-demo';
  const branchSlug = activeBranch?.slug || '';
  const storefrontUrl = `${window.location.origin}/r/${tenantSlug}/b/${branchSlug}`;
  const [copiedStorefrontLink, setCopiedStorefrontLink] = useState<boolean>(false);

  // Filtros de estado y pestaña
  const [activeTab, setActiveTab] = useState<PanelTab>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Filtro de periodo / fecha
  const [dateFilter, setDateFilter] = useState<DatePeriodFilter>('TODAY');
  const [customDateFrom, setCustomDateFrom] = useState<string>('');
  const [customDateTo, setCustomDateTo] = useState<string>('');
  const [hideCompletedOnAll, setHideCompletedOnAll] = useState<boolean>(true);

  // Modales y drawers
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<any | null>(null);
  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState<any | null>(null);
  const [adjustingOrder, setAdjustingOrder] = useState<any | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<any | null>(null);

  // Notificación de pedido procesado con WhatsApp
  const [processedOrderNotice, setProcessedOrderNotice] = useState<{
    orderCode: string;
    waUrl: string;
    customerName?: string;
    phone?: string;
  } | null>(null);

  // Sonido
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(() => {
    return localStorage.getItem('karta_sound_muted') === 'true';
  });

  const toggleSound = () => {
    setIsSoundMuted((prev) => {
      const next = !prev;
      localStorage.setItem('karta_sound_muted', String(next));
      if (!next) {
        playNewOrderChime();
      }
      return next;
    });
  };

  const dateRange = useMemo(() => {
    return getDateRange(dateFilter, customDateFrom, customDateTo);
  }, [dateFilter, customDateFrom, customDateTo]);

  // Cargar pedidos con filtros avanzados
  const {
    data: ordersData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      'full-branch-orders',
      activeBranchId,
      activeTab,
      fulfillmentFilter,
      paymentFilter,
      dateFilter,
      dateRange.date_from,
      dateRange.date_to,
    ],
    queryFn: async () => {
      if (!activeBranchId) return { data: [], meta: { total: 0 } };

      const params = new URLSearchParams();
      params.append('limit', '100');

      if (activeTab === 'requests') params.append('tab', 'solicitudes');
      else if (activeTab === 'unpaid') params.append('tab', 'por_cobrar');
      else if (activeTab === 'preparing') params.append('tab', 'en_preparacion');
      else if (activeTab === 'ready') params.append('tab', 'listos');
      else if (activeTab === 'delivered') params.append('tab', 'entregados');
      else if (activeTab === 'cancelled') params.append('tab', 'cancelados');

      if (fulfillmentFilter !== 'ALL') params.append('fulfillment_type', fulfillmentFilter);
      if (paymentFilter !== 'ALL') params.append('payment_status', paymentFilter);
      if (dateRange.date_from) params.append('date_from', dateRange.date_from);
      if (dateRange.date_to) params.append('date_to', dateRange.date_to);

      const res = await apiClient.get(`/branches/${activeBranchId}/orders?${params.toString()}`);
      return res;
    },
    enabled: !!activeBranchId,
    refetchInterval: 25000,
  });

  const orders: any[] = ordersData?.data || [];
  const tabCounts = ordersData?.meta?.tab_counts || {
    solicitudes: 0,
    por_cobrar: 0,
    en_preparacion: 0,
    listos: 0,
    entregados: 0,
    cancelados: 0,
    total: 0,
  };

  // SSE en tiempo real
  const sseUrl = activeBranchId ? `/api/v1/branches/${activeBranchId}/orders/events` : '';
  const { isConnected } = useSseStream({
    url: sseUrl,
    authMode: 'jwt',
    enabled: !!activeBranchId,
    onMessage: (message) => {
      if (message.type === 'order.created') {
        if (!isSoundMuted) {
          playNewOrderChime();
        }
        queryClient.invalidateQueries({ queryKey: ['full-branch-orders'] });
      } else if (
        message.type === 'order.adjusted' ||
        message.type === 'order.status_changed' ||
        message.type === 'payment.recorded' ||
        message.type === 'payment.voided' ||
        message.type === 'order.resolved'
      ) {
        queryClient.invalidateQueries({ queryKey: ['full-branch-orders'] });
      }
    },
  });

  // Mutación para procesar pedido (REQUESTED -> ACCEPTED)
  const processOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiClient.post(`/orders/${orderId}/process`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['full-branch-orders'] });
      const waUrl = data?.whatsapp_redirect_url || data?.whatsapp_client_url;
      if (waUrl) {
        setProcessedOrderNotice({
          orderCode: data.order_code,
          waUrl,
          customerName: data.customer_name || 'Cliente',
          phone: data.customer_phone || '',
        });
        try {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        } catch {
          // Si el navegador bloqueó el popup automático, el banner de abajo ofrece el botón manual
        }
      }
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || err?.message || 'Error al procesar el pedido.');
    },
  });

  // Mutación para cambiar estado operativo
  const transitionMutation = useMutation({
    mutationFn: async ({
      orderId,
      to_status,
      reason,
    }: {
      orderId: string;
      to_status: string;
      reason?: string;
    }) => {
      return apiClient.patch(`/orders/${orderId}/status`, { to_status, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['full-branch-orders'] });
      setCancellingOrder(null);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || err?.message || 'Error al cambiar el estado.');
    },
  });

  // Filtrado local por término de búsqueda y ocultamiento de finalizados en vista general
  const filteredOrders = orders.filter((order) => {
    // Si estamos en la pestaña 'all' y el usuario activó ocultar finalizados (entregados y pagados / cancelados)
    if (activeTab === 'all' && hideCompletedOnAll) {
      const isDeliveredAndPaid =
        ['DELIVERED', 'PICKED_UP', 'SERVED'].includes(order.status) &&
        order.payment_status === 'PAID';
      const isCancelled = ['CANCELLED', 'REJECTED', 'EXPIRED_UNPROCESSED'].includes(order.status);
      if (isDeliveredAndPaid || isCancelled) {
        return false;
      }
    }

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const code = order.order_code?.toLowerCase() || '';
    const customerName = (
      order.customer_snapshot_json?.name ||
      order.customer?.name ||
      ''
    ).toLowerCase();
    const customerPhone = (
      order.customer_snapshot_json?.phone_e164 ||
      order.customer?.phone_e164 ||
      ''
    ).toLowerCase();

    return code.includes(term) || customerName.includes(term) || customerPhone.includes(term);
  });

  // Copiar link de seguimiento
  const handleCopyLink = (order: any) => {
    const customerName = order.customer_snapshot_json?.name || 'Cliente';
    const trackingUrl = `${window.location.origin}/t/${order.public_token}`;
    const text = `Hola ${customerName}, puedes hacer seguimiento en vivo de tu pedido #${order.order_code} aquí: ${trackingUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedOrderId(order.id);
    setTimeout(() => setCopiedOrderId(null), 2500);
  };

  return (
    <div className="flex flex-col h-full bg-[#faf8f5] text-stone-800">
      {/* Top Header */}
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-stone-900 tracking-tight">
              Panel Operativo & Caja
            </h1>
            <span
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span>{isConnected ? 'SSE en Vivo' : 'Sincronizando'}</span>
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Gestión integral de comandas, cobros en efectivo/transferencia y avance de cocina.
          </p>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Botón Copiar Enlace Carta WhatsApp */}
          <button
            onClick={() => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(storefrontUrl);
                setCopiedStorefrontLink(true);
                setTimeout(() => setCopiedStorefrontLink(false), 2500);
              }
            }}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs ${
              copiedStorefrontLink
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800'
            }`}
            title={`Copiar enlace público de la carta para enviar por WhatsApp: ${storefrontUrl}`}
          >
            {copiedStorefrontLink ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>¡Link Carta Copiado!</span>
              </>
            ) : (
              <>
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span className="hidden md:inline">Copiar Link WhatsApp</span>
                <span className="md:hidden">Carta WA</span>
              </>
            )}
          </button>

          {/* Botón Abrir Carta */}
          <a
            href={storefrontUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 shadow-2xs transition-colors hidden sm:flex items-center"
            title={`Abrir carta pública (${storefrontUrl})`}
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            onClick={toggleSound}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              isSoundMuted
                ? 'bg-stone-100 border-stone-200 text-stone-400'
                : 'bg-orange-50 border-orange-200 text-orange-700 shadow-2xs'
            }`}
            title={isSoundMuted ? 'Activar timbre de pedidos' : 'Silenciar timbre'}
          >
            {isSoundMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            <span className="hidden sm:inline">
              {isSoundMuted ? 'Silenciado' : 'Timbre Activo'}
            </span>
          </button>

          <button
            onClick={() => refetch()}
            className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 shadow-2xs transition-colors"
            title="Refrescar comanda"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Banner de Confirmación y Enlace de WhatsApp con el Cliente */}
      {processedOrderNotice && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-emerald-950 animate-slide-up shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-950">
                ¡Pedido #{processedOrderNotice.orderCode} procesado y enviado a Cocina!
              </p>
              <p className="text-[11px] text-emerald-800">
                Abre el chat de WhatsApp con el cliente para confirmar la recepción y enviar el link de seguimiento.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={processedOrderNotice.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 transition shadow-2xs"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Abrir WhatsApp con el Cliente</span>
            </a>
            <button
              onClick={() => setProcessedOrderNotice(null)}
              className="p-1.5 rounded-lg text-emerald-800 hover:bg-emerald-200/60 transition"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pestañas Superiores con Contadores */}
      <div className="bg-white border-b border-stone-200 px-6 pt-3 shrink-0 overflow-x-auto">
        <div className="flex gap-2 min-w-max pb-3 text-xs font-bold">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'all'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
            }`}
          >
            <span>Todos los Pedidos</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white/20 text-[10px]">
              {tabCounts.total}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'requests'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span>🔔 Solicitudes</span>
            <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-[10px]">
              {tabCounts.solicitudes}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('unpaid')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'unpaid'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200'
            }`}
          >
            <span>💳 Por Cobrar</span>
            <span className="px-1.5 py-0.2 rounded-md bg-orange-500/20 text-[10px]">
              {tabCounts.por_cobrar}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('preparing')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'preparing'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200'
            }`}
          >
            <span>🍳 En Preparación</span>
            <span className="px-1.5 py-0.2 rounded-md bg-sky-500/20 text-[10px]">
              {tabCounts.en_preparacion}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ready')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'ready'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <span>📦 Listos / Despacho</span>
            <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-[10px]">
              {tabCounts.listos}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('delivered')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'delivered'
                ? 'bg-stone-700 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
            }`}
          >
            <span>✅ Entregados</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white/40 text-[10px]">
              {tabCounts.entregados}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('cancelled')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'cancelled'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span>❌ Cancelados</span>
            <span className="px-1.5 py-0.2 rounded-md bg-rose-500/20 text-[10px]">
              {tabCounts.cancelados}
            </span>
          </button>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros Secundarios */}
      <div className="px-6 py-3 bg-stone-50/70 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
        {/* Input de Búsqueda */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código (#ABCD), cliente o celular..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-200 bg-white text-xs focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-2xs"
          />
        </div>

        {/* Filtros Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Periodo / Fecha */}
          <div className="flex items-center gap-1.5">
            <span className="text-stone-500 font-semibold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              <span className="hidden sm:inline">Periodo:</span>
            </span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DatePeriodFilter)}
              className="px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 font-bold focus:outline-hidden shadow-2xs"
            >
              <option value="TODAY">📅 Hoy (En Curso)</option>
              <option value="YESTERDAY">📅 Ayer</option>
              <option value="LAST_7_DAYS">📅 Últimos 7 Días</option>
              <option value="THIS_MONTH">📅 Este Mes</option>
              <option value="ALL">🌐 Todo el Historial</option>
              <option value="CUSTOM">📆 Rango Personalizado...</option>
            </select>
          </div>

          {/* Modalidad */}
          <div className="flex items-center gap-1.5">
            <span className="text-stone-500 font-semibold hidden sm:inline">Modalidad:</span>
            <select
              value={fulfillmentFilter}
              onChange={(e) => setFulfillmentFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 font-semibold focus:outline-hidden shadow-2xs"
            >
              <option value="ALL">Todas las modalidades</option>
              <option value="DINE_IN">Mesa / Salón</option>
              <option value="PICKUP">Para Llevar (Pickup)</option>
              <option value="DELIVERY">Domicilio</option>
            </select>
          </div>

          {/* Estado Financiero */}
          <div className="flex items-center gap-1.5">
            <span className="text-stone-500 font-semibold hidden sm:inline">Pago:</span>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-stone-700 font-semibold focus:outline-hidden shadow-2xs"
            >
              <option value="ALL">Todos los estados de pago</option>
              <option value="UNPAID">Sin Pagar</option>
              <option value="PARTIALLY_PAID">Abono Parcial</option>
              <option value="PAID">Pagado Total</option>
              <option value="COURTESY">Cortesía</option>
              <option value="WRITTEN_OFF">Saldo Incobrable</option>
            </select>
          </div>

          {/* Checkbox Ocultar Finalizados en 'all' */}
          {activeTab === 'all' && (
            <label className="flex items-center gap-1.5 text-stone-600 font-semibold cursor-pointer select-none bg-stone-100/70 hover:bg-stone-200/60 px-2.5 py-1.5 rounded-xl border border-stone-200/60 transition-colors">
              <input
                type="checkbox"
                checked={hideCompletedOnAll}
                onChange={(e) => setHideCompletedOnAll(e.target.checked)}
                className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-[11px]">Ocultar finalizados</span>
            </label>
          )}
        </div>
      </div>

      {/* Barra de Rango de Fecha Personalizada si CUSTOM está seleccionado */}
      {dateFilter === 'CUSTOM' && (
        <div className="px-6 py-2 bg-amber-50/60 border-b border-amber-200/60 flex flex-wrap items-center gap-3 text-xs shrink-0">
          <span className="font-bold text-amber-900 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Rango de Fechas Personalizado:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-stone-600 font-medium">Desde:</span>
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white text-stone-700 text-xs shadow-2xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-stone-600 font-medium">Hasta:</span>
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white text-stone-700 text-xs shadow-2xs"
            />
          </div>
          {(customDateFrom || customDateTo) && (
            <button
              onClick={() => {
                setCustomDateFrom('');
                setCustomDateTo('');
              }}
              className="px-2 py-1 rounded-lg bg-stone-200/80 hover:bg-stone-300 text-stone-700 font-bold text-[11px] transition-colors"
            >
              Limpiar Fechas
            </button>
          )}
        </div>
      )}

      {/* Grid de Comandas */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 text-stone-400">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs font-semibold">Cargando comandas...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center max-w-md mx-auto my-12 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto text-xl">
              📋
            </div>
            <h3 className="font-extrabold text-stone-900 text-base">
              No hay pedidos en esta vista
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              {activeTab === 'all' && hideCompletedOnAll && orders.length > 0
                ? `Hay ${orders.length} pedido(s) finalizados hoy. Puedes verlos en la pestaña "Entregados" o desmarcar la casilla "Ocultar finalizados".`
                : 'No se encontraron comandas con los filtros seleccionados o no hay pedidos activos para este periodo.'}
            </p>
            {activeTab === 'all' && hideCompletedOnAll && orders.length > 0 && (
              <button
                onClick={() => setHideCompletedOnAll(false)}
                className="mt-2 px-4 py-2 rounded-xl bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 transition-colors"
              >
                Ver todos los {orders.length} pedidos
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const customerSnapshot = order.customer_snapshot_json || {};
              const isPickup = order.fulfillment_type === 'PICKUP';
              const isDineIn = order.fulfillment_type === 'DINE_IN';
              const balanceCop = Math.max(0, order.grand_total_cop - (order.paid_total_cop || 0));
              const isPaymentAllowed =
                order.status !== 'REQUESTED' && order.payment_status !== 'NOT_TRACKED';

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-3xl border border-stone-200/90 shadow-2xs hover:shadow-md transition-all flex flex-col overflow-hidden"
                >
                  {/* Encabezado Tarjeta */}
                  <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-extrabold text-stone-900">
                        #{order.order_code}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-200/80 text-stone-700">
                        {order.origin}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                          order.status === 'REQUESTED'
                            ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                            : order.status === 'ACCEPTED'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : order.status === 'PREPARING'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : order.status === 'READY'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : order.status === 'DELIVERED' || order.status === 'PICKED_UP'
                            ? 'bg-stone-100 text-stone-700 border-stone-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {/* Cuerpo Tarjeta */}
                  <div className="p-4 space-y-3.5 flex-1">
                    {/* Cliente y Modalidad */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-stone-900 text-sm">
                          {customerSnapshot.name || order.customer?.name || 'Cliente'}
                        </p>
                        <p className="text-xs text-stone-500 font-mono">
                          {customerSnapshot.phone_e164 || order.customer?.phone_e164 || 'Sin teléfono'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 text-xs font-semibold text-stone-600 bg-stone-100 px-2 py-1 rounded-lg">
                        {isDineIn ? (
                          <>
                            <UtensilsCrossed className="w-3.5 h-3.5 text-orange-600" />
                            <span>Mesa</span>
                          </>
                        ) : isPickup ? (
                          <>
                            <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
                            <span>Para Llevar</span>
                          </>
                        ) : (
                          <>
                            <Truck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Domicilio</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Dirección si es domicilio */}
                    {!isPickup && !isDineIn && customerSnapshot.address_line && (
                      <p className="text-xs text-stone-600 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                        <span className="truncate">
                          {customerSnapshot.address_line}
                          {customerSnapshot.neighborhood && `, ${customerSnapshot.neighborhood}`}
                        </span>
                      </p>
                    )}

                    {/* Medio de pago solicitado por el cliente */}
                    {customerSnapshot.payment_method && (
                      <div className={`p-2.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                        customerSnapshot.payment_method === 'CASH'
                          ? 'bg-amber-50/80 border-amber-200/90 text-amber-950'
                          : 'bg-sky-50/80 border-sky-200/90 text-sky-950'
                      }`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {customerSnapshot.payment_method === 'CASH' ? (
                            <>
                              <Coins className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="truncate">
                                <strong>Efectivo</strong>
                                {customerSnapshot.cash_amount_delivered_cop ? (
                                  <> (Paga: {formatMoneyCop(customerSnapshot.cash_amount_delivered_cop)})</>
                                ) : ' (Exacto)'}
                              </span>
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-4 h-4 text-sky-600 shrink-0" />
                              <span className="truncate">
                                <strong>Transferencia</strong> (Nequi / Bancolombia)
                              </span>
                            </>
                          )}
                        </div>
                        {customerSnapshot.payment_method === 'CASH' && (customerSnapshot.change_to_give_cop ?? 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-200/90 text-amber-950 font-black text-[10px] shrink-0">
                            Cambio: {formatMoneyCop(customerSnapshot.change_to_give_cop)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Desglose resumido de ítems */}
                    <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100 space-y-1.5 text-xs">
                      {order.items?.map((it: any) => (
                        <div key={it.id} className="flex justify-between items-center">
                          <span className="font-semibold text-stone-800 truncate mr-2">
                            <strong className="text-orange-600">{it.quantity}x</strong>{' '}
                            {it.product_snapshot_json?.name || it.product_name}
                          </span>
                          <span className="font-bold text-stone-700 shrink-0">
                            {formatMoneyCop(it.line_total_cop || it.unit_price_cop * it.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Resumen Financiero y Badge de Cobro */}
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-stone-400 block">
                          Total Comanda
                        </span>
                        <span className="text-base font-black text-stone-900">
                          {formatMoneyCop(order.grand_total_cop)}
                        </span>
                      </div>

                      {/* Badge Financiero */}
                      <div className="text-right">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            order.payment_status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : order.payment_status === 'PARTIALLY_PAID'
                              ? 'bg-orange-50 text-orange-700 border-orange-300'
                              : order.payment_status === 'COURTESY'
                              ? 'bg-purple-50 text-purple-700 border-purple-300'
                              : order.payment_status === 'WRITTEN_OFF'
                              ? 'bg-rose-50 text-rose-700 border-rose-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          {order.payment_status === 'PAID'
                            ? '✓ Pagado'
                            : order.payment_status === 'PARTIALLY_PAID'
                            ? `Abono ${formatMoneyCop(order.paid_total_cop)}`
                            : order.payment_status === 'COURTESY'
                            ? '🎁 Cortesía'
                            : order.payment_status === 'WRITTEN_OFF'
                            ? '⚠️ Incobrable'
                            : 'Sin Pagar'}
                        </span>
                        {balanceCop > 0 && order.payment_status !== 'NOT_TRACKED' && (
                          <span className="text-[10px] text-amber-700 block font-bold mt-0.5">
                            Debe: {formatMoneyCop(balanceCop)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Aviso si la comanda está cancelada */}
                    {order.status === 'CANCELLED' && (
                      <div className="mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
                        <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-rose-950 block">Pedido Cancelado</span>
                          {order.status_events?.slice().reverse().find((e: any) => e.to_status === 'CANCELLED')?.reason ? (
                            <p className="text-[11px] text-rose-800 leading-relaxed">
                              <strong>Motivo:</strong> &ldquo;{order.status_events.slice().reverse().find((e: any) => e.to_status === 'CANCELLED').reason}&rdquo;
                            </p>
                          ) : (
                            <p className="text-[11px] text-rose-700 italic">Sin motivo especificado en el registro.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botones de Acción de la Tarjeta */}
                  <div className="p-3 bg-stone-50 border-t border-stone-100 space-y-2 shrink-0">
                    {/* Fila 1: Botones de Caja e Historial */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedOrderForPayment(order)}
                        disabled={!isPaymentAllowed}
                        className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs ${
                          !isPaymentAllowed
                            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                            : order.payment_status === 'PAID'
                            ? 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                            : 'bg-orange-600 hover:bg-orange-700 text-white shadow-xs'
                        }`}
                        title={
                          order.status === 'REQUESTED'
                            ? 'Debes procesar la orden antes de registrar cobros.'
                            : order.payment_status === 'NOT_TRACKED'
                            ? 'Esta orden tiene política NONE (No rastreable).'
                            : 'Gestionar cobros y resoluciones'
                        }
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>
                          {order.payment_status === 'PAID'
                            ? 'Ver Pagos'
                            : `Cobrar (${formatMoneyCop(balanceCop)})`}
                        </span>
                      </button>

                      <button
                        onClick={() => setSelectedOrderForHistory(order)}
                        className="py-2 px-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs flex items-center gap-1 shadow-2xs"
                        title="Ver auditoría y detalles"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Auditoría</span>
                      </button>

                      <button
                        onClick={() => handleCopyLink(order)}
                        className={`p-2 rounded-xl border text-xs font-bold transition-colors ${
                          copiedOrderId === order.id
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                        title="Copiar link de WhatsApp"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setSelectedOrderForPrint(order)}
                        className="p-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs transition-colors shadow-2xs"
                        title="Imprimir ticket térmico (58mm / 80mm)"
                      >
                        <Printer className="w-3.5 h-3.5 text-stone-600" />
                      </button>

                      {/* Botón Cancelar Pedido (si no es estado terminal) */}
                      {!['DELIVERED', 'PICKED_UP', 'SERVED', 'REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'].includes(order.status) && (
                        <button
                          onClick={() => setCancellingOrder(order)}
                          className="p-2 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors shadow-2xs"
                          title="Cancelar pedido con motivo"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Fila 2: Transición Operativa según estado actual */}
                    <div className="flex gap-2">
                      {order.status === 'REQUESTED' && (
                        <div className="flex flex-col gap-2 w-full">
                          {customerSnapshot.payment_method === 'TRANSFER' && (
                            <div className="p-2 rounded-xl bg-sky-50 border border-sky-200 text-[11px] text-sky-900 flex items-center justify-between gap-1.5">
                              <span className="font-semibold">⚠️ Verificar comprobante antes de mandar a cocina</span>
                              {(customerSnapshot.phone_e164 || order.customer?.phone_e164 || order.customer?.phone) && (
                                <a
                                  href={`https://wa.me/${(customerSnapshot.phone_e164 || order.customer?.phone_e164 || order.customer?.phone).replace(/\D/g, '')}?text=${encodeURIComponent(
                                    `Hola ${customerSnapshot.name || order.customer?.name || 'Cliente'}, recibimos tu pedido #${order.order_code}. ¿Nos compartes el soporte de transferencia para que la cocina inicie la preparación?`,
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] flex items-center gap-1 shrink-0 transition"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Pedir soporte</span>
                                </a>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2 w-full">
                            <button
                              onClick={() => processOrderMutation.mutate(order.id)}
                              disabled={processOrderMutation.isPending}
                              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{customerSnapshot.payment_method === 'TRANSFER' ? 'Confirmar y Enviar a Cocina' : 'Procesar y Enviar a WhatsApp'}</span>
                            </button>
                            <button
                              onClick={() => setCancellingOrder(order)}
                              className="py-2.5 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                              title="Rechazar o cancelar solicitud con motivo"
                            >
                              <XCircle className="w-4 h-4" />
                              <span className="hidden sm:inline">Rechazar</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {order.status === 'ACCEPTED' && (
                        <>
                          <button
                            onClick={() =>
                              transitionMutation.mutate({
                                orderId: order.id,
                                to_status: 'PREPARING',
                              })
                            }
                            className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition-all shadow-xs"
                          >
                            🍳 En Preparación
                          </button>
                          <button
                            onClick={() =>
                              transitionMutation.mutate({
                                orderId: order.id,
                                to_status: isPickup ? 'READY' : 'OUT_FOR_DELIVERY',
                              })
                            }
                            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-xs"
                          >
                            {isPickup ? '📦 Listo' : '🛵 Despachar'}
                          </button>
                        </>
                      )}

                      {order.status === 'PREPARING' && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: isPickup ? 'READY' : 'OUT_FOR_DELIVERY',
                            })
                          }
                          className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-xs"
                        >
                          {isPickup ? '📦 Marcar Listo para Entrega' : '🛵 Marcar en Camino (Domicilio)'}
                        </button>
                      )}

                      {order.status === 'READY' && isDineIn && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: 'SERVED',
                            })
                          }
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-all shadow-md shadow-emerald-950/20 flex items-center justify-center gap-1.5"
                        >
                          <UtensilsCrossed className="w-4 h-4" />
                          <span>🍽️ Marcar Servido en Mesa</span>
                        </button>
                      )}

                      {order.status === 'READY' && isPickup && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: 'PICKED_UP',
                            })
                          }
                          className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-black text-white font-extrabold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          <span>✅ Entregado al Cliente (Recogida)</span>
                        </button>
                      )}

                      {order.status === 'READY' && !isPickup && !isDineIn && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() =>
                              transitionMutation.mutate({
                                orderId: order.id,
                                to_status: 'OUT_FOR_DELIVERY',
                              })
                            }
                            className="py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] transition-all shadow-xs flex items-center justify-center gap-1"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>En Despacho</span>
                          </button>
                          <button
                            onClick={() =>
                              transitionMutation.mutate({
                                orderId: order.id,
                                to_status: 'DELIVERED',
                              })
                            }
                            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all shadow-xs flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Entregado</span>
                          </button>
                        </div>
                      )}

                      {order.status === 'OUT_FOR_DELIVERY' && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: 'DELIVERED',
                            })
                          }
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>✅ Domicilio Entregado</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Cobros Manuales y Resoluciones */}
      {selectedOrderForPayment && (
        <ManualPaymentModal
          isOpen={!!selectedOrderForPayment}
          onClose={() => setSelectedOrderForPayment(null)}
          order={selectedOrderForPayment}
          onSuccess={() => {
            setSelectedOrderForPayment(null);
            queryClient.invalidateQueries({ queryKey: ['full-branch-orders'] });
          }}
        />
      )}

      {/* Drawer de Auditoría e Historial */}
      {selectedOrderForHistory && (
        <OrderHistoryDrawer
          isOpen={!!selectedOrderForHistory}
          onClose={() => setSelectedOrderForHistory(null)}
          order={selectedOrderForHistory}
        />
      )}

      {/* Modal de Ajuste de Ítems */}
      {adjustingOrder && (
        <OrderAdjustModal
          isOpen={!!adjustingOrder}
          onClose={() => setAdjustingOrder(null)}
          orderId={adjustingOrder.id}
          orderCode={adjustingOrder.order_code}
          fulfillmentType={adjustingOrder.fulfillment_type}
          initialItems={adjustingOrder.items?.map((it: any) => ({
            product_id: it.product_id,
            product_name: it.product_snapshot_json?.name || it.product_name,
            variant_id: it.variant_id,
            variant_name: it.variant_name,
            unit_price_cop: it.unit_price_cop,
            quantity: it.quantity,
            modifiers: it.modifiers || [],
            notes: it.notes,
          })) || []}
          initialDeliveryFeeCop={adjustingOrder.delivery_fee_cop || 0}
          paidTotalCop={adjustingOrder.paid_total_cop || 0}
          onSave={async (payload) => {
            await apiClient.patch(`/orders/${adjustingOrder.id}/items`, payload);
            setAdjustingOrder(null);
            queryClient.invalidateQueries({ queryKey: ['full-branch-orders'] });
          }}
        />
      )}

      {/* Modal de Impresión Térmica */}
      {selectedOrderForPrint && (
        <PrintReceiptModal
          isOpen={!!selectedOrderForPrint}
          onClose={() => setSelectedOrderForPrint(null)}
          order={selectedOrderForPrint}
        />
      )}

      {/* Modal de Cancelación de Pedido con Motivo */}
      {cancellingOrder && (
        <CancelOrderModal
          isOpen={!!cancellingOrder}
          onClose={() => setCancellingOrder(null)}
          order={cancellingOrder}
          onSuccess={() => {
            setCancellingOrder(null);
            queryClient.invalidateQueries({ queryKey: ['full-branch-orders'] });
          }}
          onOpenPayments={() => {
            setSelectedOrderForPayment(cancellingOrder);
          }}
        />
      )}
    </div>
  );
};
