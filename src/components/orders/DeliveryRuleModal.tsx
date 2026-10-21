import React, { useState } from 'react';
import { X, Truck, Check, AlertTriangle, Clock, MapPin, Navigation } from 'lucide-react';
import { DeliveryPricingMode, DeliveryRule, DeliveryRuleType } from '../../types/order';

interface DeliveryRuleModalProps {
  rule?: DeliveryRule | null;
  defaultCity?: string;
  defaultState?: string;
  pricingMode?: DeliveryPricingMode;
  onSave: (payload: {
    type: DeliveryRuleType;
    name: string;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    cepStart?: string | null;
    cepEnd?: string | null;
    fee: number;
    minimumOrder?: number | null;
    freeDeliveryAbove?: number | null;
    estimatedTime?: string | null;
    includedDistanceKm?: number | null;
    extraKmFee?: number | null;
    isActive?: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

export const DeliveryRuleModal: React.FC<DeliveryRuleModalProps> = ({
  rule,
  defaultCity = '',
  defaultState = '',
  pricingMode = 'neighborhood',
  onSave,
  onClose,
}) => {
  const [type, setType] = useState<DeliveryRuleType>(rule?.type || 'neighborhood');
  const [name, setName] = useState(rule?.name || '');
  const [neighborhood, setNeighborhood] = useState(rule?.neighborhood || '');
  const [city, setCity] = useState(rule?.city || defaultCity || '');
  const [state, setState] = useState(rule?.state || defaultState || '');
  const [cepStart, setCepStart] = useState(rule?.cepStart || '');
  const [cepEnd, setCepEnd] = useState(rule?.cepEnd || '');
  const [fee, setFee] = useState(rule?.fee !== undefined ? String(rule.fee) : '7.00');
  const [minimumOrder, setMinimumOrder] = useState(
    rule?.minimumOrder !== null && rule?.minimumOrder !== undefined ? String(rule.minimumOrder) : ''
  );
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState(
    rule?.freeDeliveryAbove !== null && rule?.freeDeliveryAbove !== undefined
      ? String(rule.freeDeliveryAbove)
      : ''
  );
  const [estimatedTime, setEstimatedTime] = useState(rule?.estimatedTime || '');
  const [includedDistanceKm, setIncludedDistanceKm] = useState(
    rule?.includedDistanceKm !== null && rule?.includedDistanceKm !== undefined
      ? String(rule.includedDistanceKm)
      : '3'
  );
  const [extraKmFee, setExtraKmFee] = useState(
    rule?.extraKmFee !== null && rule?.extraKmFee !== undefined ? String(rule.extraKmFee) : '2.00'
  );
  const [isActive, setIsActive] = useState(rule ? rule.isActive : true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNeighborhoodChange = (val: string) => {
    setNeighborhood(val);
    if (!rule && (!name.trim() || name === neighborhood)) {
      setName(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const effectiveName = (name.trim() || neighborhood.trim()).trim();
    if (!effectiveName) {
      setError('Por favor, informe o nome do bairro ou identificador da regra.');
      return;
    }

    if (type === 'neighborhood' && !neighborhood.trim()) {
      setError('Por favor, informe o nome do bairro atendido.');
      return;
    }

    if (type === 'neighborhood' && (!city.trim() || !state.trim())) {
      setError('Por favor, informe a Cidade e a UF (Estado) do bairro atendido.');
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

    const minNum = minimumOrder.trim() ? parseFloat(minimumOrder.replace(',', '.')) : null;
    const freeAboveNum = freeDeliveryAbove.trim()
      ? parseFloat(freeDeliveryAbove.replace(',', '.'))
      : null;
    const includedKmNum =
      includedDistanceKm.trim() !== ''
        ? Math.max(0, parseFloat(includedDistanceKm.replace(',', '.')))
        : null;
    const extraKmNum =
      extraKmFee.trim() !== '' ? Math.max(0, parseFloat(extraKmFee.replace(',', '.'))) : null;

    try {
      setIsSubmitting(true);
      await onSave({
        type,
        name: effectiveName,
        neighborhood: type === 'neighborhood' ? neighborhood.trim() : null,
        city: city.trim() || null,
        state: state.trim().toUpperCase() || null,
        cepStart: type === 'cep_range' ? cepStart.replace(/\D/g, '') : null,
        cepEnd: type === 'cep_range' ? cepEnd.replace(/\D/g, '') : null,
        fee: feeNum,
        minimumOrder: minNum !== null && !isNaN(minNum) ? minNum : null,
        freeDeliveryAbove: freeAboveNum !== null && !isNaN(freeAboveNum) ? freeAboveNum : null,
        estimatedTime: estimatedTime.trim() || null,
        includedDistanceKm:
          includedKmNum !== null && !isNaN(includedKmNum) ? includedKmNum : null,
        extraKmFee: extraKmNum !== null && !isNaN(extraKmNum) ? extraKmNum : null,
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
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                {rule ? 'Editar Bairro / Regra de Entrega' : 'Cadastrar Bairro / Regra de Entrega'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Defina o bairro, cidade/UF, taxa e condições de entrega
              </p>
            </div>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Rule Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Tipo da Regra</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'neighborhood' as const, label: 'Por Bairro' },
                { type: 'cep_range' as const, label: 'Faixa de CEP' },
                { type: 'fixed' as const, label: 'Taxa Geral' },
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

          {/* Neighborhood fields */}
          {type === 'neighborhood' && (
            <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome do Bairro Atendido <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={neighborhood}
                    onChange={(e) => handleNeighborhoodChange(e.target.value)}
                    placeholder="Ex: Unamar, Centro, Jardim América..."
                    className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  A comparação ignora diferenças de acentos, maiúsculas/minúsculas e espaços extras.
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cidade <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ex: Cabo Frio"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    UF <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    placeholder="RJ"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800 uppercase"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Custom Identification Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nome Identificador da Regra <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Unamar (Tamoios) / Centro"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
            />
          </div>

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
                  placeholder="28928-000"
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
                  placeholder="28929-999"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                />
              </div>
            </div>
          )}

          {/* Fee & Estimated Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {pricingMode === 'neighborhood_km'
                  ? 'Taxa-Base do Bairro (R$)'
                  : 'Valor da Taxa (R$)'}{' '}
                <span className="text-rose-500">*</span>
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
              <span className="text-[10px] text-slate-400 mt-0.5 block">Use 0 para entrega grátis</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tempo Estimado{' '}
                <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={estimatedTime}
                  onChange={(e) => setEstimatedTime(e.target.value)}
                  placeholder="Ex: 35 a 50 min"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Hybrid Mode Parameters (Neighborhood + Km) */}
          {type === 'neighborhood' && pricingMode === 'neighborhood_km' && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-3">
              <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs">
                <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                <span>Parâmetros Híbridos (Bairro + Adicional por Km)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Distância Incluída na Taxa-Base (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={includedDistanceKm}
                    onChange={(e) => setIncludedDistanceKm(e.target.value)}
                    placeholder="Ex: 3.0"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Adicional por Km Excedente (R$/km)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={extraKmFee}
                    onChange={(e) => setExtraKmFee(e.target.value)}
                    placeholder="Ex: 2.00"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Specific Minimum Order & Free Delivery Above */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pedido Mínimo Específico (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={minimumOrder}
                  onChange={(e) => setMinimumOrder(e.target.value)}
                  placeholder="Padrão da loja"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                />
              </div>
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
                  value={freeDeliveryAbove}
                  onChange={(e) => setFreeDeliveryAbove(e.target.value)}
                  placeholder="Padrão da loja"
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
              Bairro / Regra Ativa para Entregas
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
              <span>{isSubmitting ? 'Salvando...' : 'Salvar Bairro / Regra'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
