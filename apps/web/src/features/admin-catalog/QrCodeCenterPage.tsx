import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { useBrandStore } from '../../stores/brand.store';
import {
  QrCode,
  Plus,
  Copy,
  Check,
  Download,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Store,
  X,
  ExternalLink,
} from 'lucide-react';

interface QrItem {
  id: string;
  tenant_id: string;
  branch_id: string;
  qr_token: string;
  target_type: 'GENERAL_MENU' | 'BRANCH_MENU' | 'DINING_TABLE';
  table_id?: string | null;
  label: string;
  is_active: boolean;
  revoked_at?: string | null;
  created_at: string;
}

export const QrCodeCenterPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId } = useAuthStore();
  const { settings: brandSettings } = useBrandStore();

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [newTargetType, setNewTargetType] = useState<'BRANCH_MENU' | 'GENERAL_MENU' | 'DINING_TABLE'>(
    'BRANCH_MENU',
  );
  const [newLabel, setNewLabel] = useState('Carta Digital Sede');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data: qrList = [], isLoading } = useQuery<QrItem[]>({
    queryKey: ['admin-qr-codes', currentBranchId],
    queryFn: () => apiClient.get(`/admin/branches/${currentBranchId}/qr-codes`),
    enabled: !!currentBranchId,
  });

  const createQrMutation = useMutation({
    mutationFn: (payload: any) =>
      apiClient.post(`/admin/branches/${currentBranchId}/qr-codes`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-qr-codes', currentBranchId] });
      setIsGenerateModalOpen(false);
      setNewLabel('Carta Digital Sede');
    },
  });

  const revokeQrMutation = useMutation({
    mutationFn: ({ qrId, replaceWithNew }: { qrId: string; replaceWithNew: boolean }) =>
      apiClient.post(`/admin/qr-codes/${qrId}/revoke`, {
        generate_replacement: replaceWithNew,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-qr-codes', currentBranchId] });
    },
  });

  const handleCopyLink = (qrToken: string) => {
    const url = `${window.location.origin}/q/${qrToken}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(qrToken);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleDownloadSvg = (qrToken: string, label: string) => {
    const svgEl = document.getElementById(`qr-svg-${qrToken}`);
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `QR-${label.replace(/\s+/g, '_')}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  const handleDownloadPng = (qrToken: string, label: string) => {
    const svgEl = document.getElementById(`qr-svg-${qrToken}`);
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 100, 100, 800, 800);

      // Pie de foto con marca
      ctx.fillStyle = '#1c1917';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(brandSettings.display_name || 'Karta', 500, 950);

      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `QR-${label.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 mb-2 border border-orange-200">
            <QrCode className="h-3.5 w-3.5 text-orange-600" />
            Códigos QR Unificados
          </div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900">
            Centro de Códigos QR Opacos y Revocables
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Genera códigos QR de alta resolución con tokens criptográficos de 256 bits, descarga para impresión en sala o revoca de inmediato.
          </p>
        </div>

        <button
          onClick={() => setIsGenerateModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md shadow-orange-600/20 transition self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Generar Nuevo Código QR
        </button>
      </div>

      {/* Lista de Códigos QR */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-stone-400">Cargando códigos QR...</div>
      ) : qrList.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-stone-200 space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <QrCode className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-stone-800">No hay códigos QR en esta sucursal</p>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Genera un código QR para que tus comensales exploren la carta digital desde su smartphone sin descargar ninguna app.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {qrList.map((qr) => {
            const publicUrl = `${window.location.origin}/q/${qr.qr_token}`;
            const isCopied = copiedToken === qr.qr_token;

            return (
              <div
                key={qr.id}
                className={`bg-white rounded-3xl border p-5 shadow-xs transition flex flex-col justify-between ${
                  qr.is_active
                    ? 'border-stone-200/90 hover:border-orange-200'
                    : 'border-stone-200/60 bg-stone-50/70 opacity-70'
                }`}
              >
                <div>
                  {/* Badges de Estado y Tipo */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                      {qr.target_type === 'BRANCH_MENU'
                        ? 'Menú de Sede'
                        : qr.target_type === 'DINING_TABLE'
                          ? 'Mesa de Salón'
                          : 'Carta General'}
                    </span>

                    {qr.is_active ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Activo
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-stone-500 bg-stone-200 px-2 py-0.5 rounded-full">
                        Revocado
                      </span>
                    )}
                  </div>

                  {/* Render del Código QR */}
                  <div className="flex flex-col items-center justify-center py-2 bg-stone-50/60 rounded-2xl border border-stone-100 p-4">
                    <QRCodeSVG
                      id={`qr-svg-${qr.qr_token}`}
                      value={publicUrl}
                      size={160}
                      level="H"
                      includeMargin={true}
                      fgColor={qr.is_active ? '#1c1917' : '#78716c'}
                    />
                    <span className="text-xs font-black text-stone-900 mt-2 truncate max-w-[200px]">
                      {qr.label}
                    </span>
                    <span className="text-[10px] font-mono text-stone-400 mt-0.5 truncate max-w-[200px]">
                      /q/{qr.qr_token.slice(0, 12)}...
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="space-y-2 mt-4 pt-3 border-t border-stone-100">
                  {qr.is_active ? (
                    <>
                      {/* Botón Copiar Enlace */}
                      <button
                        onClick={() => handleCopyLink(qr.qr_token)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 transition"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-700">¡Enlace Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-stone-500" />
                            <span>Copiar Enlace Público</span>
                          </>
                        )}
                      </button>

                      {/* Descarga PNG / SVG */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleDownloadPng(qr.qr_token, qr.label)}
                          className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 transition"
                        >
                          <Download className="h-3 w-3" />
                          Descargar PNG
                        </button>
                        <button
                          onClick={() => handleDownloadSvg(qr.qr_token, qr.label)}
                          className="flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold bg-stone-100 hover:bg-stone-200 text-stone-800 transition"
                        >
                          <Download className="h-3 w-3" />
                          Descargar SVG
                        </button>
                      </div>

                      {/* Revocar QR */}
                      <div className="pt-1">
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `¿Revocar el código QR "${qr.label}"? Quienes lo escaneen verán aviso de QR revocado.`,
                              )
                            ) {
                              revokeQrMutation.mutate({
                                qrId: qr.id,
                                replaceWithNew: false,
                              });
                            }
                          }}
                          className="w-full text-center text-[10px] font-bold text-rose-600 hover:text-rose-700 py-1 transition"
                        >
                          Revocar código QR
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-2 space-y-2">
                      <p className="text-[11px] text-stone-400">
                        Revocado el {qr.revoked_at ? new Date(qr.revoked_at).toLocaleDateString() : 'recientemente'}
                      </p>
                      <button
                        onClick={() =>
                          revokeQrMutation.mutate({
                            qrId: qr.id,
                            replaceWithNew: true,
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:underline"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Regenerar con nuevo token
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Generar Nuevo Código QR */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-stone-200/90 shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/70">
              <h3 className="text-base font-extrabold text-stone-900">Generar Código QR Unificado</h3>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newLabel.trim()) return;
                createQrMutation.mutate({
                  target_type: newTargetType,
                  label: newLabel.trim(),
                });
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Tipo de Destino *
                </label>
                <select
                  value={newTargetType}
                  onChange={(e) => setNewTargetType(e.target.value as any)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="BRANCH_MENU">Carta Digital de la Sucursal</option>
                  <option value="GENERAL_MENU">Carta General de la Marca</option>
                  <option value="DINING_TABLE">Mesa de Salón (Requiere Salón)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Etiqueta Identificadora *
                </label>
                <input
                  type="text"
                  required
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ej. Barra Principal, Mesa 12, Vitrina Exterior..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200 text-[11px] text-orange-800">
                El sistema generará un token opaco y seguro de 256 bits (`base64url`), garantizando que nadie pueda manipular URLs ni saltar entre mesas.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createQrMutation.isPending}
                  className="px-5 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {createQrMutation.isPending ? 'Generando...' : 'Crear Código QR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
