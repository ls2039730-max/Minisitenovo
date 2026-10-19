import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  Trash2,
  Star,
  Plus,
  Loader2,
  AlertCircle,
  HelpCircle,
  DollarSign,
  Package,
  Layers,
  Sparkles,
  Barcode,
  Image as ImageIcon,
  Check,
  Crop,
  CheckCircle2,
  Calendar,
  UtensilsCrossed,
  Truck,
} from 'lucide-react';
import {
  Product,
  ProductCategory,
  ProductImage,
  ProductVariant,
  DayOfWeek,
  ProductAvailabilityConfig,
} from '../../types/product';
import { api } from '../../services/api';
import { optimizeImage } from '../../utils/imageOptimizer';
import { parsePrice, formatPriceBRL } from '../../utils/currency';
import {
  WEEK_DAYS_ORDER,
  ALL_DAYS_OF_WEEK,
  formatDaysListLabel,
  formatProductAvailabilitySummary,
} from '../../utils/productAvailability';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  categories: ProductCategory[];
  onSaved: () => void;
  onOpenCategories: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  product,
  categories,
  onSaved,
  onOpenCategories,
}) => {
  // Section tabs: 'info' | 'images' | 'pricing' | 'availability' | 'variants'
  const [activeTab, setActiveTab] = useState<'info' | 'images' | 'pricing' | 'availability' | 'variants'>('info');

  // Basic Info
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');

  // Pricing
  const [priceOnRequest, setPriceOnRequest] = useState(false);
  const [price, setPrice] = useState<string>('');
  const [promotionalPrice, setPromotionalPrice] = useState<string>('');

  // Stock & Status
  const [trackStock, setTrackStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState<string>('0');
  const [allowOutOfStock, setAllowOutOfStock] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);

  // Weekly Availability State
  const [sameChannels, setSameChannels] = useState(true);
  const [tableDays, setTableDays] = useState<DayOfWeek[]>([0, 1, 2, 3, 4, 5, 6]);
  const [deliveryDays, setDeliveryDays] = useState<DayOfWeek[]>([0, 1, 2, 3, 4, 5, 6]);

  // Images state
  const [images, setImages] = useState<Array<{ id?: string; publicUrl: string; storagePath?: string; isPrimary: boolean; altText?: string }>>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [autoOptimizeFit, setAutoOptimizeFit] = useState(true);
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null);

  // Variants state
  const [variants, setVariants] = useState<Array<{
    id?: string;
    name: string;
    sku?: string;
    price?: string;
    promotionalPrice?: string;
    trackStock: boolean;
    stockQuantity: string;
    isActive: boolean;
  }>>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategoryId(product.categoryId || '');
      setShortDescription(product.shortDescription || '');
      setDescription(product.description || '');
      setSku(product.sku || '');
      setBarcode(product.barcode || '');
      setPriceOnRequest(product.priceOnRequest);
      setPrice(product.price !== null && product.price !== undefined ? String(product.price) : '');
      setPromotionalPrice(product.promotionalPrice !== null && product.promotionalPrice !== undefined ? String(product.promotionalPrice) : '');
      setTrackStock(product.trackStock);
      setStockQuantity(String(product.stockQuantity || 0));
      setAllowOutOfStock(product.allowOutOfStock);
      setIsActive(product.isActive);
      setIsFeatured(product.isFeatured);

      // Availability days initialization
      if (product.availabilityDays) {
        setSameChannels(product.availabilityDays.sameChannels !== false);
        setTableDays(product.availabilityDays.tableDays || [0, 1, 2, 3, 4, 5, 6]);
        setDeliveryDays(product.availabilityDays.deliveryDays || [0, 1, 2, 3, 4, 5, 6]);
      } else {
        // Existing products without configuration default to all days
        setSameChannels(true);
        setTableDays([0, 1, 2, 3, 4, 5, 6]);
        setDeliveryDays([0, 1, 2, 3, 4, 5, 6]);
      }

      setImages(
        product.images.map((img) => ({
          id: img.id,
          publicUrl: img.publicUrl,
          storagePath: img.storagePath,
          isPrimary: img.isPrimary,
          altText: img.altText || '',
        }))
      );

      setVariants(
        (product.variants || []).map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku || '',
          price: v.price !== null && v.price !== undefined ? String(v.price) : '',
          promotionalPrice: v.promotionalPrice !== null && v.promotionalPrice !== undefined ? String(v.promotionalPrice) : '',
          trackStock: v.trackStock,
          stockQuantity: String(v.stockQuantity || 0),
          isActive: v.isActive,
        }))
      );
    } else {
      // Default new product values: all days selected for both channels
      setName('');
      setCategoryId(categories.length > 0 ? categories[0].id : '');
      setShortDescription('');
      setDescription('');
      setSku('');
      setBarcode('');
      setPriceOnRequest(false);
      setPrice('');
      setPromotionalPrice('');
      setTrackStock(false);
      setStockQuantity('0');
      setAllowOutOfStock(true);
      setIsActive(true);
      setIsFeatured(false);
      setSameChannels(true);
      setTableDays([0, 1, 2, 3, 4, 5, 6]);
      setDeliveryDays([0, 1, 2, 3, 4, 5, 6]);
      setImages([]);
      setVariants([]);
    }
    setActiveTab('info');
    setError(null);
  }, [product, isOpen, categories]);

  if (!isOpen) return null;

  // Handle image upload from file picker with smart optimization
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploadingImage(true);
      setError(null);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Compress and optimize image to ensure light payload and prevent site crop
        let payloadDataUrl = '';
        let mimeType = 'image/jpeg';

        try {
          const optimized = await optimizeImage(file, {
            fitMode: autoOptimizeFit ? 'contain-pad' : 'original',
            targetAspectRatio: autoOptimizeFit ? 1 : undefined,
            padColor: '#ffffff',
            maxWidth: 1600,
            maxHeight: 1600,
            quality: 0.90,
          });
          payloadDataUrl = optimized.dataUrl;
          mimeType = payloadDataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        } catch (optErr) {
          console.warn('Canvas optimization fallback to direct read:', optErr);
          payloadDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          mimeType = file.type || 'image/jpeg';
        }

        const uploadedUrl = await api.uploadSiteMedia(payloadDataUrl, file.name, mimeType, 'products');

        setImages((prev) => [
          ...prev,
          {
            publicUrl: uploadedUrl,
            storagePath: uploadedUrl,
            isPrimary: prev.length === 0, // first image becomes primary automatically
            altText: name || file.name,
          },
        ]);
      }
    } catch (err: any) {
      console.error('Failed to upload product media:', err);
      setError(err.message || 'Falha ao enviar e otimizar imagem.');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Re-adjust existing image into a 1:1 square canvas (contain-pad) so it never cuts off
  const handleOptimizeImageSquare = async (index: number) => {
    const targetImg = images[index];
    if (!targetImg) return;

    try {
      setOptimizingIndex(index);
      setError(null);

      const optimized = await optimizeImage(targetImg.publicUrl, {
        fitMode: 'contain-pad',
        targetAspectRatio: 1,
        padColor: '#ffffff',
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.90,
      });

      const uploadedUrl = await api.uploadSiteMedia(
        optimized.dataUrl,
        `opt-square-${Date.now()}.jpg`,
        'image/jpeg',
        'products'
      );

      setImages((prev) =>
        prev.map((img, idx) =>
          idx === index
            ? {
                ...img,
                publicUrl: uploadedUrl,
                storagePath: uploadedUrl,
              }
            : img
        )
      );
    } catch (err: any) {
      console.error('Failed to optimize image square:', err);
      setError('Não foi possível otimizar o enquadramento desta imagem: ' + (err.message || 'Erro inesperado'));
    } finally {
      setOptimizingIndex(null);
    }
  };

  const handleSetPrimaryImage = (index: number) => {
    setImages((prev) =>
      prev.map((img, idx) => ({
        ...img,
        isPrimary: idx === index,
      }))
    );
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const filtered = prev.filter((_, idx) => idx !== index);
      // Ensure at least one image is primary if images exist
      if (filtered.length > 0 && !filtered.some((img) => img.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
  };

  // Variants handlers
  const handleAddVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        name: '',
        sku: '',
        price: '',
        promotionalPrice: '',
        trackStock: false,
        stockQuantity: '0',
        isActive: true,
      },
    ]);
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleVariantChange = (index: number, field: string, value: any) => {
    setVariants((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Day of week availability handlers
  const handleToggleDay = (day: DayOfWeek, channel: 'table' | 'delivery' | 'both') => {
    if (channel === 'both' || sameChannels) {
      setTableDays((prev) => {
        const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
        setDeliveryDays(next);
        return next;
      });
    } else if (channel === 'table') {
      setTableDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    } else {
      setDeliveryDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    }
  };

  const handleSelectAllDays = (channel: 'table' | 'delivery' | 'both') => {
    const all: DayOfWeek[] = [...ALL_DAYS_OF_WEEK];
    if (channel === 'both' || sameChannels) {
      setTableDays(all);
      setDeliveryDays(all);
    } else if (channel === 'table') {
      setTableDays(all);
    } else {
      setDeliveryDays(all);
    }
  };

  const handleClearAllDays = (channel: 'table' | 'delivery' | 'both') => {
    if (channel === 'both' || sameChannels) {
      setTableDays([]);
      setDeliveryDays([]);
    } else if (channel === 'table') {
      setTableDays([]);
    } else {
      setDeliveryDays([]);
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setActiveTab('info');
      setError('O nome do produto é obrigatório.');
      return;
    }

    const numPrice = priceOnRequest ? null : parsePrice(price);
    const numPromotionalPrice = priceOnRequest ? null : parsePrice(promotionalPrice);

    if (!priceOnRequest) {
      if (numPrice === null || numPrice < 0) {
        setActiveTab('pricing');
        setError('Informe um preço válido (ex: 59,90 ou 59.90), ou marque "Consultar Preço".');
        return;
      }
      if (numPromotionalPrice !== null && numPromotionalPrice < 0) {
        setActiveTab('pricing');
        setError('Preço promocional não pode ser negativo.');
        return;
      }
      if (numPromotionalPrice !== null && numPromotionalPrice >= numPrice) {
        setActiveTab('pricing');
        setError('O preço promocional deve ser menor do que o preço original.');
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      const availabilityPayload: ProductAvailabilityConfig = {
        sameChannels,
        tableDays: [...tableDays].sort((a, b) => a - b),
        deliveryDays: sameChannels
          ? [...tableDays].sort((a, b) => a - b)
          : [...deliveryDays].sort((a, b) => a - b),
      };

      const payload = {
        name: name.trim(),
        categoryId: categoryId || null,
        shortDescription: shortDescription.trim() || undefined,
        description: description.trim() || undefined,
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        priceOnRequest,
        price: priceOnRequest ? null : numPrice,
        promotionalPrice: priceOnRequest || numPromotionalPrice === null ? null : numPromotionalPrice,
        trackStock,
        stockQuantity: trackStock ? Number(stockQuantity || 0) : 0,
        allowOutOfStock,
        isActive,
        isFeatured,
        availabilityDays: availabilityPayload,
        images: images.map((img) => ({
          id: img.id,
          publicUrl: img.publicUrl,
          storagePath: img.storagePath,
          altText: img.altText,
          isPrimary: img.isPrimary,
        })),
        variants: variants
          .filter((v) => v.name.trim().length > 0)
          .map((v) => {
            const vp = parsePrice(v.price);
            const vpromo = parsePrice(v.promotionalPrice);
            return {
              id: v.id,
              name: v.name.trim(),
              sku: v.sku?.trim() || undefined,
              price: vp !== null ? vp : null,
              promotionalPrice: vpromo !== null ? vpromo : null,
              trackStock: v.trackStock,
              stockQuantity: v.trackStock ? Number(v.stockQuantity || 0) : 0,
              isActive: v.isActive,
            };
          }),
      };

      if (product) {
        await api.updateProduct(product.id, payload);
      } else {
        await api.createProduct(payload);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving product:', err);
      setError(err.message || 'Erro ao salvar produto.');
    } finally {
      setSaving(false);
    }
  };

  const renderDayButtons = (
    selectedDays: DayOfWeek[],
    channel: 'table' | 'delivery' | 'both'
  ) => (
    <div className="space-y-3">
      {/* Quick Action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500">
          Selecione os dias da semana para este canal:
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectAllDays(channel)}
            className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
          >
            Todos os dias
          </button>
          <button
            type="button"
            onClick={() => handleClearAllDays(channel)}
            className="px-2.5 py-1 text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Limpar seleção
          </button>
        </div>
      </div>

      {/* Selectable day chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {WEEK_DAYS_ORDER.map(({ day, name, short }) => {
          const isSelected = selectedDays.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => handleToggleDay(day, channel)}
              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[58px] ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-bold'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 font-medium'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="text-xs">{short}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />}
              </div>
              <span
                className={`text-[10px] ${
                  isSelected ? 'text-indigo-100' : 'text-slate-400'
                }`}
              >
                {day === 0 || day === 6 ? 'Fim de semana' : 'Dia útil'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Informative text */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
        <span className="text-slate-600">
          Dias ativos: <strong className="text-slate-900">{formatDaysListLabel(selectedDays)}</strong>
        </span>
        <span className="text-[11px] font-semibold text-slate-500">
          {selectedDays.length === 7
            ? 'Disponível todos os dias'
            : selectedDays.length === 0
            ? 'Nenhum dia selecionado (produto oculto)'
            : `${selectedDays.length} de 7 dias selecionados`}
        </span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-3xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">
                {product ? 'Editar Produto' : 'Novo Produto'}
              </h3>
              <p className="text-xs text-slate-500">
                Preencha os dados e fotos do item para o catálogo digital
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation within modal */}
        <div className="px-6 border-b border-slate-100 flex items-center gap-2 overflow-x-auto text-xs font-bold pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'info'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Informações
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('images')}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'images'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Fotos ({images.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'pricing'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Preço & Estoque
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('availability')}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'availability'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Disponibilidade
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('variants')}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'variants'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Variações ({variants.length})
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* TAB 1: BASIC INFO */}
            {activeTab === 'info' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome do Produto *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Perfume Árabe Rose 100ml, Camiseta Algodão Básica..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Categoria
                      </label>
                      <button
                        type="button"
                        onClick={onOpenCategories}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        + Gerenciar Categorias
                      </button>
                    </div>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Sem categoria definida</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {!c.isActive ? '(Inativa)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      SKU / Código do Produto (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: PROD-1002"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Descrição Curta (destaque nos cards)
                  </label>
                  <input
                    type="text"
                    placeholder="Frase curta com a principal característica ou benefício"
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Descrição Completa (exibida no detalhe do produto)
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Detalhes completos sobre materiais, medidas, fragrância, modo de uso ou orientações..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Código de Barras EAN (opcional)
                    </label>
                    <div className="relative">
                      <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="7890000000000"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col justify-end space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                      <span className="text-xs font-bold text-slate-800">
                        Produto Ativo (visível para clientes)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isFeatured}
                        onChange={(e) => setIsFeatured(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 border-slate-300"
                      />
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                        Produto em Destaque no Catálogo
                      </span>
                    </label>
                  </div>

                  {/* Section summary: Disponibilidade por dia da semana */}
                  <div className="mt-4 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">Disponibilidade por dia da semana</div>
                        <div className="text-[11px] text-slate-500">
                          {formatProductAvailabilitySummary({ sameChannels, tableDays, deliveryDays })}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('availability')}
                      className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors shrink-0 self-start sm:self-auto cursor-pointer"
                    >
                      Configurar Dias
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: IMAGES */}
            {activeTab === 'images' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Fotos do Produto</h4>
                    <p className="text-[11px] text-slate-500">
                      Envie até 5 fotos. Elas são otimizadas automaticamente para evitar cortes e carregar rápido.
                    </p>
                  </div>

                  <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs">
                    {uploadingImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>{uploadingImage ? 'Otimizando & Enviando...' : 'Enviar Fotos'}</span>
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileUpload}
                      disabled={uploadingImage}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Auto Optimization Banner */}
                <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 to-blue-50/80 border border-indigo-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900">Enquadramento Perfeito Sem Cortes (1:1)</h5>
                      <p className="text-[11px] text-slate-600">
                        Ajusta a proporção da imagem automaticamente para que o produto apareça 100% visível na vitrine.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={autoOptimizeFit}
                      onChange={(e) => setAutoOptimizeFit(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                    />
                    <span>Ativar ao anexar fotos</span>
                  </label>
                </div>

                {images.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center space-y-3 bg-slate-50/50">
                    <div className="w-12 h-12 rounded-2xl bg-slate-200/60 text-slate-400 mx-auto flex items-center justify-center">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">Nenhuma foto adicionada</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Clique no botão "Enviar Fotos" acima para adicionar imagens do produto.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((img, idx) => (
                      <div
                        key={idx}
                        className={`relative rounded-2xl overflow-hidden border aspect-square group bg-white shadow-2xs ${
                          img.isPrimary ? 'ring-2 ring-indigo-600 border-indigo-500' : 'border-slate-200'
                        }`}
                      >
                        <img
                          src={img.publicUrl}
                          alt={img.altText || 'Foto do produto'}
                          className="w-full h-full object-contain p-2"
                        />

                        {/* Primary Badge */}
                        {img.isPrimary && (
                          <div className="absolute top-2 left-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-md">
                            <Star className="w-3 h-3 fill-current" />
                            Principal
                          </div>
                        )}

                        {/* Optimization Action / Status */}
                        {optimizingIndex === idx && (
                          <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-1.5 z-20">
                            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                            <span className="text-[10px] font-bold text-indigo-900">Ajustando foto...</span>
                          </div>
                        )}

                        {/* Hover Overlay Actions */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2 z-10">
                          <button
                            type="button"
                            onClick={() => handleOptimizeImageSquare(idx)}
                            disabled={optimizingIndex === idx}
                            className="p-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-md flex items-center gap-1"
                            title="Otimizar foto: Enquadrar 1:1 sem cortar bordas"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                          {!img.isPrimary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryImage(idx)}
                              className="p-2 bg-white text-slate-800 rounded-xl text-xs font-bold hover:bg-slate-100 shadow-md flex items-center gap-1"
                              title="Tornar foto principal"
                            >
                              <Star className="w-3.5 h-3.5 text-amber-500" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            className="p-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 shadow-md"
                            title="Remover foto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: PRICING & STOCK */}
            {activeTab === 'pricing' && (
              <div className="space-y-6">
                {/* 1. Price on request toggle */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={priceOnRequest}
                      onChange={(e) => setPriceOnRequest(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Sob Consulta ("Consultar Preço")
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Ideal para produtos personalizados ou que exigem orçamento. O visitante verá o botão "Consultar pelo WhatsApp".
                      </span>
                    </div>
                  </label>
                </div>

                {/* Normal / Promotional price inputs */}
                {!priceOnRequest && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Preço Normal (R$) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">Ex: 59,90 ou 59.90</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Preço Promocional (opcional)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={promotionalPrice}
                          onChange={(e) => setPromotionalPrice(e.target.value)}
                          className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-emerald-600 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      {price && promotionalPrice && parsePrice(promotionalPrice) !== null && parsePrice(price) !== null && parsePrice(promotionalPrice)! < parsePrice(price)! && (
                        <p className="text-[11px] font-bold text-emerald-600 mt-1">
                          Desconto de {Math.round(((parsePrice(price)! - parsePrice(promotionalPrice)!) / parsePrice(price)!) * 100)}%! Exibido como "De R$ {formatPriceBRL(parsePrice(price))} por R$ {formatPriceBRL(parsePrice(promotionalPrice))}"
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Stock Controls */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Controle de Estoque</h4>
                      <p className="text-[11px] text-slate-500">
                        Ative se você deseja gerenciar unidades disponíveis.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trackStock}
                        onChange={(e) => setTrackStock(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {trackStock && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Quantidade em Estoque
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={stockQuantity}
                          onChange={(e) => setStockQuantity(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="flex items-center pt-5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowOutOfStock}
                            onChange={(e) => setAllowOutOfStock(e.target.checked)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                          />
                          <span className="text-xs font-bold text-slate-800">
                            Continuar exibindo mesmo se esgotar
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: AVAILABILITY */}
            {activeTab === 'availability' && (
              <div className="space-y-5 animate-in fade-in duration-150">
                {/* Section Header */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    Disponibilidade por dia da semana
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Controle em quais dias da semana cada produto ficará visível e disponível para os clientes tanto no catálogo das mesas quanto no delivery.
                  </p>
                </div>

                {/* Option to share or separate channels */}
                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="sameChannelsToggle"
                    checked={sameChannels}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSameChannels(checked);
                      if (checked) {
                        setDeliveryDays([...tableDays]);
                      }
                    }}
                    className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <label htmlFor="sameChannelsToggle" className="cursor-pointer select-none">
                    <span className="text-xs font-bold text-slate-900 block">
                      Usar os mesmos dias nos dois canais
                    </span>
                    <span className="text-[11px] text-slate-600 block mt-0.5 leading-relaxed">
                      Ativado por padrão para simplificar o cadastro. Quando ativado, os dias selecionados serão aplicados ao <strong>Catálogo Digital das Mesas</strong> e ao <strong>Delivery</strong>. Desmarque se desejar dias diferentes para cada canal.
                    </span>
                  </label>
                </div>

                {/* Day configurations */}
                {sameChannels ? (
                  /* Unified mode */
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-xs">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          Dias de Disponibilidade (Catálogo das Mesas & Delivery)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Os clientes poderão visualizar e pedir este item apenas nos dias marcados abaixo
                        </div>
                      </div>
                    </div>
                    {renderDayButtons(tableDays, 'both')}
                  </div>
                ) : (
                  /* Independent channels mode */
                  <div className="space-y-4">
                    {/* Table Channel */}
                    <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-xs">
                      <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                          <UtensilsCrossed className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            Catálogo Digital / Consumo no Local (Mesas)
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Dias em que o produto estará visível para pedidos via QR Code das mesas
                          </div>
                        </div>
                      </div>
                      {renderDayButtons(tableDays, 'table')}
                    </div>

                    {/* Delivery Channel */}
                    <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-xs">
                      <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                          <Truck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            Cardápio de Delivery / Pedidos Online
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Dias em que o produto estará visível para delivery e retirada
                          </div>
                        </div>
                      </div>
                      {renderDayButtons(deliveryDays, 'delivery')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: VARIANTS */}
            {activeTab === 'variants' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Variações do Produto</h4>
                    <p className="text-[11px] text-slate-500">
                      Adicione opções como tamanhos, volumes ou cores (ex: "50ml", "100ml", "Azul / G").
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddVariant}
                    className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Opção</span>
                  </button>
                </div>

                {variants.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                    Nenhuma variação adicionada. O produto será vendido em opção única.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {variants.map((v, index) => (
                      <div
                        key={index}
                        className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                      >
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                            Nome da Opção *
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 100g, 50ml, Tamanho M"
                            value={v.name}
                            onChange={(e) => handleVariantChange(index, 'name', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                            Preço Específico (R$)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Herda preço principal"
                            value={v.price}
                            onChange={(e) => handleVariantChange(index, 'price', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                            SKU Próprio
                          </label>
                          <input
                            type="text"
                            placeholder="SKU-OPC"
                            value={v.sku || ''}
                            onChange={(e) => handleVariantChange(index, 'sku', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                          />
                        </div>

                        <div className="sm:col-span-2 flex items-center justify-between sm:justify-start gap-3">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={v.isActive}
                              onChange={(e) => handleVariantChange(index, 'isActive', e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                            />
                            <span>Ativa</span>
                          </label>
                        </div>

                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveVariant(index)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remover opção"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Actions Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              {product ? `Editando ID: ${product.id.slice(0, 8)}...` : 'Novo produto para o catálogo digital'}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {product ? 'Salvar Alterações' : 'Cadastrar Produto'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
