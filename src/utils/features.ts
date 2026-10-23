import { FeatureDefinition, FeatureKey, Plan, Tenant } from '../types/saas.js';

export const SYSTEM_FEATURES: FeatureDefinition[] = [
  {
    key: 'site_editor',
    name: 'Editor do Site',
    description: 'Personalização visual e blocos da página digital do negócio.',
    category: 'core',
    icon: 'Layout',
  },
  {
    key: 'whatsapp',
    name: 'Botão WhatsApp',
    description: 'Direcionamento direto com mensagem personalizada para atendimento.',
    category: 'core',
    icon: 'MessageSquare',
  },
  {
    key: 'social_links',
    name: 'Links & Redes Sociais',
    description: 'Botões de Instagram, Facebook, TikTok e contatos integrados.',
    category: 'core',
    icon: 'Share2',
  },
  {
    key: 'google_reviews',
    name: 'Avaliações Google',
    description: 'Exibição de depoimentos e incentivo a avaliações no Google Meu Negócio.',
    category: 'marketing',
    icon: 'Star',
  },
  {
    key: 'qr_code',
    name: 'Gerador de QR Code',
    description: 'QR Code dinâmico para mesas, balcão e material impresso.',
    category: 'marketing',
    icon: 'QrCode',
  },
  {
    key: 'services',
    name: 'Catálogo de Serviços',
    description: 'Listagem de procedimentos, durações e preços oferecidos.',
    category: 'atendimento',
    icon: 'Sparkles',
  },
  {
    key: 'appointments',
    name: 'Agendamentos & Agenda',
    description: 'Módulo de agendamento online de horários para clientes.',
    category: 'atendimento',
    icon: 'Calendar',
  },
  {
    key: 'professionals',
    name: 'Equipe & Profissionais',
    description: 'Vinculação de membros da equipe com suas especialidades.',
    category: 'atendimento',
    icon: 'Users',
  },
  {
    key: 'coupons',
    name: 'Cupons & Descontos',
    description: 'Criação de cupons promocionais para fidelização de clientes.',
    category: 'marketing',
    icon: 'Tag',
  },
  {
    key: 'analytics',
    name: 'Métricas & Acessos',
    description: 'Contador de visualizações, cliques no WhatsApp e taxas de conversão.',
    category: 'marketing',
    icon: 'BarChart2',
  },
  {
    key: 'products',
    name: 'Catálogo de Produtos',
    description: 'Vitrine digital com fotos, variações e controle de estoque.',
    category: 'vendas',
    icon: 'ShoppingBag',
  },
  {
    key: 'shopping_cart',
    name: 'Carrinho de Compras',
    description: 'Seleção de múltiplos itens e fechamento de pedidos.',
    category: 'vendas',
    icon: 'ShoppingCart',
  },
  {
    key: 'delivery',
    name: 'Módulo Delivery',
    description: 'Cálculo de taxa de entrega, bairros atendidos e retirada no local.',
    category: 'vendas',
    icon: 'Truck',
  },
  {
    key: 'wifi',
    name: 'Wi-Fi Marketing',
    description: 'Captura de contatos ao conectar na rede Wi-Fi do estabelecimento.',
    category: 'marketing',
    icon: 'Wifi',
  },
  {
    key: 'custom_domain',
    name: 'Domínio Próprio',
    description: 'Uso de domínio customizado (ex: seunegocio.com.br).',
    category: 'core',
    icon: 'Globe',
  },
  {
    key: 'restaurant_tables',
    name: 'Catálogo Digital & Mesas',
    description: 'Cardápio digital para mesas com QR Code individual, pedidos no salão e comanda por mesa.',
    category: 'vendas',
    icon: 'UtensilsCrossed',
  },
];

/**
 * Resolves whether a feature is effectively enabled for a tenant:
 * 1. If explicit override in tenant.featureOverrides[featureKey] === true -> Enabled
 * 2. If explicit override in tenant.featureOverrides[featureKey] === false -> Disabled
 * 3. Otherwise -> Inherit from plan.includedFeatures.includes(featureKey)
 */
export function isFeatureActive(
  tenant: Tenant | null | undefined,
  plan: Plan | null | undefined,
  featureKey: FeatureKey
): boolean {
  if (!tenant) return false;
  
  if (tenant.featureOverrides && typeof tenant.featureOverrides[featureKey] === 'boolean') {
    return tenant.featureOverrides[featureKey] as boolean;
  }

  if (plan && Array.isArray(plan.includedFeatures)) {
    return plan.includedFeatures.includes(featureKey);
  }

  return false;
}

/**
 * Centralized multi-tenant feature authorization resolver.
 * Enforces strict precedence:
 * 1. Explicit Super Admin override in tenant.featureOverrides[featureKey] (true or false)
 * 2. Server-computed resolvedFeatures[featureKey] (which already applies tenant_features over plan_features)
 * 3. Plan inheritance (plan.includedFeatures) ONLY when no explicit override exists
 * 4. Default: false (never falls back to unrelated features such as 'products')
 */
export function isTenantFeatureEnabled(
  featureKey: FeatureKey,
  resolvedFeatures?: Partial<Record<FeatureKey, boolean>> | null,
  tenant?: Tenant | null,
  plan?: Plan | null
): boolean {
  if (tenant?.featureOverrides && typeof tenant.featureOverrides[featureKey] === 'boolean') {
    return tenant.featureOverrides[featureKey] as boolean;
  }

  if (resolvedFeatures && typeof resolvedFeatures[featureKey] === 'boolean') {
    return resolvedFeatures[featureKey] as boolean;
  }

  return isFeatureActive(tenant, plan, featureKey);
}

/**
 * Returns feature status details:
 * - 'plan_enabled': Inherited as enabled from the plan
 * - 'plan_disabled': Inherited as disabled from the plan
 * - 'override_enabled': Customly enabled for this tenant
 * - 'override_disabled': Customly disabled for this tenant
 */
export function getFeatureResolution(
  tenant: Tenant,
  plan: Plan | undefined,
  featureKey: FeatureKey
): {
  active: boolean;
  source: 'plan_enabled' | 'plan_disabled' | 'override_enabled' | 'override_disabled';
  label: string;
} {
  const override = tenant.featureOverrides?.[featureKey];

  if (override === true) {
    return {
      active: true,
      source: 'override_enabled',
      label: 'Ativo por personalização (Super Admin)',
    };
  }
  if (override === false) {
    return {
      active: false,
      source: 'override_disabled',
      label: 'Desativado por personalização (Super Admin)',
    };
  }

  const inPlan = plan ? plan.includedFeatures.includes(featureKey) : false;
  if (inPlan) {
    return {
      active: true,
      source: 'plan_enabled',
      label: `Herdado do Plano ${plan?.name || ''}`,
    };
  } else {
    return {
      active: false,
      source: 'plan_disabled',
      label: `Não incluído no Plano ${plan?.name || ''}`,
    };
  }
}
