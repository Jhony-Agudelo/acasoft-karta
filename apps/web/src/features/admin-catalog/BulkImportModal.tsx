import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { BulkProductImportSchema } from '@restaurante-saas/shared';
import { X, Upload, FileText, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRow {
  index: number;
  category_name: string;
  product_name: string;
  price_cop: number;
  description?: string;
  isValid: boolean;
  error?: string;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'paste' | 'file'>('paste');
  const [rawText, setRawText] = useState<string>(
    `Entradas | Empanadas de Carne (3 und) | 12000 | Con ají de la casa
Entradas | Papas Criollas Crocantes | 9000 | Con sal marina y guacamole
Platos Fuertes | Bandeja Paisa | 32000 | Con chicharrón carnudo y frijol
Platos Fuertes | Ajiaco Santafereño | 28000 | Con pollo desmechado, alcaparras y crema
Bebidas | Limonada de Coco | 8500 | Refrescante y cremosa
Bebidas | Jugo Natural en Agua | 7000 | Frutos rojos o maracuyá`,
  );
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [resultSummary, setResultSummary] = useState<{
    categoriesCount: number;
    productsCount: number;
  } | null>(null);

  // Parsea el texto cada vez que cambia
  React.useEffect(() => {
    if (!rawText.trim()) {
      setParsedRows([]);
      return;
    }

    const lines = rawText.split('\n');
    const rows: ParsedRow[] = [];

    lines.forEach((line, idx) => {
      const clean = line.trim();
      if (!clean || clean.startsWith('#')) return; // ignorar vacías y comentarios

      // Detectar separador: pipe '|', tabulador '\t', o coma ','
      let parts: string[];
      if (clean.includes('|')) {
        parts = clean.split('|').map((s) => s.trim());
      } else if (clean.includes('\t')) {
        parts = clean.split('\t').map((s) => s.trim());
      } else {
        parts = clean.split(',').map((s) => s.trim());
      }

      const category_name = parts[0] || '';
      const product_name = parts[1] || '';
      const rawPrice = (parts[2] || '').replace(/[$.]/g, '');
      const price_cop = parseInt(rawPrice, 10);
      const description = parts[3] || undefined;

      let isValid = true;
      let error: string | undefined = undefined;

      if (!category_name) {
        isValid = false;
        error = 'Categoría requerida';
      } else if (!product_name) {
        isValid = false;
        error = 'Nombre del producto requerido';
      } else if (isNaN(price_cop) || price_cop < 0) {
        isValid = false;
        error = 'Precio inválido en pesos COP';
      }

      rows.push({
        index: idx + 1,
        category_name,
        product_name,
        price_cop: isNaN(price_cop) ? 0 : price_cop,
        description,
        isValid,
        error,
      });
    });

    setParsedRows(rows);
  }, [rawText]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setRawText(content);
        setActiveTab('paste');
      }
    };
    reader.readAsText(file);
  };

  const importMutation = useMutation({
    mutationFn: (items: any[]) => apiClient.post('/admin/products/import', { items }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setResultSummary({
        categoriesCount: data.created_categories_count || 0,
        productsCount: data.created_products_count || 0,
      });
    },
  });

  const validRows = parsedRows.filter((r) => r.isValid);
  const invalidRows = parsedRows.filter((r) => !r.isValid);

  const handleExecuteImport = () => {
    if (validRows.length === 0) return;

    const payload = validRows.map((r) => ({
      category_name: r.category_name,
      product_name: r.product_name,
      price_cop: r.price_cop,
      description: r.description,
    }));

    // Validar lote completo con BulkProductImportSchema
    const validation = BulkProductImportSchema.safeParse(payload);
    if (!validation.success) {
      alert('Error de validación: ' + validation.error.issues[0]?.message);
      return;
    }

    importMutation.mutate(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-stone-200/90 shadow-2xl w-full max-w-3xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-100 text-orange-700">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">
                Importador Rápido de Menú
              </h3>
              <p className="text-[11px] text-stone-500">
                Carga hasta 300 platos en segundos pegando desde Excel, WhatsApp o subiendo un CSV.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {resultSummary ? (
            <div className="py-8 text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-lg font-black text-stone-900">¡Importación Exitosa!</h4>
                <p className="text-xs text-stone-600 mt-1">
                  Se crearon <strong>{resultSummary.categoriesCount}</strong> categorías y{' '}
                  <strong>{resultSummary.productsCount}</strong> platos listos en tu carta.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs hover:bg-orange-700 shadow-md transition"
              >
                Ver Menú Actualizado
              </button>
            </div>
          ) : (
            <>
              {/* Selector de modo */}
              <div className="flex gap-2 border-b border-stone-100 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    activeTab === 'paste'
                      ? 'bg-orange-50 text-orange-600 border border-orange-200'
                      : 'text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Pegar Texto / Tabla
                </button>
                <label
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                    activeTab === 'file'
                      ? 'bg-orange-50 text-orange-600 border border-orange-200'
                      : 'text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  Subir Archivo CSV
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Formato explicativo */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-[11px] text-stone-600 flex items-center justify-between">
                <span>
                  <strong>Formato por línea:</strong> Categoría | Nombre del plato | Precio en COP | Descripción (opcional)
                </span>
                <span className="text-[10px] text-stone-400">
                  Soporta separador pipe (|), coma (,) o tabulador de Excel
                </span>
              </div>

              {/* Textarea */}
              <div>
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Categoría | Plato | Precio | Descripción..."
                  className="w-full rounded-2xl border border-stone-200 p-3.5 text-xs font-mono text-stone-800 bg-stone-50/50 focus:bg-white focus:ring-2 focus:ring-orange-500 transition resize-none"
                />
              </div>

              {/* Vista previa de validación */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-stone-700">
                    Vista previa ({parsedRows.length} filas analizadas)
                  </span>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {validRows.length} Válidas
                    </span>
                    {invalidRows.length > 0 && (
                      <span className="text-rose-600 font-bold flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {invalidRows.length} Con error
                      </span>
                    )}
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto rounded-xl border border-stone-200 bg-white">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-stone-50 text-stone-500 font-bold uppercase text-[9px] border-b border-stone-100">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Categoría</th>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Precio COP</th>
                        <th className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {parsedRows.map((r) => (
                        <tr
                          key={r.index}
                          className={r.isValid ? 'hover:bg-stone-50/50' : 'bg-rose-50/30'}
                        >
                          <td className="px-3 py-2 font-mono text-stone-400">{r.index}</td>
                          <td className="px-3 py-2 font-semibold text-stone-800 truncate max-w-[120px]">
                            {r.category_name || '—'}
                          </td>
                          <td className="px-3 py-2 text-stone-900 font-medium truncate max-w-[180px]">
                            {r.product_name || '—'}
                          </td>
                          <td className="px-3 py-2 font-bold text-stone-900">
                            ${r.price_cop.toLocaleString('es-CO')}
                          </td>
                          <td className="px-3 py-2">
                            {r.isValid ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Correcto
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                title={r.error}
                              >
                                {r.error}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Botones */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-stone-500">
                  Hereda el modo tributario y tasa por defecto de tu restaurante.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-stone-600 text-xs font-bold hover:bg-stone-100 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={validRows.length === 0 || importMutation.isPending}
                    className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition disabled:opacity-50"
                  >
                    <span>
                      {importMutation.isPending
                        ? 'Importando...'
                        : `Importar ${validRows.length} Platos`}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
