import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Glasses,
  Search,
  ShoppingBag,
  ShoppingCart,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Star,
  MapPin,
  Clock,
  Phone,
  MessageCircle,
  Menu,
  X,
  Sparkles,
  Check,
  Tag,
  ShieldCheck,
  Eye,
  ExternalLink,
  Instagram,
  Facebook,
  Youtube,
  Globe,
  SlidersHorizontal,
  Plus,
  Minus,
  Share2,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Tenant } from '../../../types/saas';
import { SiteData, SiteSection } from '../../../types/site';
import { Product, ProductCategory, ProductVariant } from '../../../types/product';
import { api } from '../../../services/api';
import { useCart } from '../../../context/CartContext';
import { CartDrawer } from '../../cart/CartDrawer';
import { CheckoutModal } from '../../checkout/CheckoutModal';
import { OrderSuccessModal } from '../../checkout/OrderSuccessModal';
import { calculateScheduleStatus } from '../../../constants/blockRegistry';
import { MotionMarquee } from '../motion/MotionAdapter';
import { resolveEffectivePrice } from '../../../utils/currency';

interface PublicOticaEditorialViewProps {
  tenant: Tenant;
  site: SiteData | null;
  isPublished?: boolean;
  isDraftPreview?: boolean;
  onExitPreview?: () => void;
}

// 5 Style Discovery Profiles for Eyewear
interface EyewearStyleProfile {
  id: string;
  name: string;
  tagline: string;
  description: string;
  keywords: string[];
  visualAccent: string;
}

const STYLE_PROFILES: EyewearStyleProfile[] = [
  {
    id: 'todos',
    name: 'Todos os Estilos',
    tagline: 'Curadoria Completa',
    description: 'Explore todo o catálogo autoral selecionado para esta temporada.',
    keywords: [],
    visualAccent: '#C7F36B',
  },
  {
    id: 'classico',
    name: 'Clássico',
    tagline: 'Atemporal & Proporções Áureas',
    description: 'Formatos icônicos, acabamento em tartaruga nobre, dourado polido e preto profundo.',
    keywords: ['classico', 'clássico', 'aviador', 'wayfarer', 'redondo', 'tartaruga', 'dourado', 'atemporal'],
    visualAccent: '#E2E8F0',
  },
  {
    id: 'minimalista',
    name: 'Minimalista',
    tagline: 'Linhas Puras & Peso Zero',
    description: 'Titânio japonês ultraleve, armações fio de nylon e silhuetas quase invisíveis.',
    keywords: ['minimalista', 'titanium', 'titânio', 'fio', 'leve', 'sem aro', 'rimless', 'fino'],
    visualAccent: '#C7F36B',
  },
  {
    id: 'retro',
    name: 'Retrô',
    tagline: 'Vintage 70s & Acetato Robusto',
    description: 'Pontes marcantes, chanfros esculturais em acetato espesso e atmosfera cinematográfica.',
    keywords: ['retro', 'retrô', 'vintage', 'acetato', 'anos 70', 'bold', 'espesso', 'quadrado'],
    visualAccent: '#F59E0B',
  },
  {
    id: 'moderno',
    name: 'Moderno',
    tagline: 'Geometria Arquitetural',
    description: 'Formas poligonais, acabamentos foscos acetinados e design industrial contemporâneo.',
    keywords: ['moderno', 'geometrico', 'geométrico', 'octogonal', 'fosco', 'grafite', 'hexagonal'],
    visualAccent: '#38BDF8',
  },
  {
    id: 'ousado',
    name: 'Ousado',
    tagline: 'Avant-Garde & Vanguarda',
    description: 'Proporções esculturais exageradas, lentes translúcidas coloridas e atitude autoral.',
    keywords: ['ousado', 'avant-garde', 'cat eye', 'gatinho', 'colorido', 'amarelo', 'escultural', 'futurista'],
    visualAccent: '#C7F36B',
  },
];

export const PublicOticaEditorialView: React.FC<PublicOticaEditorialViewProps> = ({
  tenant,
  site,
  isPublished = true,
  isDraftPreview = false,
  onExitPreview,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const cart = useCart();
  const hasShoppingCart = tenant.featureOverrides?.shopping_cart !== false;

  // Catalog state
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStyle, setSelectedStyle] = useState<string>('todos');

  // Interactive UI states
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [activeModalImageIndex, setActiveModalImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [modalQty, setModalQty] = useState(1);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // Palette resolution
  const appearance = site?.appearance;
  const primaryColor = appearance?.primaryColor || '#101010';
  const accentColor = appearance?.secondaryColor || '#C7F36B'; // Strategic Electric Lime
  const bgColor = appearance?.backgroundColor || '#101010';
  const textColor = appearance?.textColor || '#F8F8F5';

  // Sections resolution from site builder
  const sections = useMemo(() => {
    if (!site?.sections) return [];
    return [...site.sections].sort((a, b) => a.position - b.position);
  }, [site]);

  const heroSection = sections.find((s) => s.type === 'hero' && s.isEnabled);
  const aboutSection = sections.find((s) => s.type === 'about' && s.isEnabled);
  const productsSection = sections.find((s) => s.type === 'products' && s.isEnabled);
  const gallerySection = sections.find((s) => s.type === 'gallery' && s.isEnabled);
  const faqSection = sections.find((s) => s.type === 'faq' && s.isEnabled);
  const hoursSection = sections.find((s) => s.type === 'business_hours' && s.isEnabled);
  const locationSection = sections.find((s) => s.type === 'location' && s.isEnabled);
  const reviewsSection = sections.find((s) => s.type === 'google_reviews' && s.isEnabled);
  const ctaSection = sections.find((s) => s.type === 'cta' && s.isEnabled);
  const footerSection = sections.find((s) => s.type === 'footer' && s.isEnabled);

  const scheduleStatus = hoursSection ? calculateScheduleStatus(hoursSection.settings?.schedule) : null;

  // Safe Physical Address and Social resolution
  const addressData = locationSection?.settings?.address;
  const formattedAddress = addressData
    ? `${addressData.street || ''}${addressData.number ? `, ${addressData.number}` : ''}${addressData.neighborhood ? ` - ${addressData.neighborhood}` : ''}`
    : ((tenant as any).address || '');
  const addressCity = addressData?.city || (tenant as any).city || '';
  const addressState = addressData?.state || (tenant as any).state || '';
  const hasPhysicalAddress = !!(formattedAddress || addressCity);

  const socialSection = sections.find((s) => s.type === 'social_links' && s.isEnabled);
  const socialLinksList: any[] = socialSection?.settings?.links || site?.settings?.socialLinks || [];
  const instagramLink =
    socialLinksList.find((l: any) => l.platform === 'instagram' && l.isEnabled)?.url ||
    ((tenant as any).instagram ? `https://instagram.com/${(tenant as any).instagram.replace('@', '')}` : '');
  const facebookLink =
    socialLinksList.find((l: any) => l.platform === 'facebook' && l.isEnabled)?.url ||
    ((tenant as any).facebook ? `https://facebook.com/${(tenant as any).facebook}` : '');

  // Phone and WhatsApp link construction
  const cleanPhone = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : tenant.phone ? tenant.phone.replace(/\D/g, '') : '';
  const waBaseUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : '#contato';

  // Load Real Catalog from Tenant
  useEffect(() => {
    let isMounted = true;
    const fetchCatalog = async () => {
      try {
        setLoadingCatalog(true);
        const res = await api.getPublicCatalog(tenant.slug);
        if (isMounted && res.success) {
          setProducts(res.products || []);
          setCategories(res.categories || []);
        }
      } catch (err) {
        console.warn('[Ótica Editorial] Could not load live catalog:', err);
      } finally {
        if (isMounted) setLoadingCatalog(false);
      }
    };
    fetchCatalog();
    return () => {
      isMounted = false;
    };
  }, [tenant.slug]);

  // Sync page title and SEO
  useEffect(() => {
    const pageTitle = site?.seo?.ogTitle || site?.seo?.title || `${tenant.name} | Ótica Editorial & Eyewear`;
    document.title = pageTitle;
  }, [tenant.name, site?.seo]);

  // Filtered Products Logic
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // 1. Category filter
      if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) {
        return false;
      }

      // 2. Search query filter
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesDesc = p.shortDescription?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
        const matchesSku = p.sku?.toLowerCase().includes(q);
        const matchesCat = p.category?.name.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesSku && !matchesCat) {
          return false;
        }
      }

      // 3. Style discovery filter
      if (selectedStyle !== 'todos') {
        const style = STYLE_PROFILES.find((s) => s.id === selectedStyle);
        if (style && style.keywords.length > 0) {
          const searchable = `${p.name} ${p.shortDescription || ''} ${p.description || ''} ${p.category?.name || ''}`.toLowerCase();
          const matchesKeyword = style.keywords.some((kw) => searchable.includes(kw));
          // If keyword matches, keep; if no product matches any keyword in catalog, we will handle graceful fallback
          return matchesKeyword;
        }
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery, selectedStyle]);

  // If the active style filter produces 0 results, provide elegant fallback to all products so visitor is never stuck
  const displayedProducts = filteredProducts.length > 0 ? filteredProducts : products;

  // Handle open product modal
  const handleOpenProduct = (prod: Product) => {
    setSelectedProductForModal(prod);
    setActiveModalImageIndex(0);
    setSelectedVariant(prod.variants && prod.variants.length > 0 ? prod.variants[0] : null);
    setModalQty(1);
  };

  // Build direct WhatsApp inquiry message for product
  const getProductWhatsAppUrl = (prod: Product, variant?: ProductVariant | null) => {
    if (!cleanPhone) return '#';
    const variantTxt = variant ? ` (Opção: ${variant.name})` : '';
    const priceTxt = prod.price ? ` no valor de R$ ${prod.price.toFixed(2).replace('.', ',')}` : '';
    const msg = `Olá! Vi o modelo *${prod.name}*${variantTxt}${priceTxt} no site da ${tenant.name} e gostaria de consultar a disponibilidade para experimentar.`;
    return `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div
      className="min-h-screen text-[#F8F8F5] flex flex-col font-sans selection:bg-[#C7F36B] selection:text-black overflow-x-hidden"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        fontFamily: appearance?.fontFamily === 'Syne' ? 'Syne, sans-serif' : appearance?.fontFamily || 'Syne, sans-serif',
      }}
    >
      {/* 0. DRAFT PREVIEW BANNER (Admin only) */}
      {onExitPreview && isDraftPreview && (
        <div className="px-4 py-2 text-xs font-bold flex items-center justify-between sticky top-0 z-50 bg-[#C7F36B] text-black shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-black animate-ping" />
            <span className="tracking-wide uppercase text-[11px]">
              Modo Rascunho — Template Ótica Editorial Premium
            </span>
          </div>
          <button
            onClick={onExitPreview}
            className="px-3 py-1 bg-black text-[#C7F36B] hover:bg-neutral-900 rounded-none text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Editor</span>
          </button>
        </div>
      )}

      {/* 1. EDITORIAL HEADER / TOP NAVIGATION */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#101010]/85 border-b border-[#292929] transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo / Brand Name */}
          <a href="#" className="flex items-center gap-3 group">
            {tenant.appearance?.logoUrl ? (
              <img
                src={tenant.appearance.logoUrl}
                alt={tenant.name}
                className="h-10 max-w-[160px] object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-col">
                <span className="text-xl sm:text-2xl font-black tracking-[0.2em] uppercase text-[#F8F8F5] group-hover:text-[#C7F36B] transition-colors">
                  {tenant.name}
                </span>
                <span className="text-[9px] tracking-[0.35em] uppercase text-[#A7A7A1] -mt-1 font-mono">
                  ÓTICA & EYEWEAR AUTORAL
                </span>
              </div>
            )}
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8 text-xs font-bold tracking-[0.18em] uppercase text-[#A7A7A1]">
            <a href="#colecao" className="hover:text-[#C7F36B] transition-colors py-1 relative group">
              Coleções
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#C7F36B] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#estilos" className="hover:text-[#C7F36B] transition-colors py-1 relative group">
              Estilos
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#C7F36B] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#manifesto" className="hover:text-[#C7F36B] transition-colors py-1 relative group">
              Manifesto
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#C7F36B] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#atelie" className="hover:text-[#C7F36B] transition-colors py-1 relative group">
              O Ateliê
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#C7F36B] transition-all duration-300 group-hover:w-full" />
            </a>
            <a href="#contato" className="hover:text-[#C7F36B] transition-colors py-1 relative group">
              Contato
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#C7F36B] transition-all duration-300 group-hover:w-full" />
            </a>
          </nav>

          {/* Action Icons & CTA */}
          <div className="flex items-center gap-3">
            {/* Quick Search trigger */}
            <a
              href="#colecao"
              className="p-2 text-[#A7A7A1] hover:text-[#C7F36B] transition-colors cursor-pointer"
              title="Buscar no Catálogo"
            >
              <Search className="w-4 h-4" />
            </a>

            {/* Shopping Cart button (when active) */}
            {hasShoppingCart && (
              <button
                type="button"
                onClick={cart.openCart}
                className="p-2 relative text-[#A7A7A1] hover:text-[#C7F36B] transition-colors cursor-pointer"
                title="Sacola de Compras"
              >
                <ShoppingBag className="w-4 h-4" />
                {cart.itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C7F36B] text-black text-[10px] font-black flex items-center justify-center">
                    {cart.itemCount}
                  </span>
                )}
              </button>
            )}

            {/* WhatsApp CTA button */}
            {cleanPhone && (
              <a
                href={waBaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-transparent border border-[#C7F36B] text-[#C7F36B] hover:bg-[#C7F36B] hover:text-black font-bold text-xs tracking-[0.15em] uppercase transition-all duration-300 rounded-none cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Consultoria VIP</span>
              </a>
            )}

            {/* Mobile menu hamburger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-[#F8F8F5] hover:text-[#C7F36B] transition-colors cursor-pointer"
              aria-label="Abrir Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Navigation */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden bg-[#101010] border-b border-[#292929] px-6 py-8 space-y-6"
            >
              <div className="flex flex-col gap-4 text-sm font-bold tracking-[0.2em] uppercase text-[#A7A7A1]">
                <a
                  href="#colecao"
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-[#C7F36B] transition-colors py-1"
                >
                  Coleções & Armações
                </a>
                <a
                  href="#estilos"
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-[#C7F36B] transition-colors py-1"
                >
                  Descubra seu Estilo
                </a>
                <a
                  href="#manifesto"
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-[#C7F36B] transition-colors py-1"
                >
                  Manifesto da Marca
                </a>
                <a
                  href="#atelie"
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-[#C7F36B] transition-colors py-1"
                >
                  O Ateliê & Loja
                </a>
                <a
                  href="#contato"
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-[#C7F36B] transition-colors py-1"
                >
                  Atendimento & Horários
                </a>
              </div>

              {cleanPhone && (
                <div className="pt-4 border-t border-[#292929]">
                  <a
                    href={waBaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#C7F36B] text-black font-extrabold text-xs tracking-[0.2em] uppercase rounded-none"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Falar com Consultor Ótico</span>
                  </a>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Top Dynamic Marquee from Motion Studio (Above Hero Banner) */}
      <MotionMarquee />

      {/* 2. HERO DE CAMPANHA (Seção A) */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden bg-[#101010]">
        {/* Background Editorial Image */}
        <div className="absolute inset-0 z-0">
          <img
            src={
              heroSection?.settings?.coverImage ||
              'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1920&q=85'
            }
            alt={heroSection?.settings?.headline || 'Campanha de Óculos'}
            className="w-full h-full object-cover object-center filter grayscale-[15%] contrast-110"
            referrerPolicy="no-referrer"
          />
          {/* Subtle gradient overlay for contrast and legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-[#101010]/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#101010]/80 via-transparent to-[#101010]/70" />
        </div>

        {/* Content Container */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full flex flex-col justify-between min-h-[85vh]">
          {/* Top Editorial Kicker */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-between text-[11px] font-mono tracking-[0.3em] uppercase text-[#C7F36B]"
          >
            <span>[ COLEÇÃO AUTORAL 2026 ]</span>
            <span className="hidden sm:inline">PRECISÃO VISUAL & DESIGN CONTEMPORÂNEO</span>
          </motion.div>

          {/* Main Giant Headline */}
          <div className="my-auto max-w-4xl py-12">
            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.2 }}
              className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-[-0.03em] uppercase leading-[0.92] text-[#F8F8F5]"
            >
              {heroSection?.settings?.headline || 'SEU OLHAR. SUAS REGRAS.'}
            </motion.h1>

            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.4 }}
              className="mt-6 text-lg sm:text-xl md:text-2xl text-[#A7A7A1] font-normal max-w-2xl leading-relaxed"
            >
              {heroSection?.settings?.subtitle || 'Óculos que expressam quem você é.'}
            </motion.p>

            {(() => {
              const heroS = heroSection?.settings || {};
              const heroWhatsappDisabled = site?.settings?.heroWhatsappButtonEnabled === false;
              const primaryExplicitlyDisabled = heroS.primaryButton?.enabled === false;
              const isSiteOrderBtn = heroS.primaryButton?.actionType === 'order_site' || heroS.primaryButton?.url === '#produtos' || heroS.primaryButton?.url === '#colecao';
              const isWhatsappTarget = (!heroS.primaryButton?.url || heroS.primaryButton?.url?.includes('wa.me') || (heroS.primaryButton?.text && heroS.primaryButton?.text?.toLowerCase().includes('whatsapp'))) && !isSiteOrderBtn;
              const shouldHidePrimary = primaryExplicitlyDisabled || (heroWhatsappDisabled && isWhatsappTarget);
              const showPrimaryBtn = !shouldHidePrimary && heroS.primaryButton?.enabled !== false;
              const showSecondaryBtn = heroS.secondaryButton?.enabled === true;
              const showAnyBtn = showPrimaryBtn || showSecondaryBtn;

              if (!showAnyBtn) return null;

              return (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, delay: 0.6 }}
                  className="mt-10 flex flex-wrap items-center gap-4"
                >
                  {showPrimaryBtn && (
                    <a
                      href={heroS.primaryButton?.url || '#colecao'}
                      target={heroS.primaryButton?.url?.startsWith('http') ? '_blank' : undefined}
                      rel={heroS.primaryButton?.url?.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="px-8 py-4 bg-[#C7F36B] hover:bg-[#b5e655] text-black font-black text-xs sm:text-sm tracking-[0.2em] uppercase transition-all duration-300 rounded-none shadow-xl flex items-center gap-3 cursor-pointer group"
                    >
                      <span>{heroS.primaryButton?.text || 'EXPLORE A COLEÇÃO'}</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </a>
                  )}

                  {showSecondaryBtn && (
                    <a
                      href={heroS.secondaryButton?.url || (cleanPhone ? waBaseUrl : '#contato')}
                      target={heroS.secondaryButton?.url?.startsWith('http') || (!heroS.secondaryButton?.url && cleanPhone) ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="px-8 py-4 bg-transparent border border-[#F8F8F5]/30 hover:border-[#C7F36B] hover:text-[#C7F36B] text-[#F8F8F5] font-bold text-xs sm:text-sm tracking-[0.2em] uppercase transition-all duration-300 rounded-none cursor-pointer"
                    >
                      {heroS.secondaryButton?.text || 'Consultar Armações'}
                    </a>
                  )}
                </motion.div>
              );
            })()}
          </div>

          {/* Bottom Indicators */}
          <div className="flex items-center justify-between text-xs text-[#A7A7A1] border-t border-[#292929] pt-4 font-mono">
            <span className="tracking-[0.2em] uppercase text-[10px]">
              {tenant.name} • ATELIÊ & SHOWROOM
            </span>
            <a
              href="#manifesto"
              className="flex items-center gap-2 hover:text-[#C7F36B] transition-colors tracking-widest text-[10px] uppercase"
            >
              <span>DESCUBRA MAIS</span>
              <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            </a>
          </div>
        </div>
      </section>

      {/* 3.5. QUICK BUTTONS / NAVEGAÇÃO RÁPIDA (Configured in Site Builder) */}
      {sections
        .filter((s) => s.type === 'quick_buttons' && s.isEnabled)
        .map((section) => {
          const btns = (section.settings?.buttons || []).filter((b: any) => b.isEnabled);
          if (btns.length === 0) return null;
          return (
            <section key={section.id} className="py-12 bg-[#101010] border-b border-[#292929]">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
                  <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
                    [ NAVEGAÇÃO RÁPIDA & ATALHOS ]
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#F8F8F5]">
                    Acesso Direto
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {btns.map((b: any, idx: number) => (
                    <a
                      key={b.id || idx}
                      href={b.url || '#'}
                      className="p-4 bg-[#181818] border border-[#292929] hover:border-[#C7F36B] transition-all flex items-center gap-3 group cursor-pointer"
                    >
                      <div className="w-9 h-9 bg-[#222] group-hover:bg-[#C7F36B] group-hover:text-black text-[#C7F36B] transition-colors flex items-center justify-center shrink-0">
                        {b.type === 'whatsapp' ? (
                          <MessageCircle className="w-4 h-4" />
                        ) : b.type === 'phone' ? (
                          <Phone className="w-4 h-4" />
                        ) : b.type === 'location' ? (
                          <MapPin className="w-4 h-4" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </div>
                      <span className="font-bold text-xs uppercase tracking-wider text-[#F8F8F5] group-hover:text-[#C7F36B] truncate">
                        {b.title}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </section>
          );
        })}

      {/* 4. MANIFESTO DA MARCA (Seção B) */}
      <section id="manifesto" className="py-24 sm:py-32 bg-[#101010] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Left Column: Big Statement */}
            <div className="lg:col-span-7 space-y-8">
              <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
                [ 01 // MANIFESTO & FILOSOFIA ]
              </span>

              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight leading-tight text-[#F8F8F5]">
                {aboutSection?.settings?.subtitle ||
                  'A armação certa não esconde o seu rosto. Ela traduz a sua essência.'}
              </h2>

              <p className="text-[#A7A7A1] text-base sm:text-lg leading-relaxed font-normal">
                {aboutSection?.settings?.text ||
                  'Nossa ótica opera no ponto de convergência entre a moda autoral e a tecnologia óptica mais avançada do mundo. Selecionamos armações esculpidas em acetato italiano e titânio puro para quem entende que o óculos é a moldura viva da sua personalidade.'}
              </p>

              {/* Pillars / Differential Points */}
              {(() => {
                const defaultPillars = [
                  { title: 'Curadoria Autoral', desc: 'Armações exclusivas de designers independentes e marcas globais de prestígio.', tag: '01 / DESIGN' },
                  { title: 'Titânio & Acetato', desc: 'Resistência vitalícia, leveza milimétrica e acabamentos antialérgicos.', tag: '02 / MATERIAIS' },
                  { title: 'Laboratório Digital', desc: 'Adaptação oftalmológica computadorizada com proteção de luz azul e antirreflexo.', tag: '03 / PRECISÃO' },
                ];
                const list = aboutSection?.settings?.highlights !== undefined
                  ? aboutSection.settings.highlights
                  : defaultPillars;

                if (list.length === 0) return null;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-[#292929]">
                    {list.map((item: any, idx: number) => (
                      <div key={idx}>
                        <span className="text-xs font-mono text-[#C7F36B] block mb-1">
                          {item.tag || `0${idx + 1} / DESTAQUE`}
                        </span>
                        <h4 className="font-bold text-sm text-[#F8F8F5] uppercase tracking-wider">{item.title}</h4>
                        <p className="text-xs text-[#A7A7A1] mt-1 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Right Column: Editorial Visual Card */}
            <div className="lg:col-span-5 relative">
              <div className="relative aspect-[4/5] overflow-hidden bg-[#202020] border border-[#292929]">
                <img
                  src={
                    aboutSection?.settings?.image ||
                    'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=1200&q=80'
                  }
                  alt="Manifesto Editorial"
                  className="w-full h-full object-cover filter contrast-105 hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-xs text-[#F8F8F5] font-mono tracking-widest uppercase">
                  <span className="text-[#C7F36B] block text-[10px] mb-1">BESPOKE ATELIER</span>
                  ESTÉTICA ESCULTURAL & CONFORTO
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. DESCUBRA SEU ESTILO (Seção F - Interactive Eyewear Style Discovery) */}
      <section id="estilos" className="py-24 bg-[#181818] border-y border-[#292929] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
            <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
              [ 02 // CONSULTORIA INTERATIVA ]
            </span>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-[#F8F8F5]">
              Descubra seu Estilo de Eyewear
            </h2>
            <p className="text-sm sm:text-base text-[#A7A7A1] leading-relaxed">
              Toque no perfil estético que melhor reflete a sua atitude e veja as armações ideais do catálogo para o seu visual.
            </p>
          </div>

          {/* Style Selector Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-10">
            {STYLE_PROFILES.map((st) => {
              const isSelected = selectedStyle === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => setSelectedStyle(st.id)}
                  className={`px-4 sm:px-5 py-2.5 text-xs font-bold tracking-[0.18em] uppercase transition-all duration-200 cursor-pointer rounded-none border ${
                    isSelected
                      ? 'bg-[#C7F36B] text-black border-[#C7F36B] shadow-lg font-black'
                      : 'bg-[#101010] text-[#A7A7A1] border-[#292929] hover:border-[#C7F36B]/60 hover:text-[#F8F8F5]'
                  }`}
                >
                  {st.name}
                </button>
              );
            })}
          </div>

          {/* Active Style Profile Card */}
          {selectedStyle !== 'todos' && (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-[#101010] border border-[#292929] mb-10 max-w-2xl mx-auto text-center space-y-2"
            >
              {(() => {
                const activeP = STYLE_PROFILES.find((s) => s.id === selectedStyle);
                if (!activeP) return null;
                return (
                  <>
                    <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-[#C7F36B]">
                      {activeP.tagline}
                    </span>
                    <p className="text-xs sm:text-sm text-[#A7A7A1]">{activeP.description}</p>
                  </>
                );
              })()}
            </motion.div>
          )}

          {/* Products filtered by style (showing real catalog) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {displayedProducts.slice(0, 4).map((prod) => {
              const mainImg = prod.primaryImage?.publicUrl || prod.images?.[0]?.publicUrl;
              const hasDiscount = prod.promotionalPrice && prod.price && prod.promotionalPrice < prod.price;

              return (
                <div
                  key={prod.id}
                  onClick={() => handleOpenProduct(prod)}
                  className="group bg-[#101010] border border-[#292929] hover:border-[#C7F36B] transition-all duration-300 flex flex-col justify-between cursor-pointer p-5"
                >
                  <div className="relative aspect-[4/3] bg-[#1a1a1a] overflow-hidden mb-4 flex items-center justify-center p-3">
                    {mainImg ? (
                      <img
                        src={mainImg}
                        alt={prod.name}
                        className="w-full h-full object-contain filter contrast-105 group-hover:scale-110 transition-transform duration-500"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Glasses className="w-10 h-10 text-[#444]" />
                    )}

                    {hasDiscount && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 bg-[#C7F36B] text-black font-black text-[10px] tracking-widest uppercase">
                        OFERTA
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-mono tracking-[0.25em] text-[#A7A7A1] uppercase block">
                      {prod.category?.name || 'Armação Autoral'}
                    </span>
                    <h3 className="font-bold text-sm text-[#F8F8F5] group-hover:text-[#C7F36B] transition-colors truncate">
                      {prod.name}
                    </h3>

                    <div className="flex items-baseline gap-2 pt-1">
                      {prod.priceOnRequest ? (
                        <span className="text-xs font-bold text-[#C7F36B]">Sob Consulta</span>
                      ) : hasDiscount ? (
                        <>
                          <span className="text-xs text-[#A7A7A1] line-through">
                            R$ {prod.price?.toFixed(2).replace('.', ',')}
                          </span>
                          <span className="text-sm font-black text-[#C7F36B]">
                            R$ {prod.promotionalPrice?.toFixed(2).replace('.', ',')}
                          </span>
                        </>
                      ) : prod.price ? (
                        <span className="text-sm font-black text-[#F8F8F5]">
                          R$ {prod.price.toFixed(2).replace('.', ',')}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs font-mono text-[#A7A7A1] group-hover:text-[#C7F36B]">
                    <span>DETALHES</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. COLEÇÃO EM DESTAQUE (Seção C - Real Catalog) */}
      <section id="colecao" className="py-24 sm:py-32 bg-[#101010] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#292929]">
            <div>
              <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
                [ 03 // CATÁLOGO OFICIAL ]
              </span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-[#F8F8F5] mt-2">
                {productsSection?.settings?.title || 'Coleção em Destaque'}
              </h2>
              <p className="text-sm sm:text-base text-[#A7A7A1] mt-2 max-w-xl">
                {productsSection?.settings?.subtitle ||
                  'Armações e óculos solares com procedência garantida e estética internacional.'}
              </p>
            </div>

            {/* Search Input */}
            <div className="w-full md:w-72">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar modelo ou cor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#181818] border border-[#292929] text-xs text-[#F8F8F5] placeholder-[#666] focus:outline-hidden focus:border-[#C7F36B] transition-colors rounded-none"
                />
                <Search className="w-3.5 h-3.5 text-[#666] absolute right-3 top-3.5" />
              </div>
            </div>
          </div>

          {/* Category Filter Chips */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 text-xs font-bold tracking-[0.15em] uppercase whitespace-nowrap cursor-pointer transition-colors border ${
                  selectedCategory === 'all'
                    ? 'bg-[#F8F8F5] text-black border-[#F8F8F5]'
                    : 'bg-[#181818] text-[#A7A7A1] border-[#292929] hover:text-[#F8F8F5]'
                }`}
              >
                Todas ({products.length})
              </button>
              {categories.map((c) => {
                const count = products.filter((p) => p.categoryId === c.id).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCategory(c.id)}
                    className={`px-4 py-2 text-xs font-bold tracking-[0.15em] uppercase whitespace-nowrap cursor-pointer transition-colors border ${
                      selectedCategory === c.id
                        ? 'bg-[#F8F8F5] text-black border-[#F8F8F5]'
                        : 'bg-[#181818] text-[#A7A7A1] border-[#292929] hover:text-[#F8F8F5]'
                    }`}
                  >
                    {c.name} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Products Grid with Editorial Stagger */}
          {loadingCatalog ? (
            <div className="py-20 text-center space-y-3">
              <Glasses className="w-8 h-8 text-[#C7F36B] animate-spin mx-auto" />
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#A7A7A1]">
                Carregando acervo editorial...
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-16 text-center border border-[#292929] bg-[#181818] p-8 space-y-3">
              <Glasses className="w-10 h-10 text-[#555] mx-auto" />
              <h3 className="font-bold text-sm text-[#F8F8F5] uppercase tracking-wider">
                Nenhum modelo encontrado
              </h3>
              <p className="text-xs text-[#A7A7A1] max-w-sm mx-auto">
                Não encontramos armações correspondentes ao termo informado. Tente outra busca ou limpe os filtros.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedStyle('todos');
                }}
                className="mt-2 px-4 py-2 bg-[#C7F36B] text-black text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Ver Todas as Armações
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8">
              {filteredProducts.map((p, idx) => {
                const primaryImg = p.primaryImage?.publicUrl || p.images?.[0]?.publicUrl;
                const secondaryImg = p.images && p.images.length > 1 ? p.images[1].publicUrl : null;
                const hasDiscount = p.promotionalPrice && p.price && p.promotionalPrice < p.price;

                return (
                  <motion.div
                    key={p.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.5, delay: idx % 4 * 0.1 }}
                    className="group bg-[#161616] border border-[#242424] hover:border-[#C7F36B] transition-all duration-300 flex flex-col justify-between"
                  >
                    {/* Image Area with hover reveal */}
                    <div
                      onClick={() => handleOpenProduct(p)}
                      className="relative aspect-[4/3] bg-[#1d1d1d] overflow-hidden flex items-center justify-center p-4 cursor-pointer"
                    >
                      {primaryImg ? (
                        <>
                          <img
                            src={primaryImg}
                            alt={p.name}
                            className={`w-full h-full object-contain filter contrast-105 transition-all duration-500 ${
                              secondaryImg ? 'group-hover:opacity-0' : 'group-hover:scale-105'
                            }`}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          {secondaryImg && (
                            <img
                              src={secondaryImg}
                              alt={`${p.name} alternativa`}
                              className="w-full h-full object-contain filter contrast-105 absolute inset-0 p-4 opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </>
                      ) : (
                        <Glasses className="w-12 h-12 text-[#444]" />
                      )}

                      {/* Promo Tag */}
                      {hasDiscount && (
                        <div className="absolute top-3 left-3 bg-[#C7F36B] text-black font-black text-[9px] tracking-[0.2em] uppercase px-2 py-0.5">
                          OFF
                        </div>
                      )}

                      {/* Quick View Tag on Hover */}
                      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 px-2.5 py-1 text-[10px] font-mono text-[#F8F8F5] tracking-widest flex items-center gap-1.5 backdrop-blur-xs">
                        <Eye className="w-3 h-3 text-[#C7F36B]" />
                        <span>VER PEÇA</span>
                      </div>
                    </div>

                    {/* Product Details Info */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono tracking-widest text-[#A7A7A1] uppercase">
                          <span>{p.category?.name || 'Eyewear Autoral'}</span>
                          {p.sku && <span>SKU: {p.sku}</span>}
                        </div>

                        <h3
                          onClick={() => handleOpenProduct(p)}
                          className="font-bold text-base text-[#F8F8F5] group-hover:text-[#C7F36B] transition-colors cursor-pointer truncate"
                        >
                          {p.name}
                        </h3>

                        {p.shortDescription && (
                          <p className="text-xs text-[#A7A7A1] line-clamp-2 leading-relaxed">
                            {p.shortDescription}
                          </p>
                        )}
                      </div>

                      {/* Pricing and Action row */}
                      <div className="pt-4 mt-4 border-t border-[#222] flex items-center justify-between">
                        <div>
                          {p.priceOnRequest ? (
                            <span className="text-xs font-bold text-[#C7F36B] tracking-wider uppercase">
                              Sob Consulta
                            </span>
                          ) : hasDiscount ? (
                            <div className="flex flex-col">
                              <span className="text-[11px] text-[#A7A7A1] line-through leading-none">
                                R$ {p.price?.toFixed(2).replace('.', ',')}
                              </span>
                              <span className="text-base font-black text-[#C7F36B] leading-tight">
                                R$ {p.promotionalPrice?.toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                          ) : p.price ? (
                            <span className="text-base font-black text-[#F8F8F5]">
                              R$ {p.price.toFixed(2).replace('.', ',')}
                            </span>
                          ) : (
                            <span className="text-xs text-[#A7A7A1]">Disponível na Loja</span>
                          )}
                        </div>

                        {/* Direct Button */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenProduct(p)}
                            className="px-3 py-1.5 bg-transparent border border-[#333] hover:border-[#C7F36B] hover:text-[#C7F36B] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Detalhes
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 7. CAMPANHA VISUAL / LOOKBOOK EDITORIAL (Seção D & Gallery) */}
      <section className="py-24 bg-[#141414] border-t border-[#292929]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
              [ 04 // EDITORIAL LOOKBOOK ]
            </span>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-[#F8F8F5]">
              {gallerySection?.settings?.title || 'Campanha Visual'}
            </h2>
            <p className="text-sm text-[#A7A7A1]">
              {gallerySection?.settings?.subtitle ||
                'Expressão, atitude e elegância em cada ângulo e iluminação.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(
              gallerySection?.settings?.items || [
                {
                  id: 'g1',
                  url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=800&q=80',
                  caption: 'Geometrias arquiteturais e lentes fotocromáticas',
                },
                {
                  id: 'g2',
                  url: 'https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=800&q=80',
                  caption: 'Acabamentos acetinados e detalhes em titânio fosco',
                },
                {
                  id: 'g3',
                  url: 'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?auto=format&fit=crop&w=800&q=80',
                  caption: 'Edição limitada Solar Avant-Garde',
                },
              ]
            ).map((item: any, i: number) => (
              <div
                key={item.id || i}
                className="group relative aspect-[3/4] overflow-hidden bg-[#1f1f1f] border border-[#292929]"
              >
                <img
                  src={item.url}
                  alt={item.caption || 'Campanha Ótica'}
                  className="w-full h-full object-cover filter contrast-105 group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                <div className="absolute bottom-4 left-4 right-4 text-xs font-mono tracking-widest uppercase text-[#F8F8F5]">
                  <span className="text-[#C7F36B] block text-[10px] mb-1">0{i + 1} / SÉRIE</span>
                  {item.caption}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. SOBRE A ÓTICA, ATELIÊ & LOCALIZAÇÃO (Seção G) */}
      <section id="atelie" className="py-24 bg-[#101010] border-t border-[#292929]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Story & Boutique Details */}
            <div className="space-y-6">
              <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
                [ 05 // O ATELIÊ & SHOWROOM ]
              </span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-[#F8F8F5]">
                Atendimento Personalizado e Alta Tecnologia Ótica
              </h2>
              <p className="text-[#A7A7A1] text-base leading-relaxed">
                Nosso espaço foi concebido como um ateliê de arte visual. Aqui, você experimenta armações exclusivas com tranquilidade e conta com orientação de especialistas em visagismo e saúde oftalmológica.
              </p>

              {/* Status Badge */}
              {scheduleStatus && (
                <div className="p-4 bg-[#181818] border border-[#292929] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        scheduleStatus.isOpen ? 'bg-[#C7F36B] animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#F8F8F5]">
                      {scheduleStatus.isOpen ? 'Ateliê Aberto Agora' : 'Ateliê Fechado no Momento'}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#A7A7A1]">{scheduleStatus.text}</span>
                </div>
              )}

              {/* Physical Address */}
              {hasPhysicalAddress && (
                <div className="p-4 bg-[#181818] border border-[#292929] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#F8F8F5] uppercase tracking-wider">
                    <MapPin className="w-4 h-4 text-[#C7F36B]" />
                    <span>Endereço da Loja Física</span>
                  </div>
                  <p className="text-xs text-[#A7A7A1] leading-relaxed">
                    {formattedAddress}
                    {addressCity && ` — ${addressCity}`}
                    {addressState && ` / ${addressState}`}
                  </p>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      `${tenant.name} ${formattedAddress} ${addressCity}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-[#C7F36B] hover:underline pt-1"
                  >
                    <span>Como Chegar no Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* FAQ Accordion */}
            <div className="space-y-4">
              <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
                [ PERGUNTAS FREQUENTES ]
              </span>
              <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-[#F8F8F5]">
                Dúvidas Sobre Nossos Óculos
              </h3>

              <div className="divide-y divide-[#292929] border-y border-[#292929]">
                {(
                  faqSection?.settings?.items || [
                    {
                      id: 'f1',
                      question: 'Vocês colocam lentes com meu grau médico?',
                      answer:
                        'Sim. Recebemos sua receita oftalmológica e enviamos para laboratórios digitais de ponta para confecção de lentes com filtro azul, antirreflexo e proteção UV400.',
                    },
                    {
                      id: 'f2',
                      question: 'Como funciona o envio ou entrega?',
                      answer:
                        'Enviamos com seguro total para todo o Brasil em estojo rígido original e flanela de microfibra premium. Também é possível retirar no nosso showroom.',
                    },
                    {
                      id: 'f3',
                      question: 'Como faço para experimentar os modelos?',
                      answer:
                        'Você pode visitar nosso showroom físico ou falar com nosso consultor no WhatsApp para receber fotos no rosto e medidas exatas.',
                    },
                  ]
                ).map((faq: any, idx: number) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div key={faq.id || idx} className="py-4">
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full flex items-center justify-between text-left text-sm font-bold text-[#F8F8F5] hover:text-[#C7F36B] transition-colors cursor-pointer"
                      >
                        <span>{faq.question}</span>
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-[#C7F36B] shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#A7A7A1] shrink-0" />
                        )}
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2 text-xs text-[#A7A7A1] leading-relaxed"
                          >
                            {faq.answer}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. DEPOIMENTOS DE CLIENTES (Seção H) */}
      {reviewsSection?.settings?.reviews && reviewsSection.settings.reviews.length > 0 && (
        <section className="py-20 bg-[#161616] border-t border-[#292929]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
                [ AVALIAÇÕES REAIS ]
              </span>
              <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-[#F8F8F5]">
                O Que Nossos Clientes Dizem
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {reviewsSection.settings.reviews.map((rev: any) => (
                <div key={rev.id} className="p-6 bg-[#101010] border border-[#292929] space-y-3">
                  <div className="flex items-center gap-1 text-[#C7F36B]">
                    {[...Array(rev.rating || 5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="text-xs sm:text-sm text-[#F8F8F5] italic leading-relaxed">
                    "{rev.text}"
                  </p>
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#A7A7A1] pt-2 border-t border-[#222]">
                    <span className="font-bold text-[#F8F8F5]">{rev.authorName}</span>
                    <span>{rev.date || 'Cliente Verificado'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 9.3. SERVICES SECTION (Configured in Site Builder) */}
      {sections
        .filter((s) => s.type === 'services' && s.isEnabled)
        .map((section) => {
          const servicesList = section.settings?.services || [];
          if (servicesList.length === 0) return null;
          return (
            <section key={section.id} className="py-24 bg-[#121212] border-t border-[#292929]">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                <div className="text-center max-w-2xl mx-auto space-y-2">
                  <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
                    [ SERVIÇOS & CONSULTORIAS ]
                  </span>
                  <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-[#F8F8F5]">
                    {section.settings?.title || 'Nossos Serviços Especializados'}
                  </h2>
                  <p className="text-sm text-[#A7A7A1]">
                    {section.settings?.subtitle || 'Atendimento óptico e exames com excelência técnica.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {servicesList.map((srv: any, idx: number) => (
                    <div key={srv.id || idx} className="p-6 bg-[#181818] border border-[#292929] space-y-4">
                      <div className="w-10 h-10 bg-[#222] text-[#C7F36B] flex items-center justify-center font-bold">
                        0{idx + 1}
                      </div>
                      <h3 className="font-bold text-lg text-[#F8F8F5] uppercase tracking-wide">{srv.name}</h3>
                      <p className="text-xs text-[#A7A7A1] leading-relaxed">{srv.description}</p>
                      {srv.price && (
                        <div className="pt-2 text-sm font-black text-[#C7F36B]">
                          R$ {Number(srv.price).toFixed(2).replace('.', ',')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}

      {/* 9.5. SOCIAL LINKS / REDES SOCIAIS (Configured in Site Builder) */}
      {sections
        .filter((s) => s.type === 'social_links' && s.isEnabled)
        .map((section) => {
          const links = (section.settings?.links || []).filter((l: any) => l.isEnabled && l.url);
          if (links.length === 0) return null;
          return (
            <section key={section.id} className="py-16 bg-[#141414] border-t border-[#292929]">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
                <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
                  [ CANAIS OFICIAIS & REDES ]
                </span>
                <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-[#F8F8F5]">
                  Conecte-se com a Nossa Ótica
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {links.map((link: any, idx: number) => (
                    <a
                      key={link.id || idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-4 bg-[#1a1a1a] border border-[#292929] hover:border-[#C7F36B] text-[#F8F8F5] hover:text-[#C7F36B] font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2.5 cursor-pointer shadow-md"
                    >
                      {link.platform === 'instagram' && <Instagram className="w-4 h-4 text-[#C7F36B]" />}
                      {link.platform === 'facebook' && <Facebook className="w-4 h-4 text-[#C7F36B]" />}
                      {link.platform === 'whatsapp' && <MessageCircle className="w-4 h-4 text-[#C7F36B]" />}
                      {link.platform === 'youtube' && <Youtube className="w-4 h-4 text-[#C7F36B]" />}
                      {!['instagram', 'facebook', 'whatsapp', 'youtube'].includes(link.platform) && (
                        <Globe className="w-4 h-4 text-[#C7F36B]" />
                      )}
                      <span>{link.title || link.platform}</span>
                      <ExternalLink className="w-3 h-3 text-[#777]" />
                    </a>
                  ))}
                </div>
              </div>
            </section>
          );
        })}

      {/* 10. CHAMADA FINAL (Seção I - Closing CTA) */}
      <section id="contato" className="py-24 bg-[#101010] border-t border-[#292929] relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6 relative z-10">
          <span className="text-[11px] font-mono tracking-[0.35em] text-[#C7F36B] uppercase block">
            {ctaSection?.settings?.tagline || '[ AGENDAMENTO & CONSULTORIA ]'}
          </span>

          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight leading-tight text-[#F8F8F5]">
            {ctaSection?.settings?.title || 'SEU NOVO OLHAR COMEÇA AQUI'}
          </h2>

          <p className="text-sm sm:text-base text-[#A7A7A1] max-w-xl mx-auto leading-relaxed">
            {ctaSection?.settings?.subtitle ||
              ctaSection?.settings?.description ||
              'Converse com nossos consultores pelo WhatsApp para receber recomendações exclusivas ou tirar dúvidas sobre armações e lentes.'}
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            {cleanPhone && (
              <a
                href={waBaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-10 py-5 bg-[#C7F36B] hover:bg-[#b5e655] text-black font-black text-xs sm:text-sm tracking-[0.2em] uppercase transition-all duration-300 rounded-none shadow-2xl flex items-center gap-3 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{ctaSection?.settings?.buttonText || 'Iniciar Atendimento no WhatsApp'}</span>
              </a>
            )}

            <a
              href={ctaSection?.settings?.secondaryButtonUrl || '#colecao'}
              className="px-8 py-5 bg-transparent border border-[#F8F8F5]/30 hover:border-[#C7F36B] text-[#F8F8F5] hover:text-[#C7F36B] font-bold text-xs sm:text-sm tracking-[0.2em] uppercase transition-all duration-300 rounded-none cursor-pointer"
            >
              {ctaSection?.settings?.secondaryButtonText || 'Ver Todas as Peças'}
            </a>
          </div>
        </div>
      </section>

      {/* 11. RODAPÉ EDITORIAL (Seção J) */}
      <footer className="py-16 bg-[#0a0a0a] border-t border-[#202020] text-xs text-[#A7A7A1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Column 1: Brand Info */}
            <div className="space-y-3">
              <span className="text-base font-black tracking-[0.2em] uppercase text-[#F8F8F5]">
                {tenant.name}
              </span>
              <p className="text-xs text-[#777] leading-relaxed">
                Ótica editorial independente dedicada a armações autorais e excelência oftalmológica.
              </p>
              {cleanPhone && (
                <div className="text-xs font-mono text-[#C7F36B]">
                  WhatsApp: +55 {cleanPhone}
                </div>
              )}
            </div>

            {/* Column 2: Navigation */}
            <div className="space-y-2">
              <h4 className="font-bold text-[#F8F8F5] tracking-widest uppercase text-[11px]">
                Navegação
              </h4>
              <ul className="space-y-1.5 text-xs">
                <li>
                  <a href="#colecao" className="hover:text-[#C7F36B] transition-colors">
                    Coleções
                  </a>
                </li>
                <li>
                  <a href="#estilos" className="hover:text-[#C7F36B] transition-colors">
                    Descubra seu Estilo
                  </a>
                </li>
                <li>
                  <a href="#manifesto" className="hover:text-[#C7F36B] transition-colors">
                    Manifesto da Marca
                  </a>
                </li>
                <li>
                  <a href="#atelie" className="hover:text-[#C7F36B] transition-colors">
                    O Ateliê
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Physical Address & Hours */}
            <div className="space-y-2">
              <h4 className="font-bold text-[#F8F8F5] tracking-widest uppercase text-[11px]">
                Showroom
              </h4>
              <p className="text-xs text-[#777] leading-relaxed">
                {formattedAddress || 'Consulte nosso endereço no atendimento.'}
                {addressCity && ` — ${addressCity}/${addressState || ''}`}
              </p>
              {scheduleStatus && (
                <p className="text-xs font-mono text-[#A7A7A1] pt-1">
                  Horário: {scheduleStatus.text}
                </p>
              )}
            </div>

            {/* Column 4: Social links */}
            <div className="space-y-3">
              <h4 className="font-bold text-[#F8F8F5] tracking-widest uppercase text-[11px]">
                Conecte-se
              </h4>
              <div className="flex items-center gap-3">
                {instagramLink && (
                  <a
                    href={instagramLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-none border border-[#292929] flex items-center justify-center text-[#A7A7A1] hover:text-[#C7F36B] hover:border-[#C7F36B] transition-colors"
                  >
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {facebookLink && (
                  <a
                    href={facebookLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-none border border-[#292929] flex items-center justify-center text-[#A7A7A1] hover:text-[#C7F36B] hover:border-[#C7F36B] transition-colors"
                  >
                    <Facebook className="w-4 h-4" />
                  </a>
                )}
                {cleanPhone && (
                  <a
                    href={waBaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-none border border-[#292929] flex items-center justify-center text-[#A7A7A1] hover:text-[#C7F36B] hover:border-[#C7F36B] transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-[#1c1c1c] flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px] text-[#666]">
            <span>
              © {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.
            </span>
            <span>POWERED BY LOCALHUB • TEMPLATE ÓTICA EDITORIAL</span>
          </div>
        </div>
      </footer>

      {/* 12. PRODUCT DETAILS MODAL (Etapa 7 & 8) */}
      <AnimatePresence>
        {selectedProductForModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121212] border border-[#292929] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col md:flex-row relative text-[#F8F8F5]"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setSelectedProductForModal(null)}
                className="absolute top-4 right-4 z-20 p-2 text-[#A7A7A1] hover:text-[#C7F36B] bg-black/50 hover:bg-black rounded-none transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Left Column: Gallery */}
              <div className="md:w-1/2 p-6 bg-[#181818] border-b md:border-b-0 md:border-r border-[#292929] flex flex-col justify-between">
                <div className="relative aspect-[4/3] bg-[#121212] flex items-center justify-center p-4 overflow-hidden mb-4">
                  {selectedProductForModal.images && selectedProductForModal.images.length > 0 ? (
                    <img
                      src={
                        selectedProductForModal.images[activeModalImageIndex]?.publicUrl ||
                        selectedProductForModal.primaryImage?.publicUrl
                      }
                      alt={selectedProductForModal.name}
                      className="w-full h-full object-contain filter contrast-105"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Glasses className="w-16 h-16 text-[#444]" />
                  )}
                </div>

                {/* Thumbnails */}
                {selectedProductForModal.images && selectedProductForModal.images.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {selectedProductForModal.images.map((img, i) => (
                      <button
                        key={img.id || i}
                        type="button"
                        onClick={() => setActiveModalImageIndex(i)}
                        className={`w-14 h-14 bg-[#121212] border p-1 cursor-pointer transition-all shrink-0 ${
                          activeModalImageIndex === i ? 'border-[#C7F36B]' : 'border-[#333] opacity-60'
                        }`}
                      >
                        <img
                          src={img.publicUrl}
                          alt="Miniatura"
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Info & Commerce Actions */}
              <div className="md:w-1/2 p-6 md:p-8 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="text-[10px] font-mono tracking-[0.25em] text-[#C7F36B] uppercase">
                    {selectedProductForModal.category?.name || 'COLEÇÃO AUTORAL'}
                  </div>

                  <h3 className="text-2xl sm:text-3xl font-black uppercase text-[#F8F8F5]">
                    {selectedProductForModal.name}
                  </h3>

                  {selectedProductForModal.sku && (
                    <div className="text-xs font-mono text-[#A7A7A1]">
                      Código / Ref: {selectedProductForModal.sku}
                    </div>
                  )}

                  {/* Pricing */}
                  <div className="pt-2">
                    {selectedProductForModal.priceOnRequest ? (
                      <span className="text-lg font-bold text-[#C7F36B] uppercase tracking-wider">
                        Preço Sob Consulta
                      </span>
                    ) : (
                      (() => {
                        const basePrice = selectedVariant?.price ?? selectedProductForModal.price;
                        const promoPrice =
                          selectedVariant?.promotionalPrice ?? selectedProductForModal.promotionalPrice;
                        const hasDisc = promoPrice && basePrice && promoPrice < basePrice;

                        return (
                          <div className="flex items-baseline gap-3">
                            {hasDisc ? (
                              <>
                                <span className="text-sm text-[#A7A7A1] line-through">
                                  R$ {basePrice?.toFixed(2).replace('.', ',')}
                                </span>
                                <span className="text-2xl font-black text-[#C7F36B]">
                                  R$ {promoPrice?.toFixed(2).replace('.', ',')}
                                </span>
                              </>
                            ) : basePrice ? (
                              <span className="text-2xl font-black text-[#F8F8F5]">
                                R$ {basePrice.toFixed(2).replace('.', ',')}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()
                    )}
                  </div>

                  {/* Description */}
                  {selectedProductForModal.description && (
                    <p className="text-xs sm:text-sm text-[#A7A7A1] leading-relaxed pt-2">
                      {selectedProductForModal.description}
                    </p>
                  )}

                  {/* Variants Selector */}
                  {selectedProductForModal.variants && selectedProductForModal.variants.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <span className="text-xs font-mono uppercase tracking-widest text-[#A7A7A1]">
                        Selecione a Opção / Cor:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedProductForModal.variants.map((v) => {
                          const isSel = selectedVariant?.id === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setSelectedVariant(v)}
                              className={`px-3 py-1.5 text-xs font-bold uppercase transition-colors cursor-pointer border ${
                                isSel
                                  ? 'bg-[#C7F36B] text-black border-[#C7F36B]'
                                  : 'bg-[#181818] text-[#A7A7A1] border-[#333] hover:text-[#F8F8F5]'
                              }`}
                            >
                              {v.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-3 pt-6 border-t border-[#292929]">
                  {/* WhatsApp Direct Buy/Inquiry Button */}
                  {cleanPhone && (
                    <a
                      href={getProductWhatsAppUrl(selectedProductForModal, selectedVariant)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-4 bg-[#C7F36B] hover:bg-[#b5e655] text-black font-black text-xs tracking-[0.2em] uppercase transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Consultar / Reservar no WhatsApp</span>
                    </a>
                  )}

                  {/* Add to Cart button (when shopping cart enabled) */}
                  {hasShoppingCart && (
                    <button
                      type="button"
                      onClick={() => {
                        const rawBasePrice = selectedVariant?.price ?? selectedProductForModal.price;
                        const rawPromoPrice =
                          selectedVariant?.promotionalPrice ?? selectedProductForModal.promotionalPrice;
                        const resolved = resolveEffectivePrice(rawBasePrice, rawPromoPrice);
                        const imgUrl =
                          selectedProductForModal.primaryImage?.publicUrl ||
                          selectedProductForModal.images?.[0]?.publicUrl ||
                          null;

                        cart.addToCart(
                          selectedProductForModal.id,
                          selectedVariant ? selectedVariant.id : null,
                          modalQty,
                          selectedProductForModal.name,
                          {
                            variantName: selectedVariant ? selectedVariant.name : null,
                            imageUrl: imgUrl,
                            unitPrice: resolved.unitPrice,
                            originalPrice: resolved.originalPrice,
                            hasDiscount: resolved.hasDiscount,
                          }
                        );
                        setAddedToast(`"${selectedProductForModal.name}" adicionado à sacola!`);
                        setTimeout(() => setAddedToast(null), 4000);
                        setSelectedProductForModal(null);
                        cart.openCart();
                      }}
                      className="w-full py-3.5 bg-transparent border border-[#F8F8F5]/40 hover:border-[#C7F36B] hover:text-[#C7F36B] text-[#F8F8F5] font-bold text-xs tracking-[0.2em] uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Adicionar à Sacola</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart Drawer & Checkout Integration */}
      {hasShoppingCart && (
        <>
          <CartDrawer tenant={tenant} primaryColor={primaryColor} />
          <CheckoutModal tenant={tenant} primaryColor={primaryColor} />
          <OrderSuccessModal tenant={tenant} />
        </>
      )}

      {/* Added to cart toast */}
      <AnimatePresence>
        {addedToast && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 right-6 z-50 bg-[#C7F36B] text-black px-5 py-3 font-bold text-xs tracking-wider uppercase shadow-2xl flex items-center gap-2"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{addedToast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
