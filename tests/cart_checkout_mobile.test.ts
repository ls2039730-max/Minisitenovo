import assert from 'node:assert/strict';
import {
  parsePrice,
  toSafePrice,
  resolveEffectivePrice,
  sanitizeQuantity,
  formatPriceBRL,
  formatCurrencyBRL,
} from '../src/utils/currency.js';
import {
  calculateItemSubtotal,
  calculateCartTotals,
  buildAuthoritativeCartItems,
} from '../src/utils/cartCalculator.js';
import { calculateDeliveryFee } from '../src/utils/deliveryFeeCalculator.js';
import { orderRepo } from '../server/db/orderRepository.js';
import { CartItemInput, DeliveryRule, DeliverySettings } from '../src/types/order.js';

async function runTests() {
  console.log('=== INICIANDO TESTES DO CARRINHO E CHECKOUT MOBILE ===\n');

  // ---------------------------------------------------------------------------
  // 1. Testes de Parsing Numérico, Preço Promocional e Sanitização
  // ---------------------------------------------------------------------------
  console.log('1. Testando conversão segura de preços e sanitização de quantidades...');

  assert.equal(parsePrice(89.99), 89.99);
  assert.equal(parsePrice('89.99'), 89.99);
  assert.equal(parsePrice('89,99'), 89.99);
  assert.equal(parsePrice('R$ 89,99'), 89.99);
  assert.equal(parsePrice('R$ 1.289,99'), 1289.99);
  assert.equal(parsePrice(NaN), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(undefined), null);
  assert.equal(parsePrice('invalid'), null);
  assert.equal(toSafePrice(NaN), 0);
  assert.equal(toSafePrice(null), 0);
  assert.equal(toSafePrice(undefined), 0);
  assert.equal(toSafePrice('invalid'), 0);

  // Promotional price resolution: Costelinha Suína Glaceada no Molho BBQ (110.99 -> 89.99)
  const promoResolved = resolveEffectivePrice(110.99, 89.99);
  assert.equal(promoResolved.unitPrice, 89.99);
  assert.equal(promoResolved.originalPrice, 110.99);
  assert.equal(promoResolved.hasDiscount, true);

  // Promotional price as formatted BRL strings
  const stringPromoResolved = resolveEffectivePrice('R$ 110,99', 'R$ 89,99');
  assert.equal(stringPromoResolved.unitPrice, 89.99);
  assert.equal(stringPromoResolved.originalPrice, 110.99);
  assert.equal(stringPromoResolved.hasDiscount, true);

  // Promotional price zero or null must NOT zero out the product price!
  const zeroPromoResolved = resolveEffectivePrice(89.99, 0);
  assert.equal(zeroPromoResolved.unitPrice, 89.99);
  assert.equal(zeroPromoResolved.hasDiscount, false);

  const nullPromoResolved = resolveEffectivePrice(89.99, null);
  assert.equal(nullPromoResolved.unitPrice, 89.99);
  assert.equal(nullPromoResolved.hasDiscount, false);

  // Quantity sanitization
  assert.equal(sanitizeQuantity(1), 1);
  assert.equal(sanitizeQuantity('2'), 2);
  assert.equal(sanitizeQuantity(NaN), 1);
  assert.equal(sanitizeQuantity(null), 1);
  assert.equal(sanitizeQuantity(-5), 1);
  assert.equal(sanitizeQuantity(150), 99);
  console.log('   OK: Conversões numéricas, preços promocionais e sanitização validados.');

  // ---------------------------------------------------------------------------
  // 2. Cenários Obrigatórios de Cálculo (Testes A, B, C, D, E)
  // ---------------------------------------------------------------------------
  console.log('\n2. Executando cenários obrigatórios de cálculo (Testes A, B, C, D, E)...');

  const costelinhaId = '438cb315-8187-4369-92ab-ecaa94286037';
  const bebidaId = 'item-20-reais';

  // TESTE A: 1 produto a R$ 89,99 -> Subtotal: R$ 89,99, Total: R$ 89,99 (frete 0)
  {
    const localCartA: CartItemInput[] = [
      {
        productId: costelinhaId,
        variantId: null,
        quantity: 1,
        productName: 'Costelinha Suína Glaceada no Molho BBQ',
        unitPrice: 89.99,
        originalPrice: 110.99,
        hasDiscount: true,
      },
    ];
    const itemsA = buildAuthoritativeCartItems(localCartA, null);
    const totalsA = calculateCartTotals(itemsA, 0, 0);

    assert.equal(itemsA.length, 1);
    assert.equal(itemsA[0].unitPrice, 89.99);
    assert.equal(itemsA[0].originalPrice, 110.99);
    assert.equal(itemsA[0].hasDiscount, true);
    assert.equal(itemsA[0].subtotal, 89.99);
    assert.equal(totalsA.subtotal, 89.99);
    assert.equal(totalsA.total, 89.99);
    assert.equal(formatCurrencyBRL(totalsA.subtotal), 'R$ 89,99');
    assert.equal(formatCurrencyBRL(totalsA.total), 'R$ 89,99');
    console.log('   [PASS] Teste A: 1x R$ 89,99 -> Subtotal R$ 89,99 | Total R$ 89,99');
  }

  // TESTE B: 2 unidades do mesmo produto a R$ 89,99 -> Subtotal: R$ 179,98, Total: R$ 179,98 (frete 0)
  {
    const localCartB: CartItemInput[] = [
      {
        productId: costelinhaId,
        variantId: null,
        quantity: 2,
        productName: 'Costelinha Suína Glaceada no Molho BBQ',
        unitPrice: 89.99,
        originalPrice: 110.99,
        hasDiscount: true,
      },
    ];
    const itemsB = buildAuthoritativeCartItems(localCartB, null);
    const totalsB = calculateCartTotals(itemsB, 0, 0);

    assert.equal(itemsB[0].quantity, 2);
    assert.equal(itemsB[0].subtotal, 179.98);
    assert.equal(totalsB.subtotal, 179.98);
    assert.equal(totalsB.total, 179.98);
    assert.equal(formatCurrencyBRL(totalsB.subtotal), 'R$ 179,98');
    assert.equal(formatCurrencyBRL(totalsB.total), 'R$ 179,98');
    console.log('   [PASS] Teste B: 2x R$ 89,99 -> Subtotal R$ 179,98 | Total R$ 179,98');
  }

  // TESTE C: Um produto de R$ 89,99 e outro de R$ 20,00 -> Subtotal: R$ 109,99 + frete
  {
    const localCartC: CartItemInput[] = [
      {
        productId: costelinhaId,
        variantId: null,
        quantity: 1,
        productName: 'Costelinha Suína Glaceada no Molho BBQ',
        unitPrice: 89.99,
        originalPrice: 110.99,
        hasDiscount: true,
      },
      {
        productId: bebidaId,
        variantId: null,
        quantity: 1,
        productName: 'Acompanhamento Especial',
        unitPrice: 20.0,
        originalPrice: null,
        hasDiscount: false,
      },
    ];
    const itemsC = buildAuthoritativeCartItems(localCartC, null);
    const mockSettings: DeliverySettings = {
      tenantId: 't1',
      ordersEnabled: true,
      acceptOrdersWhenClosed: true,
      pickupEnabled: true,
      deliveryEnabled: true,
      minimumOrder: 0,
      freeDeliveryAbove: 150,
      pickupInstructions: '',
      deliveryEstimateText: '40 min',
      orderWhatsappNumber: null,
      createdAt: '',
      updatedAt: '',
    };
    const mockRules: DeliveryRule[] = [
      {
        id: 'r1',
        tenantId: 't1',
        type: 'fixed',
        name: 'Taxa Fixa',
        neighborhood: null,
        cepStart: null,
        cepEnd: null,
        fee: 10.0,
        minimumOrder: null,
        isActive: true,
        position: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const deliveryCalc = calculateDeliveryFee(109.99, { cep: '28000000', neighborhood: 'Centro' }, mockSettings, mockRules);
    assert.equal(deliveryCalc.isCovered, true);
    assert.equal(deliveryCalc.fee, 10.0);

    const totalsCWithDelivery = calculateCartTotals(itemsC, deliveryCalc.fee, 0);
    assert.equal(totalsCWithDelivery.subtotal, 109.99);
    assert.equal(totalsCWithDelivery.deliveryFee, 10.0);
    assert.equal(totalsCWithDelivery.total, 119.99);
    assert.equal(formatCurrencyBRL(totalsCWithDelivery.subtotal), 'R$ 109,99');
    assert.equal(formatCurrencyBRL(totalsCWithDelivery.total), 'R$ 119,99');
    console.log('   [PASS] Teste C: R$ 89,99 + R$ 20,00 -> Subtotal R$ 109,99 | Com Frete (R$ 10,00): R$ 119,99');
  }

  // TESTE D: Alterar quantidade de 1 para 2 e depois voltar para 1 -> Atualização imediata sem divergências
  {
    // Simulate server validatedData still holding quantity=1 while user clicks + (to 2) and - (back to 1)
    const serverValidatedSnapshot = [
      {
        id: `${costelinhaId}_base`,
        productId: costelinhaId,
        variantId: null,
        productName: 'Costelinha Suína Glaceada no Molho BBQ',
        variantName: null,
        imageUrl: null,
        unitPrice: 89.99,
        originalPrice: 110.99,
        hasDiscount: true,
        quantity: 1,
        subtotal: 89.99,
        maxAvailableQuantity: 99,
      },
    ];

    // Step 1: Qty = 1
    let localItems: CartItemInput[] = [{ productId: costelinhaId, variantId: null, quantity: 1 }];
    let display = buildAuthoritativeCartItems(localItems, serverValidatedSnapshot);
    let totals = calculateCartTotals(display, 0, 0);
    assert.equal(display[0].quantity, 1);
    assert.equal(display[0].subtotal, 89.99);
    assert.equal(totals.subtotal, 89.99);
    assert.equal(totals.total, 89.99);

    // Step 2: User taps + -> Qty = 2 (before server responds, serverValidatedSnapshot still has quantity: 1!)
    localItems = [{ productId: costelinhaId, variantId: null, quantity: 2 }];
    display = buildAuthoritativeCartItems(localItems, serverValidatedSnapshot);
    totals = calculateCartTotals(display, 0, 0);
    assert.equal(display[0].quantity, 2);
    assert.equal(display[0].subtotal, 179.98);
    assert.equal(totals.subtotal, 179.98);
    assert.equal(totals.total, 179.98);

    // Step 3: User taps - -> Qty = 1
    localItems = [{ productId: costelinhaId, variantId: null, quantity: 1 }];
    display = buildAuthoritativeCartItems(localItems, serverValidatedSnapshot);
    totals = calculateCartTotals(display, 0, 0);
    assert.equal(display[0].quantity, 1);
    assert.equal(display[0].subtotal, 89.99);
    assert.equal(totals.subtotal, 89.99);
    assert.equal(totals.total, 89.99);
    console.log('   [PASS] Teste D: Alterar quantidade 1 -> 2 -> 1 atualiza item, subtotal e total imediatamente sem divergência.');
  }

  // TESTE E: Adicionar produto, fechar carrinho, persistir em JSON (localStorage), reabrir e validar no backend real
  {
    const initialCart: CartItemInput[] = [
      {
        productId: costelinhaId,
        variantId: null,
        quantity: 1,
        productName: 'Costelinha Suína Glaceada no Molho BBQ & Whiskey',
        unitPrice: 89.99,
        originalPrice: 110.99,
        hasDiscount: true,
      },
    ];

    // Simulate localStorage serialization & deserialization across drawer close/reopen or page reload
    const serialized = JSON.stringify(initialCart);
    const restored: CartItemInput[] = JSON.parse(serialized);

    // Immediate client calculation before server roundtrip finishes
    const immediateDisplay = buildAuthoritativeCartItems(restored, null);
    const immediateTotals = calculateCartTotals(immediateDisplay, 0, 0);
    assert.equal(immediateTotals.subtotal, 89.99);
    assert.equal(immediateTotals.total, 89.99);
    assert.notEqual(immediateTotals.subtotal, 0, 'Subtotal Jamais pode ser R$ 0,00 com item válido');

    // Now validate against real database for tenant 'costela-mania'
    const serverValidated = await orderRepo.validateCart('costela-mania', restored);
    assert.equal(serverValidated.items.length, 1);
    assert.equal(serverValidated.items[0].productId, costelinhaId);
    assert.equal(serverValidated.items[0].unitPrice, 89.99);
    assert.equal(serverValidated.items[0].originalPrice, 110.99);
    assert.equal(serverValidated.items[0].hasDiscount, true);
    assert.equal(serverValidated.items[0].subtotal, 89.99);
    assert.equal(serverValidated.subtotal, 89.99);

    // Merge serverValidated with restored items
    const afterRevalidateDisplay = buildAuthoritativeCartItems(restored, serverValidated.items);
    const afterRevalidateTotals = calculateCartTotals(afterRevalidateDisplay, 0, 0);
    assert.equal(afterRevalidateTotals.subtotal, 89.99);
    assert.equal(afterRevalidateTotals.total, 89.99);

    // Also test real order creation + idempotency + WhatsApp URL generation (and clean up test order)
    const testIdempotencyKey = `test_checkout_e_${Date.now()}`;
    const created = await orderRepo.createOrder(
      'costela-mania',
      {
        items: [{ productId: costelinhaId, variantId: null, quantity: 1 }],
        customerName: 'Cliente Teste Mobile',
        customerPhone: '22999990000',
        fulfillmentType: 'pickup',
        paymentMethod: 'PIX',
        notes: 'Pedido de teste automatizado (será removido imediatamente)',
        idempotencyKey: testIdempotencyKey,
      },
      '127.0.0.1'
    );

    assert.ok(created.order.id);
    assert.equal(created.order.subtotal, 89.99);
    assert.equal(created.order.total, 89.99);
    assert.equal(created.order.items[0].unitPrice, 89.99);
    assert.equal(created.order.items[0].subtotal, 89.99);
    assert.ok(created.whatsappUrl.startsWith('https://wa.me/'));
    assert.ok(created.message.includes('89,99'));

    // Verify duplicate tap idempotency returns the exact same order without duplicating
    const duplicateAttempt = await orderRepo.createOrder(
      'costela-mania',
      {
        items: [{ productId: costelinhaId, variantId: null, quantity: 1 }],
        customerName: 'Cliente Teste Mobile',
        customerPhone: '22999990000',
        fulfillmentType: 'pickup',
        paymentMethod: 'PIX',
        idempotencyKey: testIdempotencyKey,
      },
      '127.0.0.1'
    );
    assert.equal(duplicateAttempt.order.id, created.order.id);

    // Clean up test order from database so production tenant data remains spotless
    await orderRepo.deleteOrder(serverValidated.tenant.id, created.order.id, {
      id: 'system-test',
      name: 'Automated Test Cleanup',
      email: 'test@localhub.com',
      role: 'SUPER_ADMIN',
    } as any);

    console.log('   [PASS] Teste E: Persistência, reabertura, validação real no backend, idempotência e geração de link WhatsApp validados com sucesso.');
  }

  console.log('\n=== TODOS OS TESTES DO CARRINHO E CHECKOUT MOBILE PASSARAM COM 100% DE SUCESSO ===');
}

runTests().catch((err) => {
  console.error('FALHA NOS TESTES:', err);
  process.exit(1);
});
