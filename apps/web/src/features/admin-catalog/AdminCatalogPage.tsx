import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { BulkImportModal } from './BulkImportModal';
import {
  BookOpen,
  Plus,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  Tag,
  Flame,
  ChevronDown,
  ChevronUp,
  X,
  Edit2,
  Trash2,
  Power,
  Layers,
  Sparkles,
} from 'lucide-react';

interface CategoryItem {
  id: string;
  name: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
}

interface ProductItem {
  id: string;
  category_id: string;
  category?: CategoryItem;
  name: string;
  description?: string | null;
  image_url?: string | null;
  price_cop: number;
  status: 'ACTIVE' | 'OUT_OF_STOCK' | 'ARCHIVED';
  allergen_tags: string[];
  variants?: Array<{ id: string; name: string; price_cop: number; status: string }>;
  modifier_groups?: Array<any>;
}

export const AdminCatalogPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Estados locales
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);

  // Formulario de Producto Rápido
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState<number | ''>('');
  const [newProductCategoryId, setNewProductCategoryId] = useState<string>('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductImageUrl, setNewProductImageUrl] = useState('');
  const [showAdvancedProductFields, setShowAdvancedProductFields] = useState(false);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);

  // Formulario de Nueva Categoría
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');

  // Mensajes de feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Queries
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery<CategoryItem[]>({
    queryKey: ['admin-categories'],
    queryFn: () => apiClient.get('/admin/categories'),
  });

  const { data: products = [], isLoading: isLoadingProducts } = useQuery<ProductItem[]>({
    queryKey: ['admin-products'],
    queryFn: () => apiClient.get('/admin/products'),
  });

  // Mutación: Alternar disponibilidad en 1 toque (con actualización optimista)
  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ productId, status }: { productId: string; status: 'ACTIVE' | 'OUT_OF_STOCK' }) =>
      apiClient.patch(`/admin/products/${productId}/availability`, { status }),
    onMutate: async ({ productId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-products'] });
      const previousProducts = queryClient.getQueryData<ProductItem[]>(['admin-products']);

      queryClient.setQueryData<ProductItem[]>(['admin-products'], (old = []) =>
        old.map((p) => (p.id === productId ? { ...p, status } : p)),
      );

      return { previousProducts };
    },
    onError: (err, variables, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(['admin-products'], context.previousProducts);
      }
      showFeedback('error', 'Error al actualizar disponibilidad.');
    },
    onSuccess: (_, variables) => {
      showFeedback(
        'success',
        variables.status === 'ACTIVE'
          ? 'Producto marcado como Disponible.'
          : 'Producto marcado como Agotado Hoy (OUT_OF_STOCK).',
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
  });

  // Mutación: Crear Producto
  const createProductMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post('/admin/products', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setIsCreateProductModalOpen(false);
      resetProductForm();
      showFeedback('success', 'Producto agregado con éxito.');
    },
    onError: (err: any) => {
      showFeedback('error', err.message || 'Error al crear el producto.');
    },
  });

  // Mutación: Actualizar Producto
  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.patch(`/admin/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setEditingProduct(null);
      resetProductForm();
      showFeedback('success', 'Producto actualizado con éxito.');
    },
    onError: (err: any) => {
      showFeedback('error', err.message || 'Error al actualizar el producto.');
    },
  });

  // Mutación: Archivar Producto
  const archiveProductMutation = useMutation({
    mutationFn: (productId: string) =>
      apiClient.patch(`/admin/products/${productId}`, { status: 'ARCHIVED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      showFeedback('success', 'Producto archivado correctamente.');
    },
    onError: () => {
      showFeedback('error', 'Error al archivar el producto.');
    },
  });

  // Mutación: Crear Categoría
  const createCategoryMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post('/admin/categories', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      setIsCategoryModalOpen(false);
      setNewCategoryName('');
      setNewCategoryDescription('');
      showFeedback('success', 'Categoría creada con éxito.');
    },
    onError: (err: any) => {
      showFeedback('error', err.message || 'Error al crear la categoría.');
    },
  });

  const resetProductForm = () => {
    setNewProductName('');
    setNewProductPrice('');
    setNewProductDescription('');
    setNewProductImageUrl('');
    setSelectedAllergens([]);
    setShowAdvancedProductFields(false);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName || typeof newProductPrice !== 'number' || !newProductCategoryId) {
      showFeedback('error', 'Completa los campos obligatorios: Nombre, Precio y Categoría.');
      return;
    }

    const payload = {
      category_id: newProductCategoryId,
      name: newProductName,
      price_cop: newProductPrice,
      description: newProductDescription.trim() || undefined,
      image_url: newProductImageUrl.trim() || undefined,
      allergen_tags: selectedAllergens,
    };

    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: payload });
    } else {
      createProductMutation.mutate(payload);
    }
  };

  const startEditProduct = (prod: ProductItem) => {
    setEditingProduct(prod);
    setNewProductName(prod.name);
    setNewProductPrice(prod.price_cop);
    setNewProductCategoryId(prod.category_id);
    setNewProductDescription(prod.description || '');
    setNewProductImageUrl(prod.image_url || '');
    setSelectedAllergens(prod.allergen_tags || []);
    setShowAdvancedProductFields(true);
    setIsCreateProductModalOpen(true);
  };

  // Filtrado de productos
  const filteredProducts = products.filter((p) => {
    if (p.status === 'ARCHIVED') return false;
    if (selectedCategoryId && p.category_id !== selectedCategoryId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q);
      return matchName || matchDesc;
    }
    return true;
  });

  const ALLERGEN_OPTIONS = [
    'Gluten',
    'Lácteos',
    'Huevos',
    'Maní / Frutos Secos',
    'Mariscos',
    'Soya',
    'Picante',
    'Vegetariano',
    'Vegano',
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg border text-xs font-bold animate-slide-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 mb-2 border border-orange-200">
            <BookOpen className="h-3.5 w-3.5 text-orange-600" />
            Catálogo & Menú Digital
          </div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900">
            Gestión de Menú y Disponibilidad
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Crea platos en 15 segundos, alterna disponibilidad en un toque o importa masivamente tu carta.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold shadow-xs transition"
          >
            <Upload className="h-4 w-4 text-stone-500" />
            Importar Menú (CSV/Pegado)
          </button>

          <button
            onClick={() => {
              setEditingProduct(null);
              resetProductForm();
              if (categories.length > 0 && !newProductCategoryId) {
                setNewProductCategoryId(categories[0]!.id);
              }
              setIsCreateProductModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md shadow-orange-600/20 transition"
          >
            <Plus className="h-4 w-4" />
            Nuevo Plato Rápido
          </button>
        </div>
      </div>

      {/* Barra de Filtros & Categorías */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
        {/* Pills de Categorías */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedCategoryId === null
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            Todas ({products.filter((p) => p.status !== 'ARCHIVED').length})
          </button>

          {categories.map((c) => {
            const count = products.filter(
              (p) => p.category_id === c.id && p.status !== 'ARCHIVED',
            ).length;
            const active = selectedCategoryId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCategoryId(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                  active
                    ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <span>{c.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-200/60 font-semibold text-stone-600">
                  {count}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-orange-600 hover:bg-orange-50 transition border border-dashed border-orange-200 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" />
            Nueva Categoría
          </button>
        </div>

        {/* Buscador */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-stone-200 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Grid de Productos */}
      {isLoadingProducts || isLoadingCategories ? (
        <div className="p-12 text-center text-xs text-stone-400">Cargando menú...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-stone-200 space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <BookOpen className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-stone-800">No hay platos en esta vista</p>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Crea tu primer plato con el botón rápido o usa el importador masivo desde Excel / WhatsApp.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((prod) => {
            const isAvailable = prod.status === 'ACTIVE';
            return (
              <div
                key={prod.id}
                className={`bg-white rounded-2xl border p-4 shadow-xs transition flex flex-col justify-between ${
                  isAvailable
                    ? 'border-stone-200/90 hover:border-orange-200'
                    : 'border-stone-200/60 bg-stone-50/60 opacity-80'
                }`}
              >
                <div>
                  {/* Fila superior: Categoría + Switch 1 toque */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">
                      {prod.category?.name ||
                        categories.find((c) => c.id === prod.category_id)?.name ||
                        'Plato'}
                    </span>

                    {/* Switch Instantáneo de Disponibilidad */}
                    <button
                      type="button"
                      onClick={() =>
                        toggleAvailabilityMutation.mutate({
                          productId: prod.id,
                          status: isAvailable ? 'OUT_OF_STOCK' : 'ACTIVE',
                        })
                      }
                      title={isAvailable ? 'Marcar como Agotado Hoy' : 'Marcar como Disponible'}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition shadow-2xs ${
                        isAvailable
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      {isAvailable ? 'Disponible' : 'Agotado Hoy'}
                    </button>
                  </div>

                  {/* Nombre y Precio */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3
                        className={`text-sm font-bold truncate max-w-[200px] ${
                          isAvailable ? 'text-stone-900' : 'text-stone-500 line-through'
                        }`}
                      >
                        {prod.name}
                      </h3>
                      {prod.description && (
                        <p className="text-[11px] text-stone-500 line-clamp-2 mt-0.5">
                          {prod.description}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-extrabold text-stone-900 whitespace-nowrap">
                      ${prod.price_cop.toLocaleString('es-CO')}
                    </span>
                  </div>

                  {/* Tags de Alérgenos */}
                  {prod.allergen_tags && prod.allergen_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {prod.allergen_tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] font-medium bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Acciones de Edición & Archivar */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-stone-100 text-xs">
                  <span className="text-[10px] text-stone-400">COP (Entero exacto)</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => startEditProduct(prod)}
                      className="p-1 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition"
                      title="Editar plato"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Archivar el plato "${prod.name}"? Desaparecerá de la carta pública.`)) {
                          archiveProductMutation.mutate(prod.id);
                        }
                      }}
                      className="p-1 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Archivar plato"
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

      {/* MODAL: Crear / Editar Producto */}
      {isCreateProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-stone-200/90 shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/70">
              <h3 className="text-base font-extrabold text-stone-900">
                {editingProduct ? 'Editar Plato' : 'Creación Rápida de Plato (15 Segundos)'}
              </h3>
              <button
                onClick={() => setIsCreateProductModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Nombre del Plato *
                </label>
                <input
                  type="text"
                  required
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Ej. Hamburguesa Doble Carne, Ajiaco..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">
                    Precio ($ COP) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="100"
                    value={newProductPrice}
                    onChange={(e) =>
                      setNewProductPrice(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="25000"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">
                    Categoría *
                  </label>
                  <select
                    required
                    value={newProductCategoryId}
                    onChange={(e) => setNewProductCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Selecciona...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Acordeón Opcional: Descripción, Foto, Alérgenos */}
              <div className="pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowAdvancedProductFields(!showAdvancedProductFields)}
                  className="flex items-center justify-between w-full text-xs font-bold text-stone-600 hover:text-stone-900 py-1"
                >
                  <span>Opciones avanzadas (Foto, descripción y alérgenos)</span>
                  {showAdvancedProductFields ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {showAdvancedProductFields && (
                  <div className="space-y-3 pt-3">
                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1">
                        Descripción o ingredientes
                      </label>
                      <textarea
                        rows={2}
                        value={newProductDescription}
                        onChange={(e) => setNewProductDescription(e.target.value)}
                        placeholder="Breve detalle para antojar al comensal en la carta..."
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1">
                        URL de la Fotografía
                      </label>
                      <input
                        type="url"
                        value={newProductImageUrl}
                        onChange={(e) => setNewProductImageUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/..."
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1.5">
                        Alérgenos y Etiquetas Dietarias
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {ALLERGEN_OPTIONS.map((tag) => {
                          const active = selectedAllergens.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                if (active) {
                                  setSelectedAllergens(selectedAllergens.filter((t) => t !== tag));
                                } else {
                                  setSelectedAllergens([...selectedAllergens, tag]);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                                active
                                  ? 'bg-orange-600 text-white'
                                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsCreateProductModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createProductMutation.isPending || updateProductMutation.isPending}
                  className="px-6 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {editingProduct ? 'Guardar Cambios' : 'Crear Plato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Crear Categoría */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-stone-200/90 shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/70">
              <h3 className="text-base font-extrabold text-stone-900">Nueva Categoría de Carta</h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCategoryName.trim()) return;
                createCategoryMutation.mutate({
                  name: newCategoryName.trim(),
                  description: newCategoryDescription.trim() || undefined,
                  sort_order: categories.length + 1,
                });
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Nombre de la Categoría *
                </label>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Ej. Entradas, Pastas, Cocteles..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Descripción (opcional)
                </label>
                <input
                  type="text"
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  placeholder="Para compartir al centro de mesa..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createCategoryMutation.isPending}
                  className="px-5 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-md transition disabled:opacity-50"
                >
                  Guardar Categoría
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importación Masiva */}
      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
};
