import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import {
  SalesReportResponseDto,
  formatMoneyCop,
} from '@restaurante-saas/shared';
import {
  BarChart3,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Equal,
  CreditCard,
  Banknote,
  Smartphone,
  Truck,
  HeartHandshake,
  Clock,
  TrendingUp,
  Receipt,
  RotateCcw,
  Store,
  Layers,
  ShoppingBag,
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { currentBranchId } = useAuthStore();

  // Helper para fechas YYYY-MM-DD en hora local
  const getTodayStr = () => new Date().toISOString().substring(0, 10);
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().substring(0, 10);
  };
  const getNDaysAgoStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().substring(0, 10);
  };
  const getFirstDayOfMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };

  // Filtros de búsqueda
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | '7days' | 'month' | 'custom'>('today');
  const [dateFrom, setDateFrom] = useState(getTodayStr());
  const [dateTo, setDateTo] = useState(getTodayStr());
  const [branchId, setBranchId] = useState<string>(currentBranchId || '');
  const [origin, setOrigin] = useState<string>('');
  const [fulfillmentType, setFulfillmentType] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  // Manejar cambio de preset de fecha
  const handlePresetChange = (preset: 'today' | 'yesterday' | '7days' | 'month' | 'custom') => {
    setDatePreset(preset);
    const today = getTodayStr();
    if (preset === 'today') {
      setDateFrom(today);
      setDateTo(today);
    } else if (preset === 'yesterday') {
      const yesterday = getYesterdayStr();
      setDateFrom(yesterday);
      setDateTo(yesterday);
    } else if (preset === '7days') {
      setDateFrom(getNDaysAgoStr(7));
      setDateTo(today);
    } else if (preset === 'month') {
      setDateFrom(getFirstDayOfMonthStr());
      setDateTo(today);
    }
  };

  // Obtener sucursales
  const { data: branches = [] } = useQuery<any[]>({
    queryKey: ['branches-list'],
    queryFn: () => apiClient.get('/admin/branches'),
  });

  // Query del reporte de ventas
  const { data: report, isLoading, isError, refetch } = useQuery<SalesReportResponseDto>({
    queryKey: ['sales-report', dateFrom, dateTo, branchId, origin, fulfillmentType],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('date_from', dateFrom);
      params.set('date_to', dateTo);
      if (branchId) params.set('branch_id', branchId);
      if (origin) params.set('origin', origin);
      if (fulfillmentType) params.set('fulfillment_type', fulfillmentType);
      return apiClient.get(`/reports/sales?${params.toString()}`);
    },
  });

  // Descarga del archivo CSV contable
  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      params.set('date_from', dateFrom);
      params.set('date_to', dateTo);
      if (branchId) params.set('branch_id', branchId);
      if (origin) params.set('origin', origin);
      if (fulfillmentType) params.set('fulfillment_type', fulfillmentType);

      // Usar fetch para descargar como Blob
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/v1/reports/sales/export-csv?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al descargar reporte CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_ventas_${dateFrom}_${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error('Error al exportar CSV:', e);
      alert('Ocurrió un error al generar la exportación CSV contable.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-orange-600 to-amber-500 rounded-2xl text-white shadow-md shadow-orange-500/20">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-stone-900 tracking-tight">
              Reportes & Conciliación Contable
            </h1>
            <p className="text-xs text-stone-500 font-medium">
              Ecuación de balance financiero, desglose de recaudo y auditoría contable
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-bold transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Actualizar
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isExporting || isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Generando...' : 'Exportar CSV Contable (Sin PII)'}
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm space-y-4">
        {/* Presets de fecha */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div className="flex items-center gap-1.5 bg-stone-100/80 p-1 rounded-xl text-xs">
            <button
              onClick={() => handlePresetChange('today')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                datePreset === 'today' ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => handlePresetChange('yesterday')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                datePreset === 'yesterday' ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Ayer
            </button>
            <button
              onClick={() => handlePresetChange('7days')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                datePreset === '7days' ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Últimos 7 días
            </button>
            <button
              onClick={() => handlePresetChange('month')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                datePreset === 'month' ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Mes Actual
            </button>
            <button
              onClick={() => setDatePreset('custom')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                datePreset === 'custom' ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Personalizado
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
            <Calendar className="h-4 w-4 text-stone-400" />
            <span>Zona horaria: America/Bogota (UTC-5)</span>
          </div>
        </div>

        {/* Inputs de filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDatePreset('custom');
                setDateFrom(e.target.value);
              }}
              className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDatePreset('custom');
                setDateTo(e.target.value);
              }}
              className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">Sucursal</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">Origen</label>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            >
              <option value="">Todos los orígenes</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="WEB_DIRECT">Web Directa</option>
              <option value="PHONE_MANUAL">Teléfono / Manual</option>
              <option value="WAITER">Mesero</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">Modalidad</label>
            <select
              value={fulfillmentType}
              onChange={(e) => setFulfillmentType(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            >
              <option value="">Todas las modalidades</option>
              <option value="PICKUP">Para Llevar (Pickup)</option>
              <option value="DELIVERY">Domicilio</option>
              <option value="DINE_IN">Mesa / Salón</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="p-12 text-center text-stone-500 bg-white rounded-2xl border border-stone-200 shadow-sm">
          <div className="inline-block animate-spin h-8 w-8 border-4 border-orange-500 border-t-transparent rounded-full mb-3" />
          <p className="text-sm font-bold text-stone-700">Calculando conciliación contable...</p>
        </div>
      )}

      {isError && (
        <div className="p-8 text-center text-red-600 bg-red-50 rounded-2xl border border-red-200 shadow-sm">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
          <p className="font-bold">Error al consultar los reportes de ventas.</p>
          <p className="text-xs text-red-500 mt-1">Verifique la conexión o el rango de fechas seleccionado.</p>
        </div>
      )}

      {report && (
        <>
          {/* Bloque de Ecuación Maestra de Conciliación Visual */}
          <div className="bg-gradient-to-br from-stone-900 to-stone-800 text-white p-6 rounded-2xl shadow-lg border border-stone-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-700/80 pb-3">
              <div>
                <span className="text-[10px] font-black tracking-widest text-orange-400 uppercase">
                  Ecuación Maestra de Conciliación
                </span>
                <h2 className="text-lg font-bold text-white">
                  Balance Financiero de Órdenes Confirmadas
                </h2>
              </div>
              <div>
                {report.reconciliation_summary.is_balanced ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                    <CheckCircle2 className="h-4 w-4" />
                    Conciliación Cuadrada (0 discrepancia)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/30">
                    <AlertTriangle className="h-4 w-4" />
                    Discrepancia Contable Detectada
                  </span>
                )}
              </div>
            </div>

            {/* Tarjetas conectadas de la ecuación */}
            <div className="grid grid-cols-1 md:grid-cols-9 items-center gap-2 text-center">
              {/* Facturado Bruto */}
              <div className="md:col-span-2 bg-stone-800/80 p-4 rounded-xl border border-stone-700">
                <span className="text-[10px] font-bold text-stone-400 uppercase">Total Facturado</span>
                <p className="text-xl font-black text-white mt-1">
                  {formatMoneyCop(report.billing_summary.gross_billed_total_cop)}
                </p>
                <span className="text-[10px] text-orange-400 font-semibold">
                  {report.billing_summary.confirmed_orders_count} pedidos confirmados
                </span>
              </div>

              {/* Símbolo = */}
              <div className="md:col-span-1 flex justify-center text-stone-400 font-bold">
                <Equal className="h-6 w-6 text-orange-400" />
              </div>

              {/* Recaudado Total */}
              <div className="md:col-span-2 bg-emerald-950/40 p-4 rounded-xl border border-emerald-800/50">
                <span className="text-[10px] font-bold text-emerald-400 uppercase">Recaudado Total</span>
                <p className="text-xl font-black text-emerald-300 mt-1">
                  {formatMoneyCop(report.reconciliation_summary.collected_total_cop)}
                </p>
                <div className="text-[10px] text-stone-400 flex justify-center gap-2 mt-1">
                  <span>Efect: {formatMoneyCop(report.collections_by_method.CASH)}</span>
                  <span>•</span>
                  <span>Transf: {formatMoneyCop(report.collections_by_method.MANUAL_TRANSFER)}</span>
                </div>
              </div>

              {/* Símbolo + */}
              <div className="md:col-span-1 flex justify-center text-stone-400 font-bold">
                <Plus className="h-5 w-5 text-stone-500" />
              </div>

              {/* Por Cobrar */}
              <div className="md:col-span-1 bg-amber-950/30 p-3 rounded-xl border border-amber-800/40">
                <span className="text-[10px] font-bold text-amber-400 uppercase">Por Cobrar</span>
                <p className="text-sm font-black text-amber-300 mt-1">
                  {formatMoneyCop(report.reconciliation_summary.pending_receivable_cop)}
                </p>
              </div>

              {/* Símbolo + */}
              <div className="md:col-span-1 flex justify-center text-stone-400 font-bold">
                <Plus className="h-5 w-5 text-stone-500" />
              </div>

              {/* Cortesías y Castigos */}
              <div className="md:col-span-1 bg-purple-950/30 p-3 rounded-xl border border-purple-800/40">
                <span className="text-[10px] font-bold text-purple-300 uppercase">Cortesías</span>
                <p className="text-sm font-black text-purple-200 mt-1">
                  {formatMoneyCop(report.reconciliation_summary.courtesy_total_cop)}
                </p>
                <span className="text-[9px] text-stone-400 block mt-0.5">
                  Castigos: {formatMoneyCop(report.reconciliation_summary.written_off_total_cop)}
                </span>
              </div>
            </div>
          </div>

          {/* Tarjeta Separada de Órdenes Nivel 1 (NOT_TRACKED) */}
          {report.not_tracked_orders_summary.count > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold">
                    Órdenes Nivel 1 (Sin Seguimiento de Caja): {report.not_tracked_orders_summary.count} pedidos
                  </p>
                  <p className="text-amber-700 text-[11px]">
                    Volumen nominal de {formatMoneyCop(report.not_tracked_orders_summary.nominal_total_cop)} no monitoreado contablemente (no altera saldos por cobrar).
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-amber-200/80 text-amber-800 rounded-lg font-bold text-[10px] uppercase">
                Política NONE
              </span>
            </div>
          )}

          {/* Grid de Desglose de Facturación e Ingresos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Desglose de Ingresos */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                <TrendingUp className="h-4 w-4 text-orange-600" />
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Desglose de Ingresos
                </h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-stone-50">
                  <span className="text-stone-500 font-medium">Venta Neta Productos:</span>
                  <span className="font-bold text-stone-900">{formatMoneyCop(report.billing_summary.net_products_sales_cop)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-50">
                  <span className="text-stone-500 font-medium">Base Gravable:</span>
                  <span className="font-semibold text-stone-700">{formatMoneyCop(report.billing_summary.taxable_base_cop)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-50">
                  <span className="text-stone-500 font-medium">Impuesto INC:</span>
                  <span className="font-semibold text-stone-700">{formatMoneyCop(report.billing_summary.tax_inc_cop)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-50">
                  <span className="text-stone-500 font-medium">Impuesto IVA:</span>
                  <span className="font-semibold text-stone-700">{formatMoneyCop(report.billing_summary.tax_iva_cop)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-50">
                  <span className="text-stone-500 font-medium">Cargos por Domicilio:</span>
                  <span className="font-semibold text-stone-700">{formatMoneyCop(report.billing_summary.delivery_fees_total_cop)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-stone-50">
                  <span className="text-stone-500 font-medium">Propinas Voluntarias:</span>
                  <span className="font-semibold text-stone-700">{formatMoneyCop(report.billing_summary.tips_total_cop)}</span>
                </div>
                <div className="flex justify-between pt-1 font-bold text-stone-900">
                  <span>Descuentos Otorgados:</span>
                  <span className="text-red-600">-{formatMoneyCop(report.billing_summary.discount_total_cop)}</span>
                </div>
              </div>
            </div>

            {/* 2. Recaudo por Medio de Pago */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                <CreditCard className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Recaudo por Medio de Pago
                </h3>
              </div>
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <Banknote className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-xs font-bold text-stone-800">Efectivo en Caja</p>
                      <p className="text-[10px] text-stone-500">Billetes y monedas</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-stone-900">
                    {formatMoneyCop(report.collections_by_method.CASH)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <CreditCard className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-xs font-bold text-stone-800">Datáfono / POS</p>
                      <p className="text-[10px] text-stone-500">Débito y crédito</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-stone-900">
                    {formatMoneyCop(report.collections_by_method.POS_TERMINAL)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="h-4 w-4 text-purple-600" />
                    <div>
                      <p className="text-xs font-bold text-stone-800">Transferencia Manual</p>
                      <p className="text-[10px] text-stone-500">Nequi, Daviplata, Bancolombia</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-stone-900">
                    {formatMoneyCop(report.collections_by_method.MANUAL_TRANSFER)}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Métricas de Tiempos y Exclusiones */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Eficiencia Operativa & Exclusiones
                </h3>
              </div>
              <div className="space-y-3 pt-1 text-xs">
                <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-100/80">
                  <span className="text-[10px] font-bold text-orange-700 uppercase">Tiempo Promedio de Cocina</span>
                  <p className="text-base font-extrabold text-orange-950 mt-0.5">
                    {report.operational_metrics.avg_prep_minutes != null
                      ? `${report.operational_metrics.avg_prep_minutes} minutos`
                      : 'Sin datos registrados'}
                  </p>
                  <span className="text-[10px] text-stone-500">Desde Aceptado hasta Listo en Cocina</span>
                </div>

                <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100/80">
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Tiempo Promedio de Despacho</span>
                  <p className="text-base font-extrabold text-blue-950 mt-0.5">
                    {report.operational_metrics.avg_delivery_minutes != null
                      ? `${report.operational_metrics.avg_delivery_minutes} minutos`
                      : 'Sin datos registrados'}
                  </p>
                  <span className="text-[10px] text-stone-500">Desde Listo hasta Entregado al cliente</span>
                </div>

                {/* Resumen de órdenes excluidas */}
                <div className="pt-1 text-[11px] text-stone-500 space-y-1">
                  <p className="font-bold text-stone-700">Órdenes no confirmadas (excluidas de caja):</p>
                  <div className="flex justify-between">
                    <span>Rechazadas: {report.excluded_orders_summary.rejected_count}</span>
                    <span>Canceladas: {report.excluded_orders_summary.cancelled_count}</span>
                    <span>Expiradas: {report.excluded_orders_summary.expired_count}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Productos Vendidos */}
          {report.operational_metrics.top_products.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                <ShoppingBag className="h-4 w-4 text-orange-600" />
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Top Productos Más Vendidos
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Producto</th>
                      <th className="py-2.5 px-3 text-center">Unidades Vendidas</th>
                      <th className="py-2.5 px-3 text-right">Total Facturado COP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {report.operational_metrics.top_products.map((p, idx) => (
                      <tr key={idx} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-3 font-extrabold text-stone-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-stone-800">{p.product_name}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-orange-600">{p.quantity_sold}</td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-stone-900">
                          {formatMoneyCop(p.total_cop)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabla de Auditoría de Cortesías y Saldos Castigados */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <div className="flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 text-purple-600" />
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  Auditoría de Cortesías y Saldos Castigados
                </h3>
              </div>
              <span className="text-[10px] text-stone-500 font-medium">
                {report.uncollected_resolutions_detail.length} resoluciones registradas
              </span>
            </div>

            {report.uncollected_resolutions_detail.length === 0 ? (
              <div className="py-8 text-center text-stone-400 text-xs">
                No se registraron cortesías ni saldos castigados en este periodo.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-500 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Fecha y Hora</th>
                      <th className="py-2.5 px-3">Tipo Resolución</th>
                      <th className="py-2.5 px-3">Monto No Recaudado</th>
                      <th className="py-2.5 px-3">Autorizado Por</th>
                      <th className="py-2.5 px-3">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {report.uncollected_resolutions_detail.map((res) => (
                      <tr key={res.order_id} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-3 font-bold text-stone-900">{res.order_code}</td>
                        <td className="py-2.5 px-3 text-stone-500 font-mono text-[11px]">
                          {new Date(res.occurred_at).toLocaleString('es-CO')}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              res.resolution_type === 'COURTESY'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {res.resolution_type === 'COURTESY' ? 'Cortesía' : 'Saldo Castigado'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-extrabold text-stone-900">
                          {formatMoneyCop(res.uncollected_amount_cop)}
                        </td>
                        <td className="py-2.5 px-3 text-stone-700">{res.resolved_by_name || 'Personal Autorizado'}</td>
                        <td className="py-2.5 px-3 text-stone-500 italic max-w-xs truncate">
                          {res.resolution_reason || 'Sin motivo registrado'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
