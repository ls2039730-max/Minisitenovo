import http from 'http';
import { generateSessionToken } from '../server/auth/tokenService.js';
import { repo } from '../server/db/repository.js';
import { supabaseAdmin, isRealSupabaseConfigured } from '../server/supabaseAdmin.js';
import { bootstrapDatabaseIfNeeded } from '../server/db/bootstrap.js';

function httpRequest(urlPath: string, options: any = {}, bodyData: any = null): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL('http://localhost:3000' + urlPath);
    const req = http.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyData) req.write(JSON.stringify(bodyData));
    req.end();
  });
}

export async function runHttpRouteTest() {
  console.log('================================================================');
  console.log('TESTE END-TO-END HTTP — PUT /api/tenants/:id');
  console.log(`Backend Implementation: ${isRealSupabaseConfigured ? 'REMOTE SUPABASE (OFICIAL)' : 'LOCAL ADAPTER'}`);
  console.log('================================================================\n');

  await bootstrapDatabaseIfNeeded();

  const testTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const superAdminUser = await repo.findUserByEmail('admin@localhub.com');
  if (!superAdminUser) {
    throw new Error('Usuário administrador não encontrado no banco.');
  }

  const token = generateSessionToken(superAdminUser);

  // 1. Obter estado inicial
  const getRes = await httpRequest(`/api/tenants/${testTenantId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (getRes.status !== 200 || !getRes.body.success) {
    throw new Error(`Falha ao consultar tenant via HTTP: ${JSON.stringify(getRes.body)}`);
  }

  const initialAppearance = getRes.body.data.appearance || {};
  const originalPrimary = initialAppearance.primaryColor || '#1e293b';
  const testColor = '#059669'; // Emerald-600

  console.log(`[HTTP 1] Consulta inicial OK: primaryColor = ${originalPrimary}`);

  // 2. Gravar alteração via PUT /api/tenants/:id
  console.log(`[HTTP 2] Enviando PUT /api/tenants/${testTenantId} com cor ${testColor}...`);
  const putRes = await httpRequest(
    `/api/tenants/${testTenantId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    },
    {
      appearance: {
        ...initialAppearance,
        primaryColor: testColor,
      },
    }
  );

  console.log(`[HTTP 2] Status retornado: ${putRes.status}`);
  if (putRes.status !== 200 || !putRes.body.success) {
    throw new Error(`Falha no PUT via HTTP: ${JSON.stringify(putRes.body)}`);
  }
  if (putRes.body.data.appearance?.primaryColor !== testColor) {
    throw new Error(`Cor retornada pelo PUT não confere: ${putRes.body.data.appearance?.primaryColor}`);
  }
  console.log('  -> SUCESSO: PUT respondeu 200 com cor persistida.');

  // 3. Consulta subsequente via GET /api/tenants/:id
  console.log('[HTTP 3] Verificando persistência via GET subsequente...');
  const verifyRes = await httpRequest(`/api/tenants/${testTenantId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (verifyRes.body.data.appearance?.primaryColor !== testColor) {
    throw new Error(`Cor no GET subsequente não confere: ${verifyRes.body.data.appearance?.primaryColor}`);
  }
  console.log(`  -> SUCESSO: GET confirmou cor persistida ${verifyRes.body.data.appearance?.primaryColor}`);

  // 4. Restaurar estado original
  console.log('[HTTP 4] Restaurando cor original...');
  const restoreRes = await httpRequest(
    `/api/tenants/${testTenantId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    },
    {
      appearance: {
        ...initialAppearance,
        primaryColor: originalPrimary,
      },
    }
  );

  if (restoreRes.status !== 200 || restoreRes.body.data.appearance?.primaryColor !== originalPrimary) {
    throw new Error('Falha ao restaurar dados originais.');
  }
  console.log(`  -> Restauração concluída com sucesso: ${originalPrimary}`);

  console.log('\n================================================================');
  console.log('TESTE END-TO-END HTTP APROVADO!');
  console.log('================================================================');
  return true;
}

if (process.argv[1]?.endsWith('test_http_tenant_route.ts')) {
  runHttpRouteTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nTESTE HTTP FALHOU:', err);
      process.exit(1);
    });
}
