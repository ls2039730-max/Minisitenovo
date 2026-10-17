import React, { useState, useEffect } from 'react';
import {
  Search,
  Tag,
  Star,
  MessageCircle,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ShoppingCart,
  Plus,
  Minus,
} from 'lucide-react';
import { Product, ProductCategory, ProductVariant } from '../../../types/product';
import { Tenant } from '../../../types/saas';
import { api } from '../../../services/api';
import { useCart } from '../../../context/CartContext';
import { isProductAvailableOnDay, getCurrentDayOfWeek } from '../../../utils/productAvailability';

interface PublicProductCatalogSectionProps {
  tenant: Tenant;
  settings: Record<string, any>;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  radiusClass: string;
  isDraftPreview?: boolean;
}

export const PublicProductCatalogSection: React.FC<PublicProductCatalogSectionProps> = ({
  tenant,
  settings,
  primaryColor,
  secondaryColor,
  accentColor,
  bgColor,
  textColor,
  radiusClass,
  isDraftPreview = false,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active filters in visitor view
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Product Detail Modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [modalQty, setModalQty] = useState(1);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [addedSuccess, setAddedSuccess] = useState(false);

  const cart = useCart();
  const isCartEnabled = tenant.featureOverrides?.shopping_cart !== false;

  // Load live catalog directly from API
  useEffect(() => {
    let isMounted = true;
    const fetchCatalog = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.getPublicCatalog(tenant.slug, {
          featured: settings.filterType === 'featured',
          categoryId: settings.filterType === 'category' ? settings.selectedCategoryId : undefined,
          sort: settings.defaultSort || 'manual',
          limit: settings.maxItems || 24,
        });

        if (isMounted) {
          if (res.success) {
            setProducts(res.products || []);
            setCategories(res.categories || []);
          } else {
            setProducts([]);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('[CATALOG] Catalog not available or empty:', err.message);
          setError(err.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCatalog();
    return () => {
      isMounted = false;
    };
  }, [tenant.slug, settings.filterType, settings.selectedCategoryId, settings.defaultSort, settings.maxItems]);

  // When opening product modal, reset active image and default variant
  useEffect(() => {
    if (selectedProduct) {
      setActiveImageIndex(0);
      setSelectedVariant(selectedProduct.variants && selectedProduct.variants.length > 0 ? selectedProduct.variants[0] : null);
      setModalQty(1);
      setVariantError(null);
      setAddedSuccess(false);
    }
  }, [selectedProduct]);

  const currentDay = getCurrentDayOfWeek();

  // Filter products by visitor selection and day of week for delivery
  const filteredProducts = products.filter((p) => {
    // Weekly availability filter for delivery channel
    if (!isProductAvailableOnDay(p, currentDay, 'delivery')) {
      return false;
    }
    // Category filter
    if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) {
      return false;
    }
    // Search query filter
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.shortDescription && p.shortDescription.toLowerCase().includes(q);
      const matchCat = p.category && p.category.name.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchCat) return false;
    }
    // Stock filter
    if (settings.showOutOfStock === false && p.trackStock && p.stockQuantity <= 0 && !p.allowOutOfStock) {
      return false;
    }
    return true;
  });

  // Calculate live displayed price for selected product / variant
  const getDisplayPrice = (product: Product, variant?: ProductVariant | null) => {
    if (product.priceOnRequest) return null;

    const basePrice = variant?.price !== undefined && variant?.price !== null ? variant.price : product.price;
    const promoPrice = variant?.promotionalPrice !== undefined && variant?.promotionalPrice !== null ? variant.promotionalPrice : product.promotionalPrice;

    return {
      regular: basePrice ?? null,
      promotional: promoPrice ?? null,
      hasDiscount:
        promoPrice !== null &&
        promoPrice !== undefined &&
        basePrice !== null &&
        basePrice !== undefined &&
        promoPrice < basePrice,
    };
  };

  // WhatsApp click handler
  const handleConsultWhatsApp = (product: Product, variant?: ProductVariant | null) => {
    const cleanPhone = (tenant.whatsapp || tenant.phone || '').replace(/\D/g, '');
    if (!cleanPhone) return;

    let text = `Olá! Tenho interesse no produto *${product.name}*.`;
    if (variant) {
      text = `Olá! Tenho interesse no produto *${product.name}*, opção *${variant.name}*.`;
    }
    if (product.sku) {
      text += ` (Ref: ${variant?.sku || product.sku})`;
    }

    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // If loading and no products yet
  if (loading && products.length === 0) {
    return (
      <section id="produtos" className="py-14 md:py-20 px-4 max-w-6xl mx-auto w-full text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
        <p className="text-xs font-semibold opacity-70">Carregando catálogo de produtos...</p>
      </section>
    );
  }

  // If no products available at all
  if (products.length === 0) {
    if (isDraftPreview) {
      return (
        <section id="produtos" className="py-12 px-4 max-w-4xl mx-auto w-full">
          <div className={`p-8 border-2 border-dashed border-slate-200 text-center bg-slate-50/50 ${radiusClass}`}>
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              {settings.title || 'Nossos Produtos'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-2">
              Você ainda não possui produtos cadastrados.
            </p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              Acesse o módulo <strong>Produtos</strong> no menu lateral para cadastrar seus primeiros itens com fotos, preços e opções. Eles serão exibidos automaticamente nesta seção.
            </p>
          </div>
        </section>
      );
    }
    return null; // Gracefully omit section if visitor accesses and tenant has no products
  }

  const layout = settings.layout || 'grid'; // 'grid' | 'list' | 'carousel'

  return (
    <section id="produtos" className="py-14 md:py-20 px-4 max-w-6xl mx-auto w-full">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>
          Catálogo Digital
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">
          {settings.title || 'Nossos Produtos'}
        </h2>
        {settings.subtitle && (
          <p className="text-xs sm:text-sm opacity-75">{settings.subtitle}</p>
        )}
      </div>

      {/* Visitor Search & Category Tabs */}
      <div className="mb-8 space-y-4 max-w-3xl mx-auto">
        {/* Search Input */}
        {settings.showSearch !== false && (
          <div className="relative">
            <Search className="w-4 h-4 opacity-40 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar no catálogo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 bg-black/[0.03] border border-black/10 text-xs font-medium focus:bg-white focus:outline-hidden focus:border-indigo-500 transition-all ${radiusClass}`}
            />
          </div>
        )}

        {/* Categories Pills */}
        {settings.showCategoryFilter !== false && categories.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none justify-center flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${radiusClass} ${
                selectedCategory === 'all'
                  ? 'text-white shadow-xs'
                  : 'bg-black/5 hover:bg-black/10 opacity-75'
              }`}
              style={selectedCategory === 'all' ? { backgroundColor: primaryColor } : {}}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${radiusClass} ${
                  selectedCategory === c.id
                    ? 'text-white shadow-xs'
                    : 'bg-black/5 hover:bg-black/10 opacity-75'
                }`}
                style={selectedCategory === c.id ? { backgroundColor: primaryColor } : {}}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products Display (Grid, List, Carousel) */}
      {filteredProducts.length === 0 ? (
        <div className={`p-8 text-center border border-black/10 bg-black/[0.01] max-w-md mx-auto ${radiusClass}`}>
          <Package className="w-10 h-10 opacity-30 mx-auto mb-2" />
          <p className="text-xs font-bold opacity-75">Nenhum produto encontrado nesta seleção.</p>
        </div>
      ) : layout === 'carousel' ? (
        /* CAROUSEL LAYOUT */
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-none">
            {filteredProducts.map((p) => renderProductCard(p))}
          </div>
        </div>
      ) : layout === 'list' ? (
        /* LIST LAYOUT */
        <div className="space-y-3 max-w-3xl mx-auto">
          {filteredProducts.map((p) => renderProductListItem(p))}
        </div>
      ) : (
        /* GRID LAYOUT (DEFAULT) */
        <div
          className={`grid gap-3 sm:gap-5 ${
            settings.gridColumns === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : settings.gridColumns === 3
              ? 'grid-cols-2 sm:grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
          }`}
        >
          {filteredProducts.map((p) => renderProductCard(p))}
        </div>
      )}

      {/* PRODUCT DETAILS MODAL / BOTTOM SHEET */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`bg-white text-slate-900 shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col relative ${radiusClass}`}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-3 right-3 z-10 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors cursor-pointer shadow-md"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 space-y-6">
              {/* Product Gallery */}
              <div className="space-y-3">
                <div
                  className={`relative w-full aspect-square sm:aspect-[4/3] bg-slate-50 overflow-hidden flex items-center justify-center border border-slate-200 p-2 sm:p-4 ${radiusClass}`}
                >
                  {selectedProduct.images && selectedProduct.images.length > 0 ? (
                    <img
                      src={selectedProduct.images[activeImageIndex]?.publicUrl || selectedProduct.images[0]?.publicUrl}
                      alt={selectedProduct.name}
                      className="w-full h-full object-contain object-center"
                    />
                  ) : (
                    <Package className="w-16 h-16 text-slate-300" />
                  )}

                  {selectedProduct.isFeatured && (
                    <div className="absolute top-3 left-3 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-md flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" />
                      Destaque
                    </div>
                  )}
                </div>

                {/* Gallery Thumbnails */}
                {selectedProduct.images && selectedProduct.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selectedProduct.images.map((img, idx) => (
                      <button
                        key={img.id || idx}
                        onClick={() => setActiveImageIndex(idx)}
                        className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                          activeImageIndex === idx ? 'border-indigo-600 scale-105' : 'border-slate-200 opacity-60'
                        }`}
                      >
                        <img src={img.publicUrl} alt="" className="w-full h-full object-cover object-center" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="space-y-3">
                {selectedProduct.category && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    <Tag className="w-3 h-3" />
                    {selectedProduct.category.name}
                  </span>
                )}

                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {selectedProduct.name}
                </h3>

                {selectedProduct.shortDescription && (
                  <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                    {selectedProduct.shortDescription}
                  </p>
                )}

                {/* Price Display */}
                <div className="pt-2">
                  {selectedProduct.priceOnRequest ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>Preço Sob Consulta</span>
                    </div>
                  ) : (() => {
                    const priceInfo = getDisplayPrice(selectedProduct, selectedVariant);
                    if (!priceInfo || priceInfo.regular === null || priceInfo.regular === undefined) return null;

                    return (
                      <div className="flex items-baseline gap-2">
                        {priceInfo.hasDiscount && priceInfo.promotional !== null && priceInfo.promotional !== undefined ? (
                          <>
                            <span className="text-xs text-slate-400 line-through">
                              R$ {priceInfo.regular.toFixed(2).replace('.', ',')}
                            </span>
                            <span className="text-2xl font-black text-emerald-600">
                              R$ {priceInfo.promotional.toFixed(2).replace('.', ',')}
                            </span>
                            <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                              OFERTA
                            </span>
                          </>
                        ) : (
                          <span className="text-2xl font-black text-slate-900">
                            R$ {priceInfo.regular.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Variants Selector */}
                {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Escolha uma opção:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.variants.map((v) => {
                        const isSelected = selectedVariant?.id === v.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setSelectedVariant(v)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span>{v.name}</span>
                            {v.price && v.price !== selectedProduct.price && (
                              <span className="ml-1 opacity-80 text-[10px]">
                                (R$ {v.price.toFixed(2).replace('.', ',')})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Stock info */}
                {selectedProduct.trackStock && (
                  <div className="pt-1 text-xs">
                    {selectedProduct.stockQuantity > 0 ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Disponível em estoque ({selectedProduct.stockQuantity} unidades)
                      </span>
                    ) : (
                      <span className="text-rose-600 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Item temporariamente indisponível
                      </span>
                    )}
                  </div>
                )}

                {/* Full Description */}
                {selectedProduct.description && (
                  <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 leading-relaxed space-y-1">
                    <strong className="block text-slate-800 font-bold">Detalhes do Produto:</strong>
                    <p className="whitespace-pre-line">{selectedProduct.description}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
                {isCartEnabled && !selectedProduct.priceOnRequest ? (
                  <>
                    {/* Quantity controls */}
                    <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shrink-0 self-stretch sm:self-auto justify-between">
                      <button
                        type="button"
                        onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                        className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center text-xs font-bold text-slate-900">
                        {modalQty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setModalQty((q) => Math.min(99, q + 1))}
                        className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Add to Cart button */}
                    <button
                      type="button"
                      disabled={selectedProduct.trackStock && selectedProduct.stockQuantity <= 0 && !selectedProduct.allowOutOfStock}
                      onClick={() => {
                        if (selectedProduct.variants && selectedProduct.variants.length > 0 && !selectedVariant) {
                          setVariantError('Por favor, selecione uma das opções acima.');
                          return;
                        }
                        if (cart) {
                          cart.addToCart(selectedProduct.id, selectedVariant?.id, modalQty, selectedProduct.name);
                          setAddedSuccess(true);
                          setVariantError(null);
                          setTimeout(() => setAddedSuccess(false), 3500);
                        }
                      }}
                      className={`flex-1 py-3 px-5 font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer ${radiusClass} ${
                        selectedProduct.trackStock && selectedProduct.stockQuantity <= 0 && !selectedProduct.allowOutOfStock
                          ? 'opacity-50 cursor-not-allowed bg-slate-400'
                          : 'hover:opacity-95 active:scale-[0.99]'
                      }`}
                      style={
                        selectedProduct.trackStock && selectedProduct.stockQuantity <= 0 && !selectedProduct.allowOutOfStock
                          ? undefined
                          : { backgroundColor: primaryColor }
                      }
                    >
                      <ShoppingCart className="w-4 h-4" />
                      <span>
                        {selectedProduct.trackStock && selectedProduct.stockQuantity <= 0 && !selectedProduct.allowOutOfStock
                          ? 'Item Esgotado'
                          : 'Adicionar ao Carrinho'}
                      </span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConsultWhatsApp(selectedProduct, selectedVariant)}
                    className={`flex-1 py-3 px-5 font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-lg hover:opacity-95 transition-all cursor-pointer ${radiusClass}`}
                    style={{ backgroundColor: '#25D366' }}
                  >
                    <MessageCircle className="w-5 h-5 fill-current" />
                    <span>Consultar pelo WhatsApp</span>
                  </button>
                )}
              </div>

              {variantError && (
                <p className="text-[11px] font-bold text-rose-600 mt-1">{variantError}</p>
              )}

              {addedSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{modalQty}x adicionado(s) ao carrinho!</span>
                  </div>
                  {cart && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProduct(null);
                        cart.openCart();
                      }}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-extrabold shadow-xs transition-colors cursor-pointer"
                    >
                      Ver Carrinho
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );

  // Helper to render standard Card (Grid / Carousel)
  function renderProductCard(product: Product) {
    const primaryImg = product.primaryImage?.publicUrl || (product.images && product.images[0]?.publicUrl);
    const priceInfo = getDisplayPrice(product);
    const isOutOfStock = product.trackStock && product.stockQuantity <= 0 && !product.allowOutOfStock;

    return (
      <div
        key={product.id}
        onClick={() => setSelectedProduct(product)}
        className={`group flex flex-col bg-white border border-black/8 hover:border-black/20 hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer relative ${radiusClass} ${
          layout === 'carousel' ? 'w-48 sm:w-56 shrink-0 snap-start' : ''
        }`}
      >
        {/* Card Image */}
        <div className="relative aspect-square w-full bg-slate-50/70 overflow-hidden flex items-center justify-center p-1.5">
          {primaryImg ? (
            <img
              src={primaryImg}
              alt={product.name}
              className={`w-full h-full ${
                settings.imageFit === 'cover' ? 'object-cover' : 'object-contain'
              } object-center group-hover:scale-105 transition-transform duration-300`}
              loading="lazy"
            />
          ) : (
            <Package className="w-10 h-10 opacity-20" />
          )}

          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {product.isFeatured && (
              <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-extrabold rounded-md shadow-xs flex items-center gap-1">
                <Star className="w-2.5 h-2.5 fill-current" />
                Destaque
              </span>
            )}
            {priceInfo?.hasDiscount && (
              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded-md shadow-xs">
                OFERTA
              </span>
            )}
          </div>

          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center text-white text-xs font-bold">
              Esgotado
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="p-3 sm:p-4 flex flex-col flex-1 justify-between space-y-2">
          <div>
            {settings.showCategory !== false && product.category && (
              <span className="text-[10px] font-bold opacity-60 uppercase tracking-wider block truncate">
                {product.category.name}
              </span>
            )}

            <h4 className="font-bold text-xs sm:text-sm leading-snug line-clamp-2 mt-0.5 text-slate-900">
              {product.name}
            </h4>

            {settings.showShortDesc !== false && product.shortDescription && (
              <p className="text-[11px] opacity-70 line-clamp-2 mt-1 leading-relaxed">
                {product.shortDescription}
              </p>
            )}
          </div>

          {/* Price / Consult */}
          <div className="pt-2 border-t border-black/5">
            {settings.showPrice !== false && (
              <div className="flex items-baseline justify-between">
                {product.priceOnRequest ? (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                    Sob Consulta
                  </span>
                ) : priceInfo ? (
                  <div className="flex items-baseline gap-1.5">
                    {priceInfo.hasDiscount && priceInfo.promotional !== null && priceInfo.promotional !== undefined ? (
                      <>
                        <span className="text-[10px] opacity-50 line-through">
                          R$ {priceInfo.regular?.toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-xs sm:text-sm font-black text-emerald-600">
                          R$ {priceInfo.promotional.toFixed(2).replace('.', ',')}
                        </span>
                      </>
                    ) : priceInfo.regular !== null && priceInfo.regular !== undefined ? (
                      <span className="text-xs sm:text-sm font-black text-slate-900">
                        R$ {priceInfo.regular.toFixed(2).replace('.', ',')}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {product.variants && product.variants.length > 0 && (
                  <span className="text-[9px] font-bold bg-black/5 px-1.5 py-0.5 rounded opacity-75">
                    +{product.variants.length} opções
                  </span>
                )}
              </div>
            )}

            {/* Card Action Button */}
            <div className="pt-2">
              {isCartEnabled && !product.priceOnRequest ? (
                <button
                  type="button"
                  disabled={isOutOfStock}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (product.variants && product.variants.length > 0) {
                      setSelectedProduct(product);
                    } else if (isOutOfStock) {
                      // Disabled
                    } else if (cart) {
                      cart.addToCart(product.id, null, 1, product.name);
                    }
                  }}
                  className={`w-full py-2 px-3 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer ${radiusClass} ${
                    isOutOfStock
                      ? 'opacity-40 cursor-not-allowed bg-slate-400'
                      : 'hover:opacity-95 active:scale-[0.98]'
                  }`}
                  style={isOutOfStock ? undefined : { backgroundColor: primaryColor }}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>
                    {isOutOfStock
                      ? 'Esgotado'
                      : product.variants && product.variants.length > 0
                      ? 'Ver Opções'
                      : 'Adicionar'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConsultWhatsApp(product);
                  }}
                  className={`w-full py-2 px-3 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs hover:opacity-95 transition-all cursor-pointer ${radiusClass}`}
                  style={{ backgroundColor: '#25D366' }}
                >
                  <MessageCircle className="w-3.5 h-3.5 fill-current" />
                  <span>Consultar</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper to render horizontal List item
  function renderProductListItem(product: Product) {
    const primaryImg = product.primaryImage?.publicUrl || (product.images && product.images[0]?.publicUrl);
    const priceInfo = getDisplayPrice(product);

    return (
      <div
        key={product.id}
        onClick={() => setSelectedProduct(product)}
        className={`group flex items-center gap-4 p-3 bg-white border border-black/8 hover:border-black/20 hover:shadow-md transition-all cursor-pointer ${radiusClass}`}
      >
        <div className={`w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center p-1 ${radiusClass}`}>
          {primaryImg ? (
            <img
              src={primaryImg}
              alt={product.name}
              className={`w-full h-full ${
                settings.imageFit === 'cover' ? 'object-cover' : 'object-contain'
              } object-center`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center opacity-20">
              <Package className="w-6 h-6" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-xs sm:text-sm truncate text-slate-900">{product.name}</h4>
            {product.isFeatured && <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" />}
          </div>

          {settings.showShortDesc !== false && product.shortDescription && (
            <p className="text-[11px] opacity-70 line-clamp-1">{product.shortDescription}</p>
          )}

          {settings.showPrice !== false && (
            <div className="pt-0.5">
              {product.priceOnRequest ? (
                <span className="text-[11px] font-bold text-amber-700">Sob Consulta</span>
              ) : priceInfo?.hasDiscount && priceInfo.promotional !== null && priceInfo.promotional !== undefined ? (
                <span className="text-xs font-black text-emerald-600">
                  R$ {priceInfo.promotional.toFixed(2).replace('.', ',')}
                </span>
              ) : priceInfo?.regular !== null && priceInfo?.regular !== undefined ? (
                <span className="text-xs font-black text-slate-900">
                  R$ {priceInfo.regular.toFixed(2).replace('.', ',')}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="shrink-0 pr-2">
          <span
            className={`p-2 text-white flex items-center justify-center shadow-xs ${radiusClass}`}
            style={{ backgroundColor: primaryColor }}
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    );
  }
};
