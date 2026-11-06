import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getServerGoogleMapsApiKey } from '../server/services/routingService.js';
import {
  isValidGoogleMapsKeyString,
  loadGoogleMapsScript,
  resolveFrontendGoogleMapsConfig,
} from '../src/utils/googleMapsConfig.js';

async function runGoogleMapsAndDeployAudit() {
  console.log('===================================================================');
  console.log(' AUDITORIA COMPLETA — DEPLOY VERCEL (TS2688) & GOOGLE MAPS');
  console.log('===================================================================\n');

  // 1. Verify package.json, tsconfig.json, and vite/client type resolution (TS2688 fix)
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  assert.ok(
    pkg.devDependencies?.vite,
    'O pacote "vite" deve estar declarado em devDependencies no package.json.'
  );
  assert.ok(
    pkg.devDependencies?.typescript,
    'O pacote "typescript" deve estar declarado em devDependencies no package.json.'
  );

  const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json');
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

  assert.equal(
    Array.isArray(tsconfig.compilerOptions?.types) &&
      tsconfig.compilerOptions.types.includes('vite/client'),
    true,
    'tsconfig.json deve preservar "vite/client" em compilerOptions.types.'
  );
  assert.equal(
    Array.isArray(tsconfig.compilerOptions?.typeRoots) &&
      tsconfig.compilerOptions.typeRoots.includes('./node_modules/@types') &&
      tsconfig.compilerOptions.typeRoots.includes('./src/types'),
    true,
    'tsconfig.json deve declarar typeRoots incluindo "./node_modules/@types" e "./src/types" para evitar TS2688 no @vercel/node.'
  );

  const viteClientDtsPath = path.resolve(
    process.cwd(),
    'src/types/vite/client/index.d.ts'
  );
  const viteEnvDtsPath = path.resolve(process.cwd(), 'src/vite-env.d.ts');
  assert.equal(
    fs.existsSync(viteClientDtsPath),
    true,
    'O arquivo de definição src/types/vite/client/index.d.ts deve existir para resolução garantida de vite/client.'
  );
  assert.equal(
    fs.existsSync(viteEnvDtsPath),
    true,
    'O arquivo src/vite-env.d.ts deve existir.'
  );
  const viteClientDtsContent = fs.readFileSync(viteClientDtsPath, 'utf-8');
  assert.equal(
    viteClientDtsContent.includes('ImportMetaEnv') &&
      viteClientDtsContent.includes('VITE_GOOGLE_MAPS_API_KEY'),
    true,
    'As definições de ImportMetaEnv (incluindo VITE_GOOGLE_MAPS_API_KEY) devem estar preservadas.'
  );
  console.log(
    '✅ 1. Correção definitiva do erro TS2688 validada (package.json, tsconfig.json, typeRoots e src/types/vite/client/index.d.ts).'
  );

  // 2. Verify vite.config.ts does NOT inject GOOGLE_MAPS_API_KEY or private server secrets into browser bundle
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
    '✅ 2. Isolamento de bundle validado: GOOGLE_MAPS_API_KEY não é injetada no bundle cliente pelo vite.config.ts.'
  );

  // 3. Verify /api/config exposes exclusively the public key (VITE_GOOGLE_MAPS_API_KEY) and never returns GOOGLE_MAPS_API_KEY value
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
  console.log(
    '✅ 3. Endpoint /api/config auditado: expõe exclusivamente VITE_GOOGLE_MAPS_API_KEY e preserva GOOGLE_MAPS_API_KEY oculta no servidor.'
  );

  // 4. Verify backend services (Geocoding, Distance Matrix, Directions) use getServerGoogleMapsApiKey()
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
    '✅ 4. Serviços de Backend (Geocoding, Distance Matrix e Directions) validados com prioridade para GOOGLE_MAPS_API_KEY.'
  );

  // 5. Verify Map Initialization, Non-Zero Container Dimensions, Script Loader & Fallback
  const mapPath = path.resolve(
    process.cwd(),
    'src/components/delivery/InteractiveDeliveryMap.tsx'
  );
  const mapSource = fs.readFileSync(mapPath, 'utf-8');
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const cssSource = fs.readFileSync(cssPath, 'utf-8');

  assert.equal(
    cssSource.includes('.leaflet-container img.leaflet-tile') &&
      cssSource.includes('max-width: none !important'),
    true,
    'src/index.css deve proteger os blocos (.leaflet-tile) contra o reset max-width: 100% do Tailwind v4.'
  );
  assert.equal(
    mapSource.includes('loadGoogleMapsScript') &&
      mapSource.includes('resolveFrontendGoogleMapsConfig') &&
      mapSource.includes("minHeight: '520px'") &&
      mapSource.includes('map.invalidateSize'),
    true,
    'InteractiveDeliveryMap.tsx deve carregar o SDK via loadGoogleMapsScript, garantir dimensões reais (minHeight: 520px) e recalcular o layout com invalidateSize.'
  );
  assert.equal(
    mapSource.includes("tileLayer.on('tileerror'") &&
      mapSource.includes("newTileLayer.on('tileerror'") &&
      mapSource.includes('mapLoadWarning'),
    true,
    'InteractiveDeliveryMap.tsx deve capturar falhas de tiles e autenticação, alternando automaticamente para CARTO/OpenStreetMap sem deixar o mapa em branco.'
  );

  const noKeyScriptRes = await loadGoogleMapsScript('');
  assert.equal(noKeyScriptRes.status, 'no_key');
  assert.equal(isValidGoogleMapsKeyString('AIzaSyValidKeyExample999'), true);
  assert.equal(isValidGoogleMapsKeyString('YOUR_API_KEY'), false);
  const resolved = await resolveFrontendGoogleMapsConfig();
  assert.equal(typeof resolved.configured, 'boolean');

  console.log(
    '✅ 5. Inicialização do mapa, dimensões reais do container, proteção CSS dos tiles e fallback CARTO/OpenStreetMap validados.'
  );

  // 6. Verify compiled dist/ bundle contains zero private credentials
  const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');
  if (fs.existsSync(distAssetsDir)) {
    const assetFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
    for (const file of assetFiles) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf-8');
      assert.equal(
        content.includes('SUPABASE_SECRET_KEY') || content.includes('your-service-role-key'),
        false,
        `O bundle compilado (${file}) jamais deve conter chaves privadas do servidor.`
      );
    }
    console.log(
      `✅ 6. Inspeção de segurança nos arquivos compilados em dist/assets (${assetFiles.length} arquivo(s) JS): nenhuma credencial privada presente.`
    );
  }

  console.log('\n===================================================================');
  console.log(' TODAS AS ETAPAS DE AUDITORIA E TESTES APROVADAS COM SUCESSO! ');
  console.log('===================================================================');
}

runGoogleMapsAndDeployAudit().catch((err) => {
  console.error('❌ Falha na auditoria:', err);
  process.exit(1);
});
