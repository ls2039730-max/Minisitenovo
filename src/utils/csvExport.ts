import {
  UnifiedOrder,
  FinancialReportRow,
  PaymentMethodChartPoint,
  TablePerformancePoint,
  TopSellingProductPoint,
} from '../types/analytics';

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  if (str.includes(';') || str.includes('"') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsvFile(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const separator = ';'; // Standard Excel-friendly separator in pt-BR locale
  const csvLines = [
    headers.map(escapeCsvCell).join(separator),
    ...rows.map((row) => row.map(escapeCsvCell).join(separator)),
  ];
  // UTF-8 BOM for proper accent rendering in Excel/LibreOffice
  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDateTimePtBr(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso;
  }
}

function formatMoneyCsv(val: number | null | undefined): string {
  return Number(val || 0).toFixed(2).replace('.', ',');
}

export function exportUnifiedOrdersToCsv(orders: UnifiedOrder[], filenamePrefix = 'pedidos-filtrados'): void {
  const headers = [
    'Codigo do Pedido',
    'Data/Hora',
    'Cliente',
    'Telefone',
    'Modalidade',
    'Mesa',
    'Origem',
    'Itens Resumo',
    'Qtd Itens',
    'Subtotal (R$)',
    'Desconto (R$)',
    'Taxa de Entrega (R$)',
    'Taxa de Servico (R$)',
    'Total do Pedido (R$)',
    'Valor Pago (R$)',
    'Saldo Pendente (R$)',
    'Status Operacional',
    'Status do Pagamento',
    'Forma de Pagamento',
    'Data do Pagamento',
  ];

  const rows = orders.map((o) => [
    o.displayCode,
    formatDateTimePtBr(o.createdAt),
    o.customerName,
    o.customerPhone || '-',
    o.fulfillmentLabel,
    o.tableNumber ? `Mesa ${o.tableNumber}${o.tableName ? ` (${o.tableName})` : ''}` : '-',
    o.originLabel,
    o.items.map((it) => `${it.quantity}x ${it.productName}`).join(' | '),
    o.itemsCount,
    formatMoneyCsv(o.subtotal),
    formatMoneyCsv(o.discount),
    formatMoneyCsv(o.deliveryFee),
    formatMoneyCsv(o.serviceFee),
    formatMoneyCsv(o.total),
    formatMoneyCsv(o.paidAmount),
    formatMoneyCsv(o.pendingAmount),
    o.operationalStatusLabel,
    o.paymentStatusLabel,
    o.paymentMethodLabel,
    formatDateTimePtBr(o.paidAt),
  ]);

  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`${filenamePrefix}-${dateStamp}.csv`, headers, rows);
}

export function exportFinancialReportRowsToCsv(
  reportRows: FinancialReportRow[],
  mode: 'all' | 'paid' | 'pending' = 'all',
  filenamePrefix = 'relatorio-financeiro'
): void {
  const filtered = reportRows.filter((r) => {
    if (mode === 'paid') return r.paymentStatus === 'paid' || r.paidAmount > 0;
    if (mode === 'pending') return (r.paymentStatus === 'pending' || r.paymentStatus === 'partial') && r.pendingAmount > 0;
    return true;
  });

  const headers = [
    'Pedido',
    'Data/Hora',
    'Cliente',
    'Telefone',
    'Tipo de Atendimento',
    'Mesa',
    'Itens',
    'Subtotal (R$)',
    'Desconto (R$)',
    'Taxa de Entrega (R$)',
    'Taxa de Servico (R$)',
    'Total (R$)',
    'Valor Recebido (R$)',
    'Valor Pendente (R$)',
    'Forma de Pagamento',
    'Status do Pagamento',
    'Status do Pedido',
    'Data de Pagamento',
  ];

  const rows = filtered.map((r) => [
    r.displayCode || r.formattedOrderNumber,
    formatDateTimePtBr(r.createdAt),
    r.customerName,
    r.customerPhone || '-',
    r.fulfillmentLabel || r.fulfillmentType,
    r.tableLabel || (r.tableNumber ? `Mesa ${r.tableNumber}` : '-'),
    r.itemsSummary || r.items.map((it) => `${it.quantity}x ${it.productName}`).join('; '),
    formatMoneyCsv(r.subtotal),
    formatMoneyCsv(r.discount),
    formatMoneyCsv(r.deliveryFee),
    formatMoneyCsv(r.serviceFee),
    formatMoneyCsv(r.total),
    formatMoneyCsv(r.paidAmount),
    formatMoneyCsv(r.pendingAmount),
    r.paymentMethodLabel,
    r.paymentStatusLabel || r.paymentStatus,
    r.operationalStatusLabel,
    formatDateTimePtBr(r.paidAt),
  ]);

  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`${filenamePrefix}-${mode}-${dateStamp}.csv`, headers, rows);
}

export function exportRevenueByPaymentMethodToCsv(points: PaymentMethodChartPoint[]): void {
  const headers = ['Forma de Pagamento', 'Quantidade de Transacoes', 'Valor Confirmado (R$)', 'Participacao (%)'];
  const rows = points.map((p) => [
    p.label,
    p.transactionsCount,
    formatMoneyCsv(p.confirmedAmount),
    formatMoneyCsv(p.percentage),
  ]);
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`receita-por-forma-pagamento-${dateStamp}.csv`, headers, rows);
}

export function exportSalesByTableToCsv(points: TablePerformancePoint[]): void {
  const headers = [
    'Mesa',
    'Identificacao',
    'Contas Abertas',
    'Contas Fechadas no Periodo',
    'Pedidos no Periodo',
    'Faturamento Total (R$)',
    'Recebido Confirmado (R$)',
    'Saldo em Aberto (R$)',
    'Ticket Medio por Conta (R$)',
    'Tempo Medio Ocupacao (min)',
  ];
  const rows = points.map((t) => [
    `Mesa ${t.tableNumber}`,
    t.tableName || '-',
    t.openSessionsCount ?? '-',
    t.closedSessionsCount ?? t.sessionsCount,
    t.ordersCount,
    formatMoneyCsv(t.totalRevenue ?? t.revenue),
    formatMoneyCsv(t.confirmedRevenue ?? t.confirmedReceipts),
    formatMoneyCsv(t.pendingAmount),
    formatMoneyCsv(t.averageTicket),
    t.avgOccupationMinutes ?? '-',
  ]);
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`vendas-por-mesa-${dateStamp}.csv`, headers, rows);
}

export function exportTopProductsToCsv(points: TopSellingProductPoint[]): void {
  const headers = [
    'Posicao',
    'Produto',
    'Categoria',
    'Quantidade Vendida',
    'Pedidos com o Item',
    'Preco Medio Historico (R$)',
    'Receita Gerada (R$)',
    'Participacao na Receita (%)',
  ];
  const rows = points.map((p, idx) => [
    idx + 1,
    p.productName,
    p.categoryName || '-',
    p.quantitySold,
    p.ordersCount,
    formatMoneyCsv(p.averageHistoricalPrice ?? p.averageUnitPrice),
    formatMoneyCsv(p.totalRevenue ?? p.revenueGenerated),
    formatMoneyCsv(p.revenueSharePercentage ?? p.shareOfProductSales),
  ]);
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`produtos-mais-vendidos-${dateStamp}.csv`, headers, rows);
}
