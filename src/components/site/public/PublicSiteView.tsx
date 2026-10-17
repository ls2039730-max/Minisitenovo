import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  Phone,
  MapPin,
  Clock,
  Star,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Menu,
  X,
  Share2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ShoppingCart,
  ShoppingBag,
  Scissors,
  UtensilsCrossed,
  Flame,
  Award,
  Heart,
  Tag,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Linkedin,
  Globe,
  Send,
  Eye,
} from 'lucide-react';
import { SiteData, SiteSection } from '../../../types/site';
import { Tenant } from '../../../types/saas';
import { calculateScheduleStatus } from '../../../constants/blockRegistry';
import { PublicProductCatalogSection } from './PublicProductCatalogSection';
import { PublicServicesSection } from './PublicServicesSection';
import { PublicTeamSection } from './PublicTeamSection';
import { PublicOticaEditorialView } from './PublicOticaEditorialView';
import { isTemplateExcludedFromGlobalStandard } from '../../../utils/templateExclusion';
import {
  MotionStudioProvider,
  MotionProgressBar,
  MotionMarquee,
  MotionReveal,
} from '../motion/MotionAdapter';
import { PremiumScrollReveal, PremiumTextReveal } from '../premium/PremiumMotion';
import { PremiumGalleryModal } from '../premium/PremiumGalleryModal';
import {
  RestaurantGastronomyHero,
  RestaurantGastronomyAbout,
  RestaurantReservationBanner,
} from '../premium/RestaurantGastronomyExperience';
import { CartProvider, useCart } from '../../../context/CartContext';
import { CartDrawer } from '../../cart/CartDrawer';
import { CheckoutModal } from '../../checkout/CheckoutModal';
import { OrderSuccessModal } from '../../checkout/OrderSuccessModal';

interface PublicSiteViewProps {
  tenant: Tenant;
  site: SiteData | null;
  isPublished?: boolean;
  isDraftPreview?: boolean;
  onExitPreview?: () => void;
}

// Helper to reliably parse YouTube, Vimeo or direct video URLs
function getVideoEmbedInfo(url?: string): {
  type: 'youtube' | 'vimeo' | 'direct' | 'unknown';
  embedUrl: string;
  videoId?: string;
} {
  if (!url || typeof url !== 'string') {
    return { type: 'unknown', embedUrl: '' };
  }
  const cleanUrl = url.trim();

  // YouTube checks (standard, shorts, embed, youtu.be)
  const ytMatch = cleanUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    const id = ytMatch[1];
    return {
      type: 'youtube',
      videoId: id,
      embedUrl: `https://www.youtube.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`,
    };
  }

  // Vimeo checks
  const vimeoMatch = cleanUrl.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    const id = vimeoMatch[1];
    return {
      type: 'vimeo',
      videoId: id,
      embedUrl: `https://player.vimeo.com/video/${id}?api=1`,
    };
  }

  return {
    type: 'direct',
    embedUrl: cleanUrl,
  };
}

// AutoPlay Video Player with IntersectionObserver (scroll-into-view autoplay)
interface AutoPlayVideoPlayerProps {
  url: string;
  title?: string;
  posterUrl?: string;
  radiusClass?: string;
}

const AutoPlayVideoPlayer: React.FC<AutoPlayVideoPlayerProps> = ({
  url,
  title,
  posterUrl,
  radiusClass = 'rounded-2xl',
}) => {
  if (!url || !url.trim()) return null;
  const vInfo = getVideoEmbedInfo(url);
  if (!vInfo.embedUrl) return null;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let hasAutoplayed = false;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // If at least 45% of the video is visible on screen
          if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
            setIsPlaying(true);

            // Handle direct HTML5 video
            if (videoRef.current) {
              videoRef.current.muted = true;
              videoRef.current
                .play()
                .catch((err) => console.log('[AutoPlayVideo] autoplay prevented:', err));
            }

            // Handle YouTube iframe autoplay via postMessage
            if (iframeRef.current && vInfo.type === 'youtube') {
              iframeRef.current.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'mute', args: [] }),
                '*'
              );
              iframeRef.current.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                '*'
              );
            }

            // Handle Vimeo iframe autoplay via postMessage
            if (iframeRef.current && vInfo.type === 'vimeo') {
              iframeRef.current.contentWindow?.postMessage(
                JSON.stringify({ method: 'setVolume', value: 0 }),
                '*'
              );
              iframeRef.current.contentWindow?.postMessage(
                JSON.stringify({ method: 'play' }),
                '*'
              );
            }

            hasAutoplayed = true;
          } else if (entry.intersectionRatio < 0.2 && hasAutoplayed) {
            // Pause when scrolled away
            setIsPlaying(false);

            if (videoRef.current) {
              videoRef.current.pause();
            }

            if (iframeRef.current && vInfo.type === 'youtube') {
              iframeRef.current.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
                '*'
              );
            }

            if (iframeRef.current && vInfo.type === 'vimeo') {
              iframeRef.current.contentWindow?.postMessage(
                JSON.stringify({ method: 'pause' }),
                '*'
              );
            }
          }
        });
      },
      {
        threshold: [0.1, 0.45, 0.8],
      }
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [vInfo.type, vInfo.embedUrl]);

  // Construct iframe embed URL with muted autoplay parameters
  const iframeSrc = (() => {
    if (vInfo.type === 'youtube') {
      const sep = vInfo.embedUrl.includes('?') ? '&' : '?';
      return `${vInfo.embedUrl}${sep}autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`;
    }
    if (vInfo.type === 'vimeo') {
      const sep = vInfo.embedUrl.includes('?') ? '&' : '?';
      return `${vInfo.embedUrl}${sep}autoplay=1&muted=1&playsinline=1&api=1`;
    }
    return vInfo.embedUrl;
  })();

  const toggleSound = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    } else if (iframeRef.current && vInfo.type === 'youtube') {
      if (isMuted) {
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
          '*'
        );
        setIsMuted(false);
      } else {
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'mute', args: [] }),
          '*'
        );
        setIsMuted(true);
      }
    } else if (iframeRef.current && vInfo.type === 'vimeo') {
      if (isMuted) {
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ method: 'setVolume', value: 1 }),
          '*'
        );
        setIsMuted(false);
      } else {
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ method: 'setVolume', value: 0 }),
          '*'
        );
        setIsMuted(true);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-video overflow-hidden shadow-2xl border border-slate-200/80 bg-black/90 ${radiusClass}`}
    >
      {vInfo.type === 'youtube' || vInfo.type === 'vimeo' ? (
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title={title || 'Vídeo de Apresentação'}
          className="w-full h-full border-0 pointer-events-auto"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <video
          ref={videoRef}
          muted={isMuted}
          playsInline
          loop
          controls
          poster={posterUrl}
          className="w-full h-full object-cover"
        >
          <source src={url} type="video/mp4" />
          Seu navegador não suporta reprodução de vídeos.
        </video>
      )}

      {/* Quick sound toggle badge (top-right overlay) */}
      <button
        type="button"
        onClick={toggleSound}
        className="absolute bottom-3 right-3 z-20 px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/70 hover:bg-black/90 text-white shadow-md backdrop-blur-xs flex items-center gap-1 transition-all"
        title={isMuted ? 'Ativar som' : 'Desativar som'}
      >
        <span>{isMuted ? '🔇 Ativar som' : '🔊 Som ativo'}</span>
      </button>
    </div>
  );
};

const PublicSiteViewInner: React.FC<PublicSiteViewProps> = ({
  tenant,
  site,
  isPublished = true,
  isDraftPreview = false,
  onExitPreview,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const [galleryModalOpen, setGalleryModalOpen] = useState(false);
  const [galleryModalItems, setGalleryModalItems] = useState<any[]>([]);
  const [galleryModalIndex, setGalleryModalIndex] = useState(0);
  const cart = useCart();
  const hasShoppingCart = tenant.featureOverrides?.shopping_cart !== false;
  const hasDeliveryFeature = tenant.featureOverrides?.delivery !== false;

  // Track page scroll to adapt header background and elevation smoothly
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Set document title, SEO, OpenGraph and Favicon tags dynamically
  useEffect(() => {
    if (tenant) {
      const pageTitle = site?.seo?.ogTitle || site?.seo?.title || (
        tenant.segment ? `${tenant.name} | ${tenant.segment}` : `${tenant.name} — Site Oficial & Pedidos`
      );
      document.title = pageTitle;

      const pageDesc = site?.seo?.ogDescription || site?.seo?.description || tenant.appearance?.tagline || `Conheça ${tenant.name}. Atendimento de excelência, qualidade e confiança. Faça seu pedido online ou fale conosco no WhatsApp!`;

      // Helper to update or create meta tag
      const setMetaTag = (attr: 'name' | 'property', key: string, content: string) => {
        if (!content) return;
        let el = document.querySelector(`meta[${attr}="${key}"]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute(attr, key);
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      };

      setMetaTag('name', 'description', pageDesc);
      setMetaTag('property', 'og:title', pageTitle);
      setMetaTag('property', 'og:description', pageDesc);
      setMetaTag('property', 'og:site_name', tenant.name);
      setMetaTag('property', 'og:type', 'website');
      setMetaTag('property', 'og:url', window.location.href);
      setMetaTag('name', 'twitter:title', pageTitle);
      setMetaTag('name', 'twitter:description', pageDesc);
      setMetaTag('name', 'twitter:card', 'summary_large_image');

      // Image: Priority is company logo
      let brandLogo = tenant.appearance?.logoUrl || site?.seo?.ogImage;
      if (brandLogo) {
        if (brandLogo.startsWith('/')) {
          brandLogo = window.location.origin + brandLogo;
        }
        setMetaTag('property', 'og:image', brandLogo);
        setMetaTag('property', 'og:image:secure_url', brandLogo);
        setMetaTag('name', 'twitter:image', brandLogo);

        // Update browser tab favicon to tenant logo
        let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
        if (!favicon) {
          favicon = document.createElement('link');
          favicon.setAttribute('rel', 'icon');
          document.head.appendChild(favicon);
        }
        favicon.href = brandLogo;

        let appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
        if (!appleIcon) {
          appleIcon = document.createElement('link');
          appleIcon.setAttribute('rel', 'apple-touch-icon');
          document.head.appendChild(appleIcon);
        }
        appleIcon.href = brandLogo;
      }

      // Schema.org LocalBusiness structured data
      const schemaScriptId = 'schema-local-business';
      let schemaScript = document.getElementById(schemaScriptId) as HTMLScriptElement | null;
      if (!schemaScript) {
        schemaScript = document.createElement('script');
        schemaScript.id = schemaScriptId;
        schemaScript.type = 'application/ld+json';
        document.head.appendChild(schemaScript);
      }

      const locationSection = site?.sections?.find((s) => s.type === 'location' && s.isEnabled);
      const loc = locationSection?.settings?.address;

      const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: tenant.name,
        description: pageDesc,
        image: brandLogo || undefined,
        telephone: tenant.phone || tenant.whatsapp || undefined,
        email: tenant.email || undefined,
        address: loc
          ? {
              '@type': 'PostalAddress',
              streetAddress: `${loc.street}, ${loc.number}`,
              addressLocality: loc.city,
              addressRegion: loc.state,
              postalCode: loc.zip,
              addressCountry: 'BR',
            }
          : undefined,
        url: window.location.href,
      };

      schemaScript.text = JSON.stringify(structuredData);
    }
  }, [site, tenant]);

  // If site is not published and not in draft preview
  if (!isPublished || !site) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-6 shadow-xl">
          <Building2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{tenant.name}</h1>
        <p className="text-slate-400 max-w-md text-sm leading-relaxed mb-6">
          Nosso novo site digital está sendo preparado e estará disponível em breve.
        </p>
        {tenant.whatsapp && (
          <a
            href={`https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            Fale Conosco pelo WhatsApp
          </a>
        )}
      </div>
    );
  }

  const app = site.appearance;
  const primaryColor = app.primaryColor || '#1e293b';
  const secondaryColor = app.secondaryColor || '#3b82f6';
  const accentColor = app.accentColor || '#f59e0b';
  const bgColor = app.backgroundColor || '#ffffff';
  const textColor = app.textColor || '#0f172a';
  const fontFamily = app.fontFamily || 'Inter';

  const radiusClass =
    app.borderRadius === 'none'
      ? 'rounded-none'
      : app.borderRadius === 'sm'
      ? 'rounded-lg'
      : app.borderRadius === 'md'
      ? 'rounded-xl'
      : app.borderRadius === 'full'
      ? 'rounded-full'
      : 'rounded-2xl';

  // Extract enabled sections in correct sorted order
  const activeSections = site.sections.filter((s) => s.isEnabled);

  const businessHoursSection = activeSections.find((s) => s.type === 'business_hours');
  const scheduleStatus = businessHoursSection
    ? calculateScheduleStatus(businessHoursSection.settings?.schedule)
    : null;

  const isDarkTheme =
    bgColor.toLowerCase().startsWith('#0') ||
    bgColor.toLowerCase().startsWith('#1') ||
    bgColor.toLowerCase() === '#292524' ||
    app.templateId === 'impacto';

  return (
    <div
      className="min-h-screen selection:bg-indigo-500 selection:text-white flex flex-col font-sans"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        fontFamily,
      }}
    >
      {/* Platform Preview / Navigation Bar (ONLY in Draft Preview mode for admins) */}
      {onExitPreview && isDraftPreview && (
        <div className="px-4 py-2.5 text-xs font-bold flex items-center justify-between sticky top-0 z-50 shadow-md bg-indigo-600 text-white">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Modo de Visualização Prévia do Rascunho (Não publicado)</span>
          </div>
          <button
            onClick={onExitPreview}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Editor</span>
          </button>
        </div>
      )}

      {/* HEADER / NAVIGATION BAR */}
      <header
        className={`sticky top-0 z-40 transition-all duration-300 border-b ${
          scrolled
            ? 'backdrop-blur-xl shadow-md'
            : 'backdrop-blur-md shadow-xs'
        }`}
        style={{
          backgroundColor: scrolled ? `${bgColor}f5` : `${bgColor}e6`,
          borderColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        }}
      >
        <div className={`max-w-6xl mx-auto px-4 flex items-center justify-between transition-all duration-300 ${scrolled ? 'h-14 sm:h-16' : 'h-16 sm:h-20'}`}>
          {/* Logo / Brand Name */}
          <a href="#" className="flex items-center gap-3">
            {tenant.appearance?.logoUrl ? (
              <img
                src={tenant.appearance.logoUrl}
                alt={tenant.name}
                className="h-9 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                {tenant.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="font-bold text-base tracking-tight truncate max-w-[200px] sm:max-w-xs">
              {tenant.name}
            </span>
          </a>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold">
            {activeSections.some((s) => s.type === 'about') && (
              <a href="#sobre" className="hover:opacity-75 transition-opacity">
                Sobre
              </a>
            )}
            {activeSections.some((s) => s.type === 'services') && (
              <a href="#servicos" className="hover:opacity-75 transition-opacity">
                Serviços
              </a>
            )}
            {activeSections.some((s) => s.type === 'gallery') && (
              <a href="#galeria" className="hover:opacity-75 transition-opacity">
                Galeria
              </a>
            )}
            {activeSections.some((s) => s.type === 'business_hours') && (
              <a href="#horarios" className="hover:opacity-75 transition-opacity">
                Horários
              </a>
            )}
            {activeSections.some((s) => s.type === 'location') && (
              <a href="#localizacao" className="hover:opacity-75 transition-opacity">
                Localização
              </a>
            )}
            {activeSections.some((s) => s.type === 'products') && (
              <a href="#produtos" className="hover:opacity-75 transition-opacity">
                Produtos
              </a>
            )}
            {activeSections.some((s) => s.type === 'contact') && (
              <a href="#contato" className="hover:opacity-75 transition-opacity">
                Contato
              </a>
            )}

            {/* Cart Icon in Navbar */}
            {hasShoppingCart && cart && (
              <button
                type="button"
                onClick={cart.openCart}
                className={`relative px-3 py-1.5 text-slate-800 bg-white border border-black/10 hover:border-black/20 shadow-xs flex items-center gap-2 cursor-pointer transition-all ${radiusClass}`}
                title="Meu Carrinho"
              >
                <ShoppingCart className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-xs">Carrinho</span>
                {cart.itemCount > 0 && (
                  <span
                    className="px-1.5 py-0.2 text-[10px] font-black text-white rounded-full shadow-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {cart.itemCount}
                  </span>
                )}
              </button>
            )}

            {/* Header CTA Button */}
            {site.settings?.headerCtaEnabled && tenant.whatsapp && (
              <a
                href={
                  site.settings.headerCtaLink ||
                  `https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className={`px-4 py-2 font-bold text-white shadow-xs hover:opacity-90 transition-all ${radiusClass}`}
                style={{ backgroundColor: primaryColor }}
              >
                {site.settings.headerCtaText || 'Falar no WhatsApp'}
              </a>
            )}
          </nav>

          {/* Mobile Menu & Cart Buttons */}
          <div className="flex items-center gap-2 md:hidden">
            {hasShoppingCart && cart && (
              <button
                type="button"
                onClick={cart.openCart}
                className={`p-2 text-slate-800 bg-white border border-slate-200 shadow-xs relative flex items-center justify-center cursor-pointer ${radiusClass}`}
                title="Meu Carrinho"
              >
                <ShoppingCart className="w-4 h-4" />
                {cart.itemCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 px-1.5 py-0.2 text-[9px] font-black text-white rounded-full shadow-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {cart.itemCount}
                  </span>
                )}
              </button>
            )}
            {tenant.whatsapp && (
              <a
                href={`https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-2 text-white shadow-xs ${radiusClass}`}
                style={{ backgroundColor: '#25D366' }}
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Slideout Nav */}
        {mobileMenuOpen && (
          <div
            className="md:hidden border-b px-4 py-4 space-y-3 bg-white shadow-lg animate-in slide-in-from-top-2 duration-150"
            style={{ backgroundColor: bgColor }}
          >
            <nav className="flex flex-col gap-2.5 text-sm font-semibold">
              {activeSections.some((s) => s.type === 'about') && (
                <a
                  href="#sobre"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 px-3 rounded-lg hover:bg-black/5"
                >
                  Sobre Nós
                </a>
              )}
              {activeSections.some((s) => s.type === 'services') && (
                <a
                  href="#servicos"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 px-3 rounded-lg hover:bg-black/5"
                >
                  Serviços
                </a>
              )}
              {activeSections.some((s) => s.type === 'gallery') && (
                <a
                  href="#galeria"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 px-3 rounded-lg hover:bg-black/5"
                >
                  Galeria
                </a>
              )}
              {activeSections.some((s) => s.type === 'business_hours') && (
                <a
                  href="#horarios"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 px-3 rounded-lg hover:bg-black/5"
                >
                  Horários
                </a>
              )}
              {activeSections.some((s) => s.type === 'location') && (
                <a
                  href="#localizacao"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 px-3 rounded-lg hover:bg-black/5"
                >
                  Onde Estamos
                </a>
              )}
              {activeSections.some((s) => s.type === 'products') && (
                <a
                  href="#produtos"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 px-3 rounded-lg hover:bg-black/5"
                >
                  Produtos
                </a>
              )}
              {activeSections.some((s) => s.type === 'contact') && (
                <a
                  href="#contato"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 px-3 rounded-lg hover:bg-black/5"
                >
                  Contato
                </a>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Top Motion Progress Bar & Continuous Marquee Banner */}
      <MotionProgressBar color={primaryColor} />
      <MotionMarquee bgColor={primaryColor} />

      {/* RENDER ALL SECTIONS IN SEQUENCE */}
      <main className="flex-1">
        {activeSections.map((section) => {
          const s = section.settings || {};

          // --- 1. HERO ---
          if (section.type === 'hero') {
            const bgMode = s.bgMode || (s.coverImage ? 'image' : 'gradient');
            const hasCover = bgMode === 'image' && !!s.coverImage;
            const hasVideo = bgMode === 'video' && !!s.videoUrl;
            const overlayOp = (s.overlayOpacity ?? 50) / 100;
            const isFeaturedBanner = s.mobileImageFit === 'banner_featured';

            // Detect layout variant
            const variant = s.layoutVariant || (
              app.templateId === 'impacto' ? 'vintage_barber' :
              app.templateId === 'elegante' ? 'luxury_salon' :
              app.templateId === 'moderno' ? 'culinary_bistro' :
              'classic'
            );

            // Helper to render tagline badge icon
            const renderHeroTaglineIcon = (iconName?: string, defaultFallback?: React.ReactNode) => {
              if (iconName === 'utensils') return <UtensilsCrossed className="w-3.5 h-3.5" />;
              if (iconName === 'flame') return <Flame className="w-3.5 h-3.5" />;
              if (iconName === 'sparkles') return <Sparkles className="w-3.5 h-3.5" />;
              if (iconName === 'star') return <Star className="w-3.5 h-3.5" />;
              if (iconName === 'award') return <Award className="w-3.5 h-3.5" />;
              if (iconName === 'scissors') return <Scissors className="w-3.5 h-3.5" />;
              if (iconName === 'heart') return <Heart className="w-3.5 h-3.5" />;
              if (iconName === 'none') return null;
              return defaultFallback;
            };

            const features: string[] = Array.isArray(s.features) ? s.features : [];

            // Hero primary button logic (supports disabling WhatsApp button, ordering directly on site, or custom)
            const heroWhatsappDisabled = site?.settings?.heroWhatsappButtonEnabled === false;
            const primaryExplicitlyDisabled = s.primaryButton?.enabled === false;
            const isSiteOrderBtn = s.primaryButton?.actionType === 'order_site' || s.primaryButton?.url === '#produtos';
            const isWhatsappTarget = (!s.primaryButton?.url || s.primaryButton?.url?.includes('wa.me') || (s.primaryButton?.text && s.primaryButton?.text?.toLowerCase().includes('whatsapp'))) && !isSiteOrderBtn;

            const shouldHidePrimary = primaryExplicitlyDisabled || (heroWhatsappDisabled && isWhatsappTarget);
            const showPrimaryBtn = !shouldHidePrimary && s.primaryButton?.enabled !== false;
            const showSecondaryBtn = s.secondaryButton?.enabled === true;
            const showAnyHeroBtn = showPrimaryBtn || showSecondaryBtn;

            const primaryHref = isSiteOrderBtn
              ? (s.primaryButton?.url || '#produtos')
              : (s.primaryButton?.url || (tenant.whatsapp ? `https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}` : '#contato'));

            const primaryTarget = isSiteOrderBtn
              ? undefined
              : (s.primaryButton?.url?.startsWith('http') || (!s.primaryButton?.url && tenant.whatsapp) ? '_blank' : undefined);

            const isWhatsappAction = isWhatsappTarget && !isSiteOrderBtn;

            return (
              <React.Fragment key={section.id}>
                {/* 1A. HERO: BARBEARIA VINTAGE & BLACK GOLD */}
                {variant === 'vintage_barber' && (
                  <section
                    id="inicio"
                    className="relative py-16 sm:py-24 md:py-32 px-4 text-center overflow-hidden flex flex-col justify-center items-center w-full min-h-[460px] sm:min-h-[560px] md:min-h-[640px] text-white"
                    style={{
                      backgroundImage: hasCover ? `url(${s.coverImage})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center center',
                      backgroundColor: '#090d16',
                    }}
                  >
                    {/* Background Video */}
                    {hasVideo && (
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      >
                        <source src={s.videoUrl} type="video/mp4" />
                      </video>
                    )}

                    {/* Multi-layered cinematic gradients */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'radial-gradient(circle at 50% 30%, rgba(15,23,42,0.3) 0%, rgba(9,13,22,0.85) 65%, #090d16 100%)',
                      }}
                    />
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(217,119,6,0.18) 0%, transparent 35%, rgba(9,13,22,0.95) 85%, #090d16 100%)',
                      }}
                    />

                    <div className="relative z-10 max-w-4xl mx-auto space-y-5 sm:space-y-6 w-full text-center flex flex-col items-center">
                      {/* Pre-header badge & schedule */}
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {s.tagline && (
                          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-amber-950/70 border border-amber-500/40 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.18)] backdrop-blur-md">
                            {renderHeroTaglineIcon(s.taglineIcon, <Scissors className="w-3.5 h-3.5 text-amber-400" />)}
                            <span>{s.tagline}</span>
                          </div>
                        )}
                        {scheduleStatus && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-black/60 border border-amber-500/30 text-white backdrop-blur-md">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                scheduleStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                              }`}
                            />
                            <span>{scheduleStatus.text}</span>
                          </div>
                        )}
                      </div>

                      {/* Headline with metallic gold emphasis */}
                      <h1 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-wider leading-tight text-white drop-shadow-xl max-w-3xl">
                        {s.headline || `${tenant.name} — Tradição & Estilo`}
                      </h1>

                      {/* Subtitle */}
                      {s.subtitle && (
                        <p className="text-sm sm:text-lg md:text-xl font-medium text-slate-200 max-w-2xl mx-auto leading-relaxed drop-shadow-sm">
                          {s.subtitle}
                        </p>
                      )}

                      {/* Short Hook */}
                      {s.shortText && (
                        <p className="text-xs sm:text-sm text-amber-200/90 max-w-xl mx-auto leading-relaxed">
                          {s.shortText}
                        </p>
                      )}

                      {/* Feature Micro-Pills */}
                      {features.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 pb-1">
                          {features.map((feat, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-black/60 border border-amber-500/30 text-slate-200 backdrop-blur-sm shadow-xs"
                            >
                              {feat}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons */}
                      {showAnyHeroBtn && (
                        <div className="pt-3 flex flex-wrap gap-3 justify-center w-full max-w-md mx-auto">
                          {showPrimaryBtn && (
                            <a
                              href={primaryHref}
                              target={primaryTarget}
                              rel={primaryTarget ? "noopener noreferrer" : undefined}
                              className="w-full sm:w-auto px-7 py-3.5 sm:py-4 font-black text-slate-950 text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-xl shadow-amber-950/50 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 border border-amber-200/60 transition-all duration-200 hover:scale-103 active:scale-95 flex items-center justify-center gap-2 cursor-pointer group"
                            >
                              {isWhatsappAction ? (
                                <MessageCircle className="w-4 h-4 text-slate-950" />
                              ) : (
                                <ShoppingBag className="w-4 h-4 text-slate-950" />
                              )}
                              <span>{s.primaryButton?.text || (isSiteOrderBtn ? 'Fazer Pedido no Site' : 'Agendar pelo WhatsApp')}</span>
                              <ArrowRight className="w-4 h-4 text-slate-950 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                          )}
                          {showSecondaryBtn && (
                            <a
                              href={s.secondaryButton?.url || '#servicos'}
                              className="w-full sm:w-auto px-6 py-3.5 sm:py-4 font-bold text-amber-200 text-xs sm:text-sm rounded-xl border border-amber-500/30 hover:border-amber-400 bg-black/50 hover:bg-black/75 backdrop-blur-md transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <span>{s.secondaryButton?.text || 'Conheça Nossos Serviços'}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* 1B. HERO: SALÃO DE BELEZA & ESTÉTICA LUXURY */}
                {variant === 'luxury_salon' && (
                  <section
                    id="inicio"
                    className="relative py-16 sm:py-24 md:py-32 px-4 text-center overflow-hidden flex flex-col justify-center items-center w-full min-h-[460px] sm:min-h-[560px] md:min-h-[640px] text-white"
                    style={{
                      backgroundImage: hasCover ? `url(${s.coverImage})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center center',
                      backgroundColor: primaryColor,
                    }}
                  >
                    {/* Background Video */}
                    {hasVideo && (
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      >
                        <source src={s.videoUrl} type="video/mp4" />
                      </video>
                    )}

                    {/* Luxury editorial duo-tone veil & bottom fade */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(131,24,67,0.85) 0%, rgba(112,26,117,0.68) 45%, rgba(253,251,247,0.2) 100%)',
                      }}
                    />
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `linear-gradient(to bottom, transparent 65%, ${bgColor} 100%)`,
                      }}
                    />

                    <div className="relative z-10 max-w-4xl mx-auto space-y-5 sm:space-y-6 w-full text-center flex flex-col items-center">
                      {/* Pre-header badge & schedule */}
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {s.tagline && (
                          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wider bg-rose-950/40 border border-rose-200/40 text-rose-100 shadow-sm backdrop-blur-md">
                            {renderHeroTaglineIcon(s.taglineIcon, <Sparkles className="w-3.5 h-3.5 text-rose-300" />)}
                            <span>{s.tagline}</span>
                          </div>
                        )}
                        {scheduleStatus && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-white/20 border border-white/30 text-white backdrop-blur-md">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                scheduleStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                              }`}
                            />
                            <span>{scheduleStatus.text}</span>
                          </div>
                        )}
                      </div>

                      {/* Editorial Serif Headline */}
                      <h1 className="text-3xl sm:text-5xl md:text-6xl font-serif italic font-bold sm:font-normal tracking-tight leading-tight text-white drop-shadow-md max-w-3xl">
                        {s.headline || `${tenant.name} — Cuidado & Sofisticação`}
                      </h1>

                      {/* Subtitle */}
                      {s.subtitle && (
                        <p className="text-sm sm:text-lg md:text-xl font-medium text-rose-100/95 max-w-2xl mx-auto leading-relaxed drop-shadow-sm">
                          {s.subtitle}
                        </p>
                      )}

                      {/* Short Hook */}
                      {s.shortText && (
                        <p className="text-xs sm:text-sm text-rose-200/80 max-w-xl mx-auto leading-relaxed">
                          {s.shortText}
                        </p>
                      )}

                      {/* Feature Micro-Pills */}
                      {features.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 pb-1">
                          {features.map((feat, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/15 border border-white/25 text-white backdrop-blur-sm shadow-xs"
                            >
                              {feat}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons */}
                      {showAnyHeroBtn && (
                        <div className="pt-3 flex flex-wrap gap-3 justify-center w-full max-w-md mx-auto">
                          {showPrimaryBtn && (
                            <a
                              href={primaryHref}
                              target={primaryTarget}
                              rel={primaryTarget ? "noopener noreferrer" : undefined}
                              className="w-full sm:w-auto px-7 sm:px-8 py-3.5 sm:py-4 font-bold text-white text-xs sm:text-sm rounded-full shadow-xl shadow-rose-950/30 bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 hover:from-pink-500 hover:to-rose-500 border border-white/30 transition-all duration-200 hover:scale-103 active:scale-95 flex items-center justify-center gap-2 cursor-pointer group"
                            >
                              {isWhatsappAction ? (
                                <MessageCircle className="w-4 h-4 text-white" />
                              ) : (
                                <ShoppingBag className="w-4 h-4 text-white" />
                              )}
                              <span>{s.primaryButton?.text || (isSiteOrderBtn ? 'Fazer Pedido no Site' : 'Agendar pelo WhatsApp')}</span>
                              <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" />
                            </a>
                          )}
                          {showSecondaryBtn && (
                            <a
                              href={s.secondaryButton?.url || '#servicos'}
                              className="w-full sm:w-auto px-6 sm:px-7 py-3.5 sm:py-4 font-bold text-white text-xs sm:text-sm rounded-full border border-white/40 hover:border-white/70 bg-white/20 hover:bg-white/35 backdrop-blur-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <span>{s.secondaryButton?.text || 'Ver Menu de Procedimentos'}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* 1C. HERO: BISTRÔ & GASTRONOMIA CONTEMPORÂNEA (Inspirado no El Nacional Barcelona) */}
                {variant === 'culinary_bistro' && (
                  <RestaurantGastronomyHero
                    tenant={tenant}
                    section={section}
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                    accentColor={accentColor}
                    scheduleStatus={scheduleStatus}
                  />
                )}

                {/* 1D. HERO: CLASSIC & OTHER VARIANTS */}
                {variant !== 'vintage_barber' && variant !== 'luxury_salon' && variant !== 'culinary_bistro' && (
                  <section
                    id="inicio"
                    className={`relative py-12 sm:py-20 md:py-28 px-4 text-center overflow-hidden flex flex-col justify-center items-center w-full ${
                      hasCover || hasVideo || bgMode === 'video'
                        ? 'text-white min-h-[380px] sm:min-h-[480px] md:min-h-[600px]'
                        : 'min-h-[320px] sm:min-h-[400px]'
                    }`}
                    style={
                      hasCover
                        ? {
                            backgroundImage: `url(${s.coverImage})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center center',
                            backgroundColor: primaryColor,
                          }
                        : {
                            background: `linear-gradient(180deg, ${primaryColor}0a 0%, ${bgColor} 100%)`,
                          }
                    }
                  >
                    {/* Background Video */}
                    {hasVideo && (
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      >
                        <source src={s.videoUrl} type="video/mp4" />
                      </video>
                    )}

                    {/* Overlay for image or video background */}
                    {(hasCover || hasVideo) && (
                      <div
                        className="absolute inset-0 bg-black pointer-events-none"
                        style={{ opacity: overlayOp }}
                      />
                    )}

                    <div
                      className={`relative z-10 max-w-3xl mx-auto space-y-4 sm:space-y-5 w-full ${
                        s.alignment === 'left' ? 'text-left items-start' : 'text-center items-center'
                      }`}
                    >
                      {/* Tagline / Schedule Badges */}
                      <div className="flex flex-wrap items-center justify-center gap-2 mb-1">
                        {s.tagline && (
                          <div
                            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wider shadow-xs backdrop-blur-md"
                            style={{
                              backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                              border: isDarkTheme ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(0,0,0,0.15)',
                              color: isDarkTheme ? '#ffffff' : '#0f172a',
                            }}
                          >
                            {renderHeroTaglineIcon(s.taglineIcon, <Sparkles className="w-3.5 h-3.5" />)}
                            <span>{s.tagline}</span>
                          </div>
                        )}
                        {scheduleStatus && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/90 text-slate-800 shadow-xs backdrop-blur-xs">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                scheduleStatus.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                              }`}
                            />
                            <span>{scheduleStatus.text}</span>
                          </div>
                        )}
                      </div>

                      <h1 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight">
                        {s.headline || tenant.name}
                      </h1>

                      {s.subtitle && (
                        <p className="text-sm sm:text-lg md:text-xl font-medium max-w-2xl mx-auto opacity-90 leading-snug">
                          {s.subtitle}
                        </p>
                      )}

                      {s.shortText && (
                        <p className="text-xs sm:text-sm max-w-xl mx-auto opacity-80 leading-relaxed">
                          {s.shortText}
                        </p>
                      )}

                      {/* Optional Featured Image Banner */}
                      {hasCover && isFeaturedBanner && (
                        <div className="pt-2 pb-1 w-full max-w-2xl mx-auto">
                          <div className={`overflow-hidden shadow-2xl border border-white/20 ${radiusClass}`}>
                            <img
                              src={s.coverImage}
                              alt={s.headline || tenant.name}
                              className="w-full h-auto max-h-[360px] sm:max-h-[440px] object-cover object-center"
                              loading="eager"
                            />
                          </div>
                        </div>
                      )}

                      {/* Buttons */}
                      {showAnyHeroBtn && (
                        <div className="pt-2 flex flex-wrap gap-2.5 sm:gap-3 justify-center">
                          {showPrimaryBtn && (
                            <a
                              href={primaryHref}
                              target={primaryTarget}
                              rel={primaryTarget ? "noopener noreferrer" : undefined}
                              className={`px-5 sm:px-6 py-3 sm:py-3.5 font-bold text-white shadow-lg hover:scale-105 active:scale-95 transition-all text-xs sm:text-sm flex items-center gap-2 ${radiusClass}`}
                              style={{ backgroundColor: primaryColor }}
                            >
                              {isWhatsappAction ? (
                                <MessageCircle className="w-4 h-4" />
                              ) : (
                                <ShoppingBag className="w-4 h-4" />
                              )}
                              <span>{s.primaryButton?.text || (isSiteOrderBtn ? 'Fazer Pedido no Site' : 'Entrar em Contato')}</span>
                              <ArrowRight className="w-4 h-4" />
                            </a>
                          )}
                          {showSecondaryBtn && (
                            <a
                              href={s.secondaryButton?.url || '#sobre'}
                              className={`px-4 sm:px-5 py-3 sm:py-3.5 font-bold text-xs sm:text-sm transition-all border active:scale-95 ${radiusClass} ${
                                hasCover
                                  ? 'bg-white/20 text-white border-white/40 hover:bg-white/30'
                                  : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <span>{s.secondaryButton?.text || 'Saiba Mais'}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}

              {/* FEATURED VIDEO PLACED DIRECTLY BELOW THE MAIN BANNER (Not on top of the banner image) */}
              {Boolean(s.showSubBannerVideo) === true && s.subBannerVideoUrl && s.subBannerVideoUrl.trim() !== '' && (
                <section
                  key={`${section.id}-sub-video`}
                  className="py-6 sm:py-8 md:py-10 px-4 w-full bg-slate-50/80 border-b border-slate-200/60"
                >
                  <div className="max-w-3xl mx-auto">
                    {s.subBannerVideoTitle && (
                      <div className="text-center mb-3 sm:mb-4">
                        <span
                          className="text-[11px] font-bold uppercase tracking-wider block mb-1"
                          style={{ color: secondaryColor }}
                        >
                          Vídeo de Apresentação
                        </span>
                        <h3 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                          {s.subBannerVideoTitle}
                        </h3>
                        {s.subBannerVideoDescription && (
                          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto mt-1">
                            {s.subBannerVideoDescription}
                          </p>
                        )}
                      </div>
                    )}
                    <AutoPlayVideoPlayer
                      url={s.subBannerVideoUrl}
                      title={s.subBannerVideoTitle || 'Vídeo de Apresentação'}
                      radiusClass={radiusClass}
                    />
                  </div>
                </section>
              )}
            </React.Fragment>
          );
        }

        // --- 1B. STANDALONE VIDEO SECTION ---
        if (section.type === 'video') {
          if (!s.videoUrl || !s.videoUrl.trim()) return null;
          return (
            <section key={section.id} id="video" className="py-12 md:py-20 px-4 max-w-4xl mx-auto w-full">
              <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>
                  Vídeo em Destaque
                </span>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{s.title || 'Conheça Mais Sobre Nós'}</h2>
                {s.description && <p className="text-xs sm:text-sm opacity-80 leading-relaxed">{s.description}</p>}
              </div>

              <AutoPlayVideoPlayer
                url={s.videoUrl}
                title={s.title || 'Vídeo Institucional'}
                posterUrl={s.posterUrl}
                radiusClass={radiusClass}
              />
            </section>
          );
        }

          // --- 2. QUICK BUTTONS ---
          if (section.type === 'quick_buttons') {
            const btns = (s.buttons || []).filter((b: any) => b.isEnabled);
            if (btns.length === 0) return null;

            return (
              <section key={section.id} className="py-6 px-4 max-w-5xl mx-auto w-full">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {btns.map((b: any, idx: number) => (
                    <a
                      key={b.id || idx}
                      href={b.url || '#'}
                      className={`p-3.5 border transition-all shadow-xs flex items-center gap-2.5 ${radiusClass} group ${
                        isDarkTheme
                          ? 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white hover:border-white/20'
                          : 'border-black/8 hover:border-black/20 bg-white/70 hover:bg-white text-slate-800'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white shadow-xs"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {b.type === 'whatsapp' ? (
                          <MessageCircle className="w-4 h-4" />
                        ) : b.type === 'phone' ? (
                          <Phone className="w-4 h-4" />
                        ) : b.type === 'location' ? (
                          <MapPin className="w-4 h-4" />
                        ) : (
                          <Star className="w-4 h-4" />
                        )}
                      </div>
                      <span className="font-bold text-xs truncate group-hover:underline">
                        {b.title}
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            );
          }

          // --- 2B. SOCIAL LINKS (REDES SOCIAIS & CANAIS OFICIAIS) ---
          if (section.type === 'social_links') {
            const rawLinks: any[] = Array.isArray(s.links) ? s.links : [];
            const activeLinks = rawLinks.filter((l) => l.isEnabled && l.url && l.url.trim().length > 0);
            const layout = s.layout || 'cards'; // 'cards' | 'pills' | 'icons' | 'minimal'

            if (activeLinks.length === 0) {
              if (isDraftPreview) {
                return (
                  <section key={section.id} id="redes-sociais" className="py-10 px-4 max-w-4xl mx-auto w-full">
                    <div className="p-6 border-2 border-dashed border-indigo-200 bg-indigo-50/40 rounded-2xl text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                        <Share2 className="w-5 h-5" />
                      </div>
                      <h3 className="text-sm font-bold text-indigo-950">Seção de Redes Sociais</h3>
                      <p className="text-xs text-indigo-800/80 max-w-md mx-auto">
                        Nenhuma rede social com link cadastrado ainda. Clique nesta seção no menu lateral para adicionar seus links do Instagram, Facebook, WhatsApp e outros.
                      </p>
                    </div>
                  </section>
                );
              }
              return null;
            }

            const formatUrl = (url: string) => {
              const trimmed = (url || '').trim();
              if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('tel:') || trimmed.startsWith('mailto:')) {
                return trimmed;
              }
              return `https://${trimmed}`;
            };

            const getPlatformCardMeta = (platform: string) => {
              switch ((platform || '').toLowerCase()) {
                case 'instagram':
                  return {
                    label: 'Instagram',
                    shortLabel: 'Insta',
                    actionText: 'Seguir no Instagram',
                    cardBg: 'bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white shadow-rose-500/25',
                    iconBg: 'bg-white/20',
                    icon: <Instagram className="w-5 h-5" />,
                    iconLarge: <Instagram className="w-6 h-6" />,
                    badgeColor: 'bg-rose-500/20 text-rose-300',
                  };
                case 'facebook':
                  return {
                    label: 'Facebook',
                    shortLabel: 'Face',
                    actionText: 'Curtir no Facebook',
                    cardBg: 'bg-[#1877F2] text-white shadow-blue-500/25',
                    iconBg: 'bg-white/20',
                    icon: <Facebook className="w-5 h-5" />,
                    iconLarge: <Facebook className="w-6 h-6" />,
                    badgeColor: 'bg-blue-500/20 text-blue-200',
                  };
                case 'whatsapp':
                  return {
                    label: 'WhatsApp',
                    shortLabel: 'Zap',
                    actionText: 'Falar no WhatsApp',
                    cardBg: 'bg-[#25D366] text-white shadow-emerald-500/25',
                    iconBg: 'bg-white/20',
                    icon: <MessageCircle className="w-5 h-5" />,
                    iconLarge: <MessageCircle className="w-6 h-6" />,
                    badgeColor: 'bg-emerald-500/20 text-emerald-200',
                  };
                case 'tiktok':
                  return {
                    label: 'TikTok',
                    shortLabel: 'TikTok',
                    actionText: 'Seguir no TikTok',
                    cardBg: 'bg-black text-white border border-slate-800 shadow-slate-900/40',
                    iconBg: 'bg-white/10',
                    icon: (
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.3 1.05.2 2.16-.08 2.94-.78.71-.62 1.08-1.54 1.11-2.48.04-3.51.01-7.03.02-10.55V0c-.01.01-.02.01-.02.02z" />
                      </svg>
                    ),
                    iconLarge: (
                      <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.3 1.05.2 2.16-.08 2.94-.78.71-.62 1.08-1.54 1.11-2.48.04-3.51.01-7.03.02-10.55V0c-.01.01-.02.01-.02.02z" />
                      </svg>
                    ),
                    badgeColor: 'bg-white/10 text-white',
                  };
                case 'youtube':
                  return {
                    label: 'YouTube',
                    shortLabel: 'YouTube',
                    actionText: 'Inscrever-se no YouTube',
                    cardBg: 'bg-[#FF0000] text-white shadow-red-500/25',
                    iconBg: 'bg-white/20',
                    icon: <Youtube className="w-5 h-5" />,
                    iconLarge: <Youtube className="w-6 h-6" />,
                    badgeColor: 'bg-red-500/20 text-red-100',
                  };
                case 'linkedin':
                  return {
                    label: 'LinkedIn',
                    shortLabel: 'LinkedIn',
                    actionText: 'Conectar no LinkedIn',
                    cardBg: 'bg-[#0A66C2] text-white shadow-blue-600/25',
                    iconBg: 'bg-white/20',
                    icon: <Linkedin className="w-5 h-5" />,
                    iconLarge: <Linkedin className="w-6 h-6" />,
                    badgeColor: 'bg-blue-600/20 text-blue-100',
                  };
                case 'twitter':
                case 'x':
                  return {
                    label: 'X / Twitter',
                    shortLabel: 'X',
                    actionText: 'Seguir no X',
                    cardBg: 'bg-black text-white border border-slate-800 shadow-slate-900/40',
                    iconBg: 'bg-white/10',
                    icon: <Twitter className="w-5 h-5" />,
                    iconLarge: <Twitter className="w-6 h-6" />,
                    badgeColor: 'bg-white/10 text-white',
                  };
                case 'telegram':
                  return {
                    label: 'Telegram',
                    shortLabel: 'Telegram',
                    actionText: 'Entrar no Canal',
                    cardBg: 'bg-[#229ED9] text-white shadow-sky-500/25',
                    iconBg: 'bg-white/20',
                    icon: <Send className="w-5 h-5" />,
                    iconLarge: <Send className="w-6 h-6" />,
                    badgeColor: 'bg-sky-500/20 text-sky-100',
                  };
                default:
                  return {
                    label: 'Acesse Nosso Link',
                    shortLabel: 'Link',
                    actionText: 'Visitar Link',
                    cardBg: 'bg-indigo-600 text-white shadow-indigo-500/25',
                    iconBg: 'bg-white/20',
                    icon: <Globe className="w-5 h-5" />,
                    iconLarge: <Globe className="w-6 h-6" />,
                    badgeColor: 'bg-indigo-500/20 text-indigo-100',
                  };
              }
            };

            return (
              <section key={section.id} id="redes-sociais" className="py-14 md:py-20 px-4 max-w-5xl mx-auto w-full">
                <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-1" style={{ color: secondaryColor }}>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Conecte-se Conosco</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{s.title || 'Siga Nossas Redes'}</h2>
                  {s.subtitle && <p className="text-xs sm:text-sm opacity-75">{s.subtitle}</p>}
                </div>

                {/* 1. CARDS LAYOUT */}
                {layout === 'cards' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {activeLinks.map((link: any, idx: number) => {
                      const meta = getPlatformCardMeta(link.platform);
                      return (
                        <a
                          key={link.id || idx}
                          href={formatUrl(link.url)}
                          target={s.openInNewTab !== false ? '_blank' : undefined}
                          rel={s.openInNewTab !== false ? 'noopener noreferrer' : undefined}
                          className={`p-4 rounded-2xl flex items-center justify-between gap-3 shadow-md transition-all duration-200 hover:scale-102 hover:shadow-xl active:scale-98 group cursor-pointer ${meta.cardBg}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                              {meta.icon}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-sm block truncate leading-tight">
                                {link.name || meta.label}
                              </span>
                              <span className="text-[11px] opacity-85 block truncate mt-0.5 font-medium">
                                {link.handle || meta.actionText}
                              </span>
                            </div>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/20 transition-colors">
                            <ExternalLink className="w-4 h-4 text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* 2. PILLS LAYOUT */}
                {layout === 'pills' && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {activeLinks.map((link: any, idx: number) => {
                      const meta = getPlatformCardMeta(link.platform);
                      return (
                        <a
                          key={link.id || idx}
                          href={formatUrl(link.url)}
                          target={s.openInNewTab !== false ? '_blank' : undefined}
                          rel={s.openInNewTab !== false ? 'noopener noreferrer' : undefined}
                          className={`px-5 py-3 rounded-full flex items-center gap-2.5 font-bold text-xs sm:text-sm shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 group cursor-pointer ${meta.cardBg}`}
                        >
                          {meta.icon}
                          <span>{link.name || meta.label}</span>
                          {link.handle && (
                            <span className="opacity-80 font-medium text-xs hidden sm:inline">
                              {link.handle}
                            </span>
                          )}
                          <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* 3. ICONS LAYOUT */}
                {layout === 'icons' && (
                  <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                    {activeLinks.map((link: any, idx: number) => {
                      const meta = getPlatformCardMeta(link.platform);
                      return (
                        <a
                          key={link.id || idx}
                          href={formatUrl(link.url)}
                          target={s.openInNewTab !== false ? '_blank' : undefined}
                          rel={s.openInNewTab !== false ? 'noopener noreferrer' : undefined}
                          className="flex flex-col items-center gap-2 group cursor-pointer"
                          title={link.name || meta.label}
                        >
                          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shadow-md transition-all duration-200 group-hover:scale-110 group-hover:shadow-xl active:scale-95 ${meta.cardBg}`}>
                            {meta.iconLarge}
                          </div>
                          <span className={`text-[11px] font-bold transition-opacity ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
                            {link.name || meta.shortLabel}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* 4. MINIMAL LAYOUT */}
                {layout === 'minimal' && (
                  <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
                    {activeLinks.map((link: any, idx: number) => {
                      const meta = getPlatformCardMeta(link.platform);
                      return (
                        <a
                          key={link.id || idx}
                          href={formatUrl(link.url)}
                          target={s.openInNewTab !== false ? '_blank' : undefined}
                          rel={s.openInNewTab !== false ? 'noopener noreferrer' : undefined}
                          className={`inline-flex items-center gap-2 text-xs sm:text-sm font-bold transition-all hover:scale-105 cursor-pointer underline-offset-4 hover:underline ${
                            isDarkTheme ? 'text-slate-200' : 'text-slate-800'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${meta.cardBg}`}>
                            {meta.icon}
                          </div>
                          <span>{link.name || meta.label}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          }

          // --- 3. ABOUT ---
          if (section.type === 'about') {
            const variant = activeSections.find((sec) => sec.type === 'hero')?.settings?.layoutVariant || (
              app.templateId === 'impacto' ? 'vintage_barber' :
              app.templateId === 'elegante' ? 'luxury_salon' :
              app.templateId === 'moderno' ? 'culinary_bistro' :
              'classic'
            );

            if (variant === 'culinary_bistro') {
              const ctaSec = activeSections.find((sec) => sec.type === 'cta');
              return (
                <React.Fragment key={section.id}>
                  <RestaurantGastronomyAbout
                    tenant={tenant}
                    section={section}
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                  />
                  <RestaurantReservationBanner tenant={tenant} section={ctaSec} />
                </React.Fragment>
              );
            }

            const hasImg = !!s.image;
            const isLeft = s.layout === 'image_left';

            return (
              <PremiumScrollReveal key={section.id} direction="up" delay={0.1}>
                <section id="sobre" className="py-16 md:py-24 px-4 max-w-5xl mx-auto w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-14 items-center">
                    {hasImg && isLeft && (
                      <div className="order-2 md:order-1">
                        <div className={`overflow-hidden shadow-xl group ${radiusClass}`}>
                          <img
                            src={s.image}
                            alt={s.title || tenant.name}
                            className="w-full h-64 sm:h-80 md:h-96 object-cover object-center group-hover:scale-104 transition-transform duration-700"
                            loading="lazy"
                          />
                        </div>
                      </div>
                    )}

                    <div className={`space-y-4 ${hasImg && isLeft ? 'order-1 md:order-2' : ''}`}>
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>
                        Sobre Nós
                      </span>
                      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight">{s.title || 'Nossa História'}</h2>
                      {s.subtitle && <p className="text-sm font-semibold opacity-75">{s.subtitle}</p>}
                      <p className="text-sm leading-relaxed opacity-85 whitespace-pre-line">{s.text}</p>

                      {s.highlights && s.highlights.length > 0 && (
                        <div className="pt-2 space-y-2">
                          {s.highlights.map((h: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2.5 text-xs">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              <div>
                                <strong className="font-bold">{h.title}:</strong>{' '}
                                <span className="opacity-80">{h.desc}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {hasImg && !isLeft && (
                      <div>
                        <div className={`overflow-hidden shadow-xl group ${radiusClass}`}>
                          <img
                            src={s.image}
                            alt={s.title || tenant.name}
                            className="w-full h-64 sm:h-80 md:h-96 object-cover object-center group-hover:scale-104 transition-transform duration-700"
                            loading="lazy"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </PremiumScrollReveal>
            );
          }

          // --- 4. GALLERY ---
          if (section.type === 'gallery') {
            const items = s.items || [];
            if (items.length === 0) return null;

            // Determine image aspect ratio class
            const aspectConfig = s.aspectRatio || 'square';
            const aspectClass =
              aspectConfig === 'landscape'
                ? 'aspect-[4/3]'
                : aspectConfig === 'wide'
                ? 'aspect-[16/9]'
                : aspectConfig === 'auto'
                ? 'aspect-auto'
                : 'aspect-square';

            // Determine image fit behavior
            const fitMode = s.imageFit || 'cover';
            const objectFitClass = fitMode === 'contain' ? 'object-contain' : 'object-cover';

            return (
              <PremiumScrollReveal key={section.id} direction="up" delay={0.1}>
                <section id="galeria" className="py-16 md:py-24 px-4 max-w-6xl mx-auto w-full">
                  <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>
                      Ambiente & Trabalhos
                    </span>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight">{s.title || 'Nossa Galeria'}</h2>
                    {s.subtitle && <p className="text-xs sm:text-sm opacity-75">{s.subtitle}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {items.map((img: any, idx: number) => (
                      <div
                        key={img.id || idx}
                        onClick={() => {
                          setGalleryModalItems(items);
                          setGalleryModalIndex(idx);
                          setGalleryModalOpen(true);
                        }}
                        className={`overflow-hidden shadow-md group relative bg-black/5 dark:bg-white/5 flex items-center justify-center cursor-pointer ${aspectClass} ${radiusClass}`}
                        title="Clique para ampliar"
                      >
                        <img
                          src={img.url}
                          alt={img.caption || 'Foto'}
                          className={`w-full h-full ${objectFitClass} object-center group-hover:scale-106 transition-transform duration-500`}
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="p-2.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                            <Eye className="w-4 h-4" />
                            <span>Ampliar</span>
                          </span>
                        </div>
                        {img.caption && (
                          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white text-xs font-medium">
                            {img.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </PremiumScrollReveal>
            );
          }

          // --- 5A. PRODUCTS (REAL CATALOG FROM ETAPA 3A) ---
          if (section.type === 'products') {
            return (
              <PremiumScrollReveal key={section.id} direction="up" delay={0.1}>
                <PublicProductCatalogSection
                  tenant={tenant}
                  settings={s}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  accentColor={accentColor}
                  bgColor={bgColor}
                  textColor={textColor}
                  radiusClass={radiusClass}
                  isDraftPreview={isDraftPreview}
                />
              </PremiumScrollReveal>
            );
          }

          // --- 5B. SERVICES (REAL DYNAMIC SERVICES MODULE) ---
          if (section.type === 'services') {
            return (
              <PremiumScrollReveal key={section.id} direction="up" delay={0.1}>
                <PublicServicesSection
                  tenant={tenant}
                  settings={s}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  accentColor={accentColor}
                  bgColor={bgColor}
                  textColor={textColor}
                  radiusClass={radiusClass}
                  isDraftPreview={isDraftPreview}
                />
              </PremiumScrollReveal>
            );
          }

          // --- 5C. TEAM / PROFESSIONALS (REAL DYNAMIC PROFESSIONALS MODULE) ---
          if (section.type === 'team') {
            return (
              <PremiumScrollReveal key={section.id} direction="up" delay={0.1}>
                <PublicTeamSection
                  tenant={tenant}
                  settings={s}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  accentColor={accentColor}
                  bgColor={bgColor}
                  textColor={textColor}
                  radiusClass={radiusClass}
                  isDraftPreview={isDraftPreview}
                />
              </PremiumScrollReveal>
            );
          }

          // --- 6. BUSINESS HOURS ---
          if (section.type === 'business_hours') {
            const sched = s.schedule || {};
            const dayOrder = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
            const dayNames: Record<string, string> = {
              seg: 'Segunda-feira',
              ter: 'Terça-feira',
              qua: 'Quarta-feira',
              qui: 'Quinta-feira',
              sex: 'Sexta-feira',
              sab: 'Sábado',
              dom: 'Domingo',
            };

            return (
              <section key={section.id} id="horarios" className="py-14 md:py-20 px-4 max-w-4xl mx-auto w-full">
                <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>
                    Horários
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{s.title || 'Horário de Funcionamento'}</h2>
                  {s.subtitle && <p className="text-xs sm:text-sm opacity-75">{s.subtitle}</p>}
                </div>

                <div
                  className={`p-6 border shadow-xs max-w-xl mx-auto ${radiusClass} ${
                    isDarkTheme
                      ? 'border-white/10 bg-white/[0.03] text-white'
                      : 'border-black/10 bg-black/[0.01]'
                  }`}
                >
                  {scheduleStatus && (
                    <div
                      className={`mb-4 pb-4 border-b flex items-center justify-between ${
                        isDarkTheme ? 'border-white/10' : 'border-black/10'
                      }`}
                    >
                      <span className="text-xs font-semibold opacity-75">Status Atual:</span>
                      <span className={`px-2.5 py-1 text-xs font-bold border rounded-full ${scheduleStatus.badgeClass}`}>
                        {scheduleStatus.text}
                      </span>
                    </div>
                  )}

                  <div className={`divide-y text-xs ${isDarkTheme ? 'divide-white/10' : 'divide-black/5'}`}>
                    {dayOrder.map((dk) => {
                      const day = sched[dk];
                      return (
                        <div key={dk} className="py-2.5 flex items-center justify-between">
                          <span className="font-semibold">{dayNames[dk]}</span>
                          {day?.isOpen ? (
                            <span className="font-bold opacity-85">
                              {day.openTime} às {day.closeTime}
                            </span>
                          ) : (
                            <span className="text-rose-500 font-semibold">Fechado</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          }

          // --- 7. GOOGLE REVIEWS ---
          if (section.type === 'google_reviews') {
            const revs = s.featuredReviews || [];

            return (
              <section key={section.id} id="avaliacoes" className="py-14 md:py-20 px-4 max-w-5xl mx-auto w-full">
                <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
                  <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
                    {[1, 2, 3, 4, 5].map((st) => (
                      <Star key={st} className="w-5 h-5 fill-current" />
                    ))}
                    <span className={`font-bold text-sm ml-1 ${isDarkTheme ? 'text-white' : 'text-slate-800'}`}>
                      {s.rating || '4.9'} ({s.reviewsCount || 100}+ avaliações)
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{s.title || 'O que nossos clientes dizem'}</h2>
                  {s.subtitle && <p className="text-xs sm:text-sm opacity-75">{s.subtitle}</p>}
                </div>

                {revs.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {revs.map((r: any, idx: number) => {
                      const initial = r.author ? r.author.trim().charAt(0).toUpperCase() : 'C';
                      const avatarColors = [
                        'bg-blue-600 text-white',
                        'bg-red-600 text-white',
                        'bg-amber-600 text-white',
                        'bg-emerald-600 text-white',
                        'bg-indigo-600 text-white',
                      ];
                      const colorClass = avatarColors[idx % avatarColors.length];

                      return (
                        <div
                          key={r.id || idx}
                          className={`p-5 border shadow-xs space-y-3 ${radiusClass} ${
                            isDarkTheme
                              ? 'border-white/10 bg-white/[0.03] text-white'
                              : 'border-black/10 bg-black/[0.02]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {r.avatarUrl ? (
                                <img
                                  src={r.avatarUrl}
                                  alt={r.author}
                                  className="w-10 h-10 rounded-full object-cover border border-slate-200"
                                />
                              ) : (
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${colorClass}`}>
                                  {initial}
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs">{r.author || 'Cliente Google'}</span>
                                  <span className="inline-flex items-center text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-full border border-emerald-200/50">
                                    ✓ Google
                                  </span>
                                </div>
                                <span className={`text-[10px] block ${isDarkTheme ? 'text-slate-400' : 'opacity-60'}`}>{r.date || 'Avaliação recente'}</span>
                              </div>
                            </div>
                            <div className="flex text-amber-400 shrink-0">
                              {[1, 2, 3, 4, 5].map((st) => (
                                <Star
                                  key={st}
                                  className={`w-3.5 h-3.5 ${st <= (r.stars || 5) ? 'fill-current' : 'opacity-30'}`}
                                />
                              ))}
                            </div>
                          </div>

                          <p className={`text-xs leading-relaxed ${isDarkTheme ? 'text-slate-200' : 'opacity-85'}`}>"{r.comment}"</p>

                          {r.ownerResponse && (
                            <div className={`mt-2 p-2.5 rounded-xl text-[11px] border ${
                              isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100/80 border-slate-200 text-slate-700'
                            }`}>
                              <span className="font-bold block text-[10px] opacity-75 mb-0.5">Resposta do proprietário:</span>
                              {r.ownerResponse}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {s.googleReviewUrl && (
                  <div className="text-center">
                    <a
                      href={s.googleReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold border transition-all ${radiusClass} ${
                        isDarkTheme
                          ? 'border-white/20 text-white hover:bg-white/10'
                          : 'border-black/20 hover:bg-black/5'
                      }`}
                    >
                      <Star className="w-4 h-4 text-amber-500 fill-current" />
                      {s.buttonText || 'Deixar uma Avaliação no Google'}
                      <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                    </a>
                  </div>
                )}
              </section>
            );
          }

          // --- 8. LOCATION ---
          if (section.type === 'location') {
            const loc = s.address;
            if (!loc) return null;

            const streetNumber = [loc.street, loc.number].filter(Boolean).join(', ');
            const stateUpper = loc.state ? loc.state.toUpperCase() : '';
            const cityState = [loc.city, stateUpper].filter(Boolean).join(' - ');

            const parts: string[] = [];
            if (streetNumber) parts.push(streetNumber);
            if (loc.neighborhood) parts.push(loc.neighborhood);
            if (cityState) parts.push(cityState);
            if (loc.zip) parts.push(`CEP: ${loc.zip}`);

            const fullAddr = parts.length > 0 ? parts.join(', ') : [loc.street, loc.city, stateUpper].filter(Boolean).join(' - ') || 'Endereço da Loja';
            const mapsQuery = [streetNumber, loc.neighborhood, cityState, loc.zip, 'Brasil'].filter(Boolean).join(', ');
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery || fullAddr)}`;

            return (
              <section key={section.id} id="localizacao" className="py-14 md:py-20 px-4 max-w-4xl mx-auto w-full">
                <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>
                    Localização
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{s.title || 'Onde Estamos'}</h2>
                  {s.subtitle && <p className="text-xs sm:text-sm opacity-75">{s.subtitle}</p>}
                </div>

                <div
                  className={`p-6 sm:p-8 border shadow-xs text-center max-w-xl mx-auto space-y-4 ${radiusClass} ${
                    isDarkTheme
                      ? 'border-white/10 bg-white/[0.03] text-white'
                      : 'border-black/10 bg-black/[0.01]'
                  }`}
                >
                  <div
                    className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-md"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    {streetNumber ? (
                      <h4 className={`font-extrabold text-base leading-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                        {streetNumber}
                      </h4>
                    ) : (
                      <h4 className={`font-extrabold text-base leading-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                        {fullAddr}
                      </h4>
                    )}

                    {loc.neighborhood && (
                      <p className={`text-xs font-medium ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                        Bairro: {loc.neighborhood}
                      </p>
                    )}

                    {cityState && (
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        isDarkTheme ? 'bg-white/10 text-white' : 'bg-black/5 text-slate-800'
                      }`}>
                        <span>{loc.city || 'Cidade'}</span>
                        {stateUpper && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-400 font-extrabold uppercase">{stateUpper}</span>
                          </>
                        )}
                      </div>
                    )}

                    {loc.zip && (
                      <p className="text-[11px] text-slate-500 font-mono">
                        CEP {loc.zip}
                      </p>
                    )}

                    {loc.complement && <p className="text-xs opacity-70">Complemento: {loc.complement}</p>}
                    {loc.landmark && <p className="text-xs opacity-70 mt-0.5">Referência: {loc.landmark}</p>}
                  </div>

                  {s.showDirectionsButton !== false && (
                    <div className="pt-2">
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-2 px-6 py-3 font-bold text-xs text-white shadow-md hover:scale-105 transition-all cursor-pointer ${radiusClass}`}
                        style={{ backgroundColor: primaryColor }}
                      >
                        <MapPin className="w-4 h-4" />
                        <span>Como Chegar (Google Maps / Waze)</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                      </a>
                    </div>
                  )}
                </div>
              </section>
            );
          }

          // --- 9. FAQ ---
          if (section.type === 'faq') {
            const items = (s.items || []).filter((i: any) => i.isEnabled);
            if (items.length === 0) return null;

            return (
              <section key={section.id} id="faq" className="py-14 md:py-20 px-4 max-w-3xl mx-auto w-full">
                <div className="text-center mb-8 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>
                    Dúvidas
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{s.title || 'Perguntas Frequentes'}</h2>
                  {s.subtitle && <p className="text-xs sm:text-sm opacity-75">{s.subtitle}</p>}
                </div>

                <div className="space-y-2.5">
                  {items.map((item: any, idx: number) => {
                    const isOpen = openFaqIndex === idx;
                    return (
                      <div
                        key={item.id || idx}
                        className={`border overflow-hidden ${radiusClass} ${
                          isDarkTheme
                            ? 'border-white/10 bg-white/[0.03] text-white'
                            : 'border-black/10 bg-black/[0.01]'
                        }`}
                      >
                        <button
                          onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                          className="w-full p-4 text-left font-bold text-xs sm:text-sm flex items-center justify-between gap-3 cursor-pointer"
                        >
                          <span>{item.question}</span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 opacity-60 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <div className={`px-4 pb-4 pt-1 text-xs leading-relaxed border-t ${
                            isDarkTheme ? 'border-white/10 text-slate-300' : 'border-black/5 opacity-80'
                          }`}>
                            {item.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }

          // --- 10. CTA ---
          if (section.type === 'cta') {
            return (
              <section key={section.id} className="py-16 px-4 max-w-5xl mx-auto w-full">
                <div
                  className={`p-8 md:p-14 text-center text-white space-y-4 shadow-xl ${radiusClass}`}
                  style={{ backgroundColor: primaryColor }}
                >
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">
                    {s.title || 'Fale com nossa equipe'}
                  </h2>
                  {s.description && (
                    <p className="text-xs sm:text-sm md:text-base max-w-xl mx-auto opacity-90 leading-relaxed">
                      {s.description}
                    </p>
                  )}
                  <div className="pt-2">
                    <a
                      href={s.buttonUrl || '#contato'}
                      className={`inline-flex items-center gap-2 px-6 py-3.5 bg-white text-slate-900 font-bold text-xs sm:text-sm shadow-md hover:scale-105 active:scale-95 transition-all ${radiusClass}`}
                    >
                      {s.buttonText || 'Entrar em Contato'}
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </section>
            );
          }

          // --- 11. CONTACT BLOCK ---
          if (section.type === 'contact') {
            return (
              <section key={section.id} id="contato" className="py-14 md:py-20 px-4 max-w-4xl mx-auto w-full">
                <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>
                    Canais de Atendimento
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{s.title || 'Fale Conosco'}</h2>
                  {s.subtitle && <p className="text-xs sm:text-sm opacity-75">{s.subtitle}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                  {s.showWhatsapp && tenant.whatsapp && (
                    <a
                      href={`https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`p-4 border shadow-xs flex items-center gap-3.5 hover:border-emerald-500 transition-all ${radiusClass} ${
                        isDarkTheme ? 'border-white/10 bg-white/[0.04] text-white' : 'border-black/10 bg-white'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <span className={`block text-[10px] uppercase font-bold ${isDarkTheme ? 'text-slate-400' : 'text-slate-400'}`}>WhatsApp</span>
                        <span className="font-bold text-xs">{tenant.whatsapp}</span>
                      </div>
                    </a>
                  )}

                  {s.showPhone && tenant.phone && (
                    <a
                      href={`tel:${tenant.phone.replace(/\D/g, '')}`}
                      className={`p-4 border shadow-xs flex items-center gap-3.5 hover:border-indigo-500 transition-all ${radiusClass} ${
                        isDarkTheme ? 'border-white/10 bg-white/[0.04] text-white' : 'border-black/10 bg-white'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-slate-400">Telefone</span>
                        <span className="font-bold text-xs">{tenant.phone}</span>
                      </div>
                    </a>
                  )}
                </div>
              </section>
            );
          }

          // --- 12. FOOTER ---
          if (section.type === 'footer') {
            const socialSec = site?.sections?.find((sec) => sec.type === 'social_links');
            const footerSocialLinks: any[] = (socialSec?.settings?.links || site?.settings?.socialLinks || [])
              .filter((l: any) => l.isEnabled && l.url && l.url.trim().length > 0);

            const formatUrl = (url: string) => {
              const trimmed = (url || '').trim();
              if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('tel:') || trimmed.startsWith('mailto:')) {
                return trimmed;
              }
              return `https://${trimmed}`;
            };

            const getFooterIcon = (platform: string) => {
              switch ((platform || '').toLowerCase()) {
                case 'instagram':
                  return <Instagram className="w-4 h-4" />;
                case 'facebook':
                  return <Facebook className="w-4 h-4" />;
                case 'whatsapp':
                  return <MessageCircle className="w-4 h-4" />;
                case 'tiktok':
                  return (
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.3 1.05.2 2.16-.08 2.94-.78.71-.62 1.08-1.54 1.11-2.48.04-3.51.01-7.03.02-10.55V0c-.01.01-.02.01-.02.02z" />
                    </svg>
                  );
                case 'youtube':
                  return <Youtube className="w-4 h-4" />;
                case 'linkedin':
                  return <Linkedin className="w-4 h-4" />;
                case 'twitter':
                case 'x':
                  return <Twitter className="w-4 h-4" />;
                case 'telegram':
                  return <Send className="w-4 h-4" />;
                default:
                  return <Globe className="w-4 h-4" />;
              }
            };

            return (
              <footer key={section.id} className={`py-12 px-4 border-t text-center text-xs space-y-3.5 ${
                isDarkTheme ? 'border-white/10 text-slate-400' : 'border-black/10 opacity-75'
              }`}>
                {s.customText && <p className="max-w-md mx-auto">{s.customText}</p>}

                {s.showSocial !== false && footerSocialLinks.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 pb-1">
                    {footerSocialLinks.map((l: any, idx: number) => (
                      <a
                        key={l.id || idx}
                        href={formatUrl(l.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 cursor-pointer ${
                          isDarkTheme
                            ? 'bg-white/10 hover:bg-white/20 text-white'
                            : 'bg-black/5 hover:bg-black/10 text-slate-800'
                        }`}
                        title={l.name || l.platform}
                      >
                        {getFooterIcon(l.platform)}
                      </a>
                    ))}
                  </div>
                )}

                <p>{s.copyrightText || `© ${new Date().getFullYear()} ${tenant.name}. Todos os direitos reservados.`}</p>
              </footer>
            );
          }

          return null;
        })}
      </main>

      {/* FLOATING WHATSAPP BUTTON */}
      {site.settings?.floatingWhatsapp && tenant.whatsapp && (
        <a
          href={`https://wa.me/55${tenant.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
            site.settings.floatingWhatsappMessage || 'Olá! Vim pelo site e gostaria de atendimento.'
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 right-5 z-50 p-3.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-full shadow-2xl hover:scale-110 transition-all flex items-center justify-center group"
          title="Fale Conosco no WhatsApp"
        >
          <MessageCircle className="w-6 h-6 fill-current" />
        </a>
      )}

      {/* FLOATING CART BUTTON */}
      {hasShoppingCart && cart && cart.itemCount > 0 && (
        <button
          type="button"
          onClick={cart.openCart}
          className={`fixed bottom-20 right-5 z-40 px-4 py-3 text-white rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer font-bold text-xs ${radiusClass}`}
          style={{ backgroundColor: primaryColor }}
          title="Ver Carrinho de Compras"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Carrinho ({cart.itemCount})</span>
        </button>
      )}

      {/* IMMERSIVE GALLERY LIGHTBOX MODAL */}
      <PremiumGalleryModal
        isOpen={galleryModalOpen}
        onClose={() => setGalleryModalOpen(false)}
        items={galleryModalItems}
        currentIndex={galleryModalIndex}
        onIndexChange={setGalleryModalIndex}
      />

      {/* SHOPPING CART, CHECKOUT AND SUCCESS MODALS */}
      {hasShoppingCart && (
        <>
          <CartDrawer tenant={tenant} primaryColor={primaryColor} />
          <CheckoutModal
            tenant={tenant}
            primaryColor={primaryColor}
            hasDeliveryFeature={hasDeliveryFeature}
          />
          <OrderSuccessModal tenant={tenant} />
        </>
      )}
    </div>
  );
};

export const PublicSiteView: React.FC<PublicSiteViewProps> = (props) => {
  const templateId = props.site?.appearance?.templateId || props.site?.templateId;
  const isExcluded = isTemplateExcludedFromGlobalStandard(templateId);

  return (
    <CartProvider tenant={props.tenant}>
      <MotionStudioProvider settings={props.site?.appearance?.motion}>
        {isExcluded ? (
          <PublicOticaEditorialView {...props} />
        ) : (
          <PublicSiteViewInner {...props} />
        )}
      </MotionStudioProvider>
    </CartProvider>
  );
};

