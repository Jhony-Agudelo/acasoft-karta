import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FactusV2ClientService } from '../factus-integration/factus-v2-client.service';
import {
  CreateEmployeeProfileDto,
  UpdateEmployeeProfileDto,
  PayrollLiquidationPreviewDto,
  calculatePayrollLiquidation,
} from '@restaurante-saas/shared';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factusClient: FactusV2ClientService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. GESTIÓN DE EMPLEADOS Y PERSONAL (SISTEMA Y NO-SISTEMA)
  // ---------------------------------------------------------------------------

  /**
   * Lista todos los empleados de la sucursal, incluyendo personal de operaciones,
   * meseros, cocineros y personal sin acceso al sistema (limpieza, logística).
   */
  async listEmployees(tenantId: string, branchId: string) {
    return this.prisma.employeeProfile.findMany({
      where: { tenant_id: tenantId, branch_id: branchId },
      include: {
        user: {
          select: { id: true, name: true, email: true, status: true },
        },
      },
      orderBy: { first_name: 'asc' },
    });
  }

  /**
   * Registra un empleado o miembro del personal.
   * Soporta tanto personal que usa el sistema (user_id asociado)
   * como personal que NO usa el sistema (user_id: null, ej. aseo, limpieza, logística).
   */
  async createEmployee(
    tenantId: string,
    branchId: string,
    dto: CreateEmployeeProfileDto,
  ) {
    const existing = await this.prisma.employeeProfile.findUnique({
      where: {
        uq_employee_profiles_tenant_ident: {
          tenant_id: tenantId,
          identification_number: dto.identification_number.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un empleado registrado con el documento ${dto.identification_number}.`,
      );
    }

    if (dto.user_id) {
      const userExisting = await this.prisma.employeeProfile.findUnique({
        where: { user_id: dto.user_id },
      });
      if (userExisting) {
        throw new ConflictException(
          `El usuario seleccionado ya tiene un perfil de empleado asignado.`,
        );
      }
    }

    return this.prisma.employeeProfile.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        user_id: dto.user_id || null,
        employee_code: dto.employee_code.trim(),
        job_title: dto.job_title.trim(),
        department: dto.department ? dto.department.trim() : null,
        has_system_access: Boolean(dto.has_system_access || dto.user_id),
        identification_document_code: dto.identification_document_code,
        identification_number: dto.identification_number.trim(),
        first_name: dto.first_name.trim(),
        first_surname: dto.first_surname.trim(),
        second_surname: dto.second_surname ? dto.second_surname.trim() : null,
        address: dto.address.trim(),
        municipality_code: dto.municipality_code || '66400',
        email: dto.email ? dto.email.trim() : null,
        phone: dto.phone ? dto.phone.trim() : null,
        worker_type_code: dto.worker_type_code,
        worker_subtype: dto.worker_subtype,
        contract_type: dto.contract_type,
        has_integral_salary: dto.has_integral_salary,
        has_high_risk: dto.has_high_risk,
        base_salary_cop: dto.base_salary_cop,
        receives_transport_allowance: dto.receives_transport_allowance,
        entry_date: new Date(dto.entry_date),
        retirement_date: dto.retirement_date ? new Date(dto.retirement_date) : null,
        payment_method_code: dto.payment_method_code,
        bank_name: dto.bank_name ? dto.bank_name.trim() : null,
        account_type: dto.account_type ? dto.account_type.trim() : null,
        account_number: dto.account_number ? dto.account_number.trim() : null,
        is_active: dto.is_active,
      },
    });
  }

  async updateEmployee(
    tenantId: string,
    id: string,
    dto: UpdateEmployeeProfileDto,
  ) {
    const employee = await this.prisma.employeeProfile.findUnique({ where: { id } });
    if (!employee || employee.tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${id} no encontrado.`);
    }

    return this.prisma.employeeProfile.update({
      where: { id },
      data: {
        ...dto,
        entry_date: dto.entry_date ? new Date(dto.entry_date) : undefined,
        retirement_date: dto.retirement_date ? new Date(dto.retirement_date) : undefined,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. LIQUIDACIÓN Y TRANSMISIÓN DE NÓMINA ELECTRÓNICA (/v2/payrolls)
  // ---------------------------------------------------------------------------

  /**
   * Calcula el desglose previo de nómina (sueldo proporcional, horas extras, auxilio de transporte, IBC y deducciones)
   */
  async calculatePreview(
    tenantId: string,
    branchId: string,
    dto: PayrollLiquidationPreviewDto,
  ) {
    const employee = await this.prisma.employeeProfile.findUnique({
      where: { id: dto.employee_id },
    });

    if (!employee || employee.tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${dto.employee_id} no encontrado.`);
    }

    const result = calculatePayrollLiquidation({
      employee: {
        employee_code: employee.employee_code,
        identification_document_code: employee.identification_document_code,
        identification_number: employee.identification_number,
        first_name: employee.first_name,
        first_surname: employee.first_surname,
        second_surname: employee.second_surname,
        address: employee.address,
        municipality_code: employee.municipality_code,
        entry_date: employee.entry_date.toISOString().slice(0, 10),
        base_salary_cop: employee.base_salary_cop,
        receives_transport_allowance: employee.receives_transport_allowance,
        job_title: employee.job_title,
        bank_name: employee.bank_name,
        account_type: employee.account_type,
        account_number: employee.account_number,
      },
      period: {
        year: dto.year,
        month: dto.month,
        payment_date: dto.payment_date,
      },
      days_worked: dto.days_worked,
      commissions_cop: dto.commissions_cop,
      overtime_entries: dto.overtime_entries,
      other_deductions_cop: dto.other_deductions_cop,
    });

    return result;
  }

  /**
   * Liquida y transmite la Nómina Electrónica ante Factus v2 (POST /v2/payrolls)
   */
  async settleAndTransmitPayroll(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: PayrollLiquidationPreviewDto,
  ) {
    const employee = await this.prisma.employeeProfile.findUnique({
      where: { id: dto.employee_id },
    });

    if (!employee || employee.tenant_id !== tenantId) {
      throw new NotFoundException(`Empleado ${dto.employee_id} no encontrado.`);
    }

    // Obtener rango de numeración de nómina (código '26') con ULID id
    const range = await this.prisma.branchNumberingRange.findUnique({
      where: {
        uq_branch_numbering_ranges_doc_type: {
          tenant_id: tenantId,
          branch_id: branchId,
          document_type_code: '26',
        },
      },
    });

    if (!range || !range.is_active) {
      throw new BadRequestException(
        'No se ha configurado un rango de numeración activo para Nómina Electrónica (código 26) en esta sucursal. Sincronice los rangos en Ajustes.',
      );
    }

    const refCode = `NOM-${dto.year}${String(dto.month).padStart(2, '0')}-${employee.employee_code}`;

    // Calcular liquidación completa con el range_id oficial
    const liquidation = calculatePayrollLiquidation({
      employee: {
        employee_code: employee.employee_code,
        identification_document_code: employee.identification_document_code,
        identification_number: employee.identification_number,
        first_name: employee.first_name,
        first_surname: employee.first_surname,
        second_surname: employee.second_surname,
        address: employee.address,
        municipality_code: employee.municipality_code,
        entry_date: employee.entry_date.toISOString().slice(0, 10),
        base_salary_cop: employee.base_salary_cop,
        receives_transport_allowance: employee.receives_transport_allowance,
        job_title: employee.job_title,
        bank_name: employee.bank_name,
        account_type: employee.account_type,
        account_number: employee.account_number,
      },
      period: {
        year: dto.year,
        month: dto.month,
        payment_date: dto.payment_date,
      },
      days_worked: dto.days_worked,
      commissions_cop: dto.commissions_cop,
      overtime_entries: dto.overtime_entries,
      other_deductions_cop: dto.other_deductions_cop,
      numbering_range_id: range.factus_range_id,
      reference_code: refCode,
    });

    // Limpieza de borrador no validado si existiera
    await this.factusClient.destroyPayrollDraftByReference(tenantId, refCode);

    // Transmitir a Factus v2
    const factusRes = await this.factusClient.validatePayroll(
      tenantId,
      liquidation.factusPayload,
    );
    const payrollData = factusRes?.data?.payroll || factusRes?.data;

    // Guardar en payroll_settlements
    const settlement = await this.prisma.payrollSettlement.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        employee_id: employee.id,
        reference_code: refCode,
        year: dto.year,
        month: dto.month,
        days_worked: dto.days_worked,
        worked_salary_cop: liquidation.workedSalaryCop,
        transport_allowance_cop: liquidation.transportAllowanceCop,
        commissions_cop: liquidation.commissionsCop,
        overtime_and_surcharges_json: liquidation.overtimeProcessed as any,
        overtime_total_cop: liquidation.overtimeTotalCop,
        health_deduction_cop: liquidation.healthDeductionCop,
        pension_deduction_cop: liquidation.pensionDeductionCop,
        other_deductions_cop: liquidation.otherDeductionsCop,
        gross_accrued_cop: liquidation.grossAccruedCop,
        total_deductions_cop: liquidation.totalDeductionsCop,
        net_payable_cop: liquidation.netPayableCop,
        payment_date: new Date(dto.payment_date),
        status: 'VALIDATED_DIAN',
        factus_payroll_number: payrollData?.number || null,
        cune: payrollData?.cune || null,
        pdf_url: payrollData?.pdf_url || null,
        xml_url: payrollData?.xml_url || null,
        response_payload_json: factusRes as any,
        created_by: userId,
      },
    });

    return {
      success: true,
      settlement,
      liquidation,
    };
  }

  async listSettlements(tenantId: string, branchId: string, year?: number, month?: number) {
    return this.prisma.payrollSettlement.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        year: year || undefined,
        month: month || undefined,
      },
      include: {
        employee: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async downloadPayrollPdf(tenantId: string, settlementId: string) {
    const settlement = await this.prisma.payrollSettlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement || settlement.tenant_id !== tenantId || !settlement.factus_payroll_number) {
      throw new NotFoundException('Liquidación de nómina no encontrada o sin número Factus.');
    }

    return this.factusClient.downloadPayrollPdf(tenantId, settlement.factus_payroll_number);
  }
}

