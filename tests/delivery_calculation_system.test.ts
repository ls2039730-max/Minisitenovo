import assert from 'node:assert/strict';
import {
  calculateComprehensiveDeliveryQuote,
  normalizeDeliveryText,
  parseFormattedAddressString,
} from '../src/utils/deliveryFeeCalculator';
import { DeliveryRule, DeliverySettings } from '../src/types/order';
import { orderRepo } from '../server/db/orderRepository';

function createBaseSettings(overrides: Partial<DeliverySettings> = {}): DeliverySettings {
  const now = new Date().toISOString();
  return {
    tenantId: 'tenant-test-1',
    ordersEnabled: true,
    acceptOrdersWhenClosed: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    minimumOrder: 0,
    freeDeliveryAbove: null,
    pickupInstructions: 'Retire no balcão',
    deliveryEstimateText: '40-50 min',
    orderWhatsappNumber: '5511999999999',
    pricingMode: 'neighborhood',
    originAddress: {
      cep: '28928506',
      street: 'Avenida Independência',
      number: '103',
      complement: '',
      neighborhood: 'Unamar',
      city: 'Cabo Frio',
      state: 'RJ',
      latitude: -22.6344,
      longitude: -42.0112,
    },
    kmConfig: {
      baseFee: 4.0,
      pricePerKm: 2.5,
      minDistanceKm: 0,
      maxDistanceKm: 10,
      distanceMethod: 'road_route',
      roundDistanceUp: false,
      minDeliveryFee: 0,
      freeDeliveryAbove: null,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRule(overrides: Partial<DeliveryRule>): DeliveryRule {
  const now = new Date().toISOString();
  return {
    id: `rule-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: 'tenant-test-1',
    type: 'neighborhood',
    name: overrides.neighborhood || 'Centro',
    neighborhood: 'Centro',
    city: 'Cabo Frio',
    state: 'RJ',
    cepStart: null,
    cepEnd: null,
    fee: 7.0,
    minimumOrder: null,
    freeDeliveryAbove: null,
    estimatedTime: '30-45 min',
    includedDistanceKm: null,
    extraKmFee: null,
    isActive: true,
    position: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('INICIANDO BATERIA DE TESTES DO SISTEMA DE ENTREGA (TESTES A - J)');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TESTE A: Configuração do endereço de origem
  // Salvar o endereço de um restaurante, geocodificar, recarregar a página
  // e confirmar que o endereço permanece associado ao tenant correto.
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste A: Configuração, recuperação e geocodificação do endereço de origem...');
  {
    const parsed = parseFormattedAddressString(
      'Avenida independência, 103, Unamar, Cabo Frio - RJ, CEP 28928506'
    );
    assert.ok(parsed, 'O parser deve extrair o endereço estruturado');
    assert.equal(normalizeDeliveryText(parsed.street), 'avenida independencia');
    assert.equal(parsed.number, '103');
    assert.equal(parsed.neighborhood, 'Unamar');
    assert.equal(parsed.city, 'Cabo Frio');
    assert.equal(parsed.state, 'RJ');
    assert.equal(parsed.cep, '28928506');

    // Verificar recuperação real no banco de dados para o tenant Mania de costela ('d80351bc-52b8-46c8-96c0-9d6622f4a680')
    const maniaTenantId = 'd80351bc-52b8-46c8-96c0-9d6622f4a680';
    const settingsBefore = await orderRepo.getDeliverySettings(maniaTenantId);
    assert.ok(settingsBefore.originAddress, 'Endereço de origem deve estar resolvido para Mania de costela');
    assert.equal(settingsBefore.originAddress.city, 'Cabo Frio');
    assert.equal(settingsBefore.originAddress.state, 'RJ');
    assert.equal(settingsBefore.originAddress.cep, '28928506');
    assert.ok(
      typeof settingsBefore.originAddress.latitude === 'number' &&
        typeof settingsBefore.originAddress.longitude === 'number',
      'Coordenadas geocodificadas reais devem estar presentes no endereço de origem'
    );

    // Salvar e recarregar configurações garantindo persistência por tenant
    const actorUser = {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Admin Teste',
      email: 'admin@teste.com',
      role: 'CLIENT_ADMIN' as const,
      tenantId: maniaTenantId,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
    };

    const savedSettings = await orderRepo.updateDeliverySettings(
      maniaTenantId,
      {
        pricingMode: settingsBefore.pricingMode || 'km',
        originAddress: settingsBefore.originAddress,
        kmConfig: settingsBefore.kmConfig,
      },
      actorUser
    );
    const reloadedSettings = await orderRepo.getDeliverySettings(maniaTenantId);
    assert.equal(reloadedSettings.tenantId, maniaTenantId);
    assert.equal(reloadedSettings.originAddress?.cep, '28928506');
    assert.equal(reloadedSettings.originAddress?.latitude, savedSettings.originAddress?.latitude);
    assert.equal(reloadedSettings.originAddress?.longitude, savedSettings.originAddress?.longitude);
    console.log(
      `  ✔ Teste A aprovado: Endereço de origem recuperado e geocodificado (${reloadedSettings.originAddress?.street}, ${reloadedSettings.originAddress?.number} - ${reloadedSettings.originAddress?.neighborhood}, ${reloadedSettings.originAddress?.city}/${reloadedSettings.originAddress?.state} [${reloadedSettings.originAddress?.latitude}, ${reloadedSettings.originAddress?.longitude}]).`
    );
  }

  // --------------------------------------------------------------------------
  // TESTE B: Entrega por quilômetro dentro do limite
  // Taxa fixa R$ 4,00, valor por km R$ 2,50, distância 3,2 km -> R$ 12,00
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste B: Entrega por quilômetro dentro do limite...');
  {
    const deliverySettings = createBaseSettings({
      pricingMode: 'km',
      kmConfig: {
        baseFee: 4.0,
        pricePerKm: 2.5,
        minDistanceKm: 0,
        maxDistanceKm: 10,
        distanceMethod: 'road_route',
        roundDistanceUp: false,
        minDeliveryFee: 0,
        freeDeliveryAbove: null,
      },
    });

    const quote = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings,
      deliveryRules: [],
      address: {
        cep: '28928506',
        street: 'Rua das Pacas',
        number: '50',
        neighborhood: 'Unamar',
        city: 'Cabo Frio',
        state: 'RJ',
      },
      subtotal: 89.99,
      calculatedDistanceKm: 3.2,
      distanceMethodUsed: 'road_route',
    });

    // 4.00 + (3.2 * 2.50) = 4.00 + 8.00 = 12.00
    assert.equal(quote.isCovered, true);
    assert.equal(quote.fee, 12.0);
    assert.equal(quote.distanceKm, 3.2);
    assert.equal(quote.billedDistanceKm, 3.2);
    assert.equal(quote.pricingMode, 'km');
    console.log(
      `  ✔ Teste B aprovado: Taxa fixa R$ 4,00 + (3,2 km × R$ 2,50) = R$ ${quote.fee.toFixed(2).replace('.', ',')}.`
    );
  }

  // --------------------------------------------------------------------------
  // TESTE C: Entrega por quilômetro com distância mínima
  // Distância calculada 0,8 km, distância mínima cobrada 2 km -> cobra 2 km
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste C: Entrega por quilômetro com distância mínima...');
  {
    const deliverySettings = createBaseSettings({
      pricingMode: 'km',
      kmConfig: {
        baseFee: 4.0,
        pricePerKm: 2.5,
        minDistanceKm: 2.0,
        maxDistanceKm: 10,
        distanceMethod: 'road_route',
        roundDistanceUp: false,
        minDeliveryFee: 0,
        freeDeliveryAbove: null,
      },
    });

    const quote = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings,
      deliveryRules: [],
      address: {
        cep: '28928506',
        street: 'Av. Independência',
        number: '200',
        neighborhood: 'Unamar',
        city: 'Cabo Frio',
        state: 'RJ',
      },
      subtotal: 89.99,
      calculatedDistanceKm: 0.8,
      distanceMethodUsed: 'road_route',
    });

    // Distância real 0.8 km, mínima cobrada 2.0 km -> 4.00 + (2.0 * 2.50) = R$ 9.00
    assert.equal(quote.isCovered, true);
    assert.equal(quote.distanceKm, 0.8);
    assert.equal(quote.billedDistanceKm, 2.0);
    assert.equal(quote.fee, 9.0);
    console.log(
      `  ✔ Teste C aprovado: Distância real ${quote.distanceKm} km respeitou distância mínima cobrada de ${quote.billedDistanceKm} km -> Frete R$ ${quote.fee.toFixed(2).replace('.', ',')}.`
    );
  }

  // --------------------------------------------------------------------------
  // TESTE D: Entrega por quilômetro fora do limite
  // Distância calculada 14 km, distância máxima 10 km -> bloqueia com mensagem clara
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste D: Entrega por quilômetro fora do limite...');
  {
    const deliverySettings = createBaseSettings({
      pricingMode: 'km',
      kmConfig: {
        baseFee: 4.0,
        pricePerKm: 2.5,
        minDistanceKm: 0,
        maxDistanceKm: 10,
        distanceMethod: 'road_route',
        roundDistanceUp: false,
        minDeliveryFee: 0,
        freeDeliveryAbove: null,
      },
    });

    const quote = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings,
      deliveryRules: [],
      address: {
        cep: '28900000',
        street: 'Av. Teixeira e Souza',
        number: '100',
        neighborhood: 'Centro',
        city: 'Cabo Frio',
        state: 'RJ',
      },
      subtotal: 89.99,
      calculatedDistanceKm: 14.0,
      distanceMethodUsed: 'road_route',
    });

    assert.equal(quote.isCovered, false);
    assert.equal(quote.errorCode, 'OUT_OF_RANGE_KM');
    assert.ok(quote.reason?.includes('fora da área máxima de entrega'));
    console.log(`  ✔ Teste D aprovado: Bloqueado corretamente com mensagem: "${quote.reason}"`);
  }

  // --------------------------------------------------------------------------
  // TESTE E: Entrega por bairro cadastrado
  // Bairro "Centro" com taxa de R$ 7,00 -> aplica R$ 7,00
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste E: Entrega por bairro cadastrado...');
  {
    const deliverySettings = createBaseSettings({ pricingMode: 'neighborhood' });
    const deliveryRules = [
      createRule({
        neighborhood: 'Centro',
        city: 'Cabo Frio',
        state: 'RJ',
        fee: 7.0,
      }),
    ];

    const quote = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings,
      deliveryRules,
      address: {
        cep: '28905000',
        street: 'Rua Éfeso',
        number: '10',
        neighborhood: 'Centro',
        city: 'Cabo Frio',
        state: 'RJ',
      },
      subtotal: 89.99,
    });

    assert.equal(quote.isCovered, true);
    assert.equal(quote.fee, 7.0);
    assert.equal(quote.ruleApplied?.neighborhood, 'Centro');
    console.log(`  ✔ Teste E aprovado: Bairro "Centro" aplicou taxa de R$ ${quote.fee.toFixed(2).replace('.', ',')}.`);
  }

  // --------------------------------------------------------------------------
  // TESTE F: Entrega por bairro com diferença de acentuação e caixa
  // Regra "Jardim América", cliente digita "jardim america" -> reconhece o bairro
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste F: Entrega por bairro com diferença de acentuação e caixa...');
  {
    const deliverySettings = createBaseSettings({ pricingMode: 'neighborhood' });
    const deliveryRules = [
      createRule({
        neighborhood: 'Jardim América',
        city: 'São Paulo',
        state: 'SP',
        fee: 8.5,
      }),
    ];

    const quote = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings,
      deliveryRules,
      address: {
        cep: '01435000',
        street: 'Rua Estados Unidos',
        number: '500',
        neighborhood: '  jardim   america ',
        city: 'sao paulo',
        state: 'sp',
      },
      subtotal: 100.0,
    });

    assert.equal(quote.isCovered, true);
    assert.equal(quote.fee, 8.5);
    assert.equal(quote.ruleApplied?.neighborhood, 'Jardim América');
    console.log(
      `  ✔ Teste F aprovado: "jardim america" (sao paulo/sp) reconhecido como "${quote.ruleApplied?.neighborhood}" -> R$ ${quote.fee.toFixed(2).replace('.', ',')}.`
    );
  }

  // --------------------------------------------------------------------------
  // TESTE G: Entrega por bairro não cadastrado
  // Cliente informa bairro fora da lista -> bloqueia e informa que ainda não há taxa configurada
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste G: Entrega por bairro não cadastrado...');
  {
    const deliverySettings = createBaseSettings({ pricingMode: 'neighborhood' });
    const deliveryRules = [
      createRule({
        neighborhood: 'Centro',
        city: 'Cabo Frio',
        state: 'RJ',
        fee: 7.0,
      }),
    ];

    const quote = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings,
      deliveryRules,
      address: {
        cep: '28900000',
        street: 'Rua A',
        number: '12',
        neighborhood: 'Bairro Inexistente',
        city: 'Cabo Frio',
        state: 'RJ',
      },
      subtotal: 89.99,
    });

    assert.equal(quote.isCovered, false);
    assert.equal(quote.errorCode, 'NEIGHBORHOOD_NOT_FOUND');
    assert.ok(quote.reason?.includes('ainda não há uma taxa de entrega configurada'));
    console.log(`  ✔ Teste G aprovado: Bairro não cadastrado bloqueado com mensagem: "${quote.reason}"`);
  }

  // --------------------------------------------------------------------------
  // TESTE H: Frete grátis por valor mínimo
  // Frete grátis acima de R$ 120,00, carrinho com R$ 135,00 -> frete R$ 0,00 dentro da área atendida
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste H: Frete grátis por valor mínimo...');
  {
    const deliverySettings = createBaseSettings({
      pricingMode: 'neighborhood',
      freeDeliveryAbove: 120.0,
    });
    const deliveryRules = [
      createRule({
        neighborhood: 'Centro',
        city: 'Cabo Frio',
        state: 'RJ',
        fee: 9.0,
      }),
    ];

    const quoteEligible = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings,
      deliveryRules,
      address: {
        cep: '28905000',
        street: 'Rua Éfeso',
        number: '10',
        neighborhood: 'Centro',
        city: 'Cabo Frio',
        state: 'RJ',
      },
      subtotal: 135.0,
    });

    assert.equal(quoteEligible.isCovered, true);
    assert.equal(quoteEligible.isFreeDelivery, true);
    assert.equal(quoteEligible.fee, 0);

    // Garantir que bairro FORA da área atendida NÃO ganhe frete grátis indevido
    const quoteOutsideArea = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings,
      deliveryRules,
      address: {
        cep: '28905000',
        street: 'Rua Éfeso',
        number: '10',
        neighborhood: 'Bairro Fora da Rota',
        city: 'Cabo Frio',
        state: 'RJ',
      },
      subtotal: 135.0,
    });
    assert.equal(quoteOutsideArea.isCovered, false);
    console.log(
      `  ✔ Teste H aprovado: Pedido de R$ 135,00 (meta R$ 120,00) recebeu Frete Grátis (R$ 0,00) dentro da área atendida e bloqueou endereço fora da área.`
    );
  }

  // --------------------------------------------------------------------------
  // TESTE I: Isolamento entre estabelecimentos
  // Restaurante A usa cobrança por km, Restaurante B usa cobrança por bairro
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste I: Isolamento entre estabelecimentos (Multi-Tenant)...');
  {
    const tenantASettings = createBaseSettings({
      tenantId: 'tenant-A',
      pricingMode: 'km',
      kmConfig: {
        baseFee: 5.0,
        pricePerKm: 2.0,
        minDistanceKm: 1.0,
        maxDistanceKm: 12.0,
        distanceMethod: 'road_route',
        roundDistanceUp: false,
        minDeliveryFee: 0,
        freeDeliveryAbove: null,
      },
    });

    const tenantBSettings = createBaseSettings({
      tenantId: 'tenant-B',
      pricingMode: 'neighborhood',
    });
    const tenantBRules = [
      createRule({
        tenantId: 'tenant-B',
        neighborhood: 'Unamar',
        city: 'Cabo Frio',
        state: 'RJ',
        fee: 6.0,
      }),
    ];

    const customerAddr = {
      cep: '28928506',
      street: 'Av. Independência',
      number: '500',
      neighborhood: 'Unamar',
      city: 'Cabo Frio',
      state: 'RJ',
    };

    const quoteA = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings: tenantASettings,
      deliveryRules: tenantBRules,
      address: customerAddr,
      subtotal: 89.99,
      calculatedDistanceKm: 4.0,
      distanceMethodUsed: 'road_route',
    });

    const quoteB = calculateComprehensiveDeliveryQuote({
      fulfillmentType: 'delivery',
      deliverySettings: tenantBSettings,
      deliveryRules: tenantBRules,
      address: customerAddr,
      subtotal: 89.99,
      calculatedDistanceKm: 4.0,
    });

    assert.equal(quoteA.pricingMode, 'km');
    assert.equal(quoteA.fee, 13.0); // 5 + 4 * 2 = 13.00
    assert.equal(quoteB.pricingMode, 'neighborhood');
    assert.equal(quoteB.fee, 6.0); // Taxa fixa do bairro Unamar = 6.00
    console.log(
      `  ✔ Teste I aprovado: Tenant A (por Km) calculou R$ ${quoteA.fee.toFixed(2).replace('.', ',')} e Tenant B (por Bairro) calculou R$ ${quoteB.fee.toFixed(2).replace('.', ',')} sem interferência.`
    );
  }

  // --------------------------------------------------------------------------
  // TESTE J: Segurança no fechamento do pedido
  // Tentar enviar pelo frontend um valor de frete manipulado e confirmar que o
  // backend recalcula o frete correto e rejeita divergência.
  // --------------------------------------------------------------------------
  console.log('▶ Executando Teste J: Segurança no fechamento do pedido (anti-manipulação de frete no backend)...');
  {
    const { supabaseAdmin } = await import('../server/supabaseAdmin');
    const maniaTenantId = 'd80351bc-52b8-46c8-96c0-9d6622f4a680';
    const maniaSlug = 'costela-mania';
    const { data: activeProducts } = await supabaseAdmin
      .from('products')
      .select('id, name, price, promotional_price')
      .eq('tenant_id', maniaTenantId)
      .eq('is_active', true)
      .limit(1);

    assert.ok(activeProducts && activeProducts.length > 0, 'Deve existir pelo menos 1 produto ativo no restaurante para o teste');
    const realProductId = activeProducts[0].id;

    let rejectedManipulatedFee = false;
    let rejectionMessage = '';

    try {
      await orderRepo.createOrder(maniaSlug, {
        customerName: 'Cliente Teste Segurança',
        customerPhone: '22999999999',
        fulfillmentType: 'delivery',
        paymentMethod: 'PIX',
        expectedDeliveryFee: 0.01, // Valor de frete adulterado pelo frontend!
        deliveryAddress: {
          cep: '28928506',
          street: 'Avenida Independência',
          number: '350',
          neighborhood: 'Unamar',
          city: 'Cabo Frio',
          state: 'RJ',
        },
        items: [
          {
            productId: realProductId,
            quantity: 1,
          },
        ],
      });
    } catch (err: any) {
      rejectedManipulatedFee = true;
      rejectionMessage = err.message || '';
    }

    assert.equal(
      rejectedManipulatedFee,
      true,
      'O backend DEVE rejeitar um pedido cujo expectedDeliveryFee enviado pelo frontend diverge do cálculo oficial do servidor'
    );
    assert.ok(
      rejectionMessage.includes('Divergência no valor do frete'),
      `Mensagem de erro esperada sobre divergência no frete, recebida: "${rejectionMessage}"`
    );
    console.log(`  ✔ Teste J aprovado: Backend bloqueou frete adulterado com: "${rejectionMessage}"`);
  }

  console.log('\n================================================================');
  console.log('TODOS OS TESTES (A ATÉ J) PASSARAM COM 100% DE SUCESSO!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('FALHA NOS TESTES:', err);
  process.exit(1);
});
