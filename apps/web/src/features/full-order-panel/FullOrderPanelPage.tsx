import React, { useState, useEffect } from 'react';
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
  AlertTriangle,
  CreditCard,
  Search,
  History,
  FileEdit,
  DollarSign,
  Filter,
  Printer,
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

type PanelTab =
  | 'requests'
  | 'unpaid'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled'
  | 'all';

export const FullOrderPanelPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId, user } = useAuthStore();
  const activeBranchId = currentBranchId || (user?.branchScope && user.branchScope[0]) || '';

  // Filtros de estado y pestaña
  const [activeTab, setActiveTab] = useState<PanelTab>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Modales y drawers
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<any | null>(null);
  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState<any | null>(null);
  const [adjustingOrder, setAdjustingOrder] = useState<any | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<any | null>(null);

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
      if (data?.whatsapp_redirect_url) {
        window.open(data.whatsapp_redirect_url, '_blank', 'noopener,noreferrer');
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
      setRejectingOrder(null);
      setRejectReason('');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || err?.message || 'Error al cambiar el estado.');
    },
  });

  // Filtrado local por término de búsqueda
  const filteredOrders = orders.filter((order) => {
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
        <div className="flex items-center gap-2.5">
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
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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
              No se encontraron comandas con los filtros seleccionados o no hay pedidos activos
              para esta sucursal.
            </p>
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
                    </div>

                    {/* Fila 2: Transición Operativa según estado actual */}
                    <div className="flex gap-2">
                      {order.status === 'REQUESTED' && (
                        <button
                          onClick={() => processOrderMutation.mutate(order.id)}
                          disabled={processOrderMutation.isPending}
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Procesar y Enviar a WhatsApp</span>
                        </button>
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

                      {order.status === 'READY' && isPickup && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: 'PICKED_UP',
                            })
                          }
                          className="w-full py-2 rounded-xl bg-stone-900 hover:bg-black text-white font-bold text-xs transition-all shadow-xs"
                        >
                          ✅ Entregado al Cliente
                        </button>
                      )}

                      {order.status === 'OUT_FOR_DELIVERY' && (
                        <button
                          onClick={() =>
                            transitionMutation.mutate({
                              orderId: order.id,
                              to_status: 'DELIVERED',
                            })
                          }
                          className="w-full py-2 rounded-xl bg-stone-900 hover:bg-black text-white font-bold text-xs transition-all shadow-xs"
                        >
                          ✅ Domicilio Entregado
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
    </div>
  );
};
