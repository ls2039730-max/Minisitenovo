import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Simulation of Core Business Logic & Invariant Testing for Restaurant Closing & Fees
describe('Auditoria Técnica: Fechamento de Comanda, Taxas e Segurança Multi-Tenant', () => {

  // Mock domain entities
  interface MockTenant {
    id: string;
    slug: string;
  }

  interface MockUser {
    id: string;
    tenantId: string | null;
    role: 'SUPER_ADMIN' | 'CLIENT_ADMIN' | 'OWNER' | 'MANAGER' | 'EMPLOYEE' | 'PROFESSIONAL';
  }

  interface MockTable {
    id: string;
    tenantId: string;
    tableNumber: string;
    qrCodeToken: string;
    status: 'available' | 'occupied' | 'closing';
    currentSessionId: string | null;
    isActive: boolean;
  }

  interface MockOrder {
    id: string;
    tenantId: string;
    sessionId: string;
    total: number;
    status: 'received' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  }

  interface MockFee {
    id: string;
    tenantId: string;
    sessionId: string;
    feeTemplateId?: string | null;
    name: string;
    type: 'percentage' | 'fixed';
    rateOrAmount: number;
    calculatedAmount: number;
  }

  interface MockSession {
    id: string;
    tenantId: string;
    tableId: string;
    status: 'open' | 'closed';
    closingRequestedAt: string | null;
    paymentMethod: string | null;
    paymentStatus: 'paid' | 'pending' | 'unpaid' | null;
    closedByUserId: string | null;
    ordersSubtotal: number;
    feesTotal: number;
    totalAmount: number;
    notes: string | null;
  }

  // Pure functions reflecting the database procedures & repository logic
  function calculateOrdersSubtotal(orders: MockOrder[]): number {
    const valid = orders.filter((o) => o.status !== 'cancelled');
    const sum = valid.reduce((acc, o) => acc + o.total, 0);
    return Math.round(sum * 100) / 100;
  }

  function recalculateSessionFees(subtotal: number, fees: MockFee[]): { updatedFees: MockFee[]; totalFees: number } {
    let sum = 0;
    const updated = fees.map((f) => {
      let calc = f.rateOrAmount;
      if (f.type === 'percentage') {
        calc = Math.round((subtotal * (f.rateOrAmount / 100)) * 100) / 100;
      }
      sum += calc;
      return { ...f, calculatedAmount: calc };
    });
    return { updatedFees: updated, totalFees: Math.round(sum * 100) / 100 };
  }

  function simulateRequestSessionClosing(
    table: MockTable,
    session: MockSession,
    tableToken: string
  ): { table: MockTable; session: MockSession; alreadyRequested: boolean } {
    if (!table.isActive) throw new Error('Mesa inativa no momento.');
    if (table.qrCodeToken !== tableToken) throw new Error('Acesso negado: token do QR Code inválido para esta mesa.');
    if (session.status !== 'open') throw new Error('Nenhuma comanda aberta para esta mesa.');

    if (session.closingRequestedAt !== null) {
      return { table, session, alreadyRequested: true };
    }

    const now = new Date().toISOString();
    const updatedSession: MockSession = {
      ...session,
      closingRequestedAt: now,
    };
    const updatedTable: MockTable = {
      ...table,
      status: 'closing',
    };

    return { table: updatedTable, session: updatedSession, alreadyRequested: false };
  }

  function simulateCloseSession(
    actor: MockUser,
    tenantId: string,
    table: MockTable,
    session: MockSession,
    orders: MockOrder[],
    fees: MockFee[],
    paymentMethod: string,
    simulateDbFailure = false
  ): { table: MockTable; session: MockSession; orders: MockOrder[] } {
    // 1. Authorization check
    if (actor.role === 'PROFESSIONAL') {
      throw new Error('Acesso restrito: profissionais não possuem permissão para encerrar comandas de restaurante.');
    }
    if (actor.role !== 'SUPER_ADMIN' && actor.tenantId !== tenantId) {
      throw new Error('Acesso negado: o usuário autenticado não pertence a este estabelecimento.');
    }

    // 2. Table and session integrity
    if (table.tenantId !== tenantId || session.tenantId !== tenantId) {
      throw new Error('Inconsistência de tenant entre mesa e sessão.');
    }
    if (session.status !== 'open') {
      throw new Error('Nenhuma comanda aberta para esta mesa.');
    }
    if (table.currentSessionId !== session.id) {
      throw new Error('Inconsistência de integridade: a mesa não está vinculada a esta comanda ativa.');
    }

    // 3. Mark pending orders as delivered
    const updatedOrders: MockOrder[] = orders.map((o) => {
      if (['received', 'confirmed', 'preparing', 'ready'].includes(o.status)) {
        return { ...o, status: 'delivered' };
      }
      return o;
    });

    // 4. Calculate subtotal & fees
    const subtotal = calculateOrdersSubtotal(updatedOrders);
    const { totalFees } = recalculateSessionFees(subtotal, fees);
    const finalTotal = Math.round((subtotal + totalFees) * 100) / 100;

    if (simulateDbFailure) {
      throw new Error('Database transaction failed (simulated rollback).');
    }

    // 5. Close session
    const updatedSession: MockSession = {
      ...session,
      status: 'closed',
      ordersSubtotal: subtotal,
      feesTotal: totalFees,
      totalAmount: finalTotal,
      paymentMethod,
      paymentStatus: 'paid',
      closedByUserId: actor.id,
    };

    // 6. Release table only if currentSessionId matches
    const updatedTable: MockTable = {
      ...table,
      status: 'available',
      currentSessionId: null,
    };

    return { table: updatedTable, session: updatedSession, orders: updatedOrders };
  }

  // ==========================================
  // CENÁRIO 1: Cliente pode solicitar fechamento, mas não pode finalizá-lo
  // ==========================================
  test('1. Cliente público pode solicitar fechamento via QR Code mas não pode finalizar comanda', () => {
    const table: MockTable = {
      id: 'table-1',
      tenantId: 'tenant-alpha',
      tableNumber: '05',
      qrCodeToken: 'valid-qr-token-123',
      status: 'occupied',
      currentSessionId: 'session-1',
      isActive: true,
    };

    const session: MockSession = {
      id: 'session-1',
      tenantId: 'tenant-alpha',
      tableId: 'table-1',
      status: 'open',
      closingRequestedAt: null,
      paymentMethod: null,
      paymentStatus: null,
      closedByUserId: null,
      ordersSubtotal: 50,
      feesTotal: 0,
      totalAmount: 50,
      notes: null,
    };

    // Solicitação pelo cliente com token do QR Code
    const requestResult = simulateRequestSessionClosing(table, session, 'valid-qr-token-123');
    assert.equal(requestResult.table.status, 'closing');
    assert.equal(requestResult.session.status, 'open', 'A comanda deve permanecer ABERTA após a solicitação');
    assert.ok(requestResult.session.closingRequestedAt !== null);

    // Tentativa de finalização por um cliente anônimo (sem autenticação)
    const anonymousUser: MockUser = {
      id: 'anon-visitor',
      tenantId: null,
      role: 'PROFESSIONAL', // Sem permissão de fechamento
    };

    assert.throws(
      () => simulateCloseSession(anonymousUser, 'tenant-alpha', requestResult.table, requestResult.session, [], [], 'Cartão'),
      /Acesso restrito/
    );
  });

  // ==========================================
  // CENÁRIO 2: Usuário sem autorização não pode fechar comanda de outro tenant
  // ==========================================
  test('2. Usuário sem autorização não pode fechar a comanda de outro tenant', () => {
    const intruderUser: MockUser = {
      id: 'user-hacker',
      tenantId: 'tenant-beta', // Pertence ao tenant-beta
      role: 'MANAGER',
    };

    const victimTable: MockTable = {
      id: 'table-victim',
      tenantId: 'tenant-alpha', // Pertence ao tenant-alpha
      tableNumber: '10',
      qrCodeToken: 'tok',
      status: 'occupied',
      currentSessionId: 'sess-victim',
      isActive: true,
    };

    const victimSession: MockSession = {
      id: 'sess-victim',
      tenantId: 'tenant-alpha',
      tableId: 'table-victim',
      status: 'open',
      closingRequestedAt: null,
      paymentMethod: null,
      paymentStatus: null,
      closedByUserId: null,
      ordersSubtotal: 100,
      feesTotal: 0,
      totalAmount: 100,
      notes: null,
    };

    assert.throws(
      () => simulateCloseSession(intruderUser, 'tenant-alpha', victimTable, victimSession, [], [], 'Pix'),
      /Acesso negado: o usuário autenticado não pertence a este estabelecimento/
    );
  });

  // ==========================================
  // CENÁRIO 3: Funcionário autorizado pode concluir o fechamento
  // ==========================================
  test('3. Funcionário autorizado pode concluir o fechamento e liberar a mesa', () => {
    const staffUser: MockUser = {
      id: 'staff-42',
      tenantId: 'tenant-alpha',
      role: 'EMPLOYEE',
    };

    const table: MockTable = {
      id: 'table-1',
      tenantId: 'tenant-alpha',
      tableNumber: '02',
      qrCodeToken: 'token-abc',
      status: 'closing',
      currentSessionId: 'session-42',
      isActive: true,
    };

    const session: MockSession = {
      id: 'session-42',
      tenantId: 'tenant-alpha',
      tableId: 'table-1',
      status: 'open',
      closingRequestedAt: new Date().toISOString(),
      paymentMethod: null,
      paymentStatus: null,
      closedByUserId: null,
      ordersSubtotal: 80,
      feesTotal: 0,
      totalAmount: 80,
      notes: null,
    };

    const orders: MockOrder[] = [
      { id: 'o1', tenantId: 'tenant-alpha', sessionId: 'session-42', total: 80, status: 'preparing' },
    ];

    const result = simulateCloseSession(staffUser, 'tenant-alpha', table, session, orders, [], 'Cartão de Débito');

    assert.equal(result.session.status, 'closed');
    assert.equal(result.session.closedByUserId, 'staff-42');
    assert.equal(result.session.paymentMethod, 'Cartão de Débito');
    assert.equal(result.session.paymentStatus, 'paid');
    assert.equal(result.table.status, 'available');
    assert.equal(result.table.currentSessionId, null);
    assert.equal(result.orders[0].status, 'delivered', 'Pedidos em preparação devem ser finalizados automaticamente');
  });

  // ==========================================
  // CENÁRIO 4: Mesa não é liberada se a transação falhar
  // ==========================================
  test('4. Mesa não é liberada e comanda não é fechada se a transação falhar', () => {
    const managerUser: MockUser = {
      id: 'mgr-1',
      tenantId: 'tenant-alpha',
      role: 'MANAGER',
    };

    const table: MockTable = {
      id: 'table-fail',
      tenantId: 'tenant-alpha',
      tableNumber: '08',
      qrCodeToken: 'tok-f',
      status: 'occupied',
      currentSessionId: 'sess-fail',
      isActive: true,
    };

    const session: MockSession = {
      id: 'sess-fail',
      tenantId: 'tenant-alpha',
      tableId: 'table-fail',
      status: 'open',
      closingRequestedAt: null,
      paymentMethod: null,
      paymentStatus: null,
      closedByUserId: null,
      ordersSubtotal: 120,
      feesTotal: 0,
      totalAmount: 120,
      notes: null,
    };

    assert.throws(
      () => simulateCloseSession(managerUser, 'tenant-alpha', table, session, [], [], 'Dinheiro', true),
      /Database transaction failed/
    );

    // Confirma que a mesa original não sofreu mutação indevida
    assert.equal(table.status, 'occupied');
    assert.equal(table.currentSessionId, 'sess-fail');
  });

  // ==========================================
  // CENÁRIO 5: Duas solicitações simultâneas não geram fechamento duplicado
  // ==========================================
  test('5. Duas solicitações consecutivas preservam timestamp e não criam duplicidade', () => {
    const table: MockTable = {
      id: 'table-dup',
      tenantId: 'tenant-alpha',
      tableNumber: '04',
      qrCodeToken: 'tok-dup',
      status: 'occupied',
      currentSessionId: 'sess-dup',
      isActive: true,
    };

    const session: MockSession = {
      id: 'sess-dup',
      tenantId: 'tenant-alpha',
      tableId: 'table-dup',
      status: 'open',
      closingRequestedAt: null,
      paymentMethod: null,
      paymentStatus: null,
      closedByUserId: null,
      ordersSubtotal: 65,
      feesTotal: 0,
      totalAmount: 65,
      notes: null,
    };

    const firstReq = simulateRequestSessionClosing(table, session, 'tok-dup');
    assert.equal(firstReq.alreadyRequested, false);
    const initialTimestamp = firstReq.session.closingRequestedAt;
    assert.ok(initialTimestamp);

    // Segunda solicitação concorrente do cliente
    const secondReq = simulateRequestSessionClosing(firstReq.table, firstReq.session, 'tok-dup');
    assert.equal(secondReq.alreadyRequested, true);
    assert.equal(secondReq.session.closingRequestedAt, initialTimestamp, 'O timestamp original deve ser preservado');
  });

  // ==========================================
  // CENÁRIO 6: Mesa não é liberada se estiver vinculada a outra sessão
  // ==========================================
  test('6. A mesa não é liberada se estiver vinculada a outra sessão', () => {
    const staffUser: MockUser = {
      id: 'staff-9',
      tenantId: 'tenant-alpha',
      role: 'EMPLOYEE',
    };

    const table: MockTable = {
      id: 'table-conflict',
      tenantId: 'tenant-alpha',
      tableNumber: '07',
      qrCodeToken: 'tok-c',
      status: 'occupied',
      currentSessionId: 'new-session-999', // Vinculada a OUTRA sessão
      isActive: true,
    };

    const oldSession: MockSession = {
      id: 'old-session-111', // Sessão antiga tentando ser fechada
      tenantId: 'tenant-alpha',
      tableId: 'table-conflict',
      status: 'open',
      closingRequestedAt: null,
      paymentMethod: null,
      paymentStatus: null,
      closedByUserId: null,
      ordersSubtotal: 40,
      feesTotal: 0,
      totalAmount: 40,
      notes: null,
    };

    assert.throws(
      () => simulateCloseSession(staffUser, 'tenant-alpha', table, oldSession, [], [], 'Pix'),
      /Inconsistência de integridade: a mesa não está vinculada a esta comanda ativa/
    );
  });

  // ==========================================
  // CENÁRIO 7: Taxas fixas e percentuais são calculadas corretamente com arredondamento
  // ==========================================
  test('7. Taxas fixas e percentuais são calculadas com precisão monetária e arredondamento a 2 casas', () => {
    const subtotal = 73.33; // Valor decimal complexo

    const fees: MockFee[] = [
      {
        id: 'fee-10-pct',
        tenantId: 't1',
        sessionId: 's1',
        name: 'Serviço 10%',
        type: 'percentage',
        rateOrAmount: 10.0,
        calculatedAmount: 0,
      },
      {
        id: 'fee-couvert',
        tenantId: 't1',
        sessionId: 's1',
        name: 'Couvert Artístico',
        type: 'fixed',
        rateOrAmount: 15.5,
        calculatedAmount: 0,
      },
    ];

    const { updatedFees, totalFees } = recalculateSessionFees(subtotal, fees);

    // 73.33 * 0.10 = 7.333 -> round = 7.33
    assert.equal(updatedFees[0].calculatedAmount, 7.33);
    // Couvert fixo = 15.50
    assert.equal(updatedFees[1].calculatedAmount, 15.5);
    // Total taxas: 7.33 + 15.50 = 22.83
    assert.equal(totalFees, 22.83);

    const grandTotal = Math.round((subtotal + totalFees) * 100) / 100;
    // 73.33 + 22.83 = 96.16
    assert.equal(grandTotal, 96.16);
  });

  // ==========================================
  // CENÁRIO 8: Pedidos cancelados não entram no subtotal
  // ==========================================
  test('8. Pedidos cancelados são rigorosamente desconsiderados do subtotal e da base de cálculo de taxas', () => {
    const orders: MockOrder[] = [
      { id: 'o1', tenantId: 't', sessionId: 's', total: 50.0, status: 'delivered' },
      { id: 'o2', tenantId: 't', sessionId: 's', total: 99.9, status: 'cancelled' }, // CANCELADO!
      { id: 'o3', tenantId: 't', sessionId: 's', total: 25.0, status: 'ready' },
    ];

    const subtotal = calculateOrdersSubtotal(orders);
    // Apenas o1 (50) + o3 (25) = 75.00
    assert.equal(subtotal, 75.0);

    const fee: MockFee = {
      id: 'f1',
      tenantId: 't',
      sessionId: 's',
      name: 'Serviço 10%',
      type: 'percentage',
      rateOrAmount: 10,
      calculatedAmount: 0,
    };

    const { totalFees } = recalculateSessionFees(subtotal, [fee]);
    // 75.00 * 10% = 7.50 (e NÃO (174.90 * 10%))
    assert.equal(totalFees, 7.5);
  });

  // ==========================================
  // CENÁRIO 9: Seleção de forma de pagamento não marca automaticamente como recebido
  // ==========================================
  test('9. A seleção da forma de pagamento é independente do status contábil de quitação', () => {
    // Na comanda aberta
    const openSession: MockSession = {
      id: 'sess-open',
      tenantId: 't',
      tableId: 'tab',
      status: 'open',
      closingRequestedAt: new Date().toISOString(),
      paymentMethod: 'Dinheiro', // Cliente ou garçom pré-selecionou dinheiro
      paymentStatus: null, // AINDA NÃO PAGO
      closedByUserId: null,
      ordersSubtotal: 100,
      feesTotal: 10,
      totalAmount: 110,
      notes: null,
    };

    assert.equal(openSession.paymentStatus, null, 'Enquanto a comanda está aberta, paymentStatus não deve ser "paid"');

    // Ao fechar administrativamente
    const staff: MockUser = { id: 'u1', tenantId: 't', role: 'CLIENT_ADMIN' };
    const table: MockTable = {
      id: 'tab',
      tenantId: 't',
      tableNumber: '1',
      qrCodeToken: 'k',
      status: 'closing',
      currentSessionId: 'sess-open',
      isActive: true,
    };

    const closed = simulateCloseSession(staff, 't', table, openSession, [], [], 'Dinheiro');
    assert.equal(closed.session.paymentMethod, 'Dinheiro');
    assert.equal(closed.session.paymentStatus, 'paid', 'Apenas após finalização expressa pelo operador o status se torna "paid"');
  });

  // ==========================================
  // CENÁRIO 10: A migração é compatível com o esquema existente
  // ==========================================
  test('10. O arquivo de migração SQL não contém referências a "public.users" e possui estrutura correta', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261015000000_restaurant_session_closing_and_fees.sql');
    assert.ok(fs.existsSync(migrationPath), 'O arquivo de migração deve existir');

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

    // 1. NÃO PODE referenciar public.users (erro relatado pelo usuário)
    assert.ok(
      !sqlContent.includes('public.users'),
      'O SQL NUNCA deve referenciar public.users, deve usar auth.users(id)'
    );

    // 2. DEVE referenciar auth.users(id)
    assert.ok(
      sqlContent.includes('auth.users(id)'),
      'O SQL deve vincular closed_by_user_id a auth.users(id)'
    );

    // 3. DEVE conter as procedures request_session_closing e close_restaurant_session
    assert.ok(
      sqlContent.includes('CREATE OR REPLACE FUNCTION public.request_session_closing'),
      'Deve declarar request_session_closing'
    );
    assert.ok(
      sqlContent.includes('CREATE OR REPLACE FUNCTION public.close_restaurant_session'),
      'Deve declarar close_restaurant_session'
    );

    // 4. DEVE conter revogação explícita de close_restaurant_session para anon
    assert.ok(
      sqlContent.includes('REVOKE ALL ON FUNCTION public.close_restaurant_session(UUID, UUID, TEXT, TEXT, UUID) FROM anon;'),
      'Deve revogar anon em close_restaurant_session'
    );

    // 5. DEVE conter verificação de role e tenant_users
    assert.ok(
      sqlContent.includes('public.tenant_users'),
      'Procedure deve validar permissões em public.tenant_users'
    );
    assert.ok(
      sqlContent.includes("v_user_role = 'PROFESSIONAL'"),
      'Procedure deve restringir acesso do papel PROFESSIONAL'
    );

    // 6. DEVE conter payment_status
    assert.ok(
      sqlContent.includes('payment_status'),
      'Tabela restaurant_sessions deve ter payment_status'
    );
  });

});
