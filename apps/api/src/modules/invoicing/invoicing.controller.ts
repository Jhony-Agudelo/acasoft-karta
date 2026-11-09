import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  UsePipes,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvoicingService } from './invoicing.service';
import {
  FactusTenantConfigInputSchema,
  FactusTenantConfigInputDto,
  SyncNumberingRangesSchema,
  EmitElectronicInvoiceSchema,
  EmitElectronicInvoiceDto,
  EmitCreditNoteSchema,
  EmitCreditNoteDto,
} from '@restaurante-saas/shared';

@Controller()
@RequireModule('invoicing.electronic_dian')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  /**
   * Consulta la configuración actual de Factus API v2 del restaurante
   */
  @Get('admin/factus/config')
  @RequirePermissions('tenancy:manage')
  async getFactusConfig(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.invoicingService.getFactusConfig(user.tenantId);
  }

  /**
   * Configura y valida credenciales de Factus API v2
   */
  @Put('admin/factus/config')
  @RequirePermissions('tenancy:manage')
  @UsePipes(new ZodValidationPipe(FactusTenantConfigInputSchema))
  async saveFactusConfig(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: FactusTenantConfigInputDto,
  ) {
    return this.invoicingService.saveFactusConfig(user.tenantId, dto);
  }

  /**
   * Sincroniza los rangos de numeración activos desde Factus v2 hacia la sucursal
   */
  @Post('admin/factus/numbering-ranges/sync')
  @RequirePermissions('tenancy:manage')
  @UsePipes(new ZodValidationPipe(SyncNumberingRangesSchema))
  async syncNumberingRanges(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: { branch_id: string },
  ) {
    return this.invoicingService.syncNumberingRanges(user.tenantId, dto.branch_id);
  }

  /**
   * Servicio de autocompletado en Caja POS:
   * Busca en local tax_customer_profiles; si no existe, consulta en vivo en Factus v2 (/v2/dian/acquirer)
   */
  @Get('invoicing/acquirer-lookup')
  @RequirePermissions('orders:read')
  async lookupAcquirer(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query('doc_code') docCode = '13',
    @Query('doc_number') docNumber = '',
  ) {
    return this.invoicingService.lookupAcquirer(user.tenantId, docCode, docNumber);
  }

  /**
   * Emisión de Factura Electrónica de Venta para un Pedido (Order)
   * Soporta modalidad FINAL_CONSUMER ("222222222222") o NAMED_CUSTOMER con autocompletado
   */
  @Post('orders/:orderId/electronic-invoice')
  @RequirePermissions('orders:manage')
  @UsePipes(new ZodValidationPipe(EmitElectronicInvoiceSchema))
  async emitOrderElectronicInvoice(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
    @Body() dto: EmitElectronicInvoiceDto,
  ) {
    return this.invoicingService.emitOrderElectronicInvoice(
      user.tenantId,
      orderId,
      user.id,
      dto,
    );
  }

  /**
   * Emisión de Factura Electrónica de Venta para una Cuenta de Salón (DiningAccount)
   */
  @Post('accounts/:accountId/electronic-invoice')
  @RequirePermissions('orders:manage')
  @UsePipes(new ZodValidationPipe(EmitElectronicInvoiceSchema))
  async emitAccountElectronicInvoice(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('accountId') accountId: string,
    @Body() dto: EmitElectronicInvoiceDto,
  ) {
    return this.invoicingService.emitAccountElectronicInvoice(
      user.tenantId,
      accountId,
      user.id,
      dto,
    );
  }

  /**
   * Emisión de Nota Crédito vinculada a una Factura Electrónica
   */
  @Post('electronic-invoices/:fiscalDocId/credit-note')
  @RequirePermissions('orders:manage')
  @UsePipes(new ZodValidationPipe(EmitCreditNoteSchema))
  async emitCreditNote(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('fiscalDocId') fiscalDocId: string,
    @Body() dto: EmitCreditNoteDto,
  ) {
    return this.invoicingService.emitCreditNote(
      user.tenantId,
      fiscalDocId,
      user.id,
      dto,
    );
  }

  /**
   * Descarga el PDF oficial de la factura o nota crédito
   */
  @Get('electronic-invoices/:fiscalDocId/pdf')
  @RequirePermissions('orders:read')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('fiscalDocId') fiscalDocId: string,
  ) {
    return this.invoicingService.downloadDocumentPdf(user.tenantId, fiscalDocId);
  }

  /**
   * Descarga el XML UBL 2.1 oficial de la factura
   */
  @Get('electronic-invoices/:fiscalDocId/xml')
  @RequirePermissions('orders:read')
  async downloadXml(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('fiscalDocId') fiscalDocId: string,
  ) {
    return this.invoicingService.downloadDocumentXml(user.tenantId, fiscalDocId);
  }

  /**
   * Reenvía la factura electrónica por correo al cliente
   */
  @Post('electronic-invoices/:fiscalDocId/send-email')
  @RequirePermissions('orders:manage')
  async sendEmail(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('fiscalDocId') fiscalDocId: string,
  ) {
    return this.invoicingService.sendDocumentEmail(user.tenantId, fiscalDocId);
  }
}
