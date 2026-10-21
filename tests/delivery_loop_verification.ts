import { getDeliveryCalculationKey } from '../src/context/CartContext.js';
import { calculateComprehensiveDeliveryQuote } from '../src/utils/deliveryFeeCalculator.js';
import { calculateCartTotals } from '../src/utils/cartCalculator.js';
import { orderRepo } from '../server/db/orderRepository.js';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import { DeliverySettings, DeliveryRule, ValidatedCartItem } from '../src/types/order.js';

async function runBatteryTests() {
  console.log('=== INICIANDO BATERIA DE TESTES DE CÁLCULO DE FRETE E LOOP INFINITO ===\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, extra?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`, extra || '');
      failed++;
    }
  }

  // 1. Chave estável de cálculo (getDeliveryCalculationKey)
  console.log('--- TESTE 1: Estabilidade da chave de cálculo e proteção de deduplicação ---');
  const addr1 = {
    cep: '28928-506',
    street: 'Rua San Telmo',
    number: '23',
    neighborhood: 'Unamar (Tamoios)',
    city: 'Cabo Frio',
    state: 'RJ',
    complement: '',
    reference: '',
    selectedRuleId: null,
  };
  const key1 = getDeliveryCalculationKey('costela-mania', 'delivery', addr1, 50, null);
  const key2 = getDeliveryCalculationKey('costela-mania', 'delivery', { ...addr1 }, 50, null);
  assert('Chaves idênticas para o mesmo endereço e subtotal', key1 === key2);

  // Address change detection
  const addr2 = { ...addr1, number: '25' };
  const key3 = getDeliveryCalculationKey('costela-mania', 'delivery', addr2, 50, null);
  assert('Chave altera quando o número do endereço muda', key1 !== key3);

  // Pickup key
  const pickupKey = getDeliveryCalculationKey('costela-mania', 'pickup', addr1, 50, null);
  assert('Chave de retirada é isolada e imediata', pickupKey === 'costela-mania|pickup');

  // 2. Teste de Retirada no Estabelecimento
  console.log('\n--- TESTE 2: Modalidade Retirada (Sem chamadas externas, frete zero) ---');
  const dummySettings: DeliverySettings = {
    tenantId: 'test_tenant',
    ordersEnabled: true,
    acceptOrdersWhenClosed: true,
    pickupEnabled: true,
    deliveryEnabled: true,
    minimumOrder: 0,
    freeDeliveryAbove: null,
    pickupInstructions: 'Retirar no balcão',
    deliveryEstimateText: '30 min',
    orderWhatsappNumber: null,
    createdAt: '',
    updatedAt: '',
  };
  const pickupQuote = calculateComprehensiveDeliveryQuote({
    fulfillmentType: 'pickup',
    subtotal: 50,
    deliverySettings: dummySettings,
    deliveryRules: [],
    address: addr1,
  });
  assert('Retirada tem isCovered: true', pickupQuote.isCovered === true);
  assert('Retirada tem taxa zero', pickupQuote.fee === 0);
  assert('Retirada não tem distância calculada', pickupQuote.distanceKm === null || pickupQuote.distanceKm === undefined);

  // 3. Teste de Entrega por Bairro (Sem chamadas externas de rotas)
  console.log('\n--- TESTE 3: Modalidade Bairro (Cálculo puro em memória / banco sem rotas externas) ---');
  const neighborhoodSettings: DeliverySettings = {
    ...dummySettings,
    pricingMode: 'neighborhood',
  };
  const rules: DeliveryRule[] = [
    {
      id: 'rule_unamar',
      tenantId: 'test_tenant',
      type: 'neighborhood',
      name: 'Unamar',
      neighborhood: 'Unamar',
      city: 'Cabo Frio',
      state: 'RJ',
      fee: 7.5,
      minimumOrder: 20,
      freeDeliveryAbove: 100,
      estimatedTime: '40-50 min',
      isActive: true,
      position: 0,
      createdAt: '',
      updatedAt: '',
    },
  ];

  // Matched neighborhood
  const neighQuote = calculateComprehensiveDeliveryQuote({
    fulfillmentType: 'delivery',
    subtotal: 50,
    deliverySettings: neighborhoodSettings,
    deliveryRules: rules,
    address: { ...addr1, neighborhood: 'Unamar' },
  });
  assert('Bairro Unamar reconhecido', neighQuote.isCovered === true);
  assert('Taxa de bairro aplicada (R$ 7,50)', neighQuote.fee === 7.5);
  assert('Modalidade registrada como neighborhood', neighQuote.pricingMode === 'neighborhood');

  // Fuzzy match with parentheses: "Unamar (Tamoios)"
  const neighFuzzyQuote = calculateComprehensiveDeliveryQuote({
    fulfillmentType: 'delivery',
    subtotal: 50,
    deliverySettings: neighborhoodSettings,
    deliveryRules: rules,
    address: { ...addr1, neighborhood: 'Unamar (Tamoios)' },
  });
  assert('Bairro "Unamar (Tamoios)" com normalização fuzzy atende', neighFuzzyQuote.isCovered === true);

  // Unregistered neighborhood
  const neighUnmatched = calculateComprehensiveDeliveryQuote({
    fulfillmentType: 'delivery',
    subtotal: 50,
    deliverySettings: neighborhoodSettings,
    deliveryRules: rules,
    address: { ...addr1, neighborhood: 'Bairro Inexistente 999' },
  });
  assert('Bairro inexistente retorna isCovered: false', neighUnmatched.isCovered === false);
  assert(
    'Código de erro indica ausência de taxa para o bairro',
    neighUnmatched.errorCode === 'NEIGHBORHOOD_NOT_FOUND' || neighUnmatched.errorCode === 'NO_RULES_CONFIGURED'
  );

  // 4. Teste de Entrega por KM no Backend Real (Costela Mania)
  console.log('\n--- TESTE 4: Modalidade KM no Backend Real (Costela Mania) ---');
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', 'costela-mania')
    .single();

  if (tenant) {
    const serverQuote = await orderRepo.evaluateDeliveryQuote(tenant.id, {
      address: addr1,
      subtotal: 60,
    });
    assert('Costela Mania calculou frete no servidor', !!serverQuote);
    assert('Costela Mania cobriu endereço na mesma rua (San Telmo 23)', serverQuote.isCovered === true);
    assert('Taxa correta de R$ 5,00 calculada', serverQuote.fee === 5);
    assert(
      'Distância viária calculada próxima de 0 para mesma rua (<= 0.2 km)',
      serverQuote.distanceKm !== null && serverQuote.distanceKm !== undefined && serverQuote.distanceKm <= 0.2
    );
  } else {
    console.warn('Tenant costela-mania não encontrado para teste de banco.');
  }

  // 5. Teste de Endereço Fora de Alcance (KM Limite)
  console.log('\n--- TESTE 5: Endereço Fora de Alcance (Out of range) ---');
  if (tenant) {
    const outOfRangeQuote = await orderRepo.evaluateDeliveryQuote(tenant.id, {
      address: {
        cep: '22070-000',
        street: 'Avenida Atlântica',
        number: '1000',
        neighborhood: 'Copacabana',
        city: 'Rio de Janeiro',
        state: 'RJ',
      },
      subtotal: 60,
    });
    assert('Endereço em Copacabana ultrapassa limite', outOfRangeQuote.isCovered === false);
    assert('Código de erro é OUT_OF_RANGE_KM', outOfRangeQuote.errorCode === 'OUT_OF_RANGE_KM');
  }

  // 6. Teste de Cálculo do Total do Carrinho com Frete
  console.log('\n--- TESTE 6: Total do Carrinho com Frete Confirmado ---');
  const dummyItems: ValidatedCartItem[] = [
    {
      id: 'i1',
      productId: 'p1',
      productName: 'Costela no Bafo',
      quantity: 2,
      unitPrice: 45,
      subtotal: 90,
      hasDiscount: false,
    },
  ];
  const cartTotals = calculateCartTotals(dummyItems, 5, 0);
  assert('Subtotal do carrinho calculado corretamente (R$ 90,00)', cartTotals.subtotal === 90);
  assert('Frete de R$ 5,00 somado', cartTotals.deliveryFee === 5);
  assert('Total final é exatamente R$ 95,00', cartTotals.total === 95);

  // 7. Simulação de 30 segundos sem reinício contínuo
  console.log('\n--- TESTE 7: Verificação de estabilidade (Simulação de 30s sem loops) ---');
  let apiCallCount = 0;
  const mockApi = {
    calculate: async () => {
      apiCallCount++;
      return { isCovered: true, fee: 5 };
    },
  };

  // Primeira chamada
  let cachedKey = '';
  let inMemoryQuote: any = null;

  async function simulateEffect(addr: any, sub: number) {
    const key = getDeliveryCalculationKey('costela-mania', 'delivery', addr, sub, null);
    if (key === cachedKey && inMemoryQuote) {
      // Ignorado! Deduplicação perfeita
      return;
    }
    inMemoryQuote = await mockApi.calculate();
    cachedKey = key;
  }

  // T = 0s: Usuário digita endereço
  await simulateEffect(addr1, 90);
  // Re-renders subsequentes durante 30 segundos (simulando 60 ticks de renderização)
  for (let tick = 1; tick <= 60; tick++) {
    await simulateEffect(addr1, 90);
  }

  assert('Apenas 1 chamada de API executada após 60 re-renderizações (Sem loop)', apiCallCount === 1, `Total de chamadas: ${apiCallCount}`);

  // T = 31s: Usuário altera o número para 99
  await simulateEffect({ ...addr1, number: '99' }, 90);
  assert('Nova chamada executada apenas quando o endereço de fato mudou', apiCallCount === 2, `Total de chamadas: ${apiCallCount}`);

  console.log(`\n=== FIM DOS TESTES: ${passed} PASSOU | ${failed} FALHOU ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runBatteryTests().catch((err) => {
  console.error('Erro na bateria de testes:', err);
  process.exit(1);
});
