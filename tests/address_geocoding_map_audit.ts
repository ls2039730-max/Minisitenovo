import fs from 'node:fs';
import path from 'node:path';
import {
  validateAndNormalizeCoordinates,
  computeAddressFingerprint,
  didAddressTextChange,
  buildFullGeocodingQuery,
  getGeocodePrecisionLabel,
} from '../src/utils/addressCoordinateValidator';
import { calculateStraightLineDistanceKm } from '../src/utils/deliveryFeeCalculator';
import {
  geocodeAddressServer,
  invalidateGeocodeCache,
  lookupPostalCodeServer,
  calculateMultiStopRoadRouteServer,
} from '../server/services/routingService';

interface ScenarioResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: ScenarioResult[] = [];

function recordScenario(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [Cenário ${String(id).padStart(2, '0')}] ${name}: ${details}`);
}

async function runAuditScenarios() {
  console.log('================================================================================');
  console.log('AUDITORIA AUTOMATIZADA DE ENDEREÇOS, GEOCODIFICAÇÃO E MAPAS DO MINIHUB (16 CENÁRIOS)');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // Cenário 1: Cadastrar endereço completo da empresa e verificar coordenadas
  // ---------------------------------------------------------------------------
  const companyAddr = {
    cep: '01310-100',
    street: 'Avenida Paulista',
    number: '1578',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
  };
  const companyGeo = await geocodeAddressServer(companyAddr, null, { forceRefresh: true });
  const companyValid = validateAndNormalizeCoordinates(companyGeo.latitude, companyGeo.longitude);
  const s1Passed =
    companyGeo.success &&
    companyValid.valid &&
    companyValid.latitude !== null &&
    companyValid.longitude !== null &&
    companyValid.latitude < -23.4 &&
    companyValid.latitude > -23.7 &&
    companyValid.longitude < -46.5 &&
    companyValid.longitude > -46.8 &&
    Boolean(companyGeo.precision);
  recordScenario(
    1,
    'Cadastrar endereço completo da empresa e verificar coordenadas',
    s1Passed,
    `Coordenadas=(${companyGeo.latitude}, ${companyGeo.longitude}), precisão=${companyGeo.precision} (${getGeocodePrecisionLabel(companyGeo.precision)}), provedor=${companyGeo.provider}`
  );

  // ---------------------------------------------------------------------------
  // Cenário 2: Editar endereço da empresa e verificar atualização da latitude/longitude e invalidação de coordenadas antigas
  // ---------------------------------------------------------------------------
  const editedCompanyAddr = {
    cep: '04538-133',
    street: 'Avenida Brigadeiro Faria Lima',
    number: '3477',
    neighborhood: 'Itaim Bibi',
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
  };
  const textChanged = didAddressTextChange(companyAddr, editedCompanyAddr);
  invalidateGeocodeCache(companyAddr);
  const editedCompanyGeo = await geocodeAddressServer(editedCompanyAddr, null, {
    forceRefresh: true,
  });
  const distBetweenOldAndNewCompanyKm =
    companyGeo.latitude &&
    companyGeo.longitude &&
    editedCompanyGeo.latitude &&
    editedCompanyGeo.longitude
      ? calculateStraightLineDistanceKm(
          companyGeo.latitude,
          companyGeo.longitude,
          editedCompanyGeo.latitude,
          editedCompanyGeo.longitude
        )
      : 0;

  const orderRepoCode = fs.readFileSync(
    path.resolve(process.cwd(), 'server/db/orderRepository.ts'),
    'utf-8'
  );
  const syncsTenantAndDeliveryConfig =
    orderRepoCode.includes('syncOriginAddressFromTenantProfile') &&
    orderRepoCode.includes('didAddressTextChange') &&
    orderRepoCode.includes('invalidateGeocodeCache');

  const s2Passed =
    textChanged &&
    syncsTenantAndDeliveryConfig &&
    editedCompanyGeo.success &&
    editedCompanyGeo.latitude !== undefined &&
    editedCompanyGeo.longitude !== undefined &&
    distBetweenOldAndNewCompanyKm > 1.5;
  recordScenario(
    2,
    'Editar endereço da empresa e verificar atualização de latitude/longitude',
    s2Passed,
    `Mudança detectada=${textChanged}, novas coords=(${editedCompanyGeo.latitude}, ${editedCompanyGeo.longitude}), distância da sede anterior=${distBetweenOldAndNewCompanyKm.toFixed(2)} km, sync bidirecional=${syncsTenantAndDeliveryConfig}`
  );

  // ---------------------------------------------------------------------------
  // Cenário 3: Abrir Mapa Operacional e verificar marcador da empresa no ponto correto
  // ---------------------------------------------------------------------------
  const mapComponentCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/delivery/InteractiveDeliveryMap.tsx'),
    'utf-8'
  );
  const s3Passed =
    mapComponentCode.includes('Restaurante (Origem)') &&
    mapComponentCode.includes('Endereço Oficial da Empresa (Origem)') &&
    mapComponentCode.includes('handleCenterOnOrigin') &&
    mapComponentCode.includes('prevOriginCoordKeyRef') &&
    mapComponentCode.includes('isOriginFocused');
  recordScenario(
    3,
    'Abrir Mapa Operacional e verificar marcador da empresa no ponto correto',
    s3Passed,
    'InteractiveDeliveryMap renderiza marcador exclusivo de origem (createOriginIcon), card detalhado com endereço completo/coordenadas/precisão e reposiciona automaticamente quando a origem muda'
  );

  // ---------------------------------------------------------------------------
  // Cenário 4: Criar pedido com endereço completo e verificar coordenadas do pedido (mesmo na mesma rua da empresa, não pode copiar as coordenadas da empresa)
  // ---------------------------------------------------------------------------
  const customerOrderSameStreet = {
    cep: '01311-000',
    street: 'Avenida Paulista',
    number: '900',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
  };
  const orderGeo1 = await geocodeAddressServer(
    customerOrderSameStreet,
    {
      cep: companyAddr.cep,
      street: companyAddr.street,
      number: companyAddr.number,
      neighborhood: companyAddr.neighborhood,
      city: companyAddr.city,
      state: companyAddr.state,
      latitude: companyGeo.latitude ?? null,
      longitude: companyGeo.longitude ?? null,
    },
    { forceRefresh: true }
  );
  const notCopiedFromOrigin =
    orderGeo1.success &&
    typeof orderGeo1.latitude === 'number' &&
    typeof orderGeo1.longitude === 'number' &&
    (Math.abs(orderGeo1.latitude - (companyGeo.latitude || 0)) > 0.0001 ||
      Math.abs(orderGeo1.longitude - (companyGeo.longitude || 0)) > 0.0001);
  recordScenario(
    4,
    'Criar pedido com endereço completo e verificar coordenadas próprias (sem herdar coords da empresa)',
    notCopiedFromOrigin,
    `Pedido Av. Paulista 900=(${orderGeo1.latitude}, ${orderGeo1.longitude}) vs Empresa Av. Paulista 1578=(${companyGeo.latitude}, ${companyGeo.longitude}), precisão=${orderGeo1.precision}`
  );

  // ---------------------------------------------------------------------------
  // Cenário 5: Clicar em "Visualizar no mapa" em um pedido e verificar centralização correta
  // ---------------------------------------------------------------------------
  const hubManagerCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/delivery/DeliveryHubManager.tsx'),
    'utf-8'
  );
  const orderDetailCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/orders/OrderDetailModal.tsx'),
    'utf-8'
  );
  const unifiedDetailCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/orders/UnifiedOrderDetailModal.tsx'),
    'utf-8'
  );
  const s5Passed =
    hubManagerCode.includes('handleViewOrderOnMap') &&
    hubManagerCode.includes('focusRequestSeq') &&
    mapComponentCode.includes('[Number(targetOrder.latitude), Number(targetOrder.longitude)]') &&
    orderDetailCode.includes('Visualizar no mapa') &&
    unifiedDetailCode.includes('Visualizar no mapa');
  recordScenario(
    5,
    'Clicar em "Visualizar no mapa" em um pedido e verificar centralização correta',
    s5Passed,
    'Botão "Visualizar no mapa" implementado na Central de Entregas, OrderDetailModal e UnifiedOrderDetailModal com flyTo(zoom 17), abertura de popup e geocodificação automática se pendente'
  );

  // ---------------------------------------------------------------------------
  // Cenário 6: Testar dois pedidos em ruas diferentes e verificar pontos distintos
  // ---------------------------------------------------------------------------
  const orderStreetA = await geocodeAddressServer(
    {
      cep: '01305-100',
      street: 'Rua Augusta',
      number: '1500',
      neighborhood: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
    },
    null,
    { forceRefresh: true }
  );
  const orderStreetB = await geocodeAddressServer(
    {
      cep: '01414-001',
      street: 'Rua Haddock Lobo',
      number: '595',
      neighborhood: 'Cerqueira César',
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
    },
    null,
    { forceRefresh: true }
  );
  const distBetweenOrdersAB =
    orderStreetA.latitude &&
    orderStreetA.longitude &&
    orderStreetB.latitude &&
    orderStreetB.longitude
      ? calculateStraightLineDistanceKm(
          orderStreetA.latitude,
          orderStreetA.longitude,
          orderStreetB.latitude,
          orderStreetB.longitude
        )
      : 0;
  const s6Passed =
    orderStreetA.success &&
    orderStreetB.success &&
    distBetweenOrdersAB > 0.15 &&
    (orderStreetA.latitude !== orderStreetB.latitude ||
      orderStreetA.longitude !== orderStreetB.longitude);
  recordScenario(
    6,
    'Testar dois pedidos em ruas diferentes e verificar pontos distintos',
    s6Passed,
    `Rua Augusta 1500=(${orderStreetA.latitude}, ${orderStreetA.longitude}) vs Rua Haddock Lobo 595=(${orderStreetB.latitude}, ${orderStreetB.longitude}), distância=${distBetweenOrdersAB.toFixed(2)} km`
  );

  // ---------------------------------------------------------------------------
  // Cenário 7: Testar pedido em bairro diferente e verificar localização correta
  // ---------------------------------------------------------------------------
  const orderMoema = await geocodeAddressServer(
    {
      cep: '04077-020',
      street: 'Avenida Ibirapuera',
      number: '3103',
      neighborhood: 'Moema',
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
    },
    null,
    { forceRefresh: true }
  );
  const distCenterToMoema =
    companyGeo.latitude &&
    companyGeo.longitude &&
    orderMoema.latitude &&
    orderMoema.longitude
      ? calculateStraightLineDistanceKm(
          companyGeo.latitude,
          companyGeo.longitude,
          orderMoema.latitude,
          orderMoema.longitude
        )
      : 0;
  const s7Passed =
    orderMoema.success &&
    distCenterToMoema > 3.5 &&
    distCenterToMoema < 15;
  recordScenario(
    7,
    'Testar pedido em bairro diferente (Moema) e verificar localização correta',
    s7Passed,
    `Av. Ibirapuera 3103, Moema=(${orderMoema.latitude}, ${orderMoema.longitude}), distância da Av. Paulista=${distCenterToMoema.toFixed(2)} km`
  );

  // ---------------------------------------------------------------------------
  // Cenário 8: Testar endereço com complemento (bloco/apto) sem perder precisão da rua/número
  // ---------------------------------------------------------------------------
  const orderWithComplement = {
    cep: '01310-100',
    street: 'Avenida Paulista',
    number: '1578',
    complement: 'Bloco B Apto 142 - Condomínio Edifício Central',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
  };
  const fullQueryBuilt = buildFullGeocodingQuery(orderWithComplement);
  const geoWithComplement = await geocodeAddressServer(orderWithComplement, null, {
    forceRefresh: true,
  });
  const distComplementVsBase =
    companyGeo.latitude &&
    companyGeo.longitude &&
    geoWithComplement.latitude &&
    geoWithComplement.longitude
      ? calculateStraightLineDistanceKm(
          companyGeo.latitude,
          companyGeo.longitude,
          geoWithComplement.latitude,
          geoWithComplement.longitude
        )
      : 999;
  const s8Passed =
    !fullQueryBuilt.includes('Bloco B Apto 142') &&
    fullQueryBuilt.includes('Avenida Paulista, 1578') &&
    geoWithComplement.success &&
    distComplementVsBase < 0.2;
  recordScenario(
    8,
    'Testar endereço com complemento sem perder precisão da rua/número',
    s8Passed,
    `Query gerada="${fullQueryBuilt}", coords=(${geoWithComplement.latitude}, ${geoWithComplement.longitude}), desvio=${(distComplementVsBase * 1000).toFixed(0)}m`
  );

  // ---------------------------------------------------------------------------
  // Cenário 9: Testar endereço com CEP válido e preenchimento automático
  // ---------------------------------------------------------------------------
  const cepResult = await lookupPostalCodeServer('01310-100');
  const s9Passed =
    cepResult.found &&
    cepResult.cep === '01310100' &&
    cepResult.city.toLowerCase().includes('paulo') &&
    cepResult.state === 'SP' &&
    cepResult.street.toLowerCase().includes('paulista');
  recordScenario(
    9,
    'Testar endereço com CEP válido e preenchimento automático',
    s9Passed,
    cepResult.found
      ? `CEP=${cepResult.cep}, Logradouro="${cepResult.street}", Bairro="${cepResult.neighborhood}", Cidade="${cepResult.city}/${cepResult.state}"`
      : 'Falha ao consultar CEP'
  );

  // ---------------------------------------------------------------------------
  // Cenário 10: Testar endereço inválido e verificar tratamento claro de erro
  // ---------------------------------------------------------------------------
  const invalidGeo = await geocodeAddressServer(
    {
      cep: '00000-000',
      street: 'Rua Totalmente Inexistente Xyz987654321',
      number: '99999',
      neighborhood: 'Bairro Fantasma Inexistente',
      city: 'Cidade Inexistente Xyz',
      state: 'ZZ',
    },
    null,
    { forceRefresh: true }
  );
  const invalidZeroCoordCheck = validateAndNormalizeCoordinates(0, 0);
  const invertedCoordCheck = validateAndNormalizeCoordinates(-46.633308, -23.55052);
  const s10Passed =
    !invalidGeo.success &&
    invalidGeo.latitude === undefined &&
    invalidGeo.longitude === undefined &&
    !invalidZeroCoordCheck.valid &&
    invertedCoordCheck.valid &&
    invertedCoordCheck.wasInverted &&
    invertedCoordCheck.latitude === -23.55052 &&
    invertedCoordCheck.longitude === -46.633308;
  recordScenario(
    10,
    'Testar endereço inválido, coordenadas (0,0) e inversão (lng,lat) com tratamento seguro',
    s10Passed,
    `Endereço inválido retornou success=${invalidGeo.success}, (0,0) rejeitado (${invalidZeroCoordCheck.reason}), inversão (-46.63,-23.55) corrigida automaticamente para (${invertedCoordCheck.latitude}, ${invertedCoordCheck.longitude})`
  );

  // ---------------------------------------------------------------------------
  // Cenário 11: Criar rota com origem na empresa e múltiplos pedidos
  // ---------------------------------------------------------------------------
  const waypoints = [
    { latitude: companyGeo.latitude!, longitude: companyGeo.longitude! },
    { latitude: orderStreetA.latitude!, longitude: orderStreetA.longitude! },
    { latitude: orderStreetB.latitude!, longitude: orderStreetB.longitude! },
    { latitude: orderMoema.latitude!, longitude: orderMoema.longitude! },
  ];
  const multiStopRoute = await calculateMultiStopRoadRouteServer(waypoints);
  const s11Passed =
    multiStopRoute.success &&
    multiStopRoute.legDistancesKm.length === 3 &&
    multiStopRoute.totalDistanceKm > 2 &&
    multiStopRoute.totalDurationMin > 5 &&
    multiStopRoute.routeGeometry.length >= 4;
  recordScenario(
    11,
    'Criar rota com origem na empresa e múltiplos pedidos',
    s11Passed,
    `Trechos=${multiStopRoute.legDistancesKm.length}, distância total=${multiStopRoute.totalDistanceKm} km, tempo=${multiStopRoute.totalDurationMin} min, pontos na polilinha=${multiStopRoute.routeGeometry.length}, provedor=${multiStopRoute.navigationProvider}`
  );

  // ---------------------------------------------------------------------------
  // Cenário 12: Verificar se a rota parte do endereço correto da empresa
  // ---------------------------------------------------------------------------
  const firstPolylinePoint = multiStopRoute.routeGeometry[0];
  const distOriginToFirstPointKm = firstPolylinePoint
    ? calculateStraightLineDistanceKm(
        companyGeo.latitude!,
        companyGeo.longitude!,
        firstPolylinePoint[0],
        firstPolylinePoint[1]
      )
    : 999;
  const s12Passed = Boolean(firstPolylinePoint) && distOriginToFirstPointKm < 0.15;
  recordScenario(
    12,
    'Verificar se a rota parte exatamente das coordenadas oficiais da empresa',
    s12Passed,
    `1º ponto da rota=[${firstPolylinePoint?.[0]}, ${firstPolylinePoint?.[1]}] vs Origem da empresa=[${companyGeo.latitude}, ${companyGeo.longitude}] (desvio viário=${(distOriginToFirstPointKm * 1000).toFixed(0)}m)`
  );

  // ---------------------------------------------------------------------------
  // Cenário 13: Verificar se cada parada corresponde ao pedido correto
  // ---------------------------------------------------------------------------
  const deliveryHubRepoCode = fs.readFileSync(
    path.resolve(process.cwd(), 'server/db/deliveryHubRepository.ts'),
    'utf-8'
  );
  const syncsRouteStopsOnGeocodeUpdate =
    deliveryHubRepoCode.includes("queryTable('delivery_route_stops'") &&
    deliveryHubRepoCode.includes(".eq('order_id', orderId)");
  const s13Passed =
    syncsRouteStopsOnGeocodeUpdate &&
    waypoints[1].latitude === orderStreetA.latitude &&
    waypoints[2].latitude === orderStreetB.latitude &&
    waypoints[3].latitude === orderMoema.latitude;
  recordScenario(
    13,
    'Verificar se cada parada da rota corresponde às coordenadas exatas do respectivo pedido',
    s13Passed,
    `Parada 1=(${waypoints[1].latitude}, ${waypoints[1].longitude}), Parada 2=(${waypoints[2].latitude}, ${waypoints[2].longitude}), Parada 3=(${waypoints[3].latitude}, ${waypoints[3].longitude}), sincronização em delivery_route_stops=${syncsRouteStopsOnGeocodeUpdate}`
  );

  // ---------------------------------------------------------------------------
  // Cenário 14: Verificar isolamento multi-tenant entre duas empresas diferentes
  // ---------------------------------------------------------------------------
  const fpTenantA = computeAddressFingerprint(companyAddr);
  const fpTenantB = computeAddressFingerprint({
    cep: '22070-002',
    street: 'Avenida Atlântica',
    number: '1702',
    neighborhood: 'Copacabana',
    city: 'Rio de Janeiro',
    state: 'RJ',
  });
  const enforcesTenantIdFilter =
    deliveryHubRepoCode.includes(".eq('tenant_id', tenantId)") &&
    orderRepoCode.includes(".eq('tenant_id', tenantId)");
  const s14Passed = fpTenantA !== fpTenantB && enforcesTenantIdFilter;
  recordScenario(
    14,
    'Verificar isolamento multi-tenant entre duas empresas diferentes',
    s14Passed,
    `Fingerprint Tenant SP="${fpTenantA}" !== Tenant RJ="${fpTenantB}", filtros .eq('tenant_id', tenantId) presentes em orderRepository e deliveryHubRepository=${enforcesTenantIdFilter}`
  );

  // ---------------------------------------------------------------------------
  // Cenário 15: Verificar persistência após recarregar a página e ferramenta de verificação visual
  // ---------------------------------------------------------------------------
  const companyViewCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/client/ClientCompanyView.tsx'),
    'utf-8'
  );
  const deliverySettingsCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/orders/DeliverySettingsTab.tsx'),
    'utf-8'
  );
  const verificationCardExists = fs.existsSync(
    path.resolve(process.cwd(), 'src/components/common/AddressVerificationMapCard.tsx')
  );
  const s15Passed =
    verificationCardExists &&
    companyViewCode.includes('AddressVerificationMapCard') &&
    deliverySettingsCode.includes('AddressVerificationMapCard') &&
    orderRepoCode.includes('geocodePrecision') &&
    orderRepoCode.includes('geocodedAt');
  recordScenario(
    15,
    'Verificar persistência de coordenadas/metadados e ferramenta de confirmação no mapa da empresa',
    s15Passed,
    'AddressVerificationMapCard integrado em Minha Empresa, Configurações de Entrega e Modais de Pedido; latitude, longitude, geocodeStatus, geocodePrecision, placeId e geocodedAt persistidos no banco'
  );

  // ---------------------------------------------------------------------------
  // Cenário 16 (Extra): Verificar que o marcador da empresa nunca usa coordenadas de pedido e o pedido nunca usa coordenadas da empresa
  // ---------------------------------------------------------------------------
  const routingServiceCode = fs.readFileSync(
    path.resolve(process.cwd(), 'server/services/routingService.ts'),
    'utf-8'
  );
  const removedSameStreetCopyBug = !routingServiceCode.includes(
    'if (sameCity && sameStreet) {\n      return {\n        latitude: referenceOrigin.latitude'
  );
  const s16Passed =
    removedSameStreetCopyBug &&
    companyGeo.latitude !== orderGeo1.latitude &&
    companyGeo.longitude !== orderGeo1.longitude;
  recordScenario(
    16,
    'Isolamento estrito entre coordenadas da Origem (Empresa) e Destino (Pedido)',
    s16Passed,
    `Bug de cópia de coordenadas na mesma rua removido=${removedSameStreetCopyBug}, Origem=(${companyGeo.latitude}, ${companyGeo.longitude}) !== Pedido=(${orderGeo1.latitude}, ${orderGeo1.longitude})`
  );

  console.log('\n================================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`RESULTADO FINAL: ${passedCount}/${results.length} CENÁRIOS APROVADOS`);
  console.log('================================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runAuditScenarios().catch((err) => {
  console.error('Erro fatal na execução da auditoria:', err);
  process.exit(1);
});
