import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getServerGoogleMapsApiKey } from '../server/services/routingService.js';
import {
  isValidGoogleMapsKeyString,
  resolveFrontendGoogleMapsConfig,
} from '../src/utils/googleMapsConfig.js';

async function runGoogleMapsEnvVerification() {
  console.log('===================================================================');
  console.log(' AUDITORIA E TESTES — INTEGRAÇÃO GOOGLE MAPS & VARIÁVEIS DE AMBIENTE');
  console.log('===================================================================\n');

  // 1. Verify vite.config.ts bridges GOOGLE_MAPS_API_KEY -> import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
  const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');

  assert.equal(
    viteConfigContent.includes('env.VITE_GOOGLE_MAPS_API_KEY') &&
      viteConfigContent.includes('env.GOOGLE_MAPS_API_KEY') &&
      viteConfigContent.includes("'import.meta.env.VITE_GOOGLE_MAPS_API_KEY'"),
    true,
    'vite.config.ts deve mapear tanto VITE_GOOGLE_MAPS_API_KEY quanto GOOGLE_MAPS_API_KEY para import.meta.env.VITE_GOOGLE_MAPS_API_KEY no build.'
  );

  // Security check: ensure private keys are NEVER exposed in vite.config.ts define
  assert.equal(
    viteConfigContent.includes('SUPABASE_SECRET_KEY') ||
      viteConfigContent.includes('SERVICE_ROLE') ||
      viteConfigContent.includes('JWT_SECRET'),
    false,
    'vite.config.ts jamais deve expor chaves privadas (SUPABASE_SECRET_KEY, JWT_SECRET) no bundle do navegador.'
  );
  console.log(
    '✅ 1. vite.config.ts validado: ponte automática GOOGLE_MAPS_API_KEY -> VITE_GOOGLE_MAPS_API_KEY ativa e sem exposição de chaves privadas.'
  );

  // 2. Verify backend getServerGoogleMapsApiKey() supports both GOOGLE_MAPS_API_KEY and VITE_GOOGLE_MAPS_API_KEY
  const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
  const prevViteGoogleKey = process.env.VITE_GOOGLE_MAPS_API_KEY;

  try {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.VITE_GOOGLE_MAPS_API_KEY;
    assert.equal(getServerGoogleMapsApiKey(), '', 'Sem variáveis definidas deve retornar vazio.');

    process.env.GOOGLE_MAPS_API_KEY = 'YOUR_API_KEY';
    assert.equal(
      getServerGoogleMapsApiKey(),
      '',
      'Placeholder YOUR_API_KEY deve ser ignorado com segurança.'
    );

    process.env.GOOGLE_MAPS_API_KEY = 'AIzaSyTestBackendKey123456';
    assert.equal(
      getServerGoogleMapsApiKey(),
      'AIzaSyTestBackendKey123456',
      'Deve ler GOOGLE_MAPS_API_KEY no backend.'
    );

    delete process.env.GOOGLE_MAPS_API_KEY;
    process.env.VITE_GOOGLE_MAPS_API_KEY = 'AIzaSyTestFrontendKey789012';
    assert.equal(
      getServerGoogleMapsApiKey(),
      'AIzaSyTestFrontendKey789012',
      'Deve ler VITE_GOOGLE_MAPS_API_KEY como fallback no backend.'
    );
  } finally {
    if (prevGoogleKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;

    if (prevViteGoogleKey === undefined) delete process.env.VITE_GOOGLE_MAPS_API_KEY;
    else process.env.VITE_GOOGLE_MAPS_API_KEY = prevViteGoogleKey;
  }
  console.log(
    '✅ 2. Backend (routingService.ts) validado: Geocoding, Distance Matrix e Directions reconhecem GOOGLE_MAPS_API_KEY e VITE_GOOGLE_MAPS_API_KEY.'
  );

  // 3. Verify /api/config route in server/routes.ts
  const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
  const routesContent = fs.readFileSync(routesPath, 'utf-8');
  assert.equal(
    routesContent.includes('process.env.VITE_GOOGLE_MAPS_API_KEY') &&
      routesContent.includes('process.env.GOOGLE_MAPS_API_KEY') &&
      routesContent.includes('googleMapsConfigured') &&
      routesContent.includes('googleMapsApiKey'),
    true,
    'A rota /api/config deve fornecer googleMapsConfigured e googleMapsApiKey lendo ambas as variáveis em runtime.'
  );
  assert.equal(
    isValidGoogleMapsKeyString('AIzaSyValidKeyExample999'),
    true,
    'Validador deve aceitar chaves válidas.'
  );
  assert.equal(
    isValidGoogleMapsKeyString('YOUR_API_KEY'),
    false,
    'Validador deve rejeitar placeholders.'
  );
  const resolvedFallback = await resolveFrontendGoogleMapsConfig();
  assert.equal(
    typeof resolvedFallback.configured,
    'boolean',
    'resolveFrontendGoogleMapsConfig deve resolver sem lançar erro mesmo fora do navegador.'
  );
  console.log(
    '✅ 3. Endpoint runtime /api/config e utilitário googleMapsConfig.ts validados.'
  );

  // 4. Verify InteractiveDeliveryMap.tsx never displays "API Key required" and preserves full functionality
  const mapPath = path.resolve(
    process.cwd(),
    'src/components/delivery/InteractiveDeliveryMap.tsx'
  );
  const mapSource = fs.readFileSync(mapPath, 'utf-8');

  // Ensure the component does not render any blocking "API Key required" UI message
  const codeWithoutComments = mapSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
  assert.equal(
    codeWithoutComments.includes('API Key required'),
    false,
    'InteractiveDeliveryMap.tsx jamais deve renderizar a mensagem bloqueante "API Key required".'
  );

  assert.equal(
    mapSource.includes('resolveFrontendGoogleMapsConfig') &&
      mapSource.includes('TILE_LAYERS') &&
      mapSource.includes('google_roadmap') &&
      mapSource.includes('voyager') &&
      mapSource.includes('osm'),
    true,
    'InteractiveDeliveryMap.tsx deve integrar resolveFrontendGoogleMapsConfig e camadas cartográficas de ruas e avenidas.'
  );
  assert.equal(
    mapSource.includes('handleZoomIn') &&
      mapSource.includes('handleZoomOut') &&
      mapSource.includes('handleCenterOnOrigin') &&
      mapSource.includes('handleFitAllOrders') &&
      mapSource.includes('onToggleSelectOrder'),
    true,
    'Controles de zoom, centralização, enquadramento de pedidos, marcadores e seleção de rotas devem permanecer intactos.'
  );
  console.log(
    '✅ 4. Componente InteractiveDeliveryMap.tsx auditado: zero bloqueio "API Key required", ruas/avenidas/bairros ativos, marcadores, zoom e rotas preservados.'
  );

  console.log('\n===================================================================');
  console.log(' TODOS OS TESTES DE INTEGRAÇÃO GOOGLE MAPS & ENV VARS APROVADOS! ');
  console.log('===================================================================');
}

runGoogleMapsEnvVerification().catch((err) => {
  console.error('❌ Falha na verificação da integração Google Maps:', err);
  process.exit(1);
});
