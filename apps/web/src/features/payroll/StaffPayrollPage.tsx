import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Briefcase,
  FileText,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Download,
  Building,
  Plus,
  X,
  Search,
  Filter,
  CreditCard,
  Send,
  HelpCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { formatMoneyCop } from '@restaurante-saas/shared';

export const StaffPayrollPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'employees' | 'payroll'>('employees');

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  // Modal de Empleado
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);

  // Formulario de Empleado
  const [formEmployeeCode, setFormEmployeeCode] = useState('');
  const [formDocType, setFormDocType] = useState('13'); // CC
  const [formDocNumber, setFormDocNumber] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('Personal de Aseo y Limpieza');
  const [formDepartment, setFormDepartment] = useState('Operaciones y Limpieza');
  const [formContractType, setFormContractType] = useState('1'); // Término Fijo
  const [formBaseSalaryCop, setFormBaseSalaryCop] = useState<number>(1423500);
  const [formTransportEligible, setFormTransportEligible] = useState(true);
  const [formPaymentMethod, setFormPaymentMethod] = useState('10'); // 10 Efectivo, 42 Transferencia
  const [formBankName, setFormBankName] = useState('');
  const [formBankAccountType, setFormBankAccountType] = useState<'AHORROS' | 'CORRIENTE'>('AHORROS');
  const [formBankAccountNumber, setFormBankAccountNumber] = useState('');
  const [formEntryDate, setFormEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formUserId, setFormUserId] = useState<string | null>(null);

  // Formulario de Liquidación de Nómina
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [payrollPeriod, setPayrollPeriod] = useState<string>('4'); // 4 = Quincenal, 5 = Mensual
  const [periodStartDate, setPeriodStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [periodEndDate, setPeriodEndDate] = useState(() => {
    const d = new Date();
    d.setDate(15);
    return d.toISOString().slice(0, 10);
  });
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [workedDays, setWorkedDays] = useState<number>(15);
  const [overtimeHours, setOvertimeHours] = useState<{ code: string; hours: number }[]>([
    { code: '3', hours: 0 }, // Recargo nocturno ordinario (35%)
    { code: '1', hours: 0 }, // Extra diurna ordinaria (25%)
    { code: '2', hours: 0 }, // Extra nocturna ordinaria (75%)
  ]);
  const [payrollPreview, setPayrollPreview] = useState<any | null>(null);
  const [isCalculatingPreview, setIsCalculatingPreview] = useState(false);
  const [isTransmittingPayroll, setIsTransmittingPayroll] = useState(false);
  const [payrollFeedback, setPayrollFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Consultar empleados
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<any[]>({
    queryKey: ['branch-employees', currentBranchId],
    queryFn: () => apiClient.get(`/branches/${currentBranchId}/employees`),
    enabled: !!currentBranchId,
  });

  // Consultar liquidaciones históricas
  const { data: settlements = [], isLoading: isLoadingSettlements } = useQuery<any[]>({
    queryKey: ['branch-payrolls', currentBranchId],
    queryFn: () => apiClient.get(`/branches/${currentBranchId}/payrolls`),
    enabled: !!currentBranchId,
  });

  const resetEmployeeForm = () => {
    setEditingEmployee(null);
    setFormEmployeeCode(`EMP-${Math.floor(100 + Math.random() * 900)}`);
    setFormDocType('13');
    setFormDocNumber('');
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormPhone('');
    setFormAddress('');
    setFormJobTitle('Personal de Aseo y Limpieza');
    setFormDepartment('Operaciones y Limpieza');
    setFormContractType('1');
    setFormBaseSalaryCop(1423500);
    setFormTransportEligible(true);
    setFormPaymentMethod('10');
    setFormBankName('');
    setFormBankAccountType('AHORROS');
    setFormBankAccountNumber('');
    setFormEntryDate(new Date().toISOString().slice(0, 10));
    setFormUserId(null);
  };

  const openCreateEmployeeModal = () => {
    resetEmployeeForm();
    setIsEmployeeModalOpen(true);
  };

  const openEditEmployeeModal = (emp: any) => {
    setEditingEmployee(emp);
    setFormEmployeeCode(emp.employee_code);
    setFormDocType(emp.identification_type);
    setFormDocNumber(emp.identification_number);
    setFormFirstName(emp.first_name);
    setFormLastName(emp.last_name);
    setFormEmail(emp.email || '');
    setFormPhone(emp.phone || '');
    setFormAddress(emp.address || '');
    setFormJobTitle(emp.job_title);
    setFormDepartment(emp.department);
    setFormContractType(emp.contract_type);
    setFormBaseSalaryCop(emp.base_salary_cop);
    setFormTransportEligible(emp.transport_allowance_eligible);
    setFormPaymentMethod(emp.payment_method);
    setFormBankName(emp.bank_name || '');
    setFormBankAccountType(emp.bank_account_type || 'AHORROS');
    setFormBankAccountNumber(emp.bank_account_number || '');
    setFormEntryDate(emp.entry_date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
    setFormUserId(emp.user_id || null);
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranchId) return;

    const payload = {
      employee_code: formEmployeeCode.trim(),
      identification_type: formDocType,
      identification_number: formDocNumber.trim(),
      first_name: formFirstName.trim(),
      last_name: formLastName.trim(),
      email: formEmail.trim() || undefined,
      phone: formPhone.trim() || undefined,
      address: formAddress.trim() || undefined,
      job_title: formJobTitle.trim(),
      department: formDepartment.trim(),
      contract_type: formContractType,
      base_salary_cop: Number(formBaseSalaryCop),
      transport_allowance_eligible: formTransportEligible,
      payment_method: formPaymentMethod,
      bank_name: formBankName.trim() || undefined,
      bank_account_type: formBankName.trim() ? formBankAccountType : undefined,
      bank_account_number: formBankAccountNumber.trim() || undefined,
      entry_date: formEntryDate,
      user_id: formUserId || undefined,
    };

    try {
      if (editingEmployee) {
        await apiClient.put(`/employees/${editingEmployee.id}`, payload);
      } else {
        await apiClient.post(`/branches/${currentBranchId}/employees`, payload);
      }
      queryClient.invalidateQueries({ queryKey: ['branch-employees', currentBranchId] });
      setIsEmployeeModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Error al guardar empleado.');
    }
  };

  // Cálculo de Pre-liquidación
  const handleCalculatePreview = async () => {
    if (!currentBranchId || !selectedEmployeeId) {
      alert('Selecciona un empleado para liquidar.');
      return;
    }
    setIsCalculatingPreview(true);
    setPayrollFeedback(null);
    try {
      const activeOvertime = overtimeHours
        .filter((o) => o.hours > 0)
        .map((o) => ({
          overtime_surcharge_code: o.code,
          hours_quantity: Number(o.hours),
        }));

      const res = await apiClient.post<any>(
        `/branches/${currentBranchId}/payrolls/calculate-preview`,
        {
          employee_id: selectedEmployeeId,
          period_start_date: periodStartDate,
          period_end_date: periodEndDate,
          payment_date: paymentDate,
          period_code: payrollPeriod,
          worked_days: Number(workedDays),
          overtime_surcharges: activeOvertime,
        },
      );
      setPayrollPreview(res);
    } catch (err: any) {
      setPayrollFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al calcular pre-liquidación.',
      });
    } finally {
      setIsCalculatingPreview(false);
    }
  };

  // Transmisión Oficial Factus v2 Nómina Electrónica
  const handleTransmitPayroll = async () => {
    if (!currentBranchId || !selectedEmployeeId) return;
    setIsTransmittingPayroll(true);
    setPayrollFeedback(null);
    try {
      const activeOvertime = overtimeHours
        .filter((o) => o.hours > 0)
        .map((o) => ({
          overtime_surcharge_code: o.code,
          hours_quantity: Number(o.hours),
        }));

      const res = await apiClient.post<any>(`/branches/${currentBranchId}/payrolls`, {
        employee_id: selectedEmployeeId,
        period_start_date: periodStartDate,
        period_end_date: periodEndDate,
        payment_date: paymentDate,
        period_code: payrollPeriod,
        worked_days: Number(workedDays),
        overtime_surcharges: activeOvertime,
      });

      setPayrollFeedback({
        type: 'success',
        message: `¡Nómina Electrónica transmitida y validada por la DIAN! Consecutivo: ${res.settlement?.factus_payroll_number || 'OK'}`,
      });
      setPayrollPreview(null);
      queryClient.invalidateQueries({ queryKey: ['branch-payrolls', currentBranchId] });
    } catch (err: any) {
      setPayrollFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Error al transmitir nómina a Factus / DIAN.',
      });
    } finally {
      setIsTransmittingPayroll(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const matchName =
      emp.first_name.toLowerCase().includes(q) ||
      emp.last_name.toLowerCase().includes(q) ||
      emp.identification_number.includes(q) ||
      emp.job_title.toLowerCase().includes(q);
    const matchDept = selectedDept === 'ALL' || emp.department === selectedDept;
    return matchName && matchDept;
  });

  const departmentsList = Array.from(new Set(employees.map((e) => e.department))).filter(Boolean);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-stone-900">
                Personal & Nómina Electrónica DIAN
              </h1>
              <p className="text-xs text-stone-500">
                Gestión de empleados (operativos, administrativos, aseo y logística) y transmisión UBL 2.1 con Factus API v2
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('employees')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition ${
              activeTab === 'employees'
                ? 'bg-white shadow-xs text-stone-900'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Users className="h-4 w-4 text-orange-600" />
            Directorio de Personal ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition ${
              activeTab === 'payroll'
                ? 'bg-white shadow-xs text-stone-900'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <FileText className="h-4 w-4 text-orange-600" />
            Liquidación & Nómina DIAN
          </button>
        </div>
      </div>

      {/* TAB 1: EMPLEADOS / PERSONAL */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          {/* Actions & Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, cédula o cargo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-stone-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              {departmentsList.length > 0 && (
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">Todos los Departamentos</option>
                  {departmentsList.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="button"
              onClick={openCreateEmployeeModal}
              className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 transition shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              Registrar Personal
            </button>
          </div>

          {/* Employees Table / Cards */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
            {isLoadingEmployees ? (
              <div className="p-12 text-center text-xs text-stone-400">Cargando personal...</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Users className="h-10 w-10 text-stone-300 mx-auto" />
                <p className="text-xs font-bold text-stone-600">No se encontraron empleados registrados</p>
                <p className="text-xs text-stone-400 max-w-sm mx-auto">
                  Registra tanto el personal con acceso a caja/comandas como el personal operativo de aseo, logística y mantenimiento sin usuario del sistema.
                </p>
                <button
                  type="button"
                  onClick={openCreateEmployeeModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700"
                >
                  <Plus className="h-4 w-4" /> Registrar Primer Empleado
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="py-3 px-4">Código / Identificación</th>
                      <th className="py-3 px-4">Empleado / Cargo</th>
                      <th className="py-3 px-4">Departamento</th>
                      <th className="py-3 px-4">Salario Base</th>
                      <th className="py-3 px-4">Tipo de Acceso</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-stone-50/70 transition">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-stone-900 block">
                            {emp.employee_code}
                          </span>
                          <span className="text-[11px] text-stone-500">
                            CC/NIT: {emp.identification_number}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-stone-900 block">
                            {emp.first_name} {emp.last_name}
                          </span>
                          <span className="text-[11px] text-orange-600 font-medium">
                            {emp.job_title}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-stone-600">
                          {emp.department}
                        </td>
                        <td className="py-3 px-4 font-bold text-stone-900">
                          {formatMoneyCop(emp.base_salary_cop)}
                          {emp.transport_allowance_eligible && (
                            <span className="block text-[10px] text-emerald-600 font-semibold">
                              + Aux. Transporte
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {emp.user_id ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                              Usuario del Sistema
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600 border border-stone-200">
                              Sin Acceso (Aseo/Logística)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              emp.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-stone-100 text-stone-500 border border-stone-200'
                            }`}
                          >
                            {emp.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openEditEmployeeModal(emp)}
                            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 font-bold text-stone-700 hover:bg-stone-100 transition shadow-2xs"
                          >
                            Editar
                          </button>
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

      {/* TAB 2: NÓMINA ELECTRÓNICA DIAN */}
      {activeTab === 'payroll' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panel de Emisión / Liquidación */}
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <Sparkles className="h-5 w-5 text-orange-600" />
              <h2 className="font-extrabold text-stone-900 text-sm">Liquidar Nómina Electrónica</h2>
            </div>

            {payrollFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  payrollFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {payrollFeedback.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                )}
                <span>{payrollFeedback.message}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Empleado a Liquidar *</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 font-medium focus:border-orange-500 focus:outline-none"
                >
                  <option value="">-- Seleccionar Personal --</option>
                  {employees
                    .filter((e) => e.is_active)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.first_name} {e.last_name} ({e.job_title})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Periodo DIAN</label>
                  <select
                    value={payrollPeriod}
                    onChange={(e) => {
                      setPayrollPeriod(e.target.value);
                      if (e.target.value === '4') setWorkedDays(15);
                      if (e.target.value === '5') setWorkedDays(30);
                    }}
                    className="w-full rounded-xl border border-stone-200 p-2 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="4">Quincenal (4)</option>
                    <option value="5">Mensual (5)</option>
                    <option value="1">Semanal (1)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Días Laborados</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={workedDays}
                    onChange={(e) => setWorkedDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-stone-200 p-2 font-bold focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Fecha Inicio</label>
                  <input
                    type="date"
                    value={periodStartDate}
                    onChange={(e) => setPeriodStartDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Fecha Fin</label>
                  <input
                    type="date"
                    value={periodEndDate}
                    onChange={(e) => setPeriodEndDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Fecha de Pago</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 focus:border-orange-500 focus:outline-none"
                />
              </div>

              {/* Horas Extras & Recargos */}
              <div className="pt-2 border-t border-stone-100">
                <span className="font-bold text-stone-800 block mb-2">
                  Horas Extras y Recargos (Divisor 220 DIAN)
                </span>
                <div className="space-y-2">
                  {overtimeHours.map((item, idx) => (
                    <div key={item.code} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-stone-600">
                        {item.code === '3'
                          ? 'Recargo Nocturno (35%)'
                          : item.code === '1'
                          ? 'H. Extra Diurna (25%)'
                          : 'H. Extra Nocturna (75%)'}
                      </span>
                      <div className="flex items-center gap-1 w-20">
                        <input
                          type="number"
                          min={0}
                          value={item.hours}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setOvertimeHours((prev) => {
                              const copy = [...prev];
                              const target = copy[idx];
                              if (target) {
                                target.hours = val;
                              }
                              return copy;
                            });
                          }}
                          className="w-full rounded-lg border border-stone-200 px-2 py-1 text-right font-bold text-xs"
                        />
                        <span className="text-[10px] text-stone-400">h</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleCalculatePreview}
                  disabled={isCalculatingPreview || !selectedEmployeeId}
                  className="w-full py-2.5 rounded-xl border border-orange-600 text-orange-600 font-bold hover:bg-orange-50 transition disabled:opacity-50"
                >
                  {isCalculatingPreview ? 'Calculando...' : 'Pre-visualizar Liquidación'}
                </button>

                {payrollPreview && (
                  <button
                    type="button"
                    onClick={handleTransmitPayroll}
                    disabled={isTransmittingPayroll}
                    className="w-full py-2.5 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-700 shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Send className="h-4 w-4" />
                    {isTransmittingPayroll ? 'Transmitiendo a Factus...' : 'Emitir a la DIAN (Factus v2)'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Pre-liquidación y Desglose DIAN */}
          <div className="lg:col-span-2 space-y-4">
            {payrollPreview ? (
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div>
                    <h3 className="font-extrabold text-stone-900 text-sm">
                      Pre-liquidación: {payrollPreview.employee?.first_name} {payrollPreview.employee?.last_name}
                    </h3>
                    <p className="text-xs text-stone-500">
                      Cargo: {payrollPreview.employee?.job_title} • Cédula: {payrollPreview.employee?.identification_number}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    Neto a Pagar: {formatMoneyCop(payrollPreview.calculation?.net_payable_cop || 0)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-500 block">Sueldo Básico:</span>
                    <span className="font-extrabold text-stone-900 text-sm">
                      {formatMoneyCop(payrollPreview.calculation?.earned_salary_cop || 0)}
                    </span>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-500 block">Auxilio Transporte:</span>
                    <span className="font-extrabold text-stone-900 text-sm">
                      {formatMoneyCop(payrollPreview.calculation?.transport_allowance_cop || 0)}
                    </span>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-xl">
                    <span className="text-stone-500 block">Extras & Recargos:</span>
                    <span className="font-extrabold text-stone-900 text-sm">
                      {formatMoneyCop(payrollPreview.calculation?.overtime_total_cop || 0)}
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    <span className="text-emerald-700 block font-semibold">Total Devengado:</span>
                    <span className="font-extrabold text-emerald-950 text-sm">
                      {formatMoneyCop(payrollPreview.calculation?.gross_accrued_cop || 0)}
                    </span>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-xl">
                    <span className="text-rose-700 block font-semibold">Deducción Salud (4%):</span>
                    <span className="font-extrabold text-rose-950 text-sm">
                      {formatMoneyCop(payrollPreview.calculation?.health_deduction_cop || 0)}
                    </span>
                  </div>
                  <div className="p-3 bg-rose-50 rounded-xl">
                    <span className="text-rose-700 block font-semibold">Deducción Pensión (4%):</span>
                    <span className="font-extrabold text-rose-950 text-sm">
                      {formatMoneyCop(payrollPreview.calculation?.pension_deduction_cop || 0)}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-stone-50/80 rounded-xl border border-stone-200 text-[11px] text-stone-600 space-y-1">
                  <p>
                    <strong>Base IBC Seguridad Social:</strong>{' '}
                    {formatMoneyCop(payrollPreview.calculation?.ibc_base_cop || 0)} (Excluye auxilio de transporte conforme al Art. 128 CST)
                  </p>
                  <p>
                    <strong>Fórmula Horas Extras:</strong> Divisor legal de 220 horas mensuales (Ley 2101 de 2021).
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-stone-200 shadow-2xs text-center space-y-2">
                <Clock className="h-8 w-8 text-stone-300 mx-auto" />
                <h4 className="font-bold text-stone-700 text-xs">Sin pre-visualización activa</h4>
                <p className="text-xs text-stone-400 max-w-sm mx-auto">
                  Selecciona un empleado a la izquierda y pulsa "Pre-visualizar Liquidación" para validar devengados y deducciones antes del envío a la DIAN.
                </p>
              </div>
            )}

            {/* Historial de Liquidaciones DIAN */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="font-extrabold text-stone-900 text-sm">
                Historial de Nóminas Electrónicas Transmitidas ({settlements.length})
              </h3>

              {isLoadingSettlements ? (
                <p className="text-xs text-stone-400">Cargando nóminas...</p>
              ) : settlements.length === 0 ? (
                <p className="text-xs text-stone-400 py-4 text-center">
                  Aún no se han emitido nóminas electrónicas en esta sucursal.
                </p>
              ) : (
                <div className="divide-y divide-stone-100 text-xs">
                  {settlements.map((s) => (
                    <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-900">
                            {s.factus_payroll_number || 'NEF'}
                          </span>
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            {s.status}
                          </span>
                        </div>
                        <p className="text-stone-500 text-[11px] mt-0.5">
                          {s.employee?.first_name} {s.employee?.last_name} ({s.employee?.job_title}) •{' '}
                          {s.period_start_date?.slice(0, 10)} al {s.period_end_date?.slice(0, 10)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-stone-900 text-sm">
                          {formatMoneyCop(s.net_payable_cop)}
                        </span>
                        <a
                          href={`/api/v1/payrolls/${s.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100 transition shadow-2xs"
                        >
                          <Download className="h-3.5 w-3.5 text-orange-600" />
                          PDF
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CREAR / EDITAR EMPLEADO */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-stone-50">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-orange-600" />
                <h3 className="font-bold text-stone-900 text-base">
                  {editingEmployee ? 'Editar Perfil de Personal' : 'Registrar Nuevo Empleado'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEmployeeModalOpen(false)}
                className="rounded-lg p-2 text-stone-400 hover:bg-stone-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="rounded-xl bg-orange-50/70 p-3 border border-orange-200 text-orange-900 text-[11px]">
                💡 <strong>Nota Operativa:</strong> Puedes registrar personal que <strong>no usará el sistema</strong> (como aseo, vigilancia o bodega) simplemente dejando el acceso sin vincular a un usuario.
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Código Empleado *</label>
                  <input
                    type="text"
                    required
                    value={formEmployeeCode}
                    onChange={(e) => setFormEmployeeCode(e.target.value)}
                    placeholder="EMP-001"
                    className="w-full rounded-xl border border-stone-200 p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Tipo Documento</label>
                  <select
                    value={formDocType}
                    onChange={(e) => setFormDocType(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2"
                  >
                    <option value="13">Cédula Ciudadanía (13)</option>
                    <option value="31">NIT (31)</option>
                    <option value="22">Cédula Extranjería (22)</option>
                    <option value="41">Pasaporte (41)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Número Identificación *</label>
                  <input
                    type="text"
                    required
                    value={formDocNumber}
                    onChange={(e) => setFormDocNumber(e.target.value)}
                    placeholder="1020304050"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Nombres *</label>
                  <input
                    type="text"
                    required
                    value={formFirstName}
                    onChange={(e) => setFormFirstName(e.target.value)}
                    placeholder="Gloria Inés"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Apellidos *</label>
                  <input
                    type="text"
                    required
                    value={formLastName}
                    onChange={(e) => setFormLastName(e.target.value)}
                    placeholder="Pérez Ramos"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Cargo / Puesto *</label>
                  <input
                    type="text"
                    required
                    value={formJobTitle}
                    onChange={(e) => setFormJobTitle(e.target.value)}
                    placeholder="Ej. Personal de Limpieza / Cocinero"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Departamento *</label>
                  <input
                    type="text"
                    required
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="Ej. Aseo y Mantenimiento / Cocina"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Salario Base Mensual (COP) *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formBaseSalaryCop}
                    onChange={(e) => setFormBaseSalaryCop(Number(e.target.value))}
                    className="w-full rounded-xl border border-stone-200 p-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Tipo de Contrato</label>
                  <select
                    value={formContractType}
                    onChange={(e) => setFormContractType(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2"
                  >
                    <option value="1">Término Fijo (1)</option>
                    <option value="2">Término Indefinido (2)</option>
                    <option value="3">Obra o Labor (3)</option>
                    <option value="4">Aprendizaje (4)</option>
                    <option value="5">Prestación de Servicios (5)</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-stone-700">
                    <input
                      type="checkbox"
                      checked={formTransportEligible}
                      onChange={(e) => setFormTransportEligible(e.target.checked)}
                      className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                    />
                    Aplica Aux. Transporte
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Medio de Pago</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2"
                  >
                    <option value="10">Efectivo (10)</option>
                    <option value="42">Transferencia Bancaria (42)</option>
                    <option value="48">Tarjeta de Crédito (48)</option>
                    <option value="49">Tarjeta de Débito (49)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Banco</label>
                  <input
                    type="text"
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    placeholder="Bancolombia, Nequi..."
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Nº Cuenta</label>
                  <input
                    type="text"
                    value={formBankAccountNumber}
                    onChange={(e) => setFormBankAccountNumber(e.target.value)}
                    placeholder="Cuenta bancaria"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Correo</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="empleado@correo.com"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="3001234567"
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Fecha de Ingreso</label>
                  <input
                    type="date"
                    value={formEntryDate}
                    onChange={(e) => setFormEntryDate(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="rounded-xl px-4 py-2 font-bold text-stone-600 hover:bg-stone-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-orange-600 px-5 py-2 font-bold text-white hover:bg-orange-700 shadow-sm transition"
                >
                  {editingEmployee ? 'Guardar Cambios' : 'Registrar Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
