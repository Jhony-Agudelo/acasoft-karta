import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { useBrandStore } from '../../stores/brand.store';
import { QRCodeSVG } from 'qrcode.react';
import {
  UtensilsCrossed,
  Layers,
  Plus,
  Trash2,
  Edit2,
  QrCode,
  Printer,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';

interface AreaItem {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  tables?: Array<{ id: string; code: string }>;
}

interface TableAdminItem {
  id: string;
  code: string;
  capacity: number;
  status: string;
  is_active: boolean;
  area_id: string;
  area?: { id: string; name: string };
  qr_code?: { qr_token: string; label: string } | null;
}

export const DiningAdminSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId } = useAuthStore();
  const { settings } = useBrandStore();

  const [activeTab, setActiveTab] = useState<'AREAS' | 'TABLES' | 'QR_STANDS'>('TABLES');

  // Modal de Área
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<AreaItem | null>(null);
  const [areaName, setAreaName] = useState('');
  const [areaSortOrder, setAreaSortOrder] = useState<number>(0);

  // Modal de Mesa
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableAdminItem | null>(null);
  const [tableCode, setTableCode] = useState('');
  const [tableCapacity, setTableCapacity] = useState<number>(4);
  const [tableAreaId, setTableAreaId] = useState('');

  // Stand de QR seleccionado para imprimir
  const [standToPrint, setStandToPrint] = useState<TableAdminItem | null>(null);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  // 1. Cargar Áreas
  const { data: areas = [], isLoading: isLoadingAreas } = useQuery<AreaItem[]>({
    queryKey: ['dining-admin-areas', currentBranchId],
    queryFn: () => apiClient.get(`/admin/branches/${currentBranchId}/dining-areas`),
    enabled: !!currentBranchId,
  });

  // 2. Cargar Mesas
  const { data: tables = [], isLoading: isLoadingTables } = useQuery<TableAdminItem[]>({
    queryKey: ['dining-admin-tables', currentBranchId],
    queryFn: () => apiClient.get(`/admin/branches/${currentBranchId}/tables`),
    enabled: !!currentBranchId,
  });

  // Mutaciones de Área
  const saveAreaMutation = useMutation({
    mutationFn: (data: { name: string; sort_order: number }) => {
      if (editingArea) {
        return apiClient.patch(
          `/admin/branches/${currentBranchId}/dining-areas/${editingArea.id}`,
          data,
        );
      }
      return apiClient.post(`/admin/branches/${currentBranchId}/dining-areas`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dining-admin-areas', currentBranchId] });
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      showFeedback('success', `Área ${editingArea ? 'actualizada' : 'creada'} correctamente.`);
      setIsAreaModalOpen(false);
      setEditingArea(null);
    },
    onError: (err: any) => {
      showFeedback('error', err?.response?.data?.message || err?.message || 'Error al guardar área.');
    },
  });

  const deleteAreaMutation = useMutation({
    mutationFn: (areaId: string) =>
      apiClient.delete(`/admin/branches/${currentBranchId}/dining-areas/${areaId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dining-admin-areas', currentBranchId] });
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      showFeedback('success', 'Área eliminada o desactivada.');
    },
    onError: (err: any) => {
      showFeedback('error', err?.response?.data?.message || err?.message || 'Error al eliminar área.');
    },
  });

  // Mutaciones de Mesa
  const saveTableMutation = useMutation({
    mutationFn: (data: { code: string; capacity: number; area_id: string }) => {
      if (editingTable) {
        return apiClient.patch(
          `/admin/branches/${currentBranchId}/tables/${editingTable.id}`,
          data,
        );
      }
      return apiClient.post(`/admin/branches/${currentBranchId}/tables`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dining-admin-tables', currentBranchId] });
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      showFeedback('success', `Mesa ${editingTable ? 'actualizada' : 'creada'} correctamente con código QR.`);
      setIsTableModalOpen(false);
      setEditingTable(null);
    },
    onError: (err: any) => {
      showFeedback('error', err?.response?.data?.message || err?.message || 'Error al guardar mesa.');
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: (tableId: string) =>
      apiClient.delete(`/admin/branches/${currentBranchId}/tables/${tableId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dining-admin-tables', currentBranchId] });
      queryClient.invalidateQueries({ queryKey: ['dining-table-plan'] });
      showFeedback('success', 'Mesa eliminada correctamente.');
    },
    onError: (err: any) => {
      showFeedback('error', err?.response?.data?.message || err?.message || 'Error al eliminar mesa.');
    },
  });

  const openCreateArea = () => {
    setEditingArea(null);
    setAreaName('');
    setAreaSortOrder(areas.length + 1);
    setIsAreaModalOpen(true);
  };

  const openEditArea = (area: AreaItem) => {
    setEditingArea(area);
    setAreaName(area.name);
    setAreaSortOrder(area.sort_order);
    setIsAreaModalOpen(true);
  };

  const openCreateTable = () => {
    setEditingTable(null);
    setTableCode(`M-${String(tables.length + 1).padStart(2, '0')}`);
    setTableCapacity(4);
    setTableAreaId(areas[0]?.id || '');
    setIsTableModalOpen(true);
  };

  const openEditTable = (table: TableAdminItem) => {
    setEditingTable(table);
    setTableCode(table.code);
    setTableCapacity(table.capacity);
    setTableAreaId(table.area_id);
    setIsTableModalOpen(true);
  };

  const handlePrintTableStand = (table: TableAdminItem) => {
    setStandToPrint(table);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">
            Gestión de Salón, Mesas y Portamesas QR
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Configura las zonas físicas del restaurante, añade mesas con capacidad y descarga los códigos QR para pedidos en mesa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'AREAS' && (
            <button
              onClick={openCreateArea}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Nueva Área</span>
            </button>
          )}

          {activeTab === 'TABLES' && (
            <button
              onClick={openCreateTable}
              disabled={areas.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>Nueva Mesa</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200">
        <button
          onClick={() => setActiveTab('TABLES')}
          className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'TABLES'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <UtensilsCrossed className="h-4 w-4" />
          <span>Mesas del Salón ({tables.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('AREAS')}
          className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'AREAS'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Áreas y Ambientes ({areas.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('QR_STANDS')}
          className={`pb-3 px-4 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'QR_STANDS'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <QrCode className="h-4 w-4" />
          <span>Portamesas y Códigos QR ({tables.length})</span>
        </button>
      </div>

      {/* TAB 1: MESAS */}
      {activeTab === 'TABLES' && (
        <div className="space-y-4">
          {areas.length === 0 ? (
            <div className="p-8 rounded-3xl bg-amber-50 border border-amber-200 text-center space-y-3">
              <Layers className="h-10 w-10 text-amber-600 mx-auto" />
              <h3 className="font-extrabold text-amber-900 text-sm">
                Primero crea un Área de Salón
              </h3>
              <p className="text-xs text-amber-700 max-w-md mx-auto">
                Para registrar mesas debes tener al menos un área o ambiente configurado (ej. "Salón Principal", "Terraza", "Barra").
              </p>
              <button
                onClick={openCreateArea}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
              >
                <Plus className="h-4 w-4" />
                <span>Crear Primera Área</span>
              </button>
            </div>
          ) : tables.length === 0 ? (
            <div className="p-12 rounded-3xl bg-white border border-stone-200 text-center space-y-3">
              <UtensilsCrossed className="h-10 w-10 text-stone-300 mx-auto" />
              <h3 className="font-extrabold text-stone-800 text-sm">
                No hay mesas registradas en esta sucursal
              </h3>
              <p className="text-xs text-stone-400">
                Haz clic en "Nueva Mesa" para registrar la primera mesa física y generar su QR de mesa.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {tables.map((table) => {
                const area = areas.find((a) => a.id === table.area_id);
                return (
                  <div
                    key={table.id}
                    className="p-4 rounded-3xl bg-white border border-stone-200/90 shadow-xs flex flex-col justify-between hover:shadow-md transition"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="h-10 w-10 rounded-2xl bg-orange-50 text-orange-600 border border-orange-200 font-black text-sm flex items-center justify-center">
                          {table.code}
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            table.status === 'FREE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : table.status === 'OCCUPIED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-violet-100 text-violet-800'
                          }`}
                        >
                          {table.status}
                        </span>
                      </div>

                      <div className="mt-3 space-y-0.5">
                        <h4 className="font-extrabold text-stone-900 text-sm">
                          Mesa {table.code}
                        </h4>
                        <p className="text-xs text-stone-500">
                          Zona: <span className="font-semibold text-stone-800">{area?.name || 'General'}</span>
                        </p>
                        <p className="text-xs text-stone-500">
                          Capacidad: <span className="font-semibold text-stone-800">{table.capacity} personas</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                      <button
                        onClick={() => handlePrintTableStand(table)}
                        className="text-[11px] font-bold text-orange-600 hover:underline flex items-center gap-1"
                        title="Ver Portamesa QR"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        <span>Portamesa</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditTable(table)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition"
                          title="Editar"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Eliminar la mesa ${table.code}?`)) {
                              deleteTableMutation.mutate(table.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ÁREAS */}
      {activeTab === 'AREAS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {areas.map((area) => (
              <div
                key={area.id}
                className="p-5 rounded-3xl bg-white border border-stone-200/90 shadow-xs flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
                      Orden #{area.sort_order}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditArea(area)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Eliminar el área "${area.name}"?`)) {
                            deleteAreaMutation.mutate(area.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <h4 className="font-extrabold text-stone-900 text-base">
                    {area.name}
                  </h4>
                  <p className="text-xs text-stone-500">
                    Mesas asignadas: <span className="font-bold text-stone-800">{tables.filter((t) => t.area_id === area.id).length}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: PORTAMESAS Y CÓDIGOS QR */}
      {activeTab === 'QR_STANDS' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              Cada código QR está vinculado de forma opaca y segura a la mesa correspondiente. Al escanearlo, el comensal ve el menú digital y puede enviar pedidos directamente al mesero.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {tables.map((table) => {
              const qrToken = table.qr_code?.qr_token || 'demo-qr-token';
              const qrUrl = `${window.location.origin}/q/${qrToken}`;

              return (
                <div
                  key={table.id}
                  className="p-6 rounded-3xl bg-white border border-stone-200/90 shadow-md text-center space-y-4 hover:shadow-lg transition"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-600">
                      {settings.display_name || 'Karta Bistro'}
                    </span>
                    <h3 className="text-xl font-black text-stone-900">
                      Mesa {table.code}
                    </h3>
                    <p className="text-[11px] text-stone-500">
                      Escanea para ver la carta y pedir
                    </p>
                  </div>

                  {/* QR SVG */}
                  <div className="p-4 bg-white rounded-2xl border border-stone-200 inline-block shadow-inner">
                    <QRCodeSVG
                      value={qrUrl}
                      size={140}
                      level="H"
                      includeMargin={false}
                    />
                  </div>

                  <div className="space-y-1 text-[11px] text-stone-400 font-mono truncate px-2">
                    {qrUrl}
                  </div>

                  <button
                    onClick={() => handlePrintTableStand(table)}
                    className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-2"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Imprimir Portamesa</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR ÁREA */}
      {isAreaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50">
              <h3 className="font-extrabold text-stone-900 text-sm">
                {editingArea ? 'Editar Área' : 'Nueva Área de Salón'}
              </h3>
              <button
                onClick={() => setIsAreaModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveAreaMutation.mutate({
                  name: areaName.trim(),
                  sort_order: areaSortOrder,
                });
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 block">
                  Nombre del Área:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Terraza, Barra, Salón Principal..."
                  value={areaName}
                  onChange={(e) => setAreaName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 block">
                  Orden de Visualización:
                </label>
                <input
                  type="number"
                  min={0}
                  value={areaSortOrder}
                  onChange={(e) => setAreaSortOrder(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAreaModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveAreaMutation.isPending || !areaName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
                >
                  {saveAreaMutation.isPending ? 'Guardando...' : 'Guardar Área'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR MESA */}
      {isTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-stone-200 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50">
              <h3 className="font-extrabold text-stone-900 text-sm">
                {editingTable ? 'Editar Mesa' : 'Nueva Mesa de Salón'}
              </h3>
              <button
                onClick={() => setIsTableModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveTableMutation.mutate({
                  code: tableCode.trim(),
                  capacity: tableCapacity,
                  area_id: tableAreaId,
                });
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 block">
                  Código de la Mesa (único en sucursal):
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. M-01, Barra-02, T-05..."
                  value={tableCode}
                  onChange={(e) => setTableCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 block">
                  Área / Zona:
                </label>
                <select
                  required
                  value={tableAreaId}
                  onChange={(e) => setTableAreaId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 block">
                  Capacidad de Comensales:
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(parseInt(e.target.value) || 4)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-stone-50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTableModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveTableMutation.isPending || !tableCode.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
                >
                  {saveTableMutation.isPending ? 'Guardando...' : 'Guardar Mesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
