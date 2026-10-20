import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSchedule,
  calculateScheduleStatus,
  getSaoPauloTime,
  DAY_KEYS,
  DAY_NAMES,
  type DayKey,
} from '../src/utils/businessHours.js';

describe('Auditoria e Validação Definitiva: Módulo de Horário de Funcionamento (LocalHub)', () => {
  // 1. Cenário Reproduzido da Una Ótica (Banco de Dados em Produção)
  test('1. Cenário Una Ótica: Registro no banco com apenas sab e dom exibe Seg-Sex 08:00 às 18:00, Sáb 08:00 às 12:00 e Dom Fechado', () => {
    // Payload exato recuperado da API pública da Una Ótica em produção:
    const unaOticaRawDbSchedule = {
      dom: {
        isOpen: false,
        openTime: '08:00',
        closeTime: '18:00',
      },
      sab: {
        isOpen: true,
        openTime: '08:00',
        closeTime: '12:00',
      },
    };

    const normalized = normalizeSchedule(unaOticaRawDbSchedule);

    // Validação de todos os 7 dias
    for (const dk of DAY_KEYS) {
      assert.ok(normalized[dk], `Dia ${dk} deve existir no objeto normalizado`);
      assert.equal(normalized[dk].key, dk);
      assert.equal(normalized[dk].label, DAY_NAMES[dk]);
    }

    // Segunda a Sexta: Aberto 08:00 às 18:00
    const weekDays: DayKey[] = ['seg', 'ter', 'qua', 'qui', 'sex'];
    for (const wd of weekDays) {
      assert.equal(normalized[wd].isOpen, true, `${wd} deve estar Aberto`);
      assert.equal(normalized[wd].openTime, '08:00', `${wd} deve abrir às 08:00`);
      assert.equal(normalized[wd].closeTime, '18:00', `${wd} deve fechar às 18:00`);
      assert.equal(normalized[wd].formattedText, '08:00 às 18:00', `${wd} deve exibir 08:00 às 18:00`);
    }

    // Sábado: Aberto 08:00 às 12:00
    assert.equal(normalized.sab.isOpen, true, 'Sábado deve estar Aberto');
    assert.equal(normalized.sab.openTime, '08:00', 'Sábado deve abrir às 08:00');
    assert.equal(normalized.sab.closeTime, '12:00', 'Sábado deve fechar às 12:00');
    assert.equal(normalized.sab.formattedText, '08:00 às 12:00', 'Sábado deve exibir 08:00 às 12:00');

    // Domingo: Fechado
    assert.equal(normalized.dom.isOpen, false, 'Domingo deve estar Fechado');
    assert.equal(normalized.dom.formattedText, 'Fechado', 'Domingo deve exibir Fechado');
  });

  // 2. Loja aberta dentro do intervalo cadastrado
  test('2. Status em tempo real: Loja aberta dentro do horário cadastrado', () => {
    const schedule = {
      seg: { isOpen: true, openTime: '08:00', closeTime: '18:00' },
      sab: { isOpen: true, openTime: '08:00', closeTime: '12:00' },
      dom: { isOpen: false, openTime: '08:00', closeTime: '18:00' },
    };

    // Quarta-feira 14:30 em São Paulo (17:30 UTC)
    const midDayDate = new Date('2026-10-21T17:30:00Z');
    const status = calculateScheduleStatus(schedule, midDayDate);

    assert.equal(status.isOpen, true, 'Deve indicar Aberto às 14:30 de Quarta');
    assert.ok(status.text.includes('Aberto agora · Fecha às 18:00'), `Texto incorreto: ${status.text}`);
    assert.ok(status.badgeClass.includes('emerald'));
  });

  // 3. Loja fechada antes da abertura e após o fechamento
  test('3. Status em tempo real: Fechado antes da abertura e após fechamento', () => {
    const schedule = {
      seg: { isOpen: true, openTime: '08:00', closeTime: '18:00' },
      sab: { isOpen: true, openTime: '08:00', closeTime: '12:00' },
      dom: { isOpen: false, openTime: '08:00', closeTime: '18:00' },
    };

    // Quarta-feira 06:45 em São Paulo (09:45 UTC) - Antes da abertura
    const beforeOpen = new Date('2026-10-21T09:45:00Z');
    const statusBefore = calculateScheduleStatus(schedule, beforeOpen);
    assert.equal(statusBefore.isOpen, false, 'Deve indicar Fechado às 06:45');
    assert.ok(statusBefore.text.includes('Fechado agora · Abre às 08:00'), `Texto incorreto: ${statusBefore.text}`);

    // Quarta-feira 19:15 em São Paulo (22:15 UTC) - Após fechamento
    const afterClose = new Date('2026-10-21T22:15:00Z');
    const statusAfter = calculateScheduleStatus(schedule, afterClose);
    assert.equal(statusAfter.isOpen, false, 'Deve indicar Fechado às 19:15');
    assert.ok(statusAfter.text.includes('Fechado agora · Abre amanhã às 08:00'), `Texto incorreto: ${statusAfter.text}`);

    // Sábado 13:00 em São Paulo (16:00 UTC) - Fechou às 12:00, próximo dia é Segunda
    const satAfterClose = new Date('2026-10-24T16:00:00Z');
    const statusSatAfter = calculateScheduleStatus(schedule, satAfterClose);
    assert.equal(statusSatAfter.isOpen, false, 'Deve indicar Fechado às 13:00 no Sábado');
    assert.ok(statusSatAfter.text.includes('Abre seg às 08:00'), `Texto incorreto: ${statusSatAfter.text}`);
  });

  // 4. Mudança de dia da semana no fuso "America/Sao_Paulo"
  test('4. Fuso horário America/Sao_Paulo: Validação de transição de dia entre UTC e São Paulo', () => {
    // Domingo 22:30 em São Paulo (UTC-3) corresponde a Segunda-feira 01:30 UTC no dia seguinte
    const dateUtcNextDay = new Date('2026-10-19T01:30:00Z');
    const spTime = getSaoPauloTime(dateUtcNextDay);

    assert.equal(spTime.dayKey, 'dom', 'Deve resolver para Domingo em São Paulo');
    assert.equal(spTime.hour, 22, 'Hora deve ser 22 em São Paulo');
    assert.equal(spTime.minute, 30, 'Minuto deve ser 30');
    assert.equal(spTime.timeString, '22:30');

    // Quarta-feira 23:45 em São Paulo corresponde a Quinta 02:45 UTC
    const dateWedLate = new Date('2026-10-22T02:45:00Z');
    const spWed = getSaoPauloTime(dateWedLate);
    assert.equal(spWed.dayKey, 'qua', 'Deve resolver para Quarta-feira');
    assert.equal(spWed.hour, 23);
    assert.equal(spWed.minute, 45);
  });

  // 5. Independência entre listagem semanal e status do badge
  test('5. Separação de responsabilidades: Listagem semanal exibe horários cadastrados mesmo quando a loja está fechada', () => {
    const unaOticaSchedule = {
      dom: { isOpen: false, openTime: '08:00', closeTime: '18:00' },
      sab: { isOpen: true, openTime: '08:00', closeTime: '12:00' },
    };

    // Meia-noite de Terça (loja fechada)
    const midnightTue = new Date('2026-10-20T03:00:00Z');
    const status = calculateScheduleStatus(unaOticaSchedule, midnightTue);
    const weekly = normalizeSchedule(unaOticaSchedule);

    // O status diz fechado
    assert.equal(status.isOpen, false);

    // MAS a listagem semanal de Terça continua exibindo "08:00 às 18:00", não "Fechado"
    assert.equal(weekly.ter.isOpen, true);
    assert.equal(weekly.ter.formattedText, '08:00 às 18:00');
    // Apenas Domingo exibe "Fechado"
    assert.equal(weekly.dom.isOpen, false);
    assert.equal(weekly.dom.formattedText, 'Fechado');
  });

  // 6. Simulação do Painel Administrativo: Persistência completa dos 7 dias após edição
  test('6. Painel Administrativo: Edição de um único dia persiste todos os 7 dias estruturados', () => {
    // Começa com o payload atual do banco da Una Ótica
    const initialRaw = {
      dom: { isOpen: false, openTime: '08:00', closeTime: '18:00' },
      sab: { isOpen: true, openTime: '08:00', closeTime: '12:00' },
    };

    const normalizedCurrent = normalizeSchedule(initialRaw);

    // Simula a lógica do BlockConfigDrawer ao atualizar a Quarta-feira para fechar às 17:00
    const fullSched: Record<string, { isOpen: boolean; openTime: string; closeTime: string }> = {};
    for (const k of DAY_KEYS) {
      fullSched[k] = {
        isOpen: normalizedCurrent[k].isOpen,
        openTime: normalizedCurrent[k].openTime,
        closeTime: normalizedCurrent[k].closeTime,
      };
    }
    fullSched.qua = {
      ...fullSched.qua,
      closeTime: '17:00',
    };

    // Verifica que o payload resultante contém todas as 7 chaves
    assert.equal(Object.keys(fullSched).length, 7);
    assert.equal(fullSched.seg.isOpen, true);
    assert.equal(fullSched.seg.openTime, '08:00');
    assert.equal(fullSched.seg.closeTime, '18:00');

    assert.equal(fullSched.qua.isOpen, true);
    assert.equal(fullSched.qua.closeTime, '17:00');

    assert.equal(fullSched.sab.isOpen, true);
    assert.equal(fullSched.sab.closeTime, '12:00');

    assert.equal(fullSched.dom.isOpen, false);

    // Simula salvar no banco e recarregar
    const reloaded = normalizeSchedule(fullSched);
    assert.equal(reloaded.qua.formattedText, '08:00 às 17:00');
    assert.equal(reloaded.sab.formattedText, '08:00 às 12:00');
    assert.equal(reloaded.dom.formattedText, 'Fechado');
  });

  // 7. Isolamento de Tenants diferentes
  test('7. Multi-tenant: Isolamento absoluto entre configurações de estabelecimentos distintos', () => {
    const tenantUnaOtica = {
      sab: { isOpen: true, openTime: '08:00', closeTime: '12:00' },
      dom: { isOpen: false, openTime: '08:00', closeTime: '18:00' },
    };

    const tenantBarbeariaPrime = {
      seg: { isOpen: true, openTime: '09:00', closeTime: '20:00' },
      ter: { isOpen: true, openTime: '09:00', closeTime: '20:00' },
      qua: { isOpen: true, openTime: '09:00', closeTime: '20:00' },
      qui: { isOpen: true, openTime: '09:00', closeTime: '20:00' },
      sex: { isOpen: true, openTime: '09:00', closeTime: '21:00' },
      sab: { isOpen: true, openTime: '08:30', closeTime: '18:00' },
      dom: { isOpen: false, openTime: '09:00', closeTime: '18:00' },
    };

    const tenantRestaurante = {
      seg: { isOpen: false },
      ter: { isOpen: true, openTime: '11:30', closeTime: '23:00' },
      qua: { isOpen: true, openTime: '11:30', closeTime: '23:00' },
      qui: { isOpen: true, openTime: '11:30', closeTime: '23:00' },
      sex: { isOpen: true, openTime: '11:30', closeTime: '00:00' },
      sab: { isOpen: true, openTime: '11:30', closeTime: '00:00' },
      dom: { isOpen: true, openTime: '11:30', closeTime: '22:00' },
    };

    const normOtica = normalizeSchedule(tenantUnaOtica);
    const normBarbearia = normalizeSchedule(tenantBarbeariaPrime);
    const normRestaurante = normalizeSchedule(tenantRestaurante);

    // Una Ótica
    assert.equal(normOtica.seg.openTime, '08:00');
    assert.equal(normOtica.sab.closeTime, '12:00');

    // Barbearia
    assert.equal(normBarbearia.seg.openTime, '09:00');
    assert.equal(normBarbearia.sex.closeTime, '21:00');
    assert.equal(normBarbearia.sab.closeTime, '18:00');

    // Restaurante
    assert.equal(normRestaurante.seg.isOpen, false);
    assert.equal(normRestaurante.dom.isOpen, true);
    assert.equal(normRestaurante.dom.formattedText, '11:30 às 22:00');

    // Nenhuma contaminação cruzada
    assert.notEqual(normOtica.sab.formattedText, normBarbearia.sab.formattedText);
    assert.notEqual(normOtica.dom.isOpen, normRestaurante.dom.isOpen);
  });

  // 8. Retrocompatibilidade ampla com formatos legados e alternativos
  test('8. Retrocompatibilidade: Suporte a arrays, enabled/active, open/close e chaves em inglês', () => {
    // Array com chaves em inglês e enabled
    const legacyArray = [
      { day: 'monday', enabled: true, from: '07:30', to: '19:00' },
      { day: 'saturday', enabled: true, start: '08:00', end: '13:00' },
      { day: 'sunday', enabled: false },
    ];
    const normLegacyArray = normalizeSchedule(legacyArray);
    assert.equal(normLegacyArray.seg.formattedText, '07:30 às 19:00');
    assert.equal(normLegacyArray.sab.formattedText, '08:00 às 13:00');
    assert.equal(normLegacyArray.dom.isOpen, false);

    // Chaves open/close com boolean
    const legacyOpenClose = {
      seg: { open: true, openTime: '08:00', closeTime: '18:00' },
      dom: { open: false },
    };
    const normOpenClose = normalizeSchedule(legacyOpenClose);
    assert.equal(normOpenClose.seg.isOpen, true);
    assert.equal(normOpenClose.dom.isOpen, false);

    // Intervalos múltiplos (almoço/recesso)
    const splitSchedule = {
      seg: {
        isOpen: true,
        intervals: [
          { start: '08:00', end: '12:00' },
          { start: '13:30', end: '18:00' },
        ],
      },
    };
    const normSplit = normalizeSchedule(splitSchedule);
    assert.equal(normSplit.seg.formattedText, '08:00 às 12:00 e 13:30 às 18:00');
  });
});
