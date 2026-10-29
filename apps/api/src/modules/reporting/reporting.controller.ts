import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportingService } from './reporting.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  SalesReportQuerySchema,
  SalesReportResponseDto,
} from '@restaurante-saas/shared';

@Controller('reports')
@RequireModule('reporting')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  /**
   * Consulta el reporte consolidado de ventas y conciliación financiera del tenant.
   * GET /api/v1/reports/sales
   */
  @Get('sales')
  @RequirePermissions('reports:read')
  async getSalesReport(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() rawQuery: Record<string, string>,
  ): Promise<SalesReportResponseDto> {
    const parseResult = SalesReportQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'INVALID_QUERY_PARAMS',
        message: 'Parámetros de consulta de reporte de ventas inválidos',
        issues: parseResult.error.issues,
      });
    }

    return this.reportingService.getSalesReport(
      user.tenantId,
      parseResult.data,
      user.branchScope,
    );
  }

  /**
   * Exporta a formato CSV contable con codificación UTF-8 BOM, libre de PII.
   * GET /api/v1/reports/sales/export-csv
   */
  @Get('sales/export-csv')
  @RequirePermissions('reports:read')
  async exportSalesCsv(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() rawQuery: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const parseResult = SalesReportQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'INVALID_QUERY_PARAMS',
        message: 'Parámetros de consulta de exportación de reporte inválidos',
        issues: parseResult.error.issues,
      });
    }

    const { csvString, filename } = await this.reportingService.exportSalesCsv(
      user.tenantId,
      parseResult.data,
      user.id,
      user.branchScope,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvString);
  }
}
