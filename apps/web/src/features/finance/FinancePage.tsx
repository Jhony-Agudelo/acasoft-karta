import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  FileCheck2,
  Building,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Download,
  Calendar,
  X,
  Send,
  ExternalLink,
  ShieldCheck,
  Package,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { formatMoneyCop } from '@restaurante-saas/shared';

export const FinancePage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'pnl' | 'expenses' | 'suppliers' | 'radian'>('pnl');

  // Filtros P&L
  const [pnlFrom, setPnlFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [pnlTo, setPnlTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Modal Proveedor
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [suppDocCode, setSuppDocCode] = useState('31'); // NIT
  const [suppId, setSuppId] = useState('');
  const [suppDv, setSuppDv] = useState('');
  const [suppLegalType, setSuppLegalType] = useState<'LEGAL' | 'NATURAL'>('LEGAL');
  const [suppName, setSuppName] = useState('');
  const [suppCommercialName, setSuppCommercialName] = useState('');
  const [suppEmail, setSuppEmail] = useState('');
  const [suppPhone, setSuppPhone] = useState('');
  const [suppAddress, setSuppAddress] = useState('');
  const [suppRequiresDse, setSuppRequiresDse] = useState(false);

  // Modal Gasto
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expSupplierId, setExpSupplierId] = useState('');
  const [expCategory, setExpCategory] = useState('RAW_MATERIALS');
  const [expConcept, setExpConcept] = useState('');
  const [expDocNumber, setExpDocNumber] = useState('');
  const [expAmountCop, setExpAmountCop] = useState<number>(0);
  const [expDueDate, setExpDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expPaymentMethod, setExpPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('TRANSFER');
  const [expPayImmediately, setExpPayImmediately] = useState(true);

  // Modal Pago de Gasto
  const [payingExpense, setPayingExpense] = useState<any | null>(null);
  const [payAmountCop, setPayAmountCop] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH');
  const [payRef, setPayRef] = useState('');

  // Mensajes de Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Consultar P&L
  const { data: pnlData, isLoading: isLoadingPnl } = useQuery<any>({
    queryKey: ['pnl-report', currentBranchId, pnlFrom, pnlTo],
    queryFn: () =>
      apiClient.get(
        `/reports/profit-and-loss?branch_id=${currentBranchId}&from=${pnlFrom}&to=${pnlTo}`,
      ),
    enabled: !!currentBranchId && activeTab === 'pnl',
  });

  // Consultar Proveedores
  const { data: suppliers = [], isLoading: isLoadingSuppliers } = useQuery<any[]>({
    queryKey: ['admin-suppliers'],
    queryFn: () => apiClient.get('/admin/suppliers'),
  });

  // Consultar Gastos
  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery<any[]>({
    queryKey: ['branch-expenses', currentBranchId],
    queryFn: () => apiClient.get(`/branches/${currentBranchId}/expenses`),
    enabled: !!currentBranchId,
  });

  // Consultar Facturas RADIAN
  const { data: radianInvoices = [], isLoading: isLoadingRadian } = useQuery<any[]>({
    queryKey: ['radian-invoices', currentBranchId],
    queryFn: () => apiClient.get(`/branches/${currentBranchId}/radian-invoices`),
    enabled: !!currentBranchId,
  });

  // Guardar Proveedor
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiClient.post('/admin/suppliers', {
        identification_document_code: suppDocCode,
        identification: suppId.trim(),
        dv: suppDv.trim() || undefined,
        legal_type: suppLegalType,
        company_name: suppLegalType === 'LEGAL' ? suppName.trim() : undefined,
        names: suppLegalType === 'NATURAL' ? suppName.trim() : undefined,
        commercial_name: suppCommercialName.trim() || undefined,
        email: suppEmail.trim() || undefined,
        phone: suppPhone.trim() || undefined,
        address: suppAddress.trim() || undefined,
        requires_support_document: suppRequiresDse,
      });
      setFeedback({ type: 'success', message: 'Proveedor registrado exitosamente.' });
      queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] });
      setIsSupplierModalOpen(false);
      setSuppId('');
      setSuppName('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al guardar proveedor.',
      });
    }
  };

  // Guardar Gasto
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranchId) return;
    setFeedback(null);
    try {
      await apiClient.post(`/branches/${currentBranchId}/expenses`, {
        supplier_id: expSupplierId || undefined,
        expense_category: expCategory,
        concept: expConcept.trim(),
        supplier_document_number: expDocNumber.trim() || undefined,
        subtotal_cop: expAmountCop,
        tax_total_cop: 0,
        total_cop: expAmountCop,
        due_date: expDueDate,
        pay_immediately: expPayImmediately,
        payment_method: expPaymentMethod,
      });
      setFeedback({ type: 'success', message: 'Gasto registrado correctamente.' });
      queryClient.invalidateQueries({ queryKey: ['branch-expenses', currentBranchId] });
      queryClient.invalidateQueries({ queryKey: ['pnl-report'] });
      setIsExpenseModalOpen(false);
      setExpConcept('');
      setExpAmountCop(0);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al registrar gasto.',
      });
    }
  };

  // Emitir Documento Soporte Electrónico (DSE)
  const handleEmitDse = async (expenseId: string) => {
    setFeedback(null);
    try {
      const res = await apiClient.post<any>(`/expenses/${expenseId}/support-document`);
      setFeedback({
        type: 'success',
        message: `¡Documento Soporte Electrónico validado por la DIAN! Consecutivo: ${res.support_document?.factus_number || 'SEDS'}`,
      });
      queryClient.invalidateQueries({ queryKey: ['branch-expenses', currentBranchId] });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al emitir Documento Soporte a Factus / DIAN.',
      });
    }
  };

  // Registrar Evento RADIAN (030, 032, 033)
  const handleRegisterRadianEvent = async (invoiceId: string, eventCode: '030' | '032' | '033') => {
    setFeedback(null);
    try {
      await apiClient.post(`/radian-invoices/${invoiceId}/events`, {
        event_code: eventCode,
      });
      setFeedback({
        type: 'success',
        message: `Evento RADIAN ${eventCode} registrado y transmitido a la DIAN.`,
      });
      queryClient.invalidateQueries({ queryKey: ['radian-invoices', currentBranchId] });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al registrar evento RADIAN.',
      });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-stone-900">Módulo Financiero & DIAN</h1>
            <p className="text-xs text-stone-500">
              Estado de Resultados (P&L), Gastos, Proveedores, Documento Soporte DSE y Buzón RADIAN
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('pnl')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              activeTab === 'pnl' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <TrendingUp className="h-4 w-4 text-orange-600" />
            P&L (Estado Resultados)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              activeTab === 'expenses' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Receipt className="h-4 w-4 text-orange-600" />
            Gastos & Cuentas por Pagar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              activeTab === 'suppliers' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Building className="h-4 w-4 text-orange-600" />
            Proveedores ({suppliers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('radian')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              activeTab === 'radian' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <FileCheck2 className="h-4 w-4 text-orange-600" />
            Buzón RADIAN
          </button>
        </div>
      </div>

      {/* Global Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-stone-400 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* TAB 1: P&L ESTADO DE RESULTADOS */}
      {activeTab === 'pnl' && (
        <div className="space-y-5">
          {/* Date Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-stone-400" />
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-700">Desde:</span>
                <input
                  type="date"
                  value={pnlFrom}
                  onChange={(e) => setPnlFrom(e.target.value)}
                  className="rounded-lg border border-stone-200 p-1.5 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-700">Hasta:</span>
                <input
                  type="date"
                  value={pnlTo}
                  onChange={(e) => setPnlTo(e.target.value)}
                  className="rounded-lg border border-stone-200 p-1.5 focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <span className="text-[11px] text-stone-500">
              Cálculo en tiempo real: Ventas netas (pedidos pagados) menos costos de recetas, nómina y gastos operativos.
            </span>
          </div>

          {/* P&L Financial Cards */}
          {isLoadingPnl ? (
            <div className="p-12 text-center text-xs text-stone-400">Calculando Estado de Resultados...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Ventas Netas */}
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                  <div className="flex items-center justify-between text-stone-500 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider">Ingresos Netos</span>
                    <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                  </div>
                  <span className="text-2xl font-extrabold text-stone-900 block">
                    {formatMoneyCop(pnlData?.netSalesRevenueCop || 0)}
                  </span>
                  <span className="text-[11px] text-stone-400 mt-1 block">
                    Total pedidos cobrados
                  </span>
                </div>

                {/* Costo de Ventas (COGS) */}
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                  <div className="flex items-center justify-between text-stone-500 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider">Costo Insumos (COGS)</span>
                    <Package className="h-4 w-4 text-amber-600" />
                  </div>
                  <span className="text-2xl font-extrabold text-stone-900 block">
                    {formatMoneyCop(pnlData?.costOfGoodsSoldCop || 0)}
                  </span>
                  <span className="text-[11px] text-stone-400 mt-1 block">
                    Materia prima / Recetas
                  </span>
                </div>

                {/* Gastos Operativos (OPEX) */}
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                  <div className="flex items-center justify-between text-stone-500 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider">OPEX + Nómina</span>
                    <ArrowDownRight className="h-4 w-4 text-rose-600" />
                  </div>
                  <span className="text-2xl font-extrabold text-stone-900 block">
                    {formatMoneyCop(
                      (pnlData?.operatingExpensesCop || 0) + (pnlData?.grossPayrollCop || 0),
                    )}
                  </span>
                  <span className="text-[11px] text-stone-400 mt-1 block">
                    Nómina: {formatMoneyCop(pnlData?.grossPayrollCop || 0)}
                  </span>
                </div>

                {/* Utilidad Operativa / EBITDA */}
                <div
                  className={`p-4 rounded-2xl border shadow-2xs ${
                    (pnlData?.operatingProfitCop || 0) >= 0
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                      : 'bg-rose-50/70 border-rose-200 text-rose-950'
                  }`}
                >
                  <div className="flex items-center justify-between text-stone-600 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider">EBITDA Operativo</span>
                    <Sparkles className="h-4 w-4 text-orange-600" />
                  </div>
                  <span className="text-2xl font-extrabold block">
                    {formatMoneyCop(pnlData?.operatingProfitCop || 0)}
                  </span>
                  <span className="text-[11px] font-semibold mt-1 block">
                    Margen Operativo: {pnlData?.operatingMarginPercent || 0}%
                  </span>
                </div>
              </div>

              {/* Desglose Detallado */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3 text-xs">
                <h3 className="font-extrabold text-stone-900 text-sm">Desglose Financiero Estructurado</h3>
                <div className="divide-y divide-stone-100">
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-stone-600 font-medium">(+) Ingresos Operacionales por Ventas</span>
                    <span className="font-bold text-stone-900">
                      {formatMoneyCop(pnlData?.netSalesRevenueCop || 0)}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-stone-600 font-medium">(-) Costo de Mercancía Vendida (Insumos)</span>
                    <span className="font-bold text-rose-600">
                      -{formatMoneyCop(pnlData?.costOfGoodsSoldCop || 0)}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between bg-stone-50/80 px-2 rounded-lg font-bold">
                    <span className="text-stone-800">(=) Utilidad Bruta</span>
                    <span className="text-stone-900">{formatMoneyCop(pnlData?.grossProfitCop || 0)}</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-stone-600 font-medium">(-) Gastos Generales y de Administración (OPEX)</span>
                    <span className="font-bold text-rose-600">
                      -{formatMoneyCop(pnlData?.operatingExpensesCop || 0)}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-stone-600 font-medium">(-) Nómina & Seguridad Social Devengada</span>
                    <span className="font-bold text-rose-600">
                      -{formatMoneyCop(pnlData?.grossPayrollCop || 0)}
                    </span>
                  </div>
                  <div className="py-3 flex items-center justify-between bg-emerald-50 px-3 rounded-xl font-extrabold text-sm">
                    <span className="text-emerald-950">(=) Resultado del Ejercicio (EBITDA Operativo)</span>
                    <span className="text-emerald-900">
                      {formatMoneyCop(pnlData?.operatingProfitCop || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GASTOS & DOCUMENTO SOPORTE */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
            <span className="text-xs font-bold text-stone-700">
              Listado de Egresos & Cuentas por Pagar ({expenses.length})
            </span>
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 transition"
            >
              <Plus className="h-4 w-4" /> Registrar Gasto
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
            {isLoadingExpenses ? (
              <div className="p-12 text-center text-xs text-stone-400">Cargando gastos...</div>
            ) : expenses.length === 0 ? (
              <div className="p-12 text-center text-xs text-stone-400">
                No hay gastos registrados en esta sucursal.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="py-3 px-4">Concepto / Categoría</th>
                      <th className="py-3 px-4">Proveedor</th>
                      <th className="py-3 px-4">Monto Total</th>
                      <th className="py-3 px-4">Estado Pago</th>
                      <th className="py-3 px-4">Documento Soporte DIAN (DSE)</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-stone-50/70 transition">
                        <td className="py-3 px-4">
                          <span className="font-bold text-stone-900 block">{exp.concept}</span>
                          <span className="text-[11px] text-stone-400">{exp.expense_category}</span>
                        </td>
                        <td className="py-3 px-4 font-medium text-stone-800">
                          {exp.supplier?.company_name || exp.supplier?.names || 'Sin proveedor'}
                        </td>
                        <td className="py-3 px-4 font-bold text-stone-900">
                          {formatMoneyCop(exp.total_cop)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              exp.status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {exp.status === 'PAID' ? 'Pagado' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {exp.support_document ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-emerald-700 font-bold">
                                {exp.support_document.factus_number || 'SEDS'}
                              </span>
                              <span className="rounded bg-emerald-50 text-emerald-700 text-[10px] px-1 font-bold">
                                DIAN OK
                              </span>
                            </div>
                          ) : exp.supplier?.requires_support_document ? (
                            <button
                              type="button"
                              onClick={() => handleEmitDse(exp.id)}
                              className="rounded-lg bg-orange-50 border border-orange-200 px-2 py-1 text-[11px] font-bold text-orange-700 hover:bg-orange-100 transition"
                            >
                              Emitir DSE DIAN
                            </button>
                          ) : (
                            <span className="text-stone-400 text-[11px]">No aplica</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {exp.support_document && (
                            <a
                              href={`/api/v1/support-documents/${exp.support_document.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700"
                            >
                              <Download className="h-3.5 w-3.5" /> PDF
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PROVEEDORES */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
            <span className="text-xs font-bold text-stone-700">
              Directorio de Proveedores y Terceros ({suppliers.length})
            </span>
            <button
              type="button"
              onClick={() => setIsSupplierModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 transition"
            >
              <Plus className="h-4 w-4" /> Registrar Proveedor
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
            {isLoadingSuppliers ? (
              <div className="p-12 text-center text-xs text-stone-400">Cargando proveedores...</div>
            ) : suppliers.length === 0 ? (
              <div className="p-12 text-center text-xs text-stone-400">
                No hay proveedores registrados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="py-3 px-4">Identificación / NIT</th>
                      <th className="py-3 px-4">Razón Social / Nombre</th>
                      <th className="py-3 px-4">Contacto</th>
                      <th className="py-3 px-4">Régimen / Documento Soporte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {suppliers.map((s) => (
                      <tr key={s.id} className="hover:bg-stone-50/70 transition">
                        <td className="py-3 px-4 font-mono font-bold text-stone-900">
                          {s.identification}{s.dv ? `-${s.dv}` : ''}
                        </td>
                        <td className="py-3 px-4 font-bold text-stone-900">
                          {s.company_name || s.names}
                        </td>
                        <td className="py-3 px-4 text-stone-500">
                          {s.email || s.phone || 'Sin contacto'}
                        </td>
                        <td className="py-3 px-4">
                          {s.requires_support_document ? (
                            <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                              No obligado a facturar (Aplica DSE)
                            </span>
                          ) : (
                            <span className="inline-flex rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600 border border-stone-200">
                              Facturador Electrónico
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: BUZÓN RADIAN */}
      {activeTab === 'radian' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-orange-600" />
              <h3 className="font-extrabold text-stone-900 text-sm">
                Buzón Electrónico RADIAN (Títulos Valores & Eventos DIAN)
              </h3>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              Registra la recepción de facturas electrónicas de proveedores y envía a la DIAN los eventos legales requeridos para la deducción tributaria de costos y gastos:
              <strong> Evento 030</strong> (Acuse de recibo de factura), <strong>Evento 032</strong> (Recibo de las mercancías), y <strong>Evento 033</strong> (Aceptación expresa).
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
            {isLoadingRadian ? (
              <div className="p-12 text-center text-xs text-stone-400">Cargando facturas RADIAN...</div>
            ) : radianInvoices.length === 0 ? (
              <div className="p-12 text-center text-xs text-stone-400">
                No hay facturas registradas en el buzón RADIAN de esta sucursal.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="py-3 px-4">Factura / Emisor</th>
                      <th className="py-3 px-4">CUFE</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4">Eventos RADIAN DIAN</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {radianInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-stone-50/70 transition">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-stone-900 block">
                            {inv.invoice_number}
                          </span>
                          <span className="text-[11px] text-stone-500">
                            {inv.supplier_name} (NIT: {inv.supplier_nit})
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-[10px] text-stone-500 truncate block max-w-xs">
                            {inv.cufe}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-stone-900">
                          {formatMoneyCop(inv.total_cop)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                inv.has_receipt_event
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-stone-100 text-stone-400'
                              }`}
                            >
                              030 Acuse
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                inv.has_goods_receipt_event
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-stone-100 text-stone-400'
                              }`}
                            >
                              032 Bienes
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                inv.has_acceptance_event
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-stone-100 text-stone-400'
                              }`}
                            >
                              033 Aceptación
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!inv.has_receipt_event && (
                              <button
                                type="button"
                                onClick={() => handleRegisterRadianEvent(inv.id, '030')}
                                className="rounded-lg bg-orange-50 border border-orange-200 px-2 py-1 text-[10px] font-bold text-orange-700 hover:bg-orange-100"
                              >
                                Enviar 030
                              </button>
                            )}
                            {inv.has_receipt_event && !inv.has_goods_receipt_event && (
                              <button
                                type="button"
                                onClick={() => handleRegisterRadianEvent(inv.id, '032')}
                                className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100"
                              >
                                Enviar 032
                              </button>
                            )}
                            {inv.has_goods_receipt_event && !inv.has_acceptance_event && (
                              <button
                                type="button"
                                onClick={() => handleRegisterRadianEvent(inv.id, '033')}
                                className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                              >
                                Enviar 033
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CREAR PROVEEDOR */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-stone-50">
              <h3 className="font-bold text-stone-900 text-sm">Registrar Nuevo Proveedor</h3>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="rounded-lg p-2 text-stone-400 hover:bg-stone-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Tipo Doc</label>
                  <select
                    value={suppDocCode}
                    onChange={(e) => {
                      setSuppDocCode(e.target.value);
                      if (e.target.value === '31') setSuppLegalType('LEGAL');
                      else setSuppLegalType('NATURAL');
                    }}
                    className="w-full rounded-xl border border-stone-200 p-2"
                  >
                    <option value="31">NIT (31)</option>
                    <option value="13">Cédula (13)</option>
                    <option value="22">C. Extranjería (22)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Número *</label>
                  <input
                    type="text"
                    required
                    value={suppId}
                    onChange={(e) => setSuppId(e.target.value)}
                    placeholder="900123456"
                    className="w-full rounded-xl border border-stone-200 p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">DV</label>
                  <input
                    type="text"
                    maxLength={1}
                    value={suppDv}
                    onChange={(e) => setSuppDv(e.target.value)}
                    placeholder="1"
                    className="w-full rounded-xl border border-stone-200 p-2 font-mono text-center"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Razón Social o Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={suppName}
                  onChange={(e) => setSuppName(e.target.value)}
                  placeholder="Distribuidora de Carnes del Valle S.A.S."
                  className="w-full rounded-xl border border-stone-200 p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    value={suppEmail}
                    onChange={(e) => setSuppEmail(e.target.value)}
                    placeholder="facturacion@proveedor.co"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={suppPhone}
                    onChange={(e) => setSuppPhone(e.target.value)}
                    placeholder="3101234567"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Dirección</label>
                <input
                  type="text"
                  value={suppAddress}
                  onChange={(e) => setSuppAddress(e.target.value)}
                  placeholder="Carrera 45 # 26-10"
                  className="w-full rounded-xl border border-stone-200 p-2"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-stone-700">
                  <input
                    type="checkbox"
                    checked={suppRequiresDse}
                    onChange={(e) => setSuppRequiresDse(e.target.checked)}
                    className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                  />
                  No obligado a facturar (Requiere Documento Soporte Electrónico DSE)
                </label>
              </div>

              <div className="pt-4 border-t border-stone-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="rounded-xl px-4 py-2 font-bold text-stone-600 hover:bg-stone-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-orange-600 px-5 py-2 font-bold text-white hover:bg-orange-700"
                >
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR GASTO */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-stone-50">
              <h3 className="font-bold text-stone-900 text-sm">Registrar Gasto u Operación</h3>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="rounded-lg p-2 text-stone-400 hover:bg-stone-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Proveedor / Tercero</label>
                <select
                  value={expSupplierId}
                  onChange={(e) => setExpSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2"
                >
                  <option value="">-- Sin proveedor asociado / Gasto menor --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.company_name || s.names} (NIT: {s.identification})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Categoría de Gasto</label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2"
                  >
                    <option value="RAW_MATERIALS">Materia Prima / Insumos (COGS)</option>
                    <option value="SERVICES">Servicios Públicos (Luz, Gas, Agua)</option>
                    <option value="RENT">Arrendamiento de Local</option>
                    <option value="MAINTENANCE">Mantenimiento y Reparaciones</option>
                    <option value="CLEANING_SUPPLIES">Insumos de Aseo y Limpieza</option>
                    <option value="LOGISTICS_TRANSPORT">Logística y Domicilios</option>
                    <option value="MARKETING">Publicidad y Mercadeo</option>
                    <option value="OTHER_OPEX">Otros Gastos Operativos</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Nº Factura / Remisión</label>
                  <input
                    type="text"
                    value={expDocNumber}
                    onChange={(e) => setExpDocNumber(e.target.value)}
                    placeholder="FE-1025"
                    className="w-full rounded-xl border border-stone-200 p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Concepto / Detalle *</label>
                <input
                  type="text"
                  required
                  value={expConcept}
                  onChange={(e) => setExpConcept(e.target.value)}
                  placeholder="Compra semanal de verduras y hortalizas"
                  className="w-full rounded-xl border border-stone-200 p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Monto Total COP *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={expAmountCop || ''}
                    onChange={(e) => setExpAmountCop(Number(e.target.value))}
                    placeholder="150000"
                    className="w-full rounded-xl border border-stone-200 p-2 font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    value={expDueDate}
                    onChange={(e) => setExpDueDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-stone-100 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-stone-700">
                  <input
                    type="checkbox"
                    checked={expPayImmediately}
                    onChange={(e) => setExpPayImmediately(e.target.checked)}
                    className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                  />
                  Pagar inmediatamente (Afectar flujo de caja hoy)
                </label>

                {expPayImmediately && (
                  <div className="pl-6 pt-1">
                    <label className="font-bold text-stone-700 block mb-1">Medio de Pago</label>
                    <select
                      value={expPaymentMethod}
                      onChange={(e) => setExpPaymentMethod(e.target.value as any)}
                      className="w-full rounded-xl border border-stone-200 p-2"
                    >
                      <option value="CASH">Efectivo (Registrar salida en Turno de Caja actual)</option>
                      <option value="TRANSFER">Transferencia Bancaria / Digital</option>
                      <option value="CARD">Tarjeta Débito / Crédito</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-stone-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="rounded-xl px-4 py-2 font-bold text-stone-600 hover:bg-stone-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-orange-600 px-5 py-2 font-bold text-white hover:bg-orange-700"
                >
                  Registrar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
