import React, { useState } from 'react';
import {
  X,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  Download,
  Mail,
  Copy,
  Printer,
  User,
  Building2,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { formatMoneyCop } from '@restaurante-saas/shared';

export interface ElectronicInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
  accountId?: string;
  orderCode?: string;
  totalCop: number;
  onSuccess?: (fiscalDoc: any) => void;
}

export const ElectronicInvoiceModal: React.FC<ElectronicInvoiceModalProps> = ({
  isOpen,
  onClose,
  orderId,
  accountId,
  orderCode,
  totalCop,
  onSuccess,
}) => {
  const [customerMode, setCustomerMode] = useState<'FINAL_CONSUMER' | 'NAMED_CUSTOMER' | 'INTERNAL_ONLY'>(
    'FINAL_CONSUMER',
  );

  // Datos Adquirente
  const [docCode, setDocCode] = useState<string>('13'); // 13 = CC, 31 = NIT
  const [docNumber, setDocNumber] = useState<string>('');
  const [names, setNames] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [legalType, setLegalType] = useState<'NATURAL' | 'LEGAL'>('NATURAL');

  // Estados de consulta y envío
  const [isLookingUp, setIsLookingUp] = useState<boolean>(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Documento Fiscal Emitido
  const [issuedDoc, setIssuedDoc] = useState<any | null>(null);
  const [emailInput, setEmailInput] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [copiedCufe, setCopiedCufe] = useState<boolean>(false);

  if (!isOpen) return null;

  // Consulta en vivo del Adquirente en la DIAN / Factus
  const handleAcquirerLookup = async () => {
    if (!docNumber.trim()) {
      setLookupMessage('Digita el número de documento para consultar.');
      return;
    }
    setIsLookingUp(true);
    setLookupMessage(null);
    try {
      const res = await apiClient.get<any>(
        `/invoicing/acquirer-lookup?doc_code=${docCode}&doc_number=${encodeURIComponent(docNumber.trim())}`,
      );
      if (res && res.found && res.data) {
        setNames(res.data.names || res.data.company_name || '');
        setEmail(res.data.email || '');
        setPhone(res.data.phone || '');
        setAddress(res.data.address || '');
        if (docCode === '31') {
          setLegalType('LEGAL');
        }
        setLookupMessage('✓ Adquirente localizado en base de datos DIAN / Factus');
      } else {
        setLookupMessage('No se hallaron datos previos en DIAN. Puedes ingresarlos manualmente.');
      }
    } catch (err: any) {
      setLookupMessage('No se pudo consultar DIAN en este momento. Completa los datos.');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Emisión oficial
  const handleEmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (customerMode === 'INTERNAL_ONLY') {
      onSuccess?.(null);
      onClose();
      return;
    }

    if (customerMode === 'NAMED_CUSTOMER') {
      if (!docNumber.trim()) {
        setErrorMessage('El número de identificación es obligatorio.');
        return;
      }
      if (!names.trim()) {
        setErrorMessage('El nombre o razón social es obligatorio.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setErrorMessage('Se requiere un correo electrónico válido para enviar la factura electrónica.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const url = orderId
        ? `/orders/${orderId}/electronic-invoice`
        : `/accounts/${accountId}/electronic-invoice`;

      const payload: any = {
        customer_mode: customerMode,
      };

      if (customerMode === 'NAMED_CUSTOMER') {
        payload.acquirer_data = {
          identification_document_code: docCode,
          identification: docNumber.trim(),
          legal_type: legalType,
          names: names.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        };
      }

      const res = await apiClient.post<any>(url, payload);
      const doc = res.fiscal_document || res;
      setIssuedDoc(doc);
      setEmailInput(doc.customer_or_provider_snapshot_json?.email || email.trim());
      onSuccess?.(doc);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message ||
          err.message ||
          'Error al emitir factura electrónica con Factus / DIAN.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCufe = (cufe: string) => {
    navigator.clipboard.writeText(cufe);
    setCopiedCufe(true);
    setTimeout(() => setCopiedCufe(false), 2000);
  };

  const handleSendEmail = async () => {
    if (!issuedDoc?.id || !emailInput.trim()) return;
    setIsSendingEmail(true);
    setEmailFeedback(null);
    try {
      await apiClient.post(`/electronic-invoices/${issuedDoc.id}/send-email`, {
        target_email: emailInput.trim(),
      });
      setEmailFeedback('Factura enviada exitosamente al correo.');
    } catch (err: any) {
      setEmailFeedback(err.response?.data?.message || 'Error al enviar por correo.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 bg-stone-50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900">Facturación Electrónica DIAN</h3>
              <p className="text-xs text-stone-500">
                {orderCode ? `Pedido #${orderCode}` : 'Cuenta de Salón'} • Total: {formatMoneyCop(totalCop)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {issuedDoc ? (
            /* Vista del Documento Validado por la DIAN */
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-900">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-base">¡Factura Validada por la DIAN!</h4>
                    <p className="text-xs text-emerald-700">
                      Emitida en Factus API v2 con número oficial{' '}
                      <span className="font-mono font-bold text-emerald-950">
                        {issuedDoc.factus_number || 'SETP'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-emerald-200/80 pt-3">
                  <div>
                    <span className="text-emerald-700 block">Tipo:</span>
                    <span className="font-semibold text-emerald-950">
                      {issuedDoc.customer_mode === 'FINAL_CONSUMER'
                        ? 'Consumidor Final (222222222222)'
                        : 'Factura Nominativa'}
                    </span>
                  </div>
                  <div>
                    <span className="text-emerald-700 block">Total Facturado:</span>
                    <span className="font-bold text-emerald-950">
                      {formatMoneyCop(issuedDoc.total_cop || totalCop)}
                    </span>
                  </div>
                </div>
              </div>

              {/* CUFE */}
              {issuedDoc.cufe_or_cude && (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-stone-700 uppercase tracking-wider text-[11px]">
                      CUFE (Código Único de Factura Electrónica)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCufe(issuedDoc.cufe_or_cude)}
                      className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700 text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedCufe ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <p className="font-mono text-stone-600 break-all bg-white p-2 rounded border border-stone-200 text-[11px]">
                    {issuedDoc.cufe_or_cude}
                  </p>
                </div>
              )}

              {/* Acciones de Descarga / XML / PDF */}
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`/api/v1/electronic-invoices/${issuedDoc.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-50 transition"
                >
                  <Download className="h-4 w-4 text-orange-600" />
                  Descargar PDF
                </a>
                <a
                  href={`/api/v1/electronic-invoices/${issuedDoc.id}/xml`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-50 transition"
                >
                  <ExternalLink className="h-4 w-4 text-stone-600" />
                  Descargar XML UBL 2.1
                </a>
              </div>

              {/* Envío por Correo */}
              <div className="rounded-xl border border-stone-200 p-4 space-y-2">
                <label className="text-xs font-bold text-stone-700 block">
                  Reenviar Factura por Correo Electrónico
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="cliente@correo.com"
                    className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !emailInput.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    <Mail className="h-4 w-4" />
                    {isSendingEmail ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
                {emailFeedback && (
                  <p className="text-xs font-semibold text-stone-600 mt-1">{emailFeedback}</p>
                )}
              </div>
            </div>
          ) : (
            /* Selector de Modalidad Fiscal */
            <form onSubmit={handleEmitInvoice} className="space-y-5">
              {errorMessage && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Selector de Modo */}
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCustomerMode('FINAL_CONSUMER')}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3.5 text-center transition ${
                    customerMode === 'FINAL_CONSUMER'
                      ? 'border-orange-600 bg-orange-50/80 text-orange-950 font-bold ring-2 ring-orange-500/30'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                  }`}
                >
                  <Receipt className="h-5 w-5 text-orange-600" />
                  <span className="text-xs leading-tight">Consumidor Final (222222222222)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCustomerMode('NAMED_CUSTOMER')}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3.5 text-center transition ${
                    customerMode === 'NAMED_CUSTOMER'
                      ? 'border-orange-600 bg-orange-50/80 text-orange-950 font-bold ring-2 ring-orange-500/30'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                  }`}
                >
                  <User className="h-5 w-5 text-orange-600" />
                  <span className="text-xs leading-tight">Factura a Nombre de Cliente (CC / NIT)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCustomerMode('INTERNAL_ONLY')}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3.5 text-center transition ${
                    customerMode === 'INTERNAL_ONLY'
                      ? 'border-stone-700 bg-stone-100 text-stone-900 font-bold ring-2 ring-stone-400/30'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                  }`}
                >
                  <Building2 className="h-5 w-5 text-stone-500" />
                  <span className="text-xs leading-tight">Solo Recibo Interno (Sin DIAN)</span>
                </button>
              </div>

              {/* Formulario Adquirente cuando es NAMED_CUSTOMER */}
              {customerMode === 'NAMED_CUSTOMER' && (
                <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
                      Datos del Adquirente (DIAN)
                    </span>
                    <span className="text-[11px] text-stone-500">Búsqueda rápida en DIAN / Factus</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[11px] font-semibold text-stone-600 block mb-1">
                        Tipo Doc
                      </label>
                      <select
                        value={docCode}
                        onChange={(e) => {
                          setDocCode(e.target.value);
                          if (e.target.value === '31') setLegalType('LEGAL');
                          else setLegalType('NATURAL');
                        }}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                      >
                        <option value="13">Cédula (CC - 13)</option>
                        <option value="31">NIT (Empresa - 31)</option>
                        <option value="22">Cédula Extranjería (22)</option>
                        <option value="41">Pasaporte (41)</option>
                        <option value="42">Doc Extranjero (42)</option>
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="text-[11px] font-semibold text-stone-600 block mb-1">
                        Número de Documento
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={docNumber}
                          onChange={(e) => setDocNumber(e.target.value)}
                          placeholder="Ej: 1020304050"
                          className="flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAcquirerLookup}
                          disabled={isLookingUp || !docNumber.trim()}
                          className="flex items-center gap-1 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-900 disabled:opacity-50"
                          title="Consultar en base de datos DIAN"
                        >
                          <Search className="h-3.5 w-3.5" />
                          {isLookingUp ? '...' : 'Buscar'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {lookupMessage && (
                    <p className="text-[11px] text-stone-600 bg-white p-2 rounded border border-stone-200">
                      {lookupMessage}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-semibold text-stone-600 block mb-1">
                        Nombre Completo o Razón Social *
                      </label>
                      <input
                        type="text"
                        value={names}
                        onChange={(e) => setNames(e.target.value)}
                        placeholder="Ej: Laura Morales"
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-stone-600 block mb-1">
                        Correo Electrónico (Para envío DIAN) *
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="laura@empresa.com"
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-semibold text-stone-600 block mb-1">
                        Teléfono Móvil
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="3001234567"
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-stone-600 block mb-1">
                        Dirección
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Calle 100 # 15-20"
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Botón de Emisión */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white shadow-md hover:bg-orange-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  {isSubmitting
                    ? 'Validando con DIAN Factus v2...'
                    : customerMode === 'INTERNAL_ONLY'
                    ? 'Finalizar sin Factura Electrónica'
                    : 'Emitir y Validar Factura Electrónica DIAN'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-200 px-6 py-3.5 bg-stone-50 flex items-center justify-between">
          <span className="text-[11px] text-stone-500">
            Integrado con Factus API v2 • Resolución DIAN UBL 2.1
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-200 transition"
          >
            {issuedDoc ? 'Cerrar' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  );
};
