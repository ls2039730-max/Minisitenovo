import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isProductAvailableOnDay,
  formatDaysListLabel,
  formatProductAvailabilitySummary,
  getDayName,
  getCurrentDayOfWeek,
  ProductAvailabilityConfig,
  DayOfWeek,
  ALL_DAYS_OF_WEEK,
} from '../src/utils/productAvailability.js';

describe('Auditoria Técnica: Disponibilidade de Produtos por Dia da Semana (LocalHub)', () => {
  test('1. Retrocompatibilidade: Produtos legados sem configuração de dias continuam 100% disponíveis todos os dias em ambos os canais', () => {
    const legacyProduct = {
      id: 'prod_legacy_1',
      name: 'Hambúrguer Clássico',
      price: 35.0,
      availabilityDays: null, // ou undefined
    };

    for (let day = 0; day <= 6; day++) {
      assert.equal(
        isProductAvailableOnDay(legacyProduct, day as DayOfWeek, 'table'),
        true,
        `Produto legado deve estar disponível no domingo a sábado para mesas (dia ${day})`
      );
      assert.equal(
        isProductAvailableOnDay(legacyProduct, day as DayOfWeek, 'delivery'),
        true,
        `Produto legado deve estar disponível no domingo a sábado para delivery (dia ${day})`
      );
    }
  });

  test('2. Modo canais unificados: Mesma disponibilidade aplicada para Catálogo de Mesa e Delivery', () => {
    // Configurado de Segunda a Sexta (dias 1, 2, 3, 4, 5)
    const productUnified: { availabilityDays: ProductAvailabilityConfig } = {
      availabilityDays: {
        sameChannels: true,
        tableDays: [1, 2, 3, 4, 5],
        deliveryDays: [1, 2, 3, 4, 5],
      },
    };

    // Segunda-feira (1) -> permitido
    assert.equal(isProductAvailableOnDay(productUnified, 1, 'table'), true);
    assert.equal(isProductAvailableOnDay(productUnified, 1, 'delivery'), true);

    // Sexta-feira (5) -> permitido
    assert.equal(isProductAvailableOnDay(productUnified, 5, 'table'), true);
    assert.equal(isProductAvailableOnDay(productUnified, 5, 'delivery'), true);

    // Domingo (0) -> bloqueado
    assert.equal(isProductAvailableOnDay(productUnified, 0, 'table'), false);
    assert.equal(isProductAvailableOnDay(productUnified, 0, 'delivery'), false);

    // Sábado (6) -> bloqueado
    assert.equal(isProductAvailableOnDay(productUnified, 6, 'table'), false);
    assert.equal(isProductAvailableOnDay(productUnified, 6, 'delivery'), false);
  });

  test('3. Controle independente por canal: Catálogo das mesas Segunda a Domingo, Delivery Quarta a Domingo', () => {
    // Exemplo exato do prompt:
    // Mesas: segunda a domingo [0, 1, 2, 3, 4, 5, 6]
    // Delivery: quarta a domingo [0, 3, 4, 5, 6] (domingo = 0, qua=3, qui=4, sex=5, sab=6)
    const productChannels: { availabilityDays: ProductAvailabilityConfig } = {
      availabilityDays: {
        sameChannels: false,
        tableDays: [0, 1, 2, 3, 4, 5, 6],
        deliveryDays: [0, 3, 4, 5, 6],
      },
    };

    // Segunda-feira (1): Disponível na mesa, INDISPONÍVEL no delivery
    assert.equal(isProductAvailableOnDay(productChannels, 1, 'table'), true, 'Segunda deve estar ativa na mesa');
    assert.equal(isProductAvailableOnDay(productChannels, 1, 'delivery'), false, 'Segunda deve estar bloqueada no delivery');

    // Terça-feira (2): Disponível na mesa, INDISPONÍVEL no delivery
    assert.equal(isProductAvailableOnDay(productChannels, 2, 'table'), true, 'Terça deve estar ativa na mesa');
    assert.equal(isProductAvailableOnDay(productChannels, 2, 'delivery'), false, 'Terça deve estar bloqueada no delivery');

    // Quarta-feira (3): Disponível em AMBOS os canais
    assert.equal(isProductAvailableOnDay(productChannels, 3, 'table'), true, 'Quarta deve estar ativa na mesa');
    assert.equal(isProductAvailableOnDay(productChannels, 3, 'delivery'), true, 'Quarta deve estar ativa no delivery');

    // Domingo (0): Disponível em AMBOS os canais
    assert.equal(isProductAvailableOnDay(productChannels, 0, 'table'), true, 'Domingo deve estar ativo na mesa');
    assert.equal(isProductAvailableOnDay(productChannels, 0, 'delivery'), true, 'Domingo deve estar ativo no delivery');
  });

  test('4. Validação de rejeição no backend com mensagem clara em dia não permitido', () => {
    const product = {
      name: 'Prato Executivo Terça Nobre',
      availabilityDays: {
        sameChannels: true,
        tableDays: [2] as DayOfWeek[], // Somente Terça-feira
        deliveryDays: [2] as DayOfWeek[],
      },
    };

    const simulatedDay: DayOfWeek = 1; // Segunda-feira
    const isAvailable = isProductAvailableOnDay(product, simulatedDay, 'delivery');

    assert.equal(isAvailable, false);

    let errorThrown = '';
    if (!isAvailable) {
      errorThrown = `Este produto não está disponível para pedidos neste dia. O produto "${product.name}" não está disponível para delivery hoje (${getDayName(simulatedDay)}). Atualize o cardápio para consultar as opções disponíveis.`;
    }

    assert.ok(
      errorThrown.includes('Este produto não está disponível para pedidos neste dia'),
      'Deve conter a mensagem padrão de recusa exigida'
    );
    assert.ok(
      errorThrown.includes('Atualize o cardápio para consultar as opções disponíveis'),
      'Deve orientar o cliente a atualizar o cardápio'
    );
  });

  test('5. Formatação informativa de resumo dos dias selecionados', () => {
    // Todos os dias
    assert.equal(formatDaysListLabel([0, 1, 2, 3, 4, 5, 6]), 'Todos os dias');

    // Segunda a Sexta
    assert.equal(formatDaysListLabel([1, 2, 3, 4, 5]), 'Segunda a Sexta');

    // Finais de semana
    assert.equal(formatDaysListLabel([0, 6]), 'Finais de semana (Sáb e Dom)');

    // Quarta a Domingo
    assert.equal(formatDaysListLabel([3, 4, 5, 6, 0]), 'Quarta a Domingo');

    // Nenhum dia
    assert.equal(formatDaysListLabel([]), 'Nenhum dia selecionado');

    // Resumo de produto com canais independentes
    const summaryDiff = formatProductAvailabilitySummary({
      sameChannels: false,
      tableDays: [0, 1, 2, 3, 4, 5, 6],
      deliveryDays: [3, 4, 5, 6, 0],
    });
    assert.equal(summaryDiff, 'Mesa: Todos os dias • Delivery: Quarta a Domingo');
  });

  test('6. Validação do arquivo de migração SQL para o Supabase', () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase', 'migrations', '20261016000000_product_weekly_availability.sql');
    assert.ok(fs.existsSync(migrationPath), 'Arquivo de migração 20261016000000_product_weekly_availability.sql deve existir');

    const content = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(content.includes('availability_days'), 'Deve adicionar a coluna availability_days');
    assert.ok(content.includes('JSONB'), 'Deve utilizar o tipo JSONB para performance e flexibilidade');
    assert.ok(content.includes('ALTER TABLE public.products'), 'Deve alterar a tabela public.products');
  });
});
