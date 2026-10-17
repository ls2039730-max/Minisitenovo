import React, { useState, useEffect } from 'react';
import {
  Save,
  Truck,
  Store,
  DollarSign,
  Clock,
  Phone,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Banknote,
  QrCode,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import {
  DeliverySettings,
  DeliveryRule,
  PaymentMethodConfig,
  PAYMENT_METHOD_LABELS,
} from '../../types/order';
import { api } from '../../services/api';
import { DeliveryRuleModal } from './DeliveryRuleModal';

interface DeliverySettingsTabProps {
  tenantId: string;
}

export const DeliverySettingsTab: React.FC<DeliverySettingsTabProps> = ({ tenantId }) => {
  const [settings, setSettings] = useState<DeliverySettings | null>(null);
  const [rules, setRules] = useState<DeliveryRule[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal for editing/creating delivery rules
  const [editingRule, setEditingRule] = useState<DeliveryRule | null | 'new'>(null);

  useEffect(() => {
    loadData();
  }, [tenantId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [s, r, pm] = await Promise.all([
        api.getDeliverySettings(),
        api.getDeliveryRules(),
        api.getPaymentMethods(),
      ]);
      setSettings(s);
      setRules(r);
      setPaymentMethods(pm);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar configurações de entrega e pagamento.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      setIsSaving(true);
      setError(null);
      const updated = await api.updateDeliverySettings({
        ordersEnabled: settings.ordersEnabled,
        acceptOrdersWhenClosed: settings.acceptOrdersWhenClosed,
        pickupEnabled: settings.pickupEnabled,
        deliveryEnabled: settings.deliveryEnabled,
        minimumOrder: settings.minimumOrder,
        freeDeliveryAbove: settings.freeDeliveryAbove,
        pickupInstructions: settings.pickupInstructions,
        deliveryEstimateText: settings.deliveryEstimateText,
        orderWhatsappNumber: settings.orderWhatsappNumber,
      });
      setSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRule = async (payload: any) => {
    if (editingRule && typeof editingRule === 'object') {
      await api.updateDeliveryRule(editingRule.id, payload);
    } else {
      await api.createDeliveryRule(payload);
    }
    await loadData();
    setEditingRule(null);
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta regra de entrega?')) return;
    try {
      await api.deleteDeliveryRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir regra.');
    }
  };

  const handleTogglePaymentMethod = async (pm: PaymentMethodConfig) => {
    try {
      const updated = await api.updatePaymentMethod(pm.id, {
        isActive: !pm.isActive,
      });
      setPaymentMethods((prev) =>
        prev.map((item) => (item.id === pm.id ? updated : item))
      );
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar forma de pagamento.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-3 text-xs">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Carregando configurações de vendas...</span>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-bold">Configurações salvas com sucesso!</span>
        </div>
      )}

      {/* FORM: GENERAL SETTINGS */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Card 1: Operation & Order Reception */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">1. Aceite de Pedidos</h3>
            <p className="text-xs text-slate-500">
              Controle se a sua empresa está recebendo pedidos e como se comporta fora do horário.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
              <div>
                <strong className="block text-xs font-bold text-slate-900">
                  Aceitar Novos Pedidos
                </strong>
                <span className="text-[11px] text-slate-500">
                  Pausa ou ativa temporariamente o fluxo do carrinho no site
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.ordersEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, ordersEnabled: e.target.checked })
                }
                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
              <div>
                <strong className="block text-xs font-bold text-slate-900">
                  Receber Fora do Horário
                </strong>
                <span className="text-[11px] text-slate-500">
                  Permite o cliente enviar o pedido para ser atendido na reabertura
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.acceptOrdersWhenClosed}
                onChange={(e) =>
                  setSettings({ ...settings, acceptOrdersWhenClosed: e.target.checked })
                }
                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                WhatsApp que Recebe os Pedidos
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={settings.orderWhatsappNumber || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, orderWhatsappNumber: e.target.value })
                  }
                  placeholder="Ex: 22999999999 (DDD + número)"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Se vazio, usará o WhatsApp padrão da empresa.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pedido Mínimo (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.minimumOrder}
                  onChange={(e) =>
                    setSettings({ ...settings, minimumOrder: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-800"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Valor mínimo para poder finalizar a compra.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Frete Grátis Acima de (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.freeDeliveryAbove ?? ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      freeDeliveryAbove: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 120.00"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-800"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Deixe em branco para não conceder frete grátis por valor.
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Pickup and Delivery Modes */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">2. Modalidades de Atendimento</h3>
            <p className="text-xs text-slate-500">
              Configure as opções de Retirada no Balcão e Entrega no Endereço.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Pickup */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-indigo-600" />
                  <strong className="text-xs font-bold text-slate-900">Retirada no Local</strong>
                </div>
                <input
                  type="checkbox"
                  checked={settings.pickupEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, pickupEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Instruções para Retirada
                </label>
                <textarea
                  rows={2}
                  value={settings.pickupInstructions || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, pickupInstructions: e.target.value })
                  }
                  placeholder="Ex: Retire no balcão apresentando o número do pedido."
                  className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium resize-none"
                />
              </div>
            </div>

            {/* Delivery */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-indigo-600" />
                  <strong className="text-xs font-bold text-slate-900">Entrega no Endereço</strong>
                </div>
                <input
                  type="checkbox"
                  checked={settings.deliveryEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, deliveryEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Estimativa de Tempo de Entrega
                </label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={settings.deliveryEstimateText || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, deliveryEstimateText: e.target.value })
                    }
                    placeholder="Ex: 40 a 60 minutos"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Salvando...' : 'Salvar Preferências'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Card 3: Payment Methods */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">3. Formas de Pagamento Aceitas</h3>
          <p className="text-xs text-slate-500">
            Habilite quais opções o cliente poderá escolher ao finalizar o pedido.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {paymentMethods.map((pm) => (
            <div
              key={pm.id}
              className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                pm.isActive
                  ? 'bg-slate-50 border-slate-300 shadow-xs'
                  : 'bg-white border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700">
                  {pm.type === 'PIX' && <QrCode className="w-3.5 h-3.5" />}
                  {pm.type === 'CASH' && <Banknote className="w-3.5 h-3.5" />}
                  {(pm.type === 'CREDIT_CARD_ON_DELIVERY' ||
                    pm.type === 'DEBIT_CARD_ON_DELIVERY') && (
                    <CreditCard className="w-3.5 h-3.5" />
                  )}
                  {pm.type === 'PAYMENT_ON_PICKUP' && <Store className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <strong className="block text-xs font-bold text-slate-900">{pm.label}</strong>
                  <span className="text-[10px] text-slate-500">
                    {pm.isActive ? 'Habilitado' : 'Desabilitado'}
                  </span>
                </div>
              </div>

              <input
                type="checkbox"
                checked={pm.isActive}
                onChange={() => handleTogglePaymentMethod(pm)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Card 4: Delivery Rules Table */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">4. Taxas e Regras de Entrega</h3>
            <p className="text-xs text-slate-500">
              Configure regras de taxa fixa, taxa por bairro atendido ou faixas de CEP.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setEditingRule('new')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Regra</span>
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="text-center py-8 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 space-y-2">
            <Truck className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-medium">Nenhuma regra de entrega cadastrada ainda.</p>
            <button
              type="button"
              onClick={() => setEditingRule('new')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              Clique aqui para criar sua primeira taxa
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold">
                  <th className="py-2.5 px-3">Nome da Regra</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Bairro / CEP</th>
                  <th className="py-2.5 px-3">Taxa</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-900">{r.name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                        {r.type === 'fixed' && 'Taxa Fixa'}
                        {r.type === 'neighborhood' && 'Por Bairro'}
                        {r.type === 'cep_range' && 'Faixa de CEP'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {r.type === 'neighborhood' && (r.neighborhood || '-')}
                      {r.type === 'cep_range' && `${r.cepStart} até ${r.cepEnd}`}
                      {r.type === 'fixed' && 'Toda a região'}
                    </td>
                    <td className="py-3 px-3 font-black text-slate-900">
                      {r.fee === 0 ? 'Grátis' : `R$ ${r.fee.toFixed(2).replace('.', ',')}`}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          r.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {r.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setEditingRule(r)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(r.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT DELIVERY RULE */}
      {editingRule && (
        <DeliveryRuleModal
          rule={typeof editingRule === 'object' ? editingRule : null}
          onSave={handleSaveRule}
          onClose={() => setEditingRule(null)}
        />
      )}
    </div>
  );
};
