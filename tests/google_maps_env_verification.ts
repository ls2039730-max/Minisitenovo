import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getServerGoogleMapsApiKey } from '../server/services/routingService.js';
import {
  isValidGoogleMapsKeyString,
  resolveFrontendGoogleMapsConfig,
} from '../src/utils/googleMapsConfig.js';

async function runGoogleMapsSecurityAudit() {
  console.log('===================================================================');
  console.log(' AUDITORIA DE SEGURANÇA E PRODUÇÃO — INTEGRAÇÃO GOOGLE MAPS');
  console.log('===================================================================\n');

  // 1. Verify vite.config.ts does NOT inject GOOGLE_MAPS_API_KEY or private server secrets into browser bundle
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
  const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');

  assert.equal(
    viteConfigContent.includes('GOOGLE_MAPS_API_KEY'),
    false,
    'vite.config.ts NÃO deve injetar a variável privada de backend GOOGLE_MAPS_API_KEY no bundle do navegador.'
  );
  assert.equal(
    viteConfigContent.includes('SUPABASE_SECRET_KEY') ||
      viteConfigContent.includes('SERVICE_ROLE') ||
      viteConfigContent.includes('JWT_SECRET'),
    false,
    'vite.config.ts jamais deve expor chaves privadas no bundle do navegador.'
  );
  console.log(
    '✅ 1. Isolamento de bundle validado: GOOGLE_MAPS_API_KEY não é injetada no bundle cliente pelo vite.config.ts.'
  );

  // 2. Verify /api/config exposes exclusively the public key (VITE_GOOGLE_MAPS_API_KEY) and never returns GOOGLE_MAPS_API_KEY value
  const routesPath = path.resolve(process.cwd(), 'server/routes.ts');
  const routesContent = fs.readFileSync(routesPath, 'utf-8');

  const configRouteMatch = routesContent.match(
    /apiRouter\.get\('\/config'[\s\S]*?return res\.json\(\{[\s\S]*?\}\);\s*\}\);/
  );
  assert.ok(configRouteMatch, 'Endpoint /api/config deve existir em server/routes.ts');
  const configBlock = configRouteMatch[0];

  assert.equal(
    configBlock.includes('googleMapsApiKey: isPublicKeyValid ? rawPublicMapsKey : null'),
    true,
    '/api/config deve retornar em googleMapsApiKey exclusivamente a chave pública (VITE_GOOGLE_MAPS_API_KEY).'
  );
  assert.equal(
    configBlock.includes('googleMapsBackendConfigured: isBackendKeyValid'),
    true,
    '/api/config deve expor apenas um booleano (googleMapsBackendConfigured) para a chave de servidor, sem vazar seu valor.'
  );
  assert.equal(
    configBlock.includes('SUPABASE_SECRET_KEY') || configBlock.includes('JWT_SECRET'),
    false,
    '/api/config jamais deve expor credenciais privadas do servidor.'
  );
  console.log(
    '✅ 2. Endpoint /api/config auditado: expõe exclusivamente VITE_GOOGLE_MAPS_API_KEY e preserva GOOGLE_MAPS_API_KEY oculta no servidor.'
  );

  // 3. Verify backend services (Geocoding, Distance Matrix, Directions) use getServerGoogleMapsApiKey()
  const routingServicePath = path.resolve(process.cwd(), 'server/services/routingService.ts');
  const routingServiceContent = fs.readFileSync(routingServicePath, 'utf-8');

  const keyCalls = routingServiceContent.match(/getServerGoogleMapsApiKey\(\)/g) || [];
  assert.ok(
    keyCalls.length >= 4,
    'getServerGoogleMapsApiKey() deve ser definida e utilizada nos 3 serviços de backend (Geocoding, Distance Matrix e Directions).'
  );

  const prevGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
  const prevViteGoogleKey = process.env.VITE_GOOGLE_MAPS_API_KEY;

  try {
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.VITE_GOOGLE_MAPS_API_KEY;
    assert.equal(getServerGoogleMapsApiKey(), '');

    process.env.GOOGLE_MAPS_API_KEY = 'YOUR_API_KEY';
    assert.equal(getServerGoogleMapsApiKey(), '');

    process.env.GOOGLE_MAPS_API_KEY = 'AIzaSyBackendPrivateKey123';
    process.env.VITE_GOOGLE_MAPS_API_KEY = 'AIzaSyFrontendPublicKey456';
    assert.equal(
      getServerGoogleMapsApiKey(),
      'AIzaSyBackendPrivateKey123',
      'O backend deve priorizar GOOGLE_MAPS_API_KEY para Geocoding, Distance Matrix e Directions.'
    );
  } finally {
    if (prevGoogleKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = prevGoogleKey;

    if (prevViteGoogleKey === undefined) delete process.env.VITE_GOOGLE_MAPS_API_KEY;
    else process.env.VITE_GOOGLE_MAPS_API_KEY = prevViteGoogleKey;
  }
  console.log(
    '✅ 3. Serviços de Backend (Geocoding, Distance Matrix e Directions) validados com prioridade para GOOGLE_MAPS_API_KEY.'
  );

  // 4. Verify fallback to OpenStreetMap/CARTO and clear error handling in InteractiveDeliveryMap.tsx
  const mapPath = path.resolve(
    process.cwd(),
    'src/components/delivery/InteractiveDeliveryMap.tsx'
  );
  const mapSource = fs.readFileSync(mapPath, 'utf-8');

  const codeWithoutComments = mapSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
  assert.equal(
    codeWithoutComments.includes('API Key required'),
    false,
    'InteractiveDeliveryMap.tsx jamais deve exibir a tela bloqueante "API Key required".'
  );
  assert.equal(
    mapSource.includes("tileLayer.on('tileerror'") &&
      mapSource.includes("newTileLayer.on('tileerror'") &&
      mapSource.includes('gm_authFailure') &&
      mapSource.includes('mapLoadWarning'),
    true,
    'InteractiveDeliveryMap.tsx deve capturar falhas de tiles e de autenticação (gm_authFailure), acionar fallback automático para OpenStreetMap/CARTO e exibir aviso claro sem deixar o mapa em branco.'
  );

  assert.equal(isValidGoogleMapsKeyString('AIzaSyValidKeyExample999'), true);
  assert.equal(isValidGoogleMapsKeyString('YOUR_API_KEY'), false);
  const resolved = await resolveFrontendGoogleMapsConfig();
  assert.equal(typeof resolved.configured, 'boolean');

  console.log(
    '✅ 4. Fallback automático OpenStreetMap/CARTO e exibição clara de erros (mapLoadWarning / gm_authFailure) validados.'
  );

  console.log('\n===================================================================');
  console.log(' AUDITORIA DE SEGURANÇA E PRODUÇÃO CONCLUÍDA COM SUCESSO! ');
  console.log('===================================================================');
}

runGoogleMapsSecurityAudit().catch((err) => {
  console.error('❌ Falha na auditoria de segurança do Google Maps:', err);
  process.exit(1);
});
