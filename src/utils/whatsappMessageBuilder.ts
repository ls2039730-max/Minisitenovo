import { Order, PAYMENT_METHOD_LABELS } from '../types/order.js';

/**
 * Builds the structured, human-readable WhatsApp order message
 */
export function buildWhatsAppOrderMessage(order: Order, tenantName: string): string {
  const lines: string[] = [];

  lines.push(`🛒 *NOVO PEDIDO #${order.orderNumber}*`);
  lines.push('');
  lines.push('👤 *CLIENTE*');
  lines.push(order.customerName);
  lines.push(`📱 ${order.customerPhone}`);
  if (order.customerEmail) {
    lines.push(`✉️ ${order.customerEmail}`);
  }
  lines.push('');

  lines.push('📦 *ITENS*');
  order.items.forEach((item) => {
    const itemTitle = item.variantName
      ? `${item.productName} (${item.variantName})`
      : item.productName;
    const unitPriceFormatted = `R$ ${item.unitPrice.toFixed(2).replace('.', ',')}`;
    const subtotalFormatted = `R$ ${item.subtotal.toFixed(2).replace('.', ',')}`;

    lines.push(`• ${item.quantity}x *${itemTitle}*`);
    lines.push(`  ${unitPriceFormatted} cada | Subtotal: ${subtotalFormatted}`);
  });
  lines.push('');

  lines.push('💰 *RESUMO*');
  lines.push(`Subtotal: R$ ${order.subtotal.toFixed(2).replace('.', ',')}`);
  if (order.fulfillmentType === 'delivery') {
    lines.push(
      order.deliveryFee === 0
        ? 'Entrega: GRÁTIS'
        : `Entrega: R$ ${order.deliveryFee.toFixed(2).replace('.', ',')}`
    );
  }
  lines.push(`*TOTAL: R$ ${order.total.toFixed(2).replace('.', ',')}*`);
  lines.push('');

  if (order.fulfillmentType === 'delivery' && order.deliveryAddress) {
    const addr = order.deliveryAddress;
    lines.push('🚚 *ENTREGA NO ENDEREÇO*');
    lines.push(`Rua: ${addr.street}, nº ${addr.number}`);
    if (addr.complement) lines.push(`Complemento: ${addr.complement}`);
    lines.push(`Bairro: ${addr.neighborhood}`);
    lines.push(`Cidade: ${addr.city}/${addr.state}`);
    lines.push(`CEP: ${addr.cep}`);
    if (addr.reference) lines.push(`Ponto de Referência: ${addr.reference}`);
  } else {
    lines.push('📍 *RETIRADA NO LOCAL*');
  }
  lines.push('');

  lines.push('💳 *FORMA DE PAGAMENTO*');
  const paymentLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod;
  lines.push(paymentLabel);
  if (order.paymentMethod === 'CASH' && order.changeFor) {
    lines.push(`Troco para: R$ ${order.changeFor.toFixed(2).replace('.', ',')}`);
  }
  lines.push('');

  if (order.notes && order.notes.trim()) {
    lines.push('📝 *OBSERVAÇÕES*');
    lines.push(order.notes.trim());
    lines.push('');
  }

  lines.push(`_Pedido online realizado em ${tenantName}_`);

  return lines.join('\n');
}

/**
 * Builds the wa.me URL with properly encoded message
 */
export function buildWhatsAppUrl(phoneNumber: string, message: string): string {
  const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
  const withCountryCode = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${withCountryCode}?text=${encodedText}`;
}
