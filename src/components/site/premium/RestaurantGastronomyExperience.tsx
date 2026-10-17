import React from 'react';
import {
  UtensilsCrossed,
  Wine,
  Flame,
  Calendar,
  Clock,
  MapPin,
  MessageCircle,
  ArrowRight,
  Sparkles,
  Check,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';
import { Tenant } from '../../../types/saas';
import { SiteData, SiteSection } from '../../../types/site';
import { PremiumScrollReveal, PremiumTextReveal, PremiumParallaxImage } from './PremiumMotion';

interface RestaurantGastronomyHeroProps {
  tenant: Tenant;
  section: SiteSection;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  scheduleStatus: { isOpen: boolean; text: string; badgeClass: string } | null;
  site?: SiteData | null;
}

/**
 * 1. Cinematic Gastronomy Hero (Inspired by El Nacional Barcelona)
 * Grand hall atmosphere, warm amber glow, serif typography and direct reservation CTA.
 */
export const RestaurantGastronomyHero: React.FC<RestaurantGastronomyHeroProps> = ({
  tenant,
  section,
  primaryColor,
  secondaryColor,
  accentColor,
  scheduleStatus,
  site,
}) => {
  const s = section.settings || {};

  const cleanPhone = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : tenant.phone ? tenant.phone.replace(/\D/g, '') : '';
  const reservationMsg = encodeURIComponent(
    `Olá! Gostaria de consultar disponibilidade para reserva de mesa no ${tenant.name}. Poderia me informar os horários disponíveis?`
  );
  const waReservationUrl = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${reservationMsg}` : '#contato';

  // Primary button logic (WhatsApp / site order)
  const heroWhatsappDisabled = site?.settings?.heroWhatsappButtonEnabled === false;
  const isPrimaryExplicitlyDisabled = s.primaryButton?.enabled === false || s.showWhatsappButton === false;
  const isSiteOrderBtn = s.primaryButton?.actionType === 'order_site' || s.primaryButton?.url === '#produtos';
  const isWhatsappTarget = (!s.primaryButton?.url || s.primaryButton?.url?.includes('wa.me') || (s.primaryButton?.text && s.primaryButton?.text?.toLowerCase().includes('whatsapp'))) && !isSiteOrderBtn;

  const shouldHidePrimary = isPrimaryExplicitlyDisabled || (heroWhatsappDisabled && isWhatsappTarget);
  const showPrimaryBtn = !shouldHidePrimary && s.primaryButton?.enabled !== false && s.showWhatsappButton !== false;

  // Secondary button logic (Cardápio / Conheça Mais)
  const showSecondaryBtn = s.secondaryButton?.enabled === true;
  const showAnyHeroBtn = showPrimaryBtn || showSecondaryBtn;

  const primaryHref = isSiteOrderBtn
    ? (s.primaryButton?.url || '#produtos')
    : (s.primaryButton?.url || (cleanPhone ? waReservationUrl : '#contato'));

  const primaryTarget = isSiteOrderBtn
    ? undefined
    : (s.primaryButton?.url?.startsWith('http') || (!s.primaryButton?.url && cleanPhone) ? '_blank' : undefined);

  const primaryText = s.primaryButton?.text || (isSiteOrderBtn ? 'Fazer Pedido no Site' : 'Reservar Mesa');
  const secondaryText = s.secondaryButton?.text || 'Ver Cardápio';
  const secondaryHref = s.secondaryButton?.url || '#produtos';

  const coverImage =
    s.coverImage ||
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=85';

  return (
    <section id="inicio" className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-[#0c0a09] text-stone-100">
      {/* Background Image with Cinematic Grading */}
      <div className="absolute inset-0 z-0">
        <img
          src={coverImage}
          alt={s.headline || tenant.name}
          className="w-full h-full object-cover object-center filter contrast-110 brightness-75 scale-102"
          referrerPolicy="no-referrer"
        />
        {/* Layered vignette and ambient brass/charcoal gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0a09] via-[#0c0a09]/55 to-black/60" />
        <div className="absolute inset-0 bg-radial-at-c from-transparent via-[#0c0a09]/40 to-[#0c0a09]/90" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-24 text-center flex flex-col items-center">
        {/* Pre-header: Tagline & Status */}
        <PremiumScrollReveal direction="down" delay={0.1}>
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-stone-900/80 border border-amber-500/30 text-amber-200 text-xs font-serif tracking-widest uppercase mb-6 backdrop-blur-md shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>{s.tagline || 'GASTRONOMIA AUTORAL & HOSPITALIDADE'}</span>
            {scheduleStatus && (
              <>
                <span className="text-amber-500/40">·</span>
                <span className={scheduleStatus.isOpen ? 'text-emerald-400' : 'text-stone-400'}>
                  {scheduleStatus.text}
                </span>
              </>
            )}
          </div>
        </PremiumScrollReveal>

        {/* Monumental Headline */}
        <PremiumScrollReveal direction="up" delay={0.2}>
          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-serif font-bold tracking-tight text-[#fafaf9] leading-[1.08] max-w-4xl drop-shadow-2xl">
            {s.headline || `${tenant.name} — Uma Celebração à Gastronomia`}
          </h1>
        </PremiumScrollReveal>

        {/* Subtitle */}
        <PremiumScrollReveal direction="up" delay={0.35}>
          <p className="mt-6 text-base sm:text-lg md:text-xl text-stone-300 max-w-2xl mx-auto leading-relaxed font-light">
            {s.subtitle ||
              'Ingredientes selecionados na estação, carnes preparadas na brasa, massas artesanais e uma adega desenhada para harmonizar momentos inesquecíveis.'}
          </p>
        </PremiumScrollReveal>

        {/* Action CTAs */}
        {showAnyHeroBtn && (
          <PremiumScrollReveal direction="up" delay={0.5}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              {showPrimaryBtn && (
                <a
                  href={primaryHref}
                  target={primaryTarget}
                  rel={primaryTarget ? "noopener noreferrer" : undefined}
                  className="px-8 py-4 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-bold text-xs sm:text-sm tracking-[0.18em] uppercase transition-all duration-300 shadow-xl shadow-amber-950/40 rounded-none flex items-center gap-2.5 cursor-pointer hover:scale-102"
                >
                  {isSiteOrderBtn ? (
                    <ShoppingBag className="w-4 h-4 text-stone-950" />
                  ) : isWhatsappTarget ? (
                    <MessageCircle className="w-4 h-4 text-stone-950" />
                  ) : (
                    <Calendar className="w-4 h-4 text-stone-950" />
                  )}
                  <span>{primaryText}</span>
                </a>
              )}

              {showSecondaryBtn && (
                <a
                  href={secondaryHref}
                  className="px-8 py-4 bg-stone-900/80 hover:bg-stone-800 border border-stone-700 hover:border-amber-400/50 text-stone-200 hover:text-amber-300 font-bold text-xs sm:text-sm tracking-[0.18em] uppercase transition-all duration-300 rounded-none backdrop-blur-md flex items-center gap-2 cursor-pointer"
                >
                  <span>{secondaryText}</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>
          </PremiumScrollReveal>
        )}

        {/* Highlights row */}
        <PremiumScrollReveal direction="up" delay={0.65}>
          <div className="mt-14 pt-8 border-t border-stone-800/80 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto text-center sm:text-left">
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <Flame className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="text-xs">
                <strong className="block text-stone-200 font-serif">Grelhados na Brasa</strong>
                <span className="text-stone-400 text-[11px]">Cortes nobres certificados</span>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <UtensilsCrossed className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="text-xs">
                <strong className="block text-stone-200 font-serif">Insumos da Estação</strong>
                <span className="text-stone-400 text-[11px]">Preparo artesanal diário</span>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <Wine className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="text-xs">
                <strong className="block text-stone-200 font-serif">Carta de Vinhos</strong>
                <span className="text-stone-400 text-[11px]">Harmonização pelo sommelier</span>
              </div>
            </div>
          </div>
        </PremiumScrollReveal>
      </div>
    </section>
  );
};

interface RestaurantGastronomyAboutProps {
  tenant: Tenant;
  section: SiteSection;
  primaryColor: string;
  secondaryColor: string;
}

/**
 * 2. Concept, Kitchen & Grand Hall Presentation
 */
export const RestaurantGastronomyAbout: React.FC<RestaurantGastronomyAboutProps> = ({
  tenant,
  section,
  secondaryColor,
}) => {
  const aboutS = section.settings || {};

  return (
    <section id="sobre" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-[#0c0a09] text-stone-100">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* Left Column: Narrative */}
        <div className="lg:col-span-6 space-y-6">
          <PremiumScrollReveal direction="left">
            <span className="text-xs font-serif tracking-[0.25em] text-amber-400 uppercase block">
              [ HISTÓRIA & FILOSOFIA CULINÁRIA ]
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold tracking-tight text-[#fafaf9] leading-tight mt-2">
              {aboutS.title || 'Da Nossa Cozinha para a Sua Mesa'}
            </h2>
            <p className="text-stone-300 text-base sm:text-lg leading-relaxed font-light mt-4">
              {aboutS.text ||
                `No ${tenant.name}, cada prato conta uma história. Nossa gastronomia resgata técnicas tradicionais aliadas à inventividade contemporânea, valorizando o produto em sua essência mais pura.`}
            </p>

            {/* Three Culinary Pillars */}
            <div className="pt-6 space-y-4 border-t border-stone-800">
              <div className="flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 text-amber-400">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-serif font-bold text-stone-200">Ingredientes de Origem Controlada</h4>
                  <p className="text-xs text-stone-400 mt-0.5">Parceria com pequenos produtores e ingredientes frescos diários.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 text-amber-400">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-serif font-bold text-stone-200">Ambiente & Hospitalidade Calorosa</h4>
                  <p className="text-xs text-stone-400 mt-0.5">Salão desenhado para encontros memoráveis, reuniões e celebrações.</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 text-amber-400">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-serif font-bold text-stone-200">Pratos Especiais & Sugestões do Chef</h4>
                  <p className="text-xs text-stone-400 mt-0.5">Menu sazonal com receitas preparadas na hora pela nossa equipe.</p>
                </div>
              </div>
            </div>
          </PremiumScrollReveal>
        </div>

        {/* Right Column: Overlapping Editorial Images */}
        <div className="lg:col-span-6 relative">
          <PremiumScrollReveal direction="right" delay={0.2}>
            <div className="relative aspect-[4/5] sm:aspect-[4/3] lg:aspect-[4/5] overflow-hidden rounded-none shadow-2xl border border-stone-800">
              <img
                src={
                  aboutS.image ||
                  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80'
                }
                alt="Espaço e gastronomia"
                className="w-full h-full object-cover object-center filter contrast-105 hover:scale-103 transition-transform duration-700"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <span className="text-[11px] font-mono tracking-widest text-amber-400 uppercase block mb-1">
                  O SALÃO & ATELIÊ CULINÁRIO
                </span>
                <p className="text-sm font-serif text-white font-medium">
                  Conforto acolhedor, luz suave e aromas que despertam os sentidos.
                </p>
              </div>
            </div>
          </PremiumScrollReveal>
        </div>
      </div>
    </section>
  );
};

interface RestaurantReservationBannerProps {
  tenant: Tenant;
  section?: SiteSection;
}

/**
 * 3. VIP Reservation Banner
 */
export const RestaurantReservationBanner: React.FC<RestaurantReservationBannerProps> = ({ tenant, section }) => {
  const cleanPhone = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : tenant.phone ? tenant.phone.replace(/\D/g, '') : '';
  if (!cleanPhone) return null;

  const s = section?.settings || {};
  const tagline = s.tagline || '[ EXPERIÊNCIA COMPLETA ]';
  const title = s.title || 'Garante sua Mesa com Antecedência';
  const description =
    s.description ||
    s.subtitle ||
    'Para aniversários, almoços executivos ou jantares a dois, fale diretamente com nossa recepção pelo WhatsApp e reserve seu horário sem complicação.';
  const buttonText = s.buttonText || 'Solicitar Reserva pelo WhatsApp';

  const reservationMsg = encodeURIComponent(
    `Olá! Gostaria de consultar disponibilidade para reserva de mesa no ${tenant.name}. Poderia me informar os horários disponíveis?`
  );
  const waReservationUrl = s.buttonUrl || `https://wa.me/55${cleanPhone}?text=${reservationMsg}`;

  return (
    <section className="py-16 bg-[#141210] border-y border-stone-800 text-stone-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-4">
        <span className="text-xs font-serif tracking-[0.25em] text-amber-400 uppercase block">
          {tagline}
        </span>
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-white">
          {title}
        </h3>
        <p className="text-stone-300 text-sm max-w-xl mx-auto leading-relaxed font-light">
          {description}
        </p>
        <div className="pt-2">
          <a
            href={waReservationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-3.5 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs uppercase tracking-widest shadow-lg transition-all duration-200 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 text-stone-950" />
            <span>{buttonText}</span>
          </a>
        </div>
      </div>
    </section>
  );
};
