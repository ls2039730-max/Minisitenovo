import React, { useState, useEffect, useId } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Truck,
  Store,
  CreditCard,
  Banknote,
  QrCode,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { Tenant } from '../../types/saas';
import {
  FulfillmentType,
  PaymentMethodType,
  CreateOrderPayload,
  PaymentMethodConfig,
  CartItemInput,
  ValidatedCartItem,
} from '../../types/order';
import { calculateDeliveryFee } from '../../utils/deliveryFeeCalculator';
import { postalCodeService } from '../../services/postalCodeService';
import { api } from '../../services/api';
import { useBackHandler } from '../../services/navigationManager';

interface CheckoutModalProps {
  tenant: Tenant;
  primaryColor?: string;
  hasDeliveryFeature?: boolean;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  tenant,
  primaryColor = '#1e293b',
  hasDeliveryFeature = true,
}) => {
  const {
    isCheckoutOpen,
    closeCheckout,
    items,
    validatedData,
    openCart,
    setOrderCompleted,
  } = useCart();

  // Wizard Step: 1 = Dados, 2 = Como receber, 3 = Pagamento, 4 = Revisão
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form Fields - Step 1
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Form Fields - Step 2
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('pickup');
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [reference, setReference] = useState('');
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  // Form Fields - Step 3
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('PIX');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');

  // Submission & Validation States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `checkout_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

  const deliverySettings = validatedData?.deliverySettings;
  const deliveryRules = validatedData?.deliveryRules || [];
  const paymentMethods = (validatedData?.paymentMethods || []).filter((pm: PaymentMethodConfig) => pm.isActive);
  const subtotal = validatedData?.subtotal || 0;

  // Set default fulfillment type based on tenant settings
  useEffect(() => {
    if (!deliverySettings) return;

    const pickupOk = deliverySettings.pickupEnabled;
    const deliveryOk = deliverySettings.deliveryEnabled && hasDeliveryFeature;

    if (deliveryOk && !pickupOk) {
      setFulfillmentType('delivery');
    } else if (pickupOk && !deliveryOk) {
      setFulfillmentType('pickup');
    } else if (pickupOk) {
      setFulfillmentType('pickup');
    }
  }, [deliverySettings, hasDeliveryFeature]);

  // Set default payment method based on available active methods
  useEffect(() => {
    if (paymentMethods.length > 0 && !paymentMethods.some((pm: PaymentMethodConfig) => pm.type === paymentMethod)) {
      setPaymentMethod(paymentMethods[0].type);
    }
  }, [paymentMethods, paymentMethod]);

  // Back button handling inside Checkout wizard
  useBackHandler({
    isOpen: isCheckoutOpen && step > 1,
    onClose: () => {
      setStep((s) => (s - 1) as any);
    },
    priority: 30,
    name: `CheckoutStep_${step}`,
  });

  useBackHandler({
    isOpen: isCheckoutOpen && step === 1,
    onClose: () => {
      closeCheckout();
    },
    priority: 25,
    name: 'CheckoutModalRoot',
  });

  if (!isCheckoutOpen) return null;

  // Calculate live delivery fee for step 2 & 4
  const cleanCepDigits = cep.replace(/\D/g, '');
  const deliveryResult = calculateDeliveryFee(
    subtotal,
    { cep: cleanCepDigits, neighborhood },
    deliverySettings || null,
    deliveryRules
  );

  const deliveryFee = fulfillmentType === 'delivery' ? deliveryResult.fee : 0;
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

  // Mask & phone format
  const handlePhoneChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 11);
    if (raw.length <= 2) {
      setCustomerPhone(raw);
    } else if (raw.length <= 6) {
      setCustomerPhone(`(${raw.slice(0, 2)}) ${raw.slice(2)}`);
    } else if (raw.length <= 10) {
      setCustomerPhone(`(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`);
    } else {
      setCustomerPhone(`(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7, 11)}`);
    }
  };

  // Mask & CEP lookup
  const handleCepChange = async (val: string) => {
    const formatted = postalCodeService.formatCep(val);
    setCep(formatted);
    setCepError(null);

    const clean = postalCodeService.cleanCep(formatted);
    if (clean.length === 8) {
      setIsSearchingCep(true);
      try {
        const result = await postalCodeService.lookup(clean);
        if (result.found) {
          if (result.street) setStreet(result.street);
          if (result.neighborhood) setNeighborhood(result.neighborhood);
          if (result.city) setCity(result.city);
          if (result.state) setState(result.state);
        } else {
          setCepError('CEP não encontrado automaticamente. Por favor, preencha o endereço manualmente.');
        }
      } catch {
        setCepError('Serviço de CEP temporariamente indisponível. Preencha manualmente.');
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  // Step 1 Validation
  const validateStep1 = (): boolean => {
    setFormError(null);
    if (!customerName.trim() || customerName.trim().length < 3) {
      setFormError('Por favor, informe seu nome completo.');
      return false;
    }
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setFormError('Por favor, informe um telefone/WhatsApp válido com DDD.');
      return false;
    }
    return true;
  };

  // Step 2 Validation
  const validateStep2 = (): boolean => {
    setFormError(null);
    if (fulfillmentType === 'delivery') {
      if (!cleanCepDigits || cleanCepDigits.length !== 8) {
        setFormError('Por favor, informe um CEP válido com 8 dígitos.');
        return false;
      }
      if (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim()) {
        setFormError('Por favor, preencha todos os campos obrigatórios do endereço de entrega.');
        return false;
      }
      if (!deliveryResult.isCovered) {
        setFormError(deliveryResult.reason || 'Este endereço ainda não está na nossa área de entrega. Escolha retirada no local.');
        return false;
      }
    }
    return true;
  };

  // Step 3 Validation
  const validateStep3 = (): boolean => {
    setFormError(null);
    if (paymentMethod === 'CASH' && needsChange) {
      const parsedChange = parseFloat(changeFor.replace(',', '.'));
      if (isNaN(parsedChange) || parsedChange < total) {
        setFormError(`O valor para troco deve ser maior ou igual ao total de R$ ${total.toFixed(2).replace('.', ',')}.`);
        return false;
      }
    }
    return true;
  };

  // Final Order Submission
  const handleSubmitOrder = async () => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payload: CreateOrderPayload = {
        items: items.map((it: CartItemInput) => ({
          productId: it.productId,
          variantId: it.variantId || null,
          quantity: it.quantity,
        })),
        customerName: customerName.trim(),
        customerPhone: customerPhone.replace(/\D/g, ''),
        customerEmail: customerEmail.trim() || undefined,
        fulfillmentType,
        deliveryAddress:
          fulfillmentType === 'delivery'
            ? {
                cep: cleanCepDigits,
                street: street.trim(),
                number: number.trim(),
                complement: complement.trim() || undefined,
                neighborhood: neighborhood.trim(),
                city: city.trim(),
                state: state.trim().toUpperCase(),
                reference: reference.trim() || undefined,
              }
            : undefined,
        paymentMethod,
        changeFor:
          paymentMethod === 'CASH' && needsChange && changeFor
            ? parseFloat(changeFor.replace(',', '.'))
            : undefined,
        notes: notes.trim() || undefined,
        idempotencyKey,
      };

      const result = await api.createOrder(tenant.slug, payload);

      if (result.order) {
        setOrderCompleted(result.order, result.whatsappUrl);
      }
    } catch (err: any) {
      console.error('[CHECKOUT] Order creation error:', err);
      setFormError(err.message || 'Erro ao processar seu pedido. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  closeCheckout();
                  openCart();
                }}
                className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Voltar ao carrinho"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">
                Finalizar Pedido
              </h2>
              <span className="text-[11px] text-slate-500 font-medium">
                Etapa {step} de 4:{' '}
                {step === 1 && 'Seus dados'}
                {step === 2 && 'Como receber'}
                {step === 3 && 'Forma de pagamento'}
                {step === 4 && 'Revisão e envio'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={closeCheckout}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar Indicator */}
        <div className="w-full bg-slate-100 h-1.5">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${(step / 4) * 100}%`,
              backgroundColor: primaryColor,
            }}
          />
        </div>

        {/* Error Alert */}
        {formError && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-semibold">{formError}</div>
          </div>
        )}

        {/* Body Steps */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* STEP 1: SEUS DADOS */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">1. Identificação</h3>
                <p className="text-xs text-slate-500">
                  Informe seus dados para contato e andamento do seu pedido. Não é necessário criar conta.
                </p>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="w-full pl-10 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Telefone / WhatsApp <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="(22) 99999-9999"
                      className="w-full pl-10 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-800"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Usaremos este número para enviar as atualizações pelo WhatsApp.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    E-mail <span className="text-slate-400 text-[10px] font-normal">(Opcional)</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="seuemail@exemplo.com"
                      className="w-full pl-10 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: COMO RECEBER */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">2. Como deseja receber?</h3>
                <p className="text-xs text-slate-500">
                  Escolha se prefere retirar no estabelecimento ou receber por entrega.
                </p>
              </div>

              {/* Delivery method selector */}
              <div className="grid grid-cols-2 gap-3">
                {deliverySettings?.pickupEnabled && (
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('pickup')}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition-all cursor-pointer ${
                      fulfillmentType === 'pickup'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Store
                        className={`w-5 h-5 ${
                          fulfillmentType === 'pickup' ? 'text-indigo-600' : 'text-slate-400'
                        }`}
                      />
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        Sem taxa
                      </span>
                    </div>
                    <div>
                      <strong className="block text-xs font-bold text-slate-900">
                        Retirar no Local
                      </strong>
                      <span className="text-[11px] text-slate-500">
                        Você retira diretamente na loja
                      </span>
                    </div>
                  </button>
                )}

                {deliverySettings?.deliveryEnabled && hasDeliveryFeature && (
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('delivery')}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition-all cursor-pointer ${
                      fulfillmentType === 'delivery'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Truck
                        className={`w-5 h-5 ${
                          fulfillmentType === 'delivery' ? 'text-indigo-600' : 'text-slate-400'
                        }`}
                      />
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        {deliverySettings?.deliveryEstimateText || 'Delivery'}
                      </span>
                    </div>
                    <div>
                      <strong className="block text-xs font-bold text-slate-900">
                        Receber no Endereço
                      </strong>
                      <span className="text-[11px] text-slate-500">
                        Entregamos onde você estiver
                      </span>
                    </div>
                  </button>
                )}
              </div>

              {/* PICKUP INSTRUCTIONS */}
              {fulfillmentType === 'pickup' && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <MapPin className="w-4 h-4 text-slate-600" />
                    <span>Local de Retirada:</span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium pl-6">
                    {validatedData?.tenant?.address || `${tenant.name} - Consulte detalhes pelo WhatsApp`}
                  </p>
                  {deliverySettings?.pickupInstructions && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 pl-6 text-[11px] text-slate-500 italic">
                      {deliverySettings.pickupInstructions}
                    </div>
                  )}
                </div>
              )}

              {/* DELIVERY ADDRESS FORM */}
              {fulfillmentType === 'delivery' && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        CEP <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={cep}
                          onChange={(e) => handleCepChange(e.target.value)}
                          placeholder="00000-000"
                          maxLength={9}
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                        />
                        {isSearchingCep && (
                          <Loader2 className="w-4 h-4 text-indigo-600 animate-spin absolute right-3 top-2.5" />
                        )}
                      </div>
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Estado <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase())}
                        placeholder="UF"
                        maxLength={2}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl uppercase font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  {cepError && (
                    <p className="text-[11px] text-amber-700 font-medium">{cepError}</p>
                  )}

                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-3">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Rua / Avenida <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        placeholder="Nome da rua"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Número <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        placeholder="123"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Bairro <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        placeholder="Seu bairro"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Cidade <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Sua cidade"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Complemento <span className="text-[10px] text-slate-400 font-normal">(Apto, Bloco)</span>
                      </label>
                      <input
                        type="text"
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        placeholder="Ex: Apto 202"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Ponto de Referência <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Ex: Próximo à padaria"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Calculated Delivery Fee Feedback */}
                  {cleanCepDigits.length === 8 && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
                        deliveryResult.isCovered
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        {deliveryResult.isCovered ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                        )}
                        <span>
                          {deliveryResult.isCovered
                            ? deliveryResult.isFreeDelivery
                              ? 'Entrega Grátis para seu endereço!'
                              : `Taxa de entrega calculada: R$ ${deliveryResult.fee.toFixed(2).replace('.', ',')}`
                            : 'Endereço fora da área de entrega.'}
                        </span>
                      </div>
                      {deliveryResult.isCovered && deliverySettings?.deliveryEstimateText && (
                        <span className="text-[11px] font-bold text-slate-500">
                          {deliverySettings.deliveryEstimateText}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: FORMA DE PAGAMENTO */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">3. Como deseja pagar?</h3>
                <p className="text-xs text-slate-500">
                  O pagamento é combinado diretamente com a loja. Não coletamos dados de cartão online.
                </p>
              </div>

              {/* Payment Methods */}
              <div className="space-y-2">
                {paymentMethods.map((pm: PaymentMethodConfig) => {
                  const isSelected = paymentMethod === pm.type;
                  const isCash = pm.type === 'CASH';

                  return (
                    <div key={pm.id} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod(pm.type)}
                        className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {pm.type === 'PIX' && <QrCode className="w-4 h-4" />}
                            {pm.type === 'CASH' && <Banknote className="w-4 h-4" />}
                            {(pm.type === 'CREDIT_CARD_ON_DELIVERY' ||
                              pm.type === 'DEBIT_CARD_ON_DELIVERY') && (
                              <CreditCard className="w-4 h-4" />
                            )}
                            {pm.type === 'PAYMENT_ON_PICKUP' && <Store className="w-4 h-4" />}
                          </div>
                          <div>
                            <strong className="block text-xs font-bold text-slate-900">
                              {pm.label}
                            </strong>
                            <span className="text-[10px] text-slate-500">
                              {pm.type === 'PIX' && 'Chave informada no atendimento'}
                              {pm.type === 'CASH' && 'Pagamento em espécie'}
                              {pm.type === 'CREDIT_CARD_ON_DELIVERY' && 'Máquina levada na entrega'}
                              {pm.type === 'DEBIT_CARD_ON_DELIVERY' && 'Máquina levada na entrega'}
                              {pm.type === 'PAYMENT_ON_PICKUP' && 'Pagar no balcão ao retirar'}
                            </span>
                          </div>
                        </div>

                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? 'border-indigo-600' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
                        </div>
                      </button>

                      {/* Cash change prompt */}
                      {isSelected && isCash && (
                        <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-3">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span>Precisa de troco?</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setNeedsChange(false)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                  !needsChange
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-white text-slate-700 border border-slate-200'
                                }`}
                              >
                                Não
                              </button>
                              <button
                                type="button"
                                onClick={() => setNeedsChange(true)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                  needsChange
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-white text-slate-700 border border-slate-200'
                                }`}
                              >
                                Sim
                              </button>
                            </div>
                          </div>

                          {needsChange && (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Troco para quanto? (Total do pedido: R$ {total.toFixed(2).replace('.', ',')})
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                                  R$
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min={total}
                                  value={changeFor}
                                  onChange={(e) => setChangeFor(e.target.value)}
                                  placeholder={total.toFixed(2)}
                                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Order Notes */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações do Pedido{' '}
                  <span className="text-slate-400 text-[10px] font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Entregar na portaria, campainha não funciona, etc."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 resize-none"
                />
                <span className="text-[10px] text-slate-400 block text-right">
                  {notes.length}/500 caracteres
                </span>
              </div>
            </div>
          )}

          {/* STEP 4: REVISÃO DO PEDIDO */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">4. Revisão do Pedido</h3>
                <p className="text-xs text-slate-500">
                  Confira todos os detalhes antes de registrar e enviar seu pedido.
                </p>
              </div>

              {/* Customer & Fulfillment summary card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <div>
                    <strong className="block text-slate-900">{customerName}</strong>
                    <span className="text-slate-500">{customerPhone}</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                    {fulfillmentType === 'delivery' ? 'Entrega no Endereço' : 'Retirada no Local'}
                  </span>
                </div>

                {fulfillmentType === 'delivery' ? (
                  <div className="text-slate-600 space-y-0.5 text-[11px]">
                    <p className="font-semibold text-slate-800">
                      {street}, {number} {complement && `(${complement})`}
                    </p>
                    <p>
                      {neighborhood} - {city}/{state} - CEP: {cep}
                    </p>
                    {reference && <p className="italic text-slate-500">Ref: {reference}</p>}
                  </div>
                ) : (
                  <div className="text-slate-600 text-[11px]">
                    <p className="font-semibold text-slate-800">
                      Local: {validatedData?.tenant?.address || tenant.name}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Forma de Pagamento:</span>
                  <span className="font-bold text-slate-900">
                    {paymentMethods.find((pm: PaymentMethodConfig) => pm.type === paymentMethod)?.label || paymentMethod}
                    {paymentMethod === 'CASH' && changeFor && ` (Troco para R$ ${parseFloat(changeFor.replace(',', '.')).toFixed(2).replace('.', ',')})`}
                  </span>
                </div>

                {notes && (
                  <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                    <strong className="text-slate-700 block">Observação:</strong>
                    <span>{notes}</span>
                  </div>
                )}
              </div>

              {/* Items Snapshot */}
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Itens do Pedido ({items.length})
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {(validatedData?.items || []).map((it: ValidatedCartItem) => (
                    <div key={it.id} className="flex justify-between items-center text-xs">
                      <div className="truncate max-w-[240px] sm:max-w-xs">
                        <span className="font-bold text-slate-900">{it.quantity}x</span>{' '}
                        <span className="text-slate-700">{it.productName}</span>
                        {it.variantName && (
                          <span className="text-[10px] text-slate-400 ml-1">({it.variantName})</span>
                        )}
                      </div>
                      <span className="font-bold text-slate-900 shrink-0">
                        R$ {it.subtotal.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal dos itens</span>
                  <span className="font-bold">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Taxa de Entrega</span>
                  <span className="font-bold text-emerald-700">
                    {fulfillmentType === 'pickup'
                      ? 'Grátis (Retirada)'
                      : deliveryFee === 0
                      ? 'GRÁTIS'
                      : `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`}
                  </span>
                </div>
                <div className="pt-2 border-t border-indigo-200/80 flex justify-between items-baseline">
                  <span className="text-sm font-extrabold text-slate-900">Total a Pagar</span>
                  <span className="text-xl font-black text-slate-900">
                    R$ {total.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              {/* Notice */}
              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                Ao clicar em <strong>Confirmar e Enviar Pedido</strong>, o pedido será gravado no sistema e uma janela segura será aberta com os detalhes formatados para você enviar à loja pelo WhatsApp.
              </p>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setStep((s) => (s - 1) as any)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Voltar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                closeCheckout();
                openCart();
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Ver Carrinho
            </button>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && validateStep1()) setStep(2);
                if (step === 2 && validateStep2()) setStep(3);
                if (step === 3 && validateStep3()) setStep(4);
              }}
              className="flex-1 py-3 px-5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              style={{ backgroundColor: primaryColor }}
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmitOrder}
              className={`flex-1 py-3 px-5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isSubmitting ? 'opacity-70 cursor-wait' : 'hover:opacity-95 active:scale-[0.99]'
              }`}
              style={{ backgroundColor: '#25D366' }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registrando Pedido...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar e Enviar Pedido</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
