import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Layers,
  Edit2,
  Trash2,
  Copy,
  Star,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
  ArrowUpDown,
  SlidersHorizontal,
  ExternalLink,
  DollarSign,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { Product, ProductCategory, ProductFilterParams } from '../../types/product';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { ProductFormModal } from './ProductFormModal';
import { CategoryModal } from './CategoryModal';
import { ConfirmModal } from '../common/ConfirmModal';
import { useBackHandler } from '../../services/navigationManager';
import { formatProductAvailabilitySummary } from '../../utils/productAvailability';

interface ProductManagerProps {
  tenant: Tenant;
}

export const ProductManager: React.FC<ProductManagerProps> = ({ tenant }) => {
  const [subTab, setSubTab] = useState<'products' | 'categories'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [featuredFilter, setFeaturedFilter] = useState<boolean>(false);
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [sortOption, setSortOption] = useState<'manual' | 'recent' | 'price_asc' | 'price_desc' | 'name_asc'>('manual');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useBackHandler({
    isOpen: isCategoryModalOpen,
    onClose: () => setIsCategoryModalOpen(false),
    priority: 25,
    name: 'ProductCategoryModal',
  });

  useBackHandler({
    isOpen: isFormModalOpen,
    onClose: () => setIsFormModalOpen(false),
    priority: 20,
    name: 'ProductFormModal',
  });

  // Delete modal state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Duplicate state
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Status toggle state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Load products and categories
  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const [catsData, prodsData] = await Promise.all([
        api.getCategories(),
        api.getProducts({
          search: search || undefined,
          categoryId: selectedCategoryId || undefined,
          isActive: statusFilter === 'all' ? 'all' : statusFilter === 'active',
          isFeatured: featuredFilter || undefined,
          stockStatus: stockFilter,
          sort: sortOption,
        }),
      ]);

      setCategories(catsData);
      setProducts(prodsData);
    } catch (err: any) {
      console.error('Error loading products data:', err);
      setErrorMessage(err.message || 'Erro ao carregar catálogo de produtos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCategoryId, statusFilter, featuredFilter, stockFilter, sortOption]);

  const showToast = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => {
      setActionSuccessMessage(null);
    }, 3500);
  };

  // Open create modal
  const handleOpenCreate = () => {
    setEditingProduct(null);
    setIsFormModalOpen(true);
  };

  // Open edit modal
  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setIsFormModalOpen(true);
  };

  // Toggle active status
  const handleToggleStatus = async (p: Product) => {
    try {
      setTogglingId(p.id);
      const updated = await api.toggleProductStatus(p.id, !p.isActive);
      setProducts((prev) => prev.map((item) => (item.id === p.id ? updated : item)));
      showToast(`Produto ${updated.isActive ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status.');
    } finally {
      setTogglingId(null);
    }
  };

  // Duplicate product
  const handleDuplicate = async (p: Product) => {
    try {
      setDuplicatingId(p.id);
      const dup = await api.duplicateProduct(p.id);
      showToast(`Cópia criada: "${dup.name}"`);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao duplicar produto.');
    } finally {
      setDuplicatingId(null);
    }
  };

  // Delete product
  const handleDeleteConfirm = async () => {
    if (!deletingProduct) return;
    try {
      setDeleting(true);
      await api.deleteProduct(deletingProduct.id);
      showToast(`Produto "${deletingProduct.name}" excluído.`);
      setDeletingProduct(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir produto.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100/60 overflow-hidden">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 shrink-0 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Catálogo de Produtos</span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                  {products.length} itens
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Cadastre seus itens, gerencie preços, estoque e exiba no seu mini site digital.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5">
            {subTab === 'categories' ? (
              <button
                onClick={() => setIsCategoryModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer hover:scale-102"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Categoria</span>
              </button>
            ) : null}

            <button
              onClick={handleOpenCreate}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer ${
                subTab === 'categories'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-102'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Novo Produto</span>
            </button>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={() => setSubTab('products')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'products'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Todos os produtos</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                subTab === 'products' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {products.length}
            </span>
          </button>

          <button
            onClick={() => setSubTab('categories')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'categories'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Categorias</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                subTab === 'categories' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {categories.length}
            </span>
          </button>
        </div>

        {/* Success toast notification */}
        {actionSuccessMessage && (
          <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
        )}

        {/* Filter controls - Only for products tab */}
        {subTab === 'products' && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Search text */}
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por nome, descrição ou SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category filter */}
          <div className="lg:col-span-3">
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="lg:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Status: Todos</option>
              <option value="active">Somente Ativos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
          </div>

          {/* Stock filter */}
          <div className="lg:col-span-2">
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Estoque: Todos</option>
              <option value="in_stock">Em Estoque</option>
              <option value="out_of_stock">Esgotados</option>
            </select>
          </div>

          {/* Featured toggle button */}
          <div className="lg:col-span-1 flex items-center">
            <button
              onClick={() => setFeaturedFilter(!featuredFilter)}
              className={`w-full py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                featuredFilter
                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="Filtrar por produtos em destaque"
            >
              <Star className={`w-3.5 h-3.5 ${featuredFilter ? 'fill-current' : ''}`} />
              <span className="hidden sm:inline">Destaque</span>
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
            <p className="text-xs font-semibold">Carregando catálogo...</p>
          </div>
        ) : errorMessage ? (
          <div className="p-6 bg-white rounded-3xl border border-rose-200 text-center max-w-md mx-auto space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="font-bold text-sm text-slate-900">Erro ao carregar dados</h3>
            <p className="text-xs text-slate-600">{errorMessage}</p>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        ) : subTab === 'categories' ? (
          /* Categories View */
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Categorias de Produtos</h2>
                  <p className="text-xs text-slate-500">
                    Crie categorias para organizar seus produtos e facilitar a busca no catálogo.
                  </p>
                </div>
                <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Categoria</span>
                </button>
              </div>

              {categories.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center">
                    <Layers className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">Nenhuma categoria criada ainda</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Crie categorias como "Perfumes", "Bebidas", "Acessórios" para agrupar seus produtos.
                  </p>
                  <button
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Criar Primeira Categoria
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        <th className="py-3 px-4">Nome</th>
                        <th className="py-3 px-4">Slug</th>
                        <th className="py-3 px-4">Produtos Vinculados</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {categories.map((cat, index) => (
                        <tr key={cat.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-center text-slate-400 font-bold">
                            {index + 1}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 text-xs">{cat.name}</span>
                            {cat.description && (
                              <p className="text-[11px] text-slate-400 truncate max-w-xs">{cat.description}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            /{cat.slug}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[11px] font-semibold text-slate-700">
                              {cat.productsCount || 0} produtos
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                cat.isActive
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {cat.isActive ? 'Ativa' : 'Inativa'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setIsCategoryModalOpen(true)}
                              className="px-3 py-1.5 text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 font-bold rounded-lg transition-colors cursor-pointer text-xs"
                            >
                              Gerenciar
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
        ) : products.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80 max-w-lg mx-auto space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center shadow-xs">
              <Package className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {search || selectedCategoryId || featuredFilter || statusFilter !== 'all'
                  ? 'Nenhum produto encontrado com os filtros selecionados'
                  : 'Você ainda não cadastrou produtos'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {search || selectedCategoryId || featuredFilter || statusFilter !== 'all'
                  ? 'Tente ajustar ou limpar os filtros de busca para visualizar os itens.'
                  : 'Comece adicionando itens que os visitantes poderão visualizar e solicitar diretamente pelo seu site digital.'}
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              {search || selectedCategoryId || featuredFilter || statusFilter !== 'all' ? (
                <button
                  onClick={() => {
                    setSearch('');
                    setSelectedCategoryId('');
                    setStatusFilter('all');
                    setFeaturedFilter(false);
                    setStockFilter('all');
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Limpar Filtros
                </button>
              ) : (
                <button
                  onClick={handleOpenCreate}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md flex items-center gap-2 transition-all hover:scale-102"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar primeiro produto
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Products Table/Grid */
          <div className="space-y-3 max-w-6xl mx-auto">
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Item</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4">Preço</th>
                      <th className="py-3 px-4">Estoque</th>
                      <th className="py-3 px-4 text-center">Destaque</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((p) => {
                      const primaryImg = p.primaryImage?.publicUrl || (p.images[0]?.publicUrl);

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            !p.isActive ? 'opacity-65 bg-slate-50/30' : ''
                          }`}
                        >
                          {/* Image & Title */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {primaryImg ? (
                                <img
                                  src={primaryImg}
                                  alt={p.name}
                                  className="w-12 h-12 rounded-xl object-contain bg-slate-50 border border-slate-200 shrink-0 p-0.5"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                  <Package className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-bold text-sm text-slate-900 truncate max-w-xs sm:max-w-sm">
                                  {p.name}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                  {p.sku && <span>SKU: {p.sku}</span>}
                                  {p.variants && p.variants.length > 0 && (
                                    <span className="text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.2 rounded">
                                      {p.variants.length} opções
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1">
                                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate max-w-[220px]" title={formatProductAvailabilitySummary(p.availabilityDays)}>
                                    {formatProductAvailabilitySummary(p.availabilityDays)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3.5 px-4">
                            {p.category ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 font-semibold rounded-lg text-[11px]">
                                <Tag className="w-3 h-3 text-slate-400" />
                                {p.category.name}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Sem categoria</span>
                            )}
                          </td>

                          {/* Price */}
                          <td className="py-3.5 px-4">
                            {p.priceOnRequest ? (
                              <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 font-bold rounded-lg text-[11px]">
                                Sob Consulta
                              </span>
                            ) : p.promotionalPrice && p.price ? (
                              <div>
                                <span className="block text-[11px] text-slate-400 line-through">
                                  R$ {p.price.toFixed(2).replace('.', ',')}
                                </span>
                                <span className="font-black text-sm text-emerald-600">
                                  R$ {p.promotionalPrice.toFixed(2).replace('.', ',')}
                                </span>
                              </div>
                            ) : p.price !== null && p.price !== undefined ? (
                              <span className="font-bold text-sm text-slate-900">
                                R$ {p.price.toFixed(2).replace('.', ',')}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Não informado</span>
                            )}
                          </td>

                          {/* Stock */}
                          <td className="py-3.5 px-4">
                            {p.trackStock ? (
                              p.stockQuantity > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg text-[11px]">
                                  {p.stockQuantity} un
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 font-bold rounded-lg text-[11px]">
                                  Esgotado
                                </span>
                              )
                            ) : (
                              <span className="text-slate-500 text-[11px] font-medium">Livre</span>
                            )}
                          </td>

                          {/* Featured Star */}
                          <td className="py-3.5 px-4 text-center">
                            {p.isFeatured ? (
                              <span className="inline-flex p-1 bg-amber-50 text-amber-500 rounded-lg" title="Produto em Destaque">
                                <Star className="w-4 h-4 fill-current" />
                              </span>
                            ) : (
                              <span className="inline-flex p-1 text-slate-300">
                                <Star className="w-4 h-4" />
                              </span>
                            )}
                          </td>

                          {/* Active Status Switch */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              disabled={togglingId === p.id}
                              onClick={() => handleToggleStatus(p)}
                              className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                                p.isActive ? 'bg-emerald-600' : 'bg-slate-200'
                              }`}
                              title={p.isActive ? 'Clique para desativar' : 'Clique para ativar'}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  p.isActive ? 'translate-x-4' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </td>

                          {/* Quick Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEdit(p)}
                                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                                title="Editar produto"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                disabled={duplicatingId === p.id}
                                onClick={() => handleDuplicate(p)}
                                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                                title="Duplicar produto"
                              >
                                {duplicatingId === p.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                onClick={() => setDeletingProduct(p)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="Excluir produto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Form Modal (Create / Edit) */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        product={editingProduct}
        categories={categories}
        onSaved={() => {
          showToast(editingProduct ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!');
          loadData();
        }}
        onOpenCategories={() => setIsCategoryModalOpen(true)}
      />

      {/* Category Management Modal */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onRefresh={loadData}
      />

      {/* Confirm Delete Product Modal */}
      <ConfirmModal
        isOpen={!!deletingProduct}
        title="Excluir Produto"
        message={`Tem certeza que deseja excluir o produto "${deletingProduct?.name}"? Esta ação removerá o item do catálogo digital.`}
        confirmText="Sim, excluir produto"
        cancelText="Cancelar"
        isDestructive={true}
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingProduct(null)}
      />
    </div>
  );
};
