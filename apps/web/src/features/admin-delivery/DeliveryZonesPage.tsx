import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  Clock,
  DollarSign,
  ShieldCheck,
  CheckCircle,
  X,
  Search,
} from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { useAuthStore } from '../../stores/auth.store';

interface DeliveryZone {
  id: string;
  name: string;
  polygon_or_neighborhoods_json: string[] | any;
  delivery_fee_cop: number;
  min_order_cop: number;
  estimated_minutes_min: number;
  estimated_minutes_max: number;
  is_active: boolean;
  created_at: string;
}

export const DeliveryZonesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentBranchId } = useAuthStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [deliveryFeeCop, setDeliveryFeeCop] = useState(4000);
  const [minOrderCop, setMinOrderCop] = useState(20000);
  const [estimatedMinutesMin, setEstimatedMinutesMin] = useState(30);
  const [estimatedMinutesMax, setEstimatedMinutesMax] = useState(50);
  const [neighborhoodsInput, setNeighborhoodsInput] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Cargar zonas
  const { data: zones = [], isLoading } = useQuery<DeliveryZone[]>({
    queryKey: ['delivery-zones-admin', currentBranchId],
    queryFn: () => apiClient.get(`/admin/branches/${currentBranchId}/delivery-zones`),
    enabled: !!currentBranchId,
  });

  const openCreateModal = () => {
    setEditingZone(null);
    setName('');
    setDeliveryFeeCop(4000);
    setMinOrderCop(20000);
    setEstimatedMinutesMin(30);
    setEstimatedMinutesMax(50);
    setNeighborhoodsInput('Centro, Chapinero, Usaquén');
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setName(zone.name);
    setDeliveryFeeCop(zone.delivery_fee_cop);
    setMinOrderCop(zone.min_order_cop);
    setEstimatedMinutesMin(zone.estimated_minutes_min);
    setEstimatedMinutesMax(zone.estimated_minutes_max);
    const nList = Array.isArray(zone.polygon_or_neighborhoods_json)
      ? zone.polygon_or_neighborhoods_json.join(', ')
      : '';
    setNeighborhoodsInput(nList);
    setIsActive(zone.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Mutación Crear/Editar
  const saveMutation = useMutation({
    mutationFn: async () => {
      const neighborhoods = neighborhoodsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: name.trim(),
        polygon_or_neighborhoods_json: neighborhoods.length > 0 ? neighborhoods : [name.trim()],
        delivery_fee_cop: deliveryFeeCop,
        min_order_cop: minOrderCop,
        estimated_minutes_min: estimatedMinutesMin,
        estimated_minutes_max: estimatedMinutesMax,
        is_active: isActive,
      };

      if (editingZone) {
        return apiClient.patch(
          `/admin/branches/${currentBranchId}/delivery-zones/${editingZone.id}`,
          payload,
        );
      } else {
        return apiClient.post(
          `/admin/branches/${currentBranchId}/delivery-zones`,
          payload,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-zones-admin', currentBranchId] });
      setIsModalOpen(false);
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || err?.message || 'Error al guardar la zona.');
    },
  });

  // Mutación Eliminar
  const deleteMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      return apiClient.delete(`/admin/branches/${currentBranchId}/delivery-zones/${zoneId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-zones-admin', currentBranchId] });
    },
  });

  const handleDelete = (zone: DeliveryZone) => {
    if (confirm(`¿Estás seguro de eliminar la zona '${zone.name}'?`)) {
      deleteMutation.mutate(zone.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <MapPin className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-black text-stone-900">Zonas de Domicilio & Cobertura</h1>
          </div>
          <p className="text-xs text-stone-500 max-w-xl">
            Configura las tarifas de despacho, barrios cubiertos y montos mínimos de pedido por zona para tu sucursal.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md shadow-orange-600/25 transition transform active:scale-98"
        >
          <Plus className="h-4 w-4" />
          <span>Nueva Zona</span>
        </button>
      </div>

      {/* Lista de Zonas */}
      {isLoading ? (
        <div className="p-12 text-center text-xs font-bold text-stone-400">
          Cargando zonas de cobertura...
        </div>
      ) : zones.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-stone-200/80 shadow-xs space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
            <MapPin className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-black text-stone-800">No hay zonas de domicilio configuradas</h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Agrega zonas para que tus comensales puedan calcular automáticamente su costo de despacho en el checkout.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-200 font-bold text-xs hover:bg-orange-100 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Crear primera zona</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {zones.map((zone) => {
            const neighborhoods = Array.isArray(zone.polygon_or_neighborhoods_json)
              ? zone.polygon_or_neighborhoods_json
              : [];

            return (
              <div
                key={zone.id}
                className="bg-white rounded-3xl p-5 border border-stone-200/90 shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md transition"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-sm text-stone-900">{zone.name}</h3>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mt-1 ${
                          zone.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-stone-100 text-stone-500 border border-stone-200'
                        }`}
                      >
                        {zone.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(zone)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition"
                        title="Editar"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(zone)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Tarifas y Tiempos */}
                  <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-2xl bg-stone-50 border border-stone-100">
                    <div>
                      <span className="text-[10px] text-stone-400 block font-semibold">Tarifa Despacho</span>
                      <span className="font-black text-stone-900 font-mono">
                        ${zone.delivery_fee_cop.toLocaleString('es-CO')} COP
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block font-semibold">Pedido Mínimo</span>
                      <span className="font-black text-stone-900 font-mono">
                        ${zone.min_order_cop.toLocaleString('es-CO')} COP
                      </span>
                    </div>
                  </div>

                  {/* Tiempo Estimado */}
                  <div className="flex items-center gap-1.5 text-xs text-stone-600">
                    <Clock className="h-3.5 w-3.5 text-orange-600" />
                    <span>
                      {zone.estimated_minutes_min} a {zone.estimated_minutes_max} minutos de entrega
                    </span>
                  </div>

                  {/* Barrios */}
                  {neighborhoods.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                        Barrios Cubiertos:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {neighborhoods.map((n: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 text-[10px] font-medium"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-5 animate-slide-up">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-extrabold text-stone-900 text-sm">
                {editingZone ? 'Editar Zona de Cobertura' : 'Nueva Zona de Cobertura'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
              className="space-y-4 text-xs"
            >
              <div className="space-y-1">
                <label className="font-bold text-stone-700">Nombre de la Zona</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Zona Centro / Rosales"
                  required
                  className="w-full rounded-xl border border-stone-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-stone-700">Tarifa Domicilio (COP)</label>
                  <input
                    type="number"
                    value={deliveryFeeCop}
                    onChange={(e) => setDeliveryFeeCop(Number(e.target.value))}
                    min={0}
                    step={500}
                    required
                    className="w-full rounded-xl border border-stone-300 p-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-stone-700">Pedido Mínimo (COP)</label>
                  <input
                    type="number"
                    value={minOrderCop}
                    onChange={(e) => setMinOrderCop(Number(e.target.value))}
                    min={0}
                    step={1000}
                    required
                    className="w-full rounded-xl border border-stone-300 p-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-stone-700">Tiempo Mínimo (min)</label>
                  <input
                    type="number"
                    value={estimatedMinutesMin}
                    onChange={(e) => setEstimatedMinutesMin(Number(e.target.value))}
                    min={5}
                    required
                    className="w-full rounded-xl border border-stone-300 p-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-stone-700">Tiempo Máximo (min)</label>
                  <input
                    type="number"
                    value={estimatedMinutesMax}
                    onChange={(e) => setEstimatedMinutesMax(Number(e.target.value))}
                    min={estimatedMinutesMin}
                    required
                    className="w-full rounded-xl border border-stone-300 p-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-stone-700">
                  Barrios Cubiertos (separados por coma)
                </label>
                <textarea
                  rows={2}
                  value={neighborhoodsInput}
                  onChange={(e) => setNeighborhoodsInput(e.target.value)}
                  placeholder="Centro, La Macarena, San Diego..."
                  className="w-full rounded-xl border border-stone-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1 font-bold text-stone-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                />
                <span>Zona Activa para recibir pedidos</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 font-bold hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold shadow-sm"
                >
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar Zona'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
