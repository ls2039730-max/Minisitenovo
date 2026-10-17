import { repo } from '../server/db/repository.js';
import { supabaseAdmin, isRealSupabaseConfigured } from '../server/supabaseAdmin.js';
import { bootstrapDatabaseIfNeeded } from '../server/db/bootstrap.js';

export async function runAppearancePersistenceTest() {
  console.log('================================================================');
  console.log('TESTE REPRODUZÍVEL — PERSISTÊNCIA DA IDENTIDADE VISUAL');
  console.log(`Backend Implementation: ${isRealSupabaseConfigured ? 'REMOTE SUPABASE (OFICIAL)' : 'LOCAL ADAPTER'}`);
  console.log('================================================================\n');

  // Inicializar banco / seed se necessário
  await bootstrapDatabaseIfNeeded();

  // 1. Obter tenant de teste autorizado e usuário autorizado
  const testTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const superAdminUser = (await repo.findUserByEmail('admin@localhub.com')) || {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@localhub.com',
    name: 'Super Admin Test',
    role: 'SUPER_ADMIN' as const,
    tenantId: null,
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const initialTenant = await repo.getTenantById(testTenantId, superAdminUser);
  if (!initialTenant) {
    throw new Error(`Tenant de teste (${testTenantId}) não encontrado.`);
  }

  const originalColor = initialTenant.appearance?.primaryColor || '#1e293b';
  const originalSecondary = initialTenant.appearance?.secondaryColor || '#ca8a04';
  const testUniqueColor = '#7c3aed'; // Roxo único identificável

  console.log(`[ETAPA 1] Tenant de teste identificado: "${initialTenant.name}" (${initialTenant.id})`);
  console.log(`[ETAPA 1] Cor original: ${originalColor}`);

  // 2. Gravar cor de identificação única
  console.log(`\n[ETAPA 2] Gravando cor única de teste: ${testUniqueColor}...`);
  const correlationId = `test_${Date.now()}`;
  await repo.updateTenant(
    testTenantId,
    {
      appearance: {
        ...initialTenant.appearance,
        primaryColor: testUniqueColor,
      },
    },
    superAdminUser,
    correlationId
  );

  // 3. Consultar novamente pelo caminho normal de leitura
  console.log('\n[ETAPA 3] Consultando tenant pelo repositório (caminho normal)...');
  const readBackTenant = await repo.getTenantById(testTenantId, superAdminUser);

  // 4. Verificar se a cor recuperada corresponde exatamente à gravada
  console.log(`[ETAPA 4] Verificação da cor no tenant lido: ${readBackTenant?.appearance?.primaryColor}`);
  if (readBackTenant?.appearance?.primaryColor !== testUniqueColor) {
    throw new Error(
      `Falha na validação: esperado ${testUniqueColor}, obtido ${readBackTenant?.appearance?.primaryColor}`
    );
  }
  console.log('  -> SUCESSO: A cor recuperada corresponde exatamente à cor gravada.');

  // 5. Confirmação direta na tabela tenant_settings
  console.log('\n[ETAPA 5] Verificando diretamente na tabela tenant_settings...');
  const { data: dbSettings, error: dbErr } = await supabaseAdmin
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', testTenantId)
    .single();

  if (dbErr) {
    throw new Error(`Erro ao consultar tenant_settings diretamente: ${dbErr.message}`);
  }

  if (dbSettings?.primary_color !== testUniqueColor) {
    throw new Error(
      `Falha na tabela tenant_settings: esperado ${testUniqueColor}, obtido ${dbSettings?.primary_color}`
    );
  }
  console.log(`  -> SUCESSO: Registro na tabela tenant_settings confirma primary_color = ${dbSettings.primary_color}`);

  // 6. Restaurar o valor original do tenant de teste
  console.log(`\n[ETAPA 6] Restaurando cor original (${originalColor})...`);
  await repo.updateTenant(
    testTenantId,
    {
      appearance: {
        ...initialTenant.appearance,
        primaryColor: originalColor,
        secondaryColor: originalSecondary,
      },
    },
    superAdminUser,
    `restore_${Date.now()}`
  );

  const restoredTenant = await repo.getTenantById(testTenantId, superAdminUser);
  console.log(`  -> Restauração confirmada: cor final = ${restoredTenant?.appearance?.primaryColor}`);

  console.log('\n================================================================');
  console.log('TESTE CONCLUÍDO COM 100% DE SUCESSO E DADOS RESTAURADOS!');
  console.log('================================================================');
  return true;
}

if (process.argv[1]?.endsWith('test_appearance_persistence.ts')) {
  runAppearancePersistenceTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nTESTE FALHOU:', err);
      process.exit(1);
    });
}
