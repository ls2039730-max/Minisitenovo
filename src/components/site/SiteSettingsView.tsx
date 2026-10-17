import React, { useState } from 'react';
import { Settings, MessageCircle, Globe, Shield, Zap, ExternalLink, Info, Copy, Check, Share2, Instagram, Facebook, Youtube } from 'lucide-react';
import { SiteData, SiteSettings, SocialLinkItem } from '../../types/site';
import { Tenant } from '../../types/saas';

interface SiteSettingsViewProps {
  tenant: Tenant;
  site: SiteData;
  onUpdateSettings: (newSettings: Partial<SiteSettings>) => void;
}

export const SiteSettingsView: React.FC<SiteSettingsViewProps> = ({
  tenant,
  site,
  onUpdateSettings,
}) => {
  const settings = site.settings;
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${tenant.slug}` : `/p/${tenant.slug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 overflow-y-auto">
      {/* Intro */}
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          Configurações do Mini Site
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Ajuste opções de navegação, botão flutuante e endereço de acesso da sua página.
        </p>
      </div>

      {/* 1. FLOATING WHATSAPP BUTTON */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Botão Flutuante do WhatsApp</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Exibe um botão flutuante no canto inferior direito durante toda a rolagem da página.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.floatingWhatsapp}
              onChange={(e) => onUpdateSettings({ floatingWhatsapp: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {settings.floatingWhatsapp && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3 pt-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Mensagem Inicial Pré-preenchida
              </label>
              <input
                type="text"
                placeholder="Ex: Olá! Vim pelo site e gostaria de saber mais."
                value={settings.floatingWhatsappMessage || ''}
                onChange={(e) => onUpdateSettings({ floatingWhatsappMessage: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Número utilizado:{' '}
              <strong className="font-semibold text-slate-800">
                {tenant.whatsapp || tenant.phone || 'Nenhum WhatsApp cadastrado na empresa'}
              </strong>
            </p>
          </div>
        )}
      </div>

      {/* 2. HEADER CTA BUTTON */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Botão de Ação no Cabeçalho (Header CTA)</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Exibe um botão destacado no menu superior da página em computadores e tablets.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.headerCtaEnabled !== false}
              onChange={(e) => onUpdateSettings({ headerCtaEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {settings.headerCtaEnabled !== false && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto do Botão</label>
              <input
                type="text"
                value={settings.headerCtaText || ''}
                onChange={(e) => onUpdateSettings({ headerCtaText: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Link de Destino</label>
              <input
                type="text"
                placeholder="Ex: #contato ou https://..."
                value={settings.headerCtaLink || ''}
                onChange={(e) => onUpdateSettings({ headerCtaLink: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2B. BANNER HERO WHATSAPP BUTTON (OPÇÃO DE RETIRAR WHATSAPP NO BANNER) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Botão de WhatsApp no Banner Principal</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Controle se o banner inicial deve exibir botão para o WhatsApp. Desative caso seus clientes devam fazer pedidos diretamente pelo site (cardápio e carrinho próprio), sem botão de WhatsApp no banner.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.heroWhatsappButtonEnabled !== false}
              onChange={(e) => onUpdateSettings({ heroWhatsappButtonEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {settings.heroWhatsappButtonEnabled === false ? (
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Botão de WhatsApp retirado do banner principal</strong>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Os clientes farão seus pedidos diretamente pelo catálogo/carrinho do site, sem o botão de WhatsApp no banner. Você também pode personalizar o texto e destino diretamente no editor de blocos (Banner Principal).
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            ✓ O banner principal está configurado para exibir botão de contato/pedido. Seus clientes podem clicar para falar no WhatsApp ou ver os produtos.
          </p>
        )}
      </div>

      {/* 2C. REDES SOCIAIS DA EMPRESA */}
      {(() => {
        const socialLinks: SocialLinkItem[] = Array.isArray(settings.socialLinks)
          ? settings.socialLinks
          : [
              { platform: 'instagram', name: 'Instagram', url: '', handle: '', isEnabled: true },
              { platform: 'facebook', name: 'Facebook', url: '', handle: '', isEnabled: true },
              { platform: 'tiktok', name: 'TikTok', url: '', handle: '', isEnabled: false },
              { platform: 'youtube', name: 'YouTube', url: '', handle: '', isEnabled: false },
            ];

        const handleUpdatePlatform = (platform: string, url: string) => {
          const existingIdx = socialLinks.findIndex((l) => l.platform.toLowerCase() === platform.toLowerCase());
          let updated: SocialLinkItem[];
          if (existingIdx >= 0) {
            updated = [...socialLinks];
            updated[existingIdx] = {
              ...updated[existingIdx],
              url,
              isEnabled: Boolean(url.trim().length > 0),
            };
          } else {
            updated = [
              ...socialLinks,
              {
                platform,
                name: platform.charAt(0).toUpperCase() + platform.slice(1),
                url,
                isEnabled: Boolean(url.trim().length > 0),
              },
            ];
          }
          onUpdateSettings({ socialLinks: updated });
        };

        const getUrl = (platform: string) => {
          const item = socialLinks.find((l) => l.platform.toLowerCase() === platform.toLowerCase());
          return item ? item.url : '';
        };

        return (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Redes Sociais da Empresa</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Preencha os links dos perfis oficiais da sua empresa. Esses links serão utilizados no rodapé e podem ser conectados à seção de Redes Sociais.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
              {/* Instagram */}
              <div>
                <label className="flex items-center gap-1.5 font-bold text-slate-700 mb-1">
                  <Instagram className="w-4 h-4 text-rose-500" />
                  <span>Instagram</span>
                </label>
                <input
                  type="text"
                  placeholder="https://instagram.com/seuperfil"
                  value={getUrl('instagram')}
                  onChange={(e) => handleUpdatePlatform('instagram', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 font-mono text-xs"
                />
              </div>

              {/* Facebook */}
              <div>
                <label className="flex items-center gap-1.5 font-bold text-slate-700 mb-1">
                  <Facebook className="w-4 h-4 text-blue-600" />
                  <span>Facebook</span>
                </label>
                <input
                  type="text"
                  placeholder="https://facebook.com/suapagina"
                  value={getUrl('facebook')}
                  onChange={(e) => handleUpdatePlatform('facebook', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 font-mono text-xs"
                />
              </div>

              {/* TikTok */}
              <div>
                <label className="flex items-center gap-1.5 font-bold text-slate-700 mb-1">
                  <svg className="w-4 h-4 fill-current text-slate-900" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.3 1.05.2 2.16-.08 2.94-.78.71-.62 1.08-1.54 1.11-2.48.04-3.51.01-7.03.02-10.55V0c-.01.01-.02.01-.02.02z" />
                  </svg>
                  <span>TikTok</span>
                </label>
                <input
                  type="text"
                  placeholder="https://tiktok.com/@seuperfil"
                  value={getUrl('tiktok')}
                  onChange={(e) => handleUpdatePlatform('tiktok', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 font-mono text-xs"
                />
              </div>

              {/* YouTube */}
              <div>
                <label className="flex items-center gap-1.5 font-bold text-slate-700 mb-1">
                  <Youtube className="w-4 h-4 text-red-600" />
                  <span>YouTube</span>
                </label>
                <input
                  type="text"
                  placeholder="https://youtube.com/@seucanal"
                  value={getUrl('youtube')}
                  onChange={(e) => handleUpdatePlatform('youtube', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:border-indigo-500 font-mono text-xs"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-1">
              Dica: Você também pode adicionar e estilizar a seção dedicada <strong className="text-slate-700">"Redes Sociais"</strong> diretamente no editor de blocos para exibir botões em destaque na página.
            </p>
          </div>
        );
      })()}

      {/* 3. DOMAIN & SUBDOMAIN INFORMATION */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Endereço de Acesso (Subdomínio)</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Seu mini site é publicado sob o endereço dinâmico da plataforma.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">Link Público do Mini Site</span>
            <span className="font-mono font-bold text-slate-900 text-sm break-all">{publicUrl}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyLink}
              className="px-3.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="Copiar Link para Compartilhar"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>

            <a
              href={`/p/${tenant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              Acessar
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-950 text-xs">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-amber-800">
            A alteração do slug ({tenant.slug}) é gerenciada pelo administrador da plataforma no painel Super Admin para garantir a disponibilidade e unicidade de endereços.
          </p>
        </div>
      </div>
    </div>
  );
};
