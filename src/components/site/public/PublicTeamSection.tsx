import React, { useState, useEffect } from 'react';
import {
  Users,
  MessageCircle,
  Tag,
  Briefcase,
  Loader2,
  AlertCircle,
  Sparkles,
  Phone,
  Mail,
} from 'lucide-react';
import { PublicProfessional } from '../../../types/service';
import { Tenant } from '../../../types/saas';
import { api } from '../../../services/api';

interface PublicTeamSectionProps {
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

export const PublicTeamSection: React.FC<PublicTeamSectionProps> = ({
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
  const [professionals, setProfessionals] = useState<PublicProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchProfessionals = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.getPublicProfessionals(tenant.slug);
        if (isMounted) {
          const max = settings.maxItems || 8;
          setProfessionals((res.professionals || []).slice(0, max));
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('[PUBLIC] Error fetching professionals:', err);
          setError(err.message || 'Erro ao carregar profissionais.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProfessionals();
    return () => {
      isMounted = false;
    };
  }, [tenant.slug, settings.maxItems]);

  const rawWhatsapp = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
  const makeWhatsappUrl = (profName: string) => {
    if (!rawWhatsapp) return '#contato';
    const msg = encodeURIComponent(
      `Olá! Vim pelo site da *${tenant.name}* e gostaria de informações sobre atendimento com o profissional *${profName}*.`
    );
    return `https://wa.me/55${rawWhatsapp}?text=${msg}`;
  };

  const sectionTitle = settings.title || 'Nossos Profissionais';
  const sectionSubtitle = settings.subtitle || 'Especialistas apaixonados e preparados para cuidar de você com excelência';
  const buttonLabel = settings.contactButtonText || 'Consultar Disponibilidade';

  if (!loading && professionals.length === 0 && !error) {
    if (isDraftPreview) {
      return (
        <section id="equipe" className="py-14 px-4 max-w-5xl mx-auto w-full text-center">
          <div className={`p-8 border border-dashed border-slate-300 bg-slate-50 ${radiusClass}`}>
            <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h3 className="font-bold text-sm text-slate-700">Seção de Profissionais</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Nenhum profissional ativo cadastrado ainda. Adicione membros da equipe no painel para exibi-los aqui.
            </p>
          </div>
        </section>
      );
    }
    return null;
  }

  return (
    <section id="equipe" className="py-14 md:py-20 px-4 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-2.5">
        <span
          className="text-xs font-bold uppercase tracking-wider block"
          style={{ color: secondaryColor }}
        >
          Equipe & Especialistas
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

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: primaryColor }} />
          <p className="text-xs font-semibold">Carregando equipe...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 text-rose-700 rounded-2xl text-xs text-center max-w-md mx-auto">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {professionals.map((prof) => {
            const waUrl = makeWhatsappUrl(prof.name);

            return (
              <div
                key={prof.id}
                className={`group bg-white border border-black/10 hover:border-black/20 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden text-slate-900 ${radiusClass}`}
              >
                {/* Photo Header */}
                <div className="relative aspect-square sm:aspect-[4/3] bg-slate-50 overflow-hidden">
                  {prof.photoUrl ? (
                    <img
                      src={prof.photoUrl}
                      alt={prof.name}
                      className="w-full h-full object-cover object-top sm:object-center group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                      <Users className="w-12 h-12 mb-1" />
                      <span className="text-xs font-bold text-slate-400">{prof.name}</span>
                    </div>
                  )}

                  {/* Gradient Overlay at Bottom */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 text-white">
                    <h3 className="font-black text-base drop-shadow-md truncate">
                      {prof.name}
                    </h3>
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    {/* Bio */}
                    {settings.showBio !== false && prof.bio && (
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                        {prof.bio}
                      </p>
                    )}

                    {/* Specialties */}
                    {settings.showSpecialties !== false &&
                      prof.specialties &&
                      prof.specialties.length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Especialidades:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {prof.specialties.map((spec) => (
                              <span
                                key={spec}
                                className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[10px] font-semibold"
                              >
                                {spec}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Services Performed */}
                    {settings.showServices !== false &&
                      prof.services &&
                      prof.services.length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Procedimentos:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {prof.services.slice(0, 3).map((svc) => (
                              <span
                                key={svc.id}
                                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-semibold truncate max-w-[160px]"
                              >
                                {svc.name}
                              </span>
                            ))}
                            {prof.services.length > 3 && (
                              <span className="text-[10px] text-slate-400 self-center font-bold">
                                +{prof.services.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Public Contact (Only if explicitly allowed) */}
                    {(prof.phone || prof.email) && (
                      <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
                        {prof.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{prof.phone}</span>
                          </div>
                        )}
                        {prof.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>{prof.email}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* WhatsApp Contact Button */}
                  <div className="pt-3 border-t border-slate-100">
                    {tenant.whatsapp ? (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-full py-2.5 px-4 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all ${radiusClass}`}
                        style={{ backgroundColor: primaryColor }}
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{buttonLabel}</span>
                      </a>
                    ) : (
                      <div className="text-center text-[11px] text-slate-400 font-semibold py-1">
                        Profissional disponível no estabelecimento
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
