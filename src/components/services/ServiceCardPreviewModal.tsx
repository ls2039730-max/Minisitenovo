import React from 'react';
import { X, Clock, Sparkles, MessageCircle, Star, Users } from 'lucide-react';
import { Service } from '../../types/service';
import { Tenant } from '../../types/saas';

interface ServiceCardPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: Service | null;
  tenant: Tenant;
}

export const ServiceCardPreviewModal: React.FC<ServiceCardPreviewModalProps> = ({
  isOpen,
  onClose,
  service,
  tenant,
}) => {
  if (!isOpen || !service) return null;

  const primaryColor = tenant?.appearance?.primaryColor || '#1e293b';
  const secondaryColor = tenant?.appearance?.secondaryColor || '#3b82f6';
  const rawWa = tenant?.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
  const waMessage = encodeURIComponent(
    `Olá! Gostaria de consultar informações e disponibilidade para o serviço: *${service.name}*.`
  );
  const waUrl = rawWa ? `https://wa.me/55${rawWa}?text=${waMessage}` : '#';

  const formatPrice = () => {
    if (service.pricingType === 'on_request') {
      return 'Sob consulta';
    }
    if (service.price !== null && service.price !== undefined) {
      const formatted = Number(service.price).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      if (service.pricingType === 'starting_at') {
        return `A partir de ${formatted}`;
      }
      return formatted;
    }
    return 'Sob consulta';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Pré-visualização do Card no Mini Site
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card Mockup */}
        <div className="p-6 bg-slate-100/60 flex items-center justify-center">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden group">
            {/* Image */}
            <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
              {service.imageUrl ? (
                <img
                  src={service.imageUrl}
                  alt={service.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                  <Sparkles className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-bold">Sem imagem</span>
                </div>
              )}

              {/* Badges */}
              <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                {service.featured && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs">
                    <Star className="w-3 h-3 fill-current" />
                    Destaque
                  </span>
                )}
                {service.durationMinutes && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/70 text-white backdrop-blur-xs">
                    <Clock className="w-3 h-3" />
                    {service.durationMinutes} min
                  </span>
                )}
              </div>

              {service.category && (
                <div className="absolute bottom-2.5 left-2.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/95 text-slate-800 shadow-xs">
                    {service.category.name}
                  </span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <div>
                <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {service.name}
                </h4>
                {service.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                    {service.description}
                  </p>
                )}
              </div>

              {/* Assigned Professionals */}
              {service.professionals && service.professionals.length > 0 && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Profissionais:
                  </span>
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {service.professionals.map((prof) => (
                      <div
                        key={prof.id}
                        title={prof.name}
                        className="w-6 h-6 rounded-full ring-2 ring-white bg-slate-200 overflow-hidden flex items-center justify-center text-[9px] font-bold text-slate-600 shrink-0"
                      >
                        {prof.photoUrl ? (
                          <img src={prof.photoUrl} alt={prof.name} className="w-full h-full object-cover" />
                        ) : (
                          prof.name.substring(0, 1)
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Price & CTA */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="block text-[9px] uppercase font-bold text-slate-400">
                    {service.pricingType === 'on_request'
                      ? 'Orçamento'
                      : service.pricingType === 'starting_at'
                      ? 'Preço Inicial'
                      : 'Valor'}
                  </span>
                  <span className="font-extrabold text-sm text-slate-900">
                    {formatPrice()}
                  </span>
                </div>

                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95 transition-all"
                  style={{ backgroundColor: primaryColor }}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Consultar</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>O layout final adapta-se à paleta de cores da sua empresa.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
