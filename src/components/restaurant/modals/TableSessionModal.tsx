import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Loader2,
  Clock,
  Utensils,
  Receipt,
  CheckCircle,
  AlertTriangle,
  FileText,
  Trash2,
  Plus,
  Percent,
  CreditCard,
  DollarSign,
  Wallet,
  Coins,
  QrCode,
  Bell,
  Tag,
  Split,
} from 'lucide-react';
import {
  RestaurantTable,
  RestaurantSession,
  RestaurantOrder,
  RestaurantFeeTemplate,
  RESTAURANT_STATUS_LABELS,
  RESTAURANT_STATUS_COLORS,
} from '../../../types/restaurant';
import { EnrichedRestaurantTable, PAYMENT_STATUS_LABELS, OrderPaymentRecord } from '../../../types/analytics';
import { api } from '../../../services/api';
import { useBackHandler } from '../../../services/navigationManager';

interface TableSessionModalProps {
  isOpen: boolean;
  table: (RestaurantTable & Partial<EnrichedRestaurantTable>) | null;
  onClose: () => void;
  onSessionClosed: () => void;
}

const PAYMENT_METHODS = [
  { id: 'PIX', label: 'PIX', icon: QrCode },
  { id: 'Cartão de Crédito', label: 'Crédito', icon: CreditCard },
  { id: 'Cartão de Débito', label: 'Débito', icon: CreditCard },
  { id: 'Dinheiro', label: 'Dinheiro', icon: Coins },
  { id: 'Vale Refeição', label: 'VR / Ticket', icon: Wallet },
  { id: 'Outro', label: 'Outro', icon: DollarSign },
];

export const TableSessionModal: React.FC<TableSessionModalProps> = ({
  isOpen,
  table,
  onClose,
  onSessionClosed,
}) => {
  const [session, setSession] = useState<RestaurantSession | null>(null);
  const [enrichedTable, setEnrichedTable] = useState<EnrichedRestaurantTable | null>(null);
  const [feeTemplates, setFeeTemplates] = useState<RestaurantFeeTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancellingClosing, setCancellingClosing] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [error, setError] = useState<string | null>(null);

  // Add Custom Fee Form State
  const [addCustomFeeOpen, setAddCustomFeeOpen] = useState(false);
  const [customFeeName, setCustomFeeName] = useState('');
  const [customFeeType, setCustomFeeType] = useState<'percentage' | 'fixed'>('percentage');
  const [customFeeValue, setCustomFeeValue] = useState('');
  const [addingFee, setAddingFee] = useState(false);

  // Partial Payment / Split Bill & Discount State
  const [discountInput, setDiscountInput] = useState('');
  const [partialAmountInput, setPartialAmountInput] = useState('');
  const [partialMethodInput, setPartialMethodInput] = useState('PIX');
  const [partialNotesInput, setPartialNotesInput] = useState('');
  const [savingFinancials, setSavingFinancials] = useState(false);
  const [splitPeopleCount, setSplitPeopleCount] = useState<number>(2);

  useBackHandler({
    isOpen: confirmCloseOpen,
    onClose: () => setConfirmCloseOpen(false),
    priority: 35,
    name: 'TableSessionConfirmClose',
  });

  useBackHandler({
    isOpen: addCustomFeeOpen,
    onClose: () => setAddCustomFeeOpen(false),
    priority: 30,
    name: 'TableSessionAddFee',
  });

  useBackHandler({
    isOpen: !!cancellingOrderId,
    onClose: () => setCancellingOrderId(null),
    priority: 30,
    name: 'TableSessionCancelOrderPrompt',
  });

  useBackHandler({
    isOpen: isOpen,
    onClose: () => {
      if (!closing && !cancellingClosing) {
        onClose();
      }
    },
    priority: 20,
    name: 'TableSessionModalRoot',
  });

  const loadSession = useCallback(async () => {
    if (!table) return;
    try {
      setLoading(true);
      setError(null);
      const [sessionData, templates, overviewData] = await Promise.all([
        api.getTableSession(table.id),
        api.getRestaurantFeeTemplates().catch(() => []),
        api.getEnrichedTablesOverview().catch(() => null),
      ]);
      setSession(sessionData);
      setFeeTemplates(templates);
      if (overviewData?.tables) {
        const found = overviewData.tables.find((t: EnrichedRestaurantTable) => t.id === table.id) || null;
        setEnrichedTable(found);
        if (found) {
          setDiscountInput(
            found.currentSessionDiscount > 0
              ? found.currentSessionDiscount.toFixed(2).replace('.', ',')
              : ''
          );
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar comanda da mesa.');
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => {
    if (isOpen && table) {
      loadSession();
      setConfirmCloseOpen(false);
      setCancellingOrderId(null);
      setCancelReason('');
      setAddCustomFeeOpen(false);
    }
  }, [isOpen, table, loadSession]);

  if (!isOpen || !table) return null;

  const handleCancelOrder = async (orderId: string) => {
    if (!cancelReason.trim()) {
      alert('Informe o motivo do cancelamento.');
      return;
    }
    try {
      setLoading(true);
      await api.cancelRestaurantOrder(orderId, cancelReason.trim());
      setCancellingOrderId(null);
      setCancelReason('');
      await loadSession();
      onSessionClosed();
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar pedido.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSession = async () => {
    try {
      setClosing(true);
      setError(null);
      await api.closeTableSession(table.id, closeNotes.trim() || undefined, paymentMethod);
      onSessionClosed();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao fechar conta da mesa.');
    } finally {
      setClosing(false);
    }
  };

  const handleCancelClosing = async () => {
    try {
      setCancellingClosing(true);
      await api.cancelTableClosing(table.id);
      await loadSession();
      onSessionClosed();
    } catch (err: any) {
      alert(err.message || 'Erro ao reabrir comanda.');
    } finally {
      setCancellingClosing(false);
    }
  };

  const handleAddFeeFromTemplate = async (template: RestaurantFeeTemplate) => {
    if (!session) return;
    try {
      setAddingFee(true);
      await api.addSessionFee(session.id, {
        feeTemplateId: template.id,
        name: template.name,
        description: template.description || undefined,
        type: template.type,
        rateOrAmount: template.value,
      });
      await loadSession();
      onSessionClosed();
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar taxa à comanda.');
    } finally {
      setAddingFee(false);
    }
  };

  const handleAddCustomFeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !customFeeName.trim()) {
      alert('Informe o nome da taxa.');
      return;
    }
    const val = parseFloat(customFeeValue.replace(',', '.'));
    if (isNaN(val) || val < 0) {
      alert('Informe um valor ou percentual válido.');
      return;
    }
    try {
      setAddingFee(true);
      await api.addSessionFee(session.id, {
        name: customFeeName.trim(),
        type: customFeeType,
        rateOrAmount: val,
      });
      setAddCustomFeeOpen(false);
      setCustomFeeName('');
      setCustomFeeValue('');
      await loadSession();
      onSessionClosed();
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar taxa.');
    } finally {
      setAddingFee(false);
    }
  };

  const handleRemoveFee = async (feeId: string) => {
    if (!session) return;
    try {
      setLoading(true);
      await api.removeSessionFee(session.id, feeId);
      await loadSession();
      onSessionClosed();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover taxa.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyDiscount = async () => {
    if (!session) return;
    const val = parseFloat(discountInput.replace(',', '.')) || 0;
    if (val < 0) return;
    try {
      setSavingFinancials(true);
      await api.updateSessionFinancials(session.id, { discount: val });
      await loadSession();
      onSessionClosed();
    } catch (err: any) {
      alert(err.message || 'Erro ao aplicar desconto na comanda.');
    } finally {
      setSavingFinancials(false);
    }
  };

  const handleAddPartialPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const amount = parseFloat(partialAmountInput.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      alert('Informe um valor válido maior que zero para registrar o pagamento.');
      return;
    }
    try {
      setSavingFinancials(true);
      await api.updateSessionFinancials(session.id, {
        addPayment: {
          amount,
          paymentMethod: partialMethodInput,
          notes: partialNotesInput.trim() || undefined,
        },
      });
      setPartialAmountInput('');
      setPartialNotesInput('');
      await loadSession();
      onSessionClosed();
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar pagamento na mesa.');
    } finally {
      setSavingFinancials(false);
    }
  };

  const handleRemoveSessionPayment = async (paymentId: string) => {
    if (!session) return;
    try {
      setSavingFinancials(true);
      await api.updateSessionFinancials(session.id, { removePaymentId: paymentId });
      await loadSession();
      onSessionClosed();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover pagamento.');
    } finally {
      setSavingFinancials(false);
    }
  };

  const orders = session?.orders || [];
  const validOrders = orders.filter((o) => o.status !== 'cancelled');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');

  const ordersSubtotal =
    session?.ordersSubtotal !== undefined
      ? session.ordersSubtotal
      : validOrders.reduce((sum, o) => sum + o.total, 0);

  const sessionFees = session?.fees || [];
  const feesTotal =
    session?.feesTotal !== undefined
      ? session.feesTotal
      : sessionFees.reduce((sum, f) => sum + f.calculatedAmount, 0);

  const sessionDiscount = enrichedTable?.currentSessionDiscount || 0;
  const grandTotal = Math.max(0, Math.round((ordersSubtotal + feesTotal - sessionDiscount) * 100) / 100);
  const confirmedPaidAmount = enrichedTable?.currentSessionPaidAmount || 0;
  const pendingBalance = Math.max(0, Math.round((grandTotal - confirmedPaidAmount) * 100) / 100);
  const registeredPayments: OrderPaymentRecord[] = enrichedTable?.currentSessionPayments || [];
  const occupationMinutes = enrichedTable?.occupationMinutes || 0;

  const isClosingRequested = Boolean(session?.closingRequestedAt) || table.status === 'closing';

  const appliedFeeNames = new Set(sessionFees.map((f) => f.name.toLowerCase().trim()));
  const availableTemplates = feeTemplates.filter(
    (t) => t.isActive && !appliedFeeNames.has(t.name.toLowerCase().trim())
  );

  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}min`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black text-base border border-amber-500/20 shadow-xs">
              {table.tableNumber}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-900">
                  Comanda da Mesa {table.tableNumber}
                </h3>
                {table.name && (
                  <span className="text-xs bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                    {table.name}
                  </span>
                )}
                {enrichedTable?.visualStateLabel && (
                  <span className="text-[11px] font-extrabold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                    {enrichedTable.visualStateLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-3 mt-0.5 flex-wrap">
                {session?.openedAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Aberta às{' '}
                    {new Date(session.openedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {occupationMinutes > 0 && (
                      <strong className="text-slate-700 ml-1">
                        ({formatDuration(occupationMinutes)} de ocupação)
                      </strong>
                    )}
                  </span>
                )}
                {session?.sessionCode && (
                  <span className="font-mono text-[10px] text-slate-400">
                    ({session.sessionCode})
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* ALERT: Client requested closing notice */}
          {isClosingRequested && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell className="w-4 h-4 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-950 flex items-center gap-2">
                    <span>Esta mesa solicitou o fechamento da conta</span>
                    {session?.closingRequestedAt && (
                      <span className="text-[11px] font-normal text-amber-800">
                        (
                        {new Date(session.closingRequestedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        )
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                    O cliente conferiu a comanda e aguarda o fechamento e pagamento.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancelClosing}
                disabled={cancellingClosing}
                className="text-[11px] font-bold text-amber-900 hover:text-amber-950 underline shrink-0 cursor-pointer"
              >
                {cancellingClosing ? 'Reabrindo...' : 'Reabrir comanda'}
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
              <p className="text-xs">Carregando comanda, pedidos e pagamentos...</p>
            </div>
          ) : !session ? (
            <div className="py-12 text-center text-slate-400">
              <Receipt className="w-12 h-12 stroke-[1.5] mx-auto mb-3 opacity-40 text-slate-400" />
              <h4 className="text-sm font-bold text-slate-700 mb-1">Mesa Livre (Sem comanda aberta)</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Esta mesa está livre no momento. Assim que o cliente ou atendente enviar o primeiro pedido via QR Code, a conta será iniciada automaticamente.
              </p>
            </div>
          ) : (
            <>
              {/* Financial Differentiation Banner: Open Total vs Confirmed Paid vs Pending Balance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    Total Acumulado da Conta
                  </span>
                  <div className="text-2xl font-black mt-0.5">
                    R$ {grandTotal.toFixed(2).replace('.', ',')}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    Itens: R$ {ordersSubtotal.toFixed(2).replace('.', ',')}
                    {feesTotal > 0 ? ` • Taxas: +R$ ${feesTotal.toFixed(2).replace('.', ',')}` : ''}
                    {sessionDiscount > 0
                      ? ` • Desc: -R$ ${sessionDiscount.toFixed(2).replace('.', ',')}`
                      : ''}
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-700 block">
                    Dinheiro Já Recebido
                  </span>
                  <div className="text-2xl font-black text-emerald-900 mt-0.5">
                    R$ {confirmedPaidAmount.toFixed(2).replace('.', ',')}
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-1 font-semibold">
                    {registeredPayments.length}{' '}
                    {registeredPayments.length === 1 ? 'pagamento lançado' : 'pagamentos lançados'}
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border shadow-xs ${
                    pendingBalance > 0
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-emerald-50 border-emerald-300'
                  }`}
                >
                  <span
                    className={`text-[10px] uppercase font-extrabold tracking-wider block ${
                      pendingBalance > 0 ? 'text-amber-800' : 'text-emerald-800'
                    }`}
                  >
                    Saldo Pendente a Receber
                  </span>
                  <div
                    className={`text-2xl font-black mt-0.5 ${
                      pendingBalance > 0 ? 'text-amber-950' : 'text-emerald-900'
                    }`}
                  >
                    R$ {pendingBalance.toFixed(2).replace('.', ',')}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1 font-semibold">
                    Situação:{' '}
                    <strong>
                      {PAYMENT_STATUS_LABELS[
                        enrichedTable?.currentSessionPaymentStatus || 'pending'
                      ]}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Partial Payments / Bill Split & Discount Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Register Partial Payment / Split Bill */}
                <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Split className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Pagamentos Parciais & Divisão de Conta</span>
                    </h4>
                  </div>

                  {/* Quick Split Calculator */}
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-600 font-semibold">Dividir por:</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={splitPeopleCount}
                        onChange={(e) =>
                          setSplitPeopleCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        className="w-12 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                      />
                      <span className="text-[11px] text-slate-500">pessoas</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const share = Math.round((grandTotal / splitPeopleCount) * 100) / 100;
                        setPartialAmountInput(share.toFixed(2).replace('.', ','));
                        setPartialNotesInput(`Divisão 1/${splitPeopleCount}`);
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                    >
                      R$ {(grandTotal / Math.max(1, splitPeopleCount)).toFixed(2).replace('.', ',')} / pessoa (usar valor)
                    </button>
                  </div>

                  <form onSubmit={handleAddPartialPayment} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={partialAmountInput}
                        onChange={(e) => setPartialAmountInput(e.target.value)}
                        placeholder="Valor pago (ex: 50,00)"
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                      />
                      <select
                        value={partialMethodInput}
                        onChange={(e) => setPartialMethodInput(e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={partialNotesInput}
                        onChange={(e) => setPartialNotesInput(e.target.value)}
                        placeholder="Obs (ex: Cliente 1, Parte em PIX)"
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      />
                      <button
                        type="submit"
                        disabled={savingFinancials}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Registrar Pago</span>
                      </button>
                    </div>
                  </form>

                  {/* List of Registered Payments */}
                  {registeredPayments.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5 max-h-32 overflow-y-auto">
                      {registeredPayments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between px-2.5 py-1.5 bg-emerald-50/70 border border-emerald-200/70 rounded-lg text-[11px]"
                        >
                          <div>
                            <strong className="text-emerald-900">
                              R$ {p.amount.toFixed(2).replace('.', ',')}
                            </strong>{' '}
                            <span className="text-emerald-700">({p.paymentMethodLabel})</span>
                            {p.notes && <span className="text-slate-500"> • {p.notes}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">
                              {new Date(p.paidAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSessionPayment(p.id)}
                              className="text-rose-500 hover:text-rose-700 cursor-pointer"
                              title="Estornar pagamento"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Taxas Adicionais & Desconto da Comanda */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Taxas e Descontos da Conta</span>
                    </h4>
                  </div>

                  {/* Discount Input */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Desconto na Comanda (R$)
                      </label>
                      <input
                        type="text"
                        value={discountInput}
                        onChange={(e) => setDiscountInput(e.target.value)}
                        placeholder="0,00"
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={savingFinancials}
                      onClick={handleApplyDiscount}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Aplicar Desconto
                    </button>
                  </div>

                  {/* Applied Fees */}
                  {sessionFees.length > 0 && (
                    <div className="space-y-1.5">
                      {sessionFees.map((fee) => (
                        <div
                          key={fee.id}
                          className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-xl"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{fee.name}</span>
                            <span className="text-[10px] text-indigo-600 ml-1.5">
                              ({fee.type === 'percentage' ? `${fee.rateOrAmount}%` : 'Fixo'})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900">
                              + R$ {fee.calculatedAmount.toFixed(2).replace('.', ',')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveFee(fee.id)}
                              className="text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Add Buttons from Templates */}
                  <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 mr-1">+ Taxa:</span>
                    {availableTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleAddFeeFromTemplate(t)}
                        disabled={addingFee}
                        className="px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3 text-indigo-600" />
                        <span>
                          {t.name} ({t.type === 'percentage' ? `${t.value}%` : `R$ ${t.value.toFixed(2)}`})
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAddCustomFeeOpen(!addCustomFeeOpen)}
                      className="px-2 py-1 bg-slate-200/80 hover:bg-slate-300 text-slate-700 rounded-lg text-[11px] font-bold cursor-pointer"
                    >
                      + Personalizada
                    </button>
                  </div>

                  {addCustomFeeOpen && (
                    <form
                      onSubmit={handleAddCustomFeeSubmit}
                      className="p-2.5 bg-white border border-indigo-200 rounded-xl space-y-2"
                    >
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="text"
                          value={customFeeName}
                          onChange={(e) => setCustomFeeName(e.target.value)}
                          placeholder="Nome (ex: Couvert)"
                          required
                          className="col-span-2 px-2 py-1 border border-slate-200 rounded-lg text-xs"
                        />
                        <select
                          value={customFeeType}
                          onChange={(e) => setCustomFeeType(e.target.value as any)}
                          className="px-1.5 py-1 border border-slate-200 rounded-lg text-xs bg-white"
                        >
                          <option value="percentage">%</option>
                          <option value="fixed">R$</option>
                        </select>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={customFeeValue}
                          onChange={(e) => setCustomFeeValue(e.target.value)}
                          placeholder="Valor"
                          required
                          className="flex-1 px-2 py-1 border border-slate-200 rounded-lg text-xs"
                        />
                        <button
                          type="submit"
                          disabled={addingFee}
                          className="px-3 py-1 bg-indigo-600 text-white font-bold text-xs rounded-lg cursor-pointer"
                        >
                          Adicionar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              {/* Orders Linked to this Session */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Utensils className="w-3.5 h-3.5" />
                    Pedidos Vinculados à Conta ({orders.length})
                  </h4>
                  <span className="text-xs text-slate-500 font-semibold">
                    Subtotal Itens: R$ {ordersSubtotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>

                {orders.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs">Nenhum pedido lançado nesta comanda até o momento.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((order: RestaurantOrder) => {
                      const isCancelled = order.status === 'cancelled';
                      const statusStyle = RESTAURANT_STATUS_COLORS[order.status] || {
                        bg: 'bg-slate-50',
                        text: 'text-slate-700',
                        border: 'border-slate-200',
                        dot: 'bg-slate-400',
                      };

                      return (
                        <div
                          key={order.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            isCancelled
                              ? 'bg-slate-50 border-slate-200 opacity-60'
                              : 'bg-white border-slate-200 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">
                                Pedido #{order.orderNumber}
                              </span>
                              {order.customerName && (
                                <span className="text-xs text-slate-500">
                                  por <u>{order.customerName}</u>
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400">
                                {new Date(order.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                {RESTAURANT_STATUS_LABELS[order.status] || order.status}
                              </span>

                              {!isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancellingOrderId(order.id);
                                    setCancelReason('');
                                  }}
                                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              )}
                            </div>
                          </div>

                          {cancellingOrderId === order.id && (
                            <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                              <div className="text-xs font-bold text-rose-800">
                                Justificativa de cancelamento do Pedido #{order.orderNumber}:
                              </div>
                              <input
                                type="text"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Ex: Cliente desistiu, item esgotado..."
                                className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs"
                              />
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setCancellingOrderId(null)}
                                  className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200/60 rounded-md cursor-pointer"
                                >
                                  Voltar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelOrder(order.id)}
                                  className="px-3 py-1 bg-rose-600 text-white font-bold text-xs rounded-md hover:bg-rose-700 cursor-pointer"
                                >
                                  Confirmar Cancelamento
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Items List */}
                          <div className="space-y-1.5">
                            {order.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between text-xs py-1"
                              >
                                <div className="flex items-start gap-2 max-w-[70%]">
                                  <span className="font-bold text-slate-900 shrink-0">
                                    {item.quantity}x
                                  </span>
                                  <div>
                                    <span className="text-slate-800 font-medium">
                                      {item.productName}
                                    </span>
                                    {item.variantName && (
                                      <span className="text-slate-500 ml-1">
                                        ({item.variantName})
                                      </span>
                                    )}
                                    {item.notes && (
                                      <p className="text-[11px] text-amber-700 italic mt-0.5">
                                        Obs: {item.notes}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-bold text-slate-900">
                                    R$ {item.subtotal.toFixed(2).replace('.', ',')}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    R$ {item.unitPrice.toFixed(2).replace('.', ',')} un
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {order.notes && (
                            <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Obs do pedido: {order.notes}</span>
                            </div>
                          )}

                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-between items-center text-xs font-bold">
                            <span className="text-slate-500">Subtotal deste pedido</span>
                            <span className={isCancelled ? 'line-through text-slate-400' : 'text-slate-900'}>
                              R$ {order.total.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {cancelledOrders.length > 0 && (
                <div className="text-[11px] text-slate-400 text-center">
                  * {cancelledOrders.length} pedido(s) cancelado(s) não estão somados no valor total da comanda.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {session && (
          <div className="p-4 border-t border-slate-100 bg-slate-50">
            {confirmCloseOpen ? (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-3.5 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                      Finalizar Comanda e Liberar Mesa {table.tableNumber}?
                    </h5>
                    <div className="text-xs text-amber-900 mt-1 space-y-0.5 font-medium">
                      <p>
                        Total Final da Comanda:{' '}
                        <strong>R$ {grandTotal.toFixed(2).replace('.', ',')}</strong>
                      </p>
                      {confirmedPaidAmount > 0 && (
                        <p className="text-emerald-800">
                          Já Recebido Parcialmente:{' '}
                          <strong>R$ {confirmedPaidAmount.toFixed(2).replace('.', ',')}</strong>
                        </p>
                      )}
                      <p className="text-sm font-black text-slate-900 pt-0.5">
                        Saldo Restante a Quitar Agora: R$ {pendingBalance.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selector for Remaining Balance */}
                {pendingBalance > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5">
                      Forma de Pagamento do Saldo Restante:
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {PAYMENT_METHODS.map((pm) => {
                        const Icon = pm.icon;
                        const isSelected = paymentMethod === pm.id;
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => setPaymentMethod(pm.id)}
                            className={`p-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="text-[10px] truncate">{pm.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Observações de Fechamento (Opcional):
                  </label>
                  <input
                    type="text"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Ex: Conta quitada integralmente, NF emitida..."
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmCloseOpen(false)}
                    disabled={closing}
                    className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-xl font-medium cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseSession}
                    disabled={closing}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    ENCERRAR MESA E CONFIRMAR RECEBIMENTO
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Total da Conta
                    </span>
                    <span className="text-base font-black text-slate-900">
                      R$ {grandTotal.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block">
                      Já Pago
                    </span>
                    <span className="text-base font-black text-emerald-700">
                      R$ {confirmedPaidAmount.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-amber-700 block">
                      Falta Pagar
                    </span>
                    <span className="text-base font-black text-amber-900">
                      R$ {pendingBalance.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer"
                  >
                    Fechar Janela
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCloseOpen(true)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <Receipt className="w-4 h-4" />
                    ENCERRAR MESA E LIBERAR PARA NOVO CLIENTE
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
