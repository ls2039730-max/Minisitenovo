import React, { useState } from 'react';
import { X, Truck, MapPin, Hash, DollarSign, Check, AlertTriangle } from 'lucide-react';
import { DeliveryRule, DeliveryRuleType } from '../../types/order';

interface DeliveryRuleModalProps {
  rule?: DeliveryRule | null;
  onSave: (payload: {
    type: DeliveryRuleType;
    name: string;
    neighborhood?: string;
    cepStart?: string;
    cepEnd?: string;
    fee: number;
    minimumOrder?: number | null;
    isActive?: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

export const DeliveryRuleModal: React.FC<DeliveryRuleModalProps> = ({
  rule,
  onSave,
  onClose,
}) => {
  const [type, setType] = useState<DeliveryRuleType>(rule?.type || 'fixed');
  const [name, setName] = useState(rule?.name || '');
  const [neighborhood, setNeighborhood] = useState(rule?.neighborhood || '');
  const [cepStart, setCepStart] = useState(rule?.cepStart || '');
  const [cepEnd, setCepEnd] = useState(rule?.cepEnd || '');
  const [fee, setFee] = useState(rule?.fee !== undefined ? String(rule.fee) : '5.00');
  const [minimumOrder, setMinimumOrder] = useState(
    rule?.minimumOrder !== null && rule?.minimumOrder !== undefined ? String(rule.minimumOrder) : ''
  );
  const [isActive, setIsActive] = useState(rule ? rule.isActive : true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Por favor, informe um nome identificador para a regra.');
      return;
    }

    if (type === 'neighborhood' && !neighborhood.trim()) {
      setError('Por favor, informe o nome do bairro.');
      return;
    }

    if (type === 'cep_range') {
      const cleanStart = cepStart.replace(/\D/g, '');
      const cleanEnd = cepEnd.replace(/\D/g, '');
      if (cleanStart.length !== 8 || cleanEnd.length !== 8) {
        setError('Por favor, informe o CEP inicial e final com 8 dígitos válidos.');
        return;
      }
      if (parseInt(cleanStart, 10) > parseInt(cleanEnd, 10)) {
        setError('O CEP inicial não pode ser maior que o CEP final.');
        return;
      }
    }

    const feeNum = parseFloat(fee.replace(',', '.'));
    if (isNaN(feeNum) || feeNum < 0) {
      setError('Por favor, informe uma taxa de entrega válida (maior ou igual a zero).');
      return;
    }

    const minNum = minimumOrder ? parseFloat(minimumOrder.replace(',', '.')) : null;

    try {
      setIsSubmitting(true);
      await onSave({
        type,
        name: name.trim(),
        neighborhood: type === 'neighborhood' ? neighborhood.trim() : undefined,
        cepStart: type === 'cep_range' ? cepStart.replace(/\D/g, '') : undefined,
        cepEnd: type === 'cep_range' ? cepEnd.replace(/\D/g, '') : undefined,
        fee: feeNum,
        minimumOrder: minNum,
        isActive,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar regra de entrega.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">
              {rule ? 'Editar Regra de Entrega' : 'Nova Regra de Entrega'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Rule Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Tipo da Regra
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'fixed' as const, label: 'Taxa Fixa' },
                { type: 'neighborhood' as const, label: 'Por Bairro' },
                { type: 'cep_range' as const, label: 'Faixa de CEP' },
              ].map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setType(opt.type)}
                  className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                    type === opt.type
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nome da Regra <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Centro e arredores / Taxa Padrão"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
            />
          </div>

          {/* Neighborhood (if neighborhood rule) */}
          {type === 'neighborhood' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nome do Bairro Atendido <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Ex: Centro, Rio Dourado, etc."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Compara automaticamente sem distinção de acentos ou maiúsculas.
              </span>
            </div>
          )}

          {/* CEP Range (if cep_range rule) */}
          {type === 'cep_range' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  CEP Inicial <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={9}
                  value={cepStart}
                  onChange={(e) => setCepStart(e.target.value)}
                  placeholder="28890-000"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  CEP Final <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={9}
                  value={cepEnd}
                  onChange={(e) => setCepEnd(e.target.value)}
                  placeholder="28890-999"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                />
              </div>
            </div>
          )}

          {/* Fee & Minimum Order */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Valor da Taxa (R$) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Use 0 para grátis</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pedido Mínimo (R$){' '}
                <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={minimumOrder}
                  onChange={(e) => setMinimumOrder(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Active status */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="ruleIsActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="ruleIsActive" className="text-xs font-bold text-slate-700 cursor-pointer">
              Regra Ativa para Cálculo
            </label>
          </div>

          {/* Footer buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Salvando...' : 'Salvar Regra'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
