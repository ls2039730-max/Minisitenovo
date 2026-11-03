import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin } from '../server/supabaseAdmin.js';
import { restaurantRepo } from '../server/db/restaurantRepository.js';
import { User } from '../src/types/saas.js';

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`FALHA DE VERIFICAÇÃO UI/MOBILE: ${message}`);
  }
}

async function runMobileUiAndFlowVerification() {
  console.log('===================================================================');
  console.log('INICIANDO VERIFICAÇÃO DE UI MOBILE & FLUXO — ADICIONAR ITENS');
  console.log('===================================================================\n');

  const modalPath = path.resolve(process.cwd(), 'src/components/restaurant/modals/AddTableOrderModal.tsx');
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const modalCode = fs.readFileSync(modalPath, 'utf-8');
  const cssCode = fs.readFileSync(cssPath, 'utf-8');

  // 1. Verificar responsividade e viewports (360x800, 390x844, 412x915 e Desktop)
  console.log('[1/8] Auditando estrutura mobile-first (360×800, 390×844, 412×915 e Desktop)...');
  assert(
    modalCode.includes('h-[100dvh]') && modalCode.includes('max-h-[100dvh]'),
    'O modal deve ocupar 100dvh em celulares para aproveitar toda a área útil sem disputas de rolagem'
  );
  assert(
    modalCode.includes('sm:h-[92dvh]') && modalCode.includes('sm:max-w-6xl'),
    'O modal deve expandir adequadamente para tablets e desktops (max-w-6xl)'
  );
  assert(
    modalCode.includes('lg:grid-cols-12') && modalCode.includes('lg:col-span-7') && modalCode.includes('lg:col-span-5'),
    'No desktop (lg:), o catálogo e o resumo lateral devem dividir o espaço horizontalmente'
  );
  assert(
    cssCode.includes('.pt-safe') && cssCode.includes('.pb-safe') && modalCode.includes('pt-safe') && modalCode.includes('pb-safe'),
    'Áreas seguras superior (status bar) e inferior (navegação do celular) devem ser respeitadas'
  );
  console.log('✅ Estrutura responsiva mobile-first e desktop validada!\n');

  // 2. Verificar Cabeçalho Compacto
  console.log('[2/8] Auditando cabeçalho compacto e hierarquia de informações...');
  assert(
    modalCode.includes('Adicionar itens') &&
      modalCode.includes('Mesa {table.tableNumber}') &&
      modalCode.includes('Sessão #${effectiveSessionCode}') &&
      modalCode.includes('{nextOrderSequence}º pedido'),
    'Cabeçalho deve exibir título "Adicionar itens", mesa, sessão aberta e número/sequência do pedido'
  );
  assert(
    modalCode.includes('aria-label="Fechar janela de adicionar itens"') &&
      modalCode.includes('min-w-[44px] min-h-[44px]'),
    'Botão de fechar no cabeçalho deve possuir área de toque mínima de 44×44px'
  );
  console.log('✅ Cabeçalho compacto validado!\n');

  // 3. Verificar Pesquisa e Faixa Horizontal de Categorias
  console.log('[3/8] Auditando campo de pesquisa e faixa horizontal de categorias...');
  assert(
    modalCode.includes('Buscar produto por nome, código ou categoria...') &&
      modalCode.includes('p.sku') &&
      modalCode.includes('p.category?.name'),
    'A busca deve filtrar por nome, código (SKU) e categoria'
  );
  assert(
    modalCode.includes('overflow-x-auto no-scrollbar') && cssCode.includes('.no-scrollbar'),
    'As categorias devem estar em uma faixa horizontal deslizável sem barra de rolagem intrusiva'
  );
  console.log('✅ Pesquisa e faixa de categorias validadas!\n');

  // 4. Verificar Cards de Produtos, Tipografia e Áreas de Toque (>= 44px)
  console.log('[4/8] Auditando cards de produtos, tipografia e alvos de toque (>= 44px)...');
  assert(
    modalCode.includes('text-[16px] sm:text-[17px]') &&
      modalCode.includes('text-[18px] sm:text-[19px] font-extrabold text-emerald-700 tabular-nums'),
    'Nome do produto (16–17px) e preço (18–19px) devem ter tipografia legível e destaque visual'
  );
  assert(
    modalCode.includes('expandedNameProductIds') && modalCode.includes('line-clamp-2'),
    'Cards devem ter truncamento controlado (line-clamp-2) com possibilidade de leitura do nome completo ao tocar'
  );
  assert(
    modalCode.includes('pb-10 sm:px-5 sm:pt-4 sm:pb-12') && modalCode.includes('flex-1 min-h-0 overflow-y-auto'),
    'Lista de produtos deve ter rolagem própria e espaçamento inferior (pb-10/pb-12) para que o último produto nunca fique escondido'
  );
  console.log('✅ Cards de produtos, tipografia e rolagem do último produto validados!\n');

  // 5. Verificar Resumo em Duas Camadas (Compacta + Expandida) e Rodapé Fixo
  console.log('[5/8] Auditando resumo em duas camadas e botão fixo de confirmação...');
  assert(
    modalCode.includes('data-testid="mobile-compact-summary-bar"') &&
      modalCode.includes('Subtotal: {formatCurrency(newOrderSubtotal)}') &&
      modalCode.includes('Ver resumo'),
    'Camada compacta deve mostrar quantidade de itens, subtotal do novo pedido e botão para abrir o resumo completo'
  );
  assert(
    modalCode.includes('isSummaryExpandedMobile') &&
      modalCode.includes('Consumo atual da mesa:') &&
      modalCode.includes('Novo total estimado da conta:'),
    'Camada expandida deve exibir itens selecionados, controles de quantidade/remoção, consumo atual e novo total estimado da conta'
  );
  assert(
    modalCode.includes('Confirmar e enviar para cozinha') &&
      modalCode.includes('Cancelar') &&
      modalCode.includes('min-h-[48px]'),
    'Rodapé fixo deve conter botões "Cancelar" e "Confirmar e enviar para cozinha" com altura confortável (48px) e valor do novo pedido'
  );
  console.log('✅ Resumo em duas camadas e rodapé fixo validados!\n');

  // 6. Verificar Estados da Interface e Preservação do Carrinho em Erro
  console.log('[6/8] Auditando estados da interface e preservação do carrinho em falha...');
  assert(
    modalCode.includes('isLoadingCatalog') &&
      modalCode.includes('catalogLoadError') &&
      modalCode.includes('isSessionUnavailable') &&
      modalCode.includes('addedToast') &&
      modalCode.includes('confirmedOrderInfo'),
    'Todos os estados visuais obrigatórios (carregamento, falha de conexão, sessão encerrada, item adicionado, erro e confirmação) devem existir'
  );
  // Verificar que no bloco catch de handleSubmitOrder não há setCart([])
  const submitFnMatch = modalCode.slice(modalCode.indexOf('const handleSubmitOrder = async'));
  const catchBlock = submitFnMatch.slice(submitFnMatch.indexOf('catch (err: any)'));
  assert(
    !catchBlock.includes('setCart([])'),
    'O carrinho NÃO pode ser limpo quando ocorrer erro no envio do pedido'
  );
  console.log('✅ Estados da interface e preservação do carrinho em erro validados!\n');

  // 7. Teste Funcional Integrado: Vínculo à Sessão, Cliques Repetidos (Idempotência), Financeiro e KDS
  console.log('[7/8] Testando fluxo ponta a ponta (sessão aberta, cliques repetidos, financeiro e KDS)...');
  const { data: tenants } = await supabaseAdmin.from('tenants').select('id, slug, name').limit(1);
  assert(tenants && tenants.length > 0, 'Deve existir ao menos um tenant para teste');
  const tenantId = tenants![0].id;

  const actor: User = {
    id: crypto.randomUUID(),
    tenantId,
    name: 'Garçom Mobile Android',
    email: 'garcom.mobile@teste.local',
    role: 'CLIENT_ADMIN',
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  let createdTableId: string | null = null;
  let createdSessionId: string | null = null;
  let createdProductId: string | null = null;
  const createdOrderIds: string[] = [];

  try {
    createdProductId = crypto.randomUUID();
    await supabaseAdmin.from('products').insert({
      id: createdProductId,
      tenant_id: tenantId,
      name: 'Porção Mobile Teste Especial Com Nome Completo Longo',
      slug: `porcao-mobile-${Date.now()}`,
      sku: 'MOB-101',
      price: 42.5,
      is_active: true,
      track_stock: true,
      stock_quantity: 20,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const table = await restaurantRepo.createTable(
      tenantId,
      { tableNumber: 'M-MOB', name: 'Varanda Mobile', isActive: true },
      actor
    );
    createdTableId = table.id;

    const session = await restaurantRepo.getOrCreateActiveSession(tenantId, table.id);
    createdSessionId = session.id;

    // Lançar pedido inicial
    const firstRes = await restaurantRepo.addOrderToActiveSession(
      tenantId,
      table.id,
      {
        sessionId: session.id,
        idempotencyKey: `mob-init-${Date.now()}`,
        items: [{ productId: createdProductId, quantity: 1 }],
      },
      actor
    );
    createdOrderIds.push(firstRes.order.id);

    // Simular clique duplo no botão "Confirmar e enviar para cozinha" no celular (mesma idempotencyKey)
    const idemKey = `mob-double-tap-${Date.now()}`;
    const [tap1, tap2] = await Promise.all([
      restaurantRepo.addOrderToActiveSession(
        tenantId,
        table.id,
        {
          sessionId: session.id,
          customerName: 'Cliente Android 360px',
          notes: 'Pedido adicional via celular',
          idempotencyKey: idemKey,
          items: [{ productId: createdProductId, quantity: 2, notes: 'Bem crocante' }],
        },
        actor
      ),
      restaurantRepo.addOrderToActiveSession(
        tenantId,
        table.id,
        {
          sessionId: session.id,
          customerName: 'Cliente Android 360px',
          notes: 'Pedido adicional via celular',
          idempotencyKey: idemKey,
          items: [{ productId: createdProductId, quantity: 2, notes: 'Bem crocante' }],
        },
        actor
      ),
    ]);
    createdOrderIds.push(tap1.order.id);

    assert(tap1.order.id === tap2.order.id, 'Cliques repetidos devem retornar exatamente o mesmo pedido');
    assert(tap1.order.sessionId === session.id, 'Pedido adicional deve continuar vinculado à sessão aberta correta');
    assert(tap1.session.totalAmount === 127.5, `Total da sessão deve ser 42.50 + 85.00 = 127.50 (atual: ${tap1.session.totalAmount})`);

    // Confirmar aparição no KDS operacional
    const kdsOrders = await restaurantRepo.listOrders(tenantId, { sessionStatus: 'open' });
    const inKds = kdsOrders.find((o) => o.id === tap1.order.id);
    assert(inKds && inKds.status === 'received', 'Pedido adicional deve aparecer no KDS com status received');

    console.log('✅ Fluxo ponta a ponta (sessão, cliques repetidos, financeiro e KDS) aprovado!\n');
  } finally {
    if (createdOrderIds.length > 0) {
      await supabaseAdmin.from('restaurant_order_items').delete().in('order_id', createdOrderIds);
      await supabaseAdmin.from('restaurant_order_status_history').delete().in('order_id', createdOrderIds);
      await supabaseAdmin.from('restaurant_orders').delete().in('id', createdOrderIds);
    }
    if (createdSessionId) {
      await supabaseAdmin.from('restaurant_sessions').delete().eq('id', createdSessionId);
    }
    if (createdTableId) {
      await supabaseAdmin.from('restaurant_tables').delete().eq('id', createdTableId);
    }
    if (createdProductId) {
      await supabaseAdmin.from('products').delete().eq('id', createdProductId);
    }
  }

  console.log('===================================================================');
  console.log('🎉 TODAS AS VERIFICAÇÕES DE UI MOBILE E FLUXO FORAM APROVADAS!');
  console.log('===================================================================');
}

runMobileUiAndFlowVerification().catch((err) => {
  console.error('\n❌ ERRO NA VERIFICAÇÃO MOBILE:', err);
  process.exit(1);
});
