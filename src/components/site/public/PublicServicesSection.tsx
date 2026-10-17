import React, { useState, useEffect } from 'react';
import {
  Clock,
  Star,
  MessageCircle,
  Eye,
  X,
  Sparkles,
  Users,
  Tag,
  Loader2,
  AlertCircle,
  ArrowRight,
  Info,
  Calendar,
} from 'lucide-react';
import { PublicService } from '../../../types/service';
import { Tenant } from '../../../types/saas';
import { api } from '../../../services/api';
import { PublicAppointmentModal } from './PublicAppointmentModal';

interface PublicServicesSectionProps {
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

export const PublicServicesSection: React.FC<PublicServicesSectionProps> = ({
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
  const [services, setServices] = useState<PublicService[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active category tab
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Service Details Modal state
  const [selectedService, setSelectedService] = useState<PublicService | null>(null);

  // Online Appointment Modal state
  const [bookingService, setBookingService] = useState<PublicService | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchServices = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.getPublicServices(tenant.slug, {
          featuredOnly: settings.filterType === 'featured',
          categoryId: settings.filterType === 'category' ? settings.selectedCategoryId : undefined,
          limit: settings.maxItems || 24,
        });

        if (isMounted) {
          setServices(res.services || []);
          setCategories(res.categories || []);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('[PUBLIC] Error fetching services:', err);
          setError(err.message || 'Erro ao carregar serviços.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchServices();
    return () => {
      isMounted = false;
    };
  }, [tenant.slug, settings.filterType, settings.selectedCategoryId, settings.maxItems]);

  // Filter services by category tab
  const filteredServices = services.filter((s) => {
    if (selectedCategory === 'all') return true;
    return s.categoryId === selectedCategory;
  });

  const rawWhatsapp = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
  const makeWhatsappUrl = (serviceName: string) => {
    if (!rawWhatsapp) return '#contato';
    const msg = encodeURIComponent(
      `Olá! Vim pelo site da *${tenant.name}* e gostaria de consultar informações e disponibilidade para o serviço: *${serviceName}*.`
    );
    return `https://wa.me/55${rawWhatsapp}?text=${msg}`;
  };

  const formatPrice = (s: PublicService) => {
    if (s.pricingType === 'on_request') {
      return 'Sob consulta';
    }
    if (s.price !== null && s.price !== undefined) {
      const formatted = Number(s.price).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      if (s.pricingType === 'starting_at') {
        return `A partir de ${formatted}`;
      }
      return formatted;
    }
    return 'Sob consulta';
  };

  const sectionTitle = settings.title || 'Nossos Serviços';
  const sectionSubtitle = settings.subtitle || 'Procedimentos especializados realizados por profissionais dedicados';
  const buttonLabel = settings.buttonText || 'Consultar Disponibilidade';

  if (!loading && services.length === 0 && !error) {
    if (isDraftPreview) {
      return (
        <section id="servicos" className="py-14 px-4 max-w-5xl mx-auto w-full text-center">
          <div className={`p-8 border border-dashed border-slate-300 bg-slate-50 ${radiusClass}`}>
            <Sparkles className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h3 className="font-bold text-sm text-slate-700">Seção de Serviços</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Nenhum serviço ativo encontrado para esta empresa. Cadastre seus serviços na aba "Serviços" do painel para que apareçam aqui.
            </p>
          </div>
        </section>
      );
    }
    return null;
  }

  return (
    <section id="servicos" className="py-14 md:py-20 px-4 max-w-6xl mx-auto w-full">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-10 space-y-2.5">
        <span
          className="text-xs font-bold uppercase tracking-wider block"
          style={{ color: secondaryColor }}
        >
          Procedimentos & Cuidados
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">
          {sectionTitle}
        </h2>
        {sectionSubtitle && (
          <p className="text-xs sm:text-sm opacity-75 max-w-xl mx-auto leading-relaxed">
            {sectionSubtitle}
          </p>
        )}
      </div>

      {/* Category Tabs (if enabled and categories exist) */}
      {settings.showCategoryTabs !== false && categories.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer ${radiusClass} ${
              selectedCategory === 'all'
                ? 'text-white shadow-md'
                : 'bg-black/5 hover:bg-black/10 text-slate-800'
            }`}
            style={selectedCategory === 'all' ? { backgroundColor: primaryColor } : {}}
          >
            Todos os Serviços
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer ${radiusClass} ${
                  isSelected
                    ? 'text-white shadow-md'
                    : 'bg-black/5 hover:bg-black/10 text-slate-800'
                }`}
                style={isSelected ? { backgroundColor: primaryColor } : {}}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: primaryColor }} />
          <p className="text-xs font-semibold">Carregando serviços...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-700 rounded-2xl text-xs text-center max-w-md mx-auto">
          {error}
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-12 opacity-60 text-xs">
          Nenhum serviço disponível nesta categoria no momento.
        </div>
      ) : (
        /* Services Cards Grid */
        <div
          className={`grid gap-5 ${
            settings.layout === 'list'
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {filteredServices.map((service) => {
            const waUrl = makeWhatsappUrl(service.name);

            return (
              <div
                key={service.id}
                className={`group bg-white border border-black/10 hover:border-black/20 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden text-slate-900 ${radiusClass}`}
              >
                {/* Image & Top Badges */}
                <div
                  onClick={() => setSelectedService(service)}
                  className="relative aspect-[16/10] bg-slate-100 overflow-hidden cursor-pointer"
                >
                  {service.imageUrl ? (
                    <img
                      src={service.imageUrl}
                      alt={service.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                      <Sparkles className="w-8 h-8 mb-1" />
                      <span className="text-[10px] font-bold">Ver detalhes</span>
                    </div>
                  )}

                  {/* Badges Over Image */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                    {service.featured && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-md">
                        <Star className="w-3 h-3 fill-current" />
                        Destaque
                      </span>
                    )}
                    {settings.showDuration !== false && service.durationMinutes && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/75 text-white backdrop-blur-xs">
                        <Clock className="w-3 h-3" />
                        {service.durationMinutes} min
                      </span>
                    )}
                  </div>

                  {service.categoryName && (
                    <div className="absolute bottom-2.5 left-2.5">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/95 text-slate-900 shadow-xs">
                        {service.categoryName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <h3
                      onClick={() => setSelectedService(service)}
                      className="font-extrabold text-base text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer line-clamp-1"
                    >
                      {service.name}
                    </h3>
                    {service.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {service.description}
                      </p>
                    )}
                  </div>

                  {/* Assigned Professionals */}
                  {settings.showProfessionals !== false &&
                    service.professionals &&
                    service.professionals.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          Atendimento:
                        </span>
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {service.professionals.map((prof) => (
                            <div
                              key={prof.id}
                              title={prof.name}
                              className="w-6 h-6 rounded-full ring-2 ring-white bg-slate-200 overflow-hidden flex items-center justify-center text-[9px] font-bold text-slate-700 shrink-0"
                            >
                              {prof.photoUrl ? (
                                <img
                                  src={prof.photoUrl}
                                  alt={prof.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                prof.name.substring(0, 1)
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Price & Action Row */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {settings.showPrice !== false && (
                      <div>
                        <span className="block text-[9px] uppercase font-bold text-slate-400">
                          {service.pricingType === 'on_request'
                            ? 'Orçamento'
                            : service.pricingType === 'starting_at'
                            ? 'A Partir De'
                            : 'Valor'}
                        </span>
                        <span className="font-extrabold text-sm text-slate-900 block">
                          {formatPrice(service)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedService(service)}
                        className={`p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer ${radiusClass}`}
                        title="Ver detalhes completos"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {service.bookingEnabled !== false ? (
                        <button
                          onClick={() => {
                            setBookingService(service);
                            setIsBookingModalOpen(true);
                          }}
                          className={`px-3 py-2 text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer ${radiusClass}`}
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Agendar</span>
                        </button>
                      ) : tenant.whatsapp ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`px-3 py-2 text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:scale-105 active:scale-95 transition-all ${radiusClass}`}
                          style={{ backgroundColor: primaryColor }}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{buttonLabel}</span>
                        </a>
                      ) : (
                        <button
                          onClick={() => setSelectedService(service)}
                          className={`px-3 py-2 text-white font-bold text-xs flex items-center gap-1.5 shadow-md ${radiusClass}`}
                          style={{ backgroundColor: primaryColor }}
                        >
                          <span>Ver Detalhes</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* SERVICE DETAILS MODAL (POPUP) */}
      {/* ========================================================= */}
      {selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`bg-white text-slate-900 max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 ${radiusClass}`}
          >
            {/* Modal Header Image */}
            <div className="relative aspect-[16/9] bg-slate-100 overflow-hidden shrink-0">
              {selectedService.imageUrl ? (
                <img
                  src={selectedService.imageUrl}
                  alt={selectedService.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50">
                  <Sparkles className="w-12 h-12" />
                </div>
              )}

              <button
                onClick={() => setSelectedService(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer shadow-lg"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                {selectedService.featured && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white shadow-md">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    Destaque
                  </span>
                )}
                {selectedService.categoryName && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/95 text-slate-900 shadow-md">
                    {selectedService.categoryName}
                  </span>
                )}
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              <div>
                <h3 className="text-xl md:text-2xl font-black text-slate-900">
                  {selectedService.name}
                </h3>

                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-semibold text-slate-500">
                  {selectedService.durationMinutes && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      Duração estimada: {selectedService.durationMinutes} minutos
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg">
                    {selectedService.pricingType === 'on_request'
                      ? 'Orçamento sob consulta'
                      : selectedService.pricingType === 'starting_at'
                      ? 'Preço inicial'
                      : 'Preço fixo'}
                  </span>
                </div>
              </div>

              {selectedService.description && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Sobre o Procedimento
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                    {selectedService.description}
                  </p>
                </div>
              )}

              {/* Assigned Professionals in Detail Modal */}
              {selectedService.professionals && selectedService.professionals.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    Profissionais Habilitados
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedService.professionals.map((prof) => (
                      <div
                        key={prof.id}
                        className="p-3 bg-slate-50 rounded-xl flex items-center gap-3 border border-slate-100"
                      >
                        <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center font-bold text-xs text-slate-600 shrink-0">
                          {prof.photoUrl ? (
                            <img src={prof.photoUrl} alt={prof.name} className="w-full h-full object-cover" />
                          ) : (
                            prof.name.substring(0, 1)
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs block text-slate-900 truncate">
                            {prof.name}
                          </span>
                          {prof.specialties && prof.specialties.length > 0 && (
                            <span className="text-[10px] text-slate-500 block truncate">
                              {prof.specialties.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer / WhatsApp Contact */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">
                  {selectedService.pricingType === 'on_request'
                    ? 'Cobrança'
                    : selectedService.pricingType === 'starting_at'
                    ? 'Preço Inicial'
                    : 'Valor do Serviço'}
                </span>
                <span className="font-black text-xl text-slate-900">
                  {formatPrice(selectedService)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedService.bookingEnabled !== false && (
                  <button
                    onClick={() => {
                      const s = selectedService;
                      setSelectedService(null);
                      setBookingService(s);
                      setIsBookingModalOpen(true);
                    }}
                    className={`px-5 py-3 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer ${radiusClass}`}
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Agendar Horário Online</span>
                  </button>
                )}

                {tenant.whatsapp && (
                  <a
                    href={makeWhatsappUrl(selectedService.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all ${radiusClass}`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </a>
                )}

                <button
                  onClick={() => setSelectedService(null)}
                  className={`px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer ${radiusClass}`}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Online Appointment Booking Modal */}
      <PublicAppointmentModal
        isOpen={isBookingModalOpen}
        tenant={tenant}
        services={services}
        preSelectedService={bookingService}
        primaryColor={primaryColor}
        radiusClass={radiusClass}
        onClose={() => {
          setIsBookingModalOpen(false);
          setBookingService(null);
        }}
      />
    </section>
  );
};
