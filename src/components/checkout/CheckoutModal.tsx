import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
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
  DeliverySettings,
} from '../../types/order';
import { calculateDeliveryFee } from '../../utils/deliveryFeeCalculator';
import { postalCodeService } from '../../services/postalCodeService';
import { api } from '../../services/api';
import { useBackHandler } from '../../services/navigationManager';
import { formatCurrencyBRL, formatPriceBRL, toSafePrice } from '../../utils/currency';
import { calculateCartTotals } from '../../utils/cartCalculator';
import { CartCheckoutErrorBoundary } from '../cart/CartCheckoutErrorBoundary';

interface CheckoutModalProps {
  tenant: Tenant;
  primaryColor?: string;
  hasDeliveryFeature?: boolean;
}

const FALLBACK_PAYMENT_METHODS: PaymentMethodConfig[] = [
  { id: 'fallback_pix', tenantId: '', type: 'PIX', label: 'PIX', isActive: true, position: 0, createdAt: '', updatedAt: '' },
  { id: 'fallback_cash', tenantId: '', type: 'CASH', label: 'Dinheiro', isActive: true, position: 1, createdAt: '', updatedAt: '' },
  {
    id: 'fallback_cc',
    tenantId: '',
    type: 'CREDIT_CARD_ON_DELIVERY',
    label: 'Cartão de Crédito na Entrega',
    isActive: true,
    position: 2,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback_dc',
    tenantId: '',
    type: 'DEBIT_CARD_ON_DELIVERY',
    label: 'Cartão de Débito na Entrega',
    isActive: true,
    position: 3,
    createdAt: '',
    updatedAt: '',
  },
];

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  tenant,
  primaryColor = '#1e293b',
  hasDeliveryFeature = true,
}) => {
  const {
    isCheckoutOpen,
    closeCheckout,
    items,
    displayItems,
    subtotal: contextSubtotal,
    validatedData,
    isValidating,
    revalidationError,
    revalidateCart,
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
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(
    () => `checkout_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Reset wizard state cleanly whenever checkout opens
  useEffect(() => {
    if (isCheckoutOpen) {
      setStep(1);
      setFormError(null);
      setIdempotencyKey(`checkout_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
      if (!validatedData && !isValidating && items.length > 0) {
        revalidateCart();
      }
    }
  }, [isCheckoutOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const deliverySettings = useMemo<DeliverySettings>(() => {
    if (validatedData?.deliverySettings) {
      return validatedData.deliverySettings;
    }
    return {
      tenantId: tenant.id,
      ordersEnabled: true,
      acceptOrdersWhenClosed: true,
      pickupEnabled: true,
      deliveryEnabled: true,
      minimumOrder: 0,
      freeDeliveryAbove: null,
      pickupInstructions: 'Retire no balcão apresentando o número do pedido.',
      deliveryEstimateText: '40 a 60 minutos',
      orderWhatsappNumber: null,
      createdAt: '',
      updatedAt: '',
    };
  }, [validatedData?.deliverySettings, tenant.id]);

  const deliveryRules = useMemo(() => {
    return validatedData?.deliveryRules || [];
  }, [validatedData?.deliveryRules]);

  const paymentMethods = useMemo<PaymentMethodConfig[]>(() => {
    const active = (validatedData?.paymentMethods || []).filter(
      (pm: PaymentMethodConfig) => pm && pm.isActive
    );
    return active.length > 0 ? active : FALLBACK_PAYMENT_METHODS;
  }, [validatedData?.paymentMethods]);

  // Set default fulfillment type based on tenant settings
  useEffect(() => {
    const pickupOk = deliverySettings.pickupEnabled !== false;
    const deliveryOk = deliverySettings.deliveryEnabled !== false && hasDeliveryFeature;

    if (deliveryOk && !pickupOk) {
      setFulfillmentType('delivery');
    } else if (pickupOk && !deliveryOk) {
      setFulfillmentType('pickup');
    }
  }, [deliverySettings.pickupEnabled, deliverySettings.deliveryEnabled, hasDeliveryFeature]);

  // Set default payment method based on available active methods (memoized to prevent infinite loops)
  useEffect(() => {
    if (
      paymentMethods.length > 0 &&
      !paymentMethods.some((pm: PaymentMethodConfig) => pm.type === paymentMethod)
    ) {
      setPaymentMethod(paymentMethods[0].type);
    }
  }, [paymentMethods, paymentMethod]);

  // Single unified back handler for Checkout wizard (eliminates dual-hook history race condition)
  useBackHandler({
    isOpen: isCheckoutOpen,
    onClose: () => {
      if (step > 1) {
        setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4);
        return false; // Handled internally by stepping back
      }
      closeCheckout();
    },
    priority: 25,
    name: 'CheckoutModal',
  });

  if (!isCheckoutOpen) return null;

  // Calculate live delivery fee and authoritative totals
  const cleanCepDigits = cep.replace(/\D/g, '');
  const baseTotals = calculateCartTotals(displayItems, 0, 0);
  const rawSubtotal = baseTotals.subtotal > 0 ? baseTotals.subtotal : contextSubtotal;

  const deliveryResult = calculateDeliveryFee(
    rawSubtotal,
    { cep: cleanCepDigits, neighborhood },
    deliverySettings,
    deliveryRules
  );

  const rawDeliveryFee = fulfillmentType === 'delivery' ? toSafePrice(deliveryResult.fee) : 0;
  const { subtotal, deliveryFee, total } = calculateCartTotals(displayItems, rawDeliveryFee, 0);

  const hasItemsWaitingPrice =
    displayItems.length > 0 && displayItems.every((it) => toSafePrice(it.unitPrice) <= 0);

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

  const handleReturnToCart = () => {
    closeCheckout();
    openCart();
  };

  // Step 1 Validation
  const validateStep1 = (): boolean => {
    setFormError(null);
    if (items.length === 0) {
      setFormError('Seu carrinho está vazio. Adicione produtos antes de finalizar.');
      return false;
    }
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
        setFormError(
          deliveryResult.reason ||
            'Este endereço ainda não está na nossa área de entrega. Escolha retirada no local.'
        );
        return false;
      }
    }
    return true;
  };

  // Step 3 Validation
  const validateStep3 = (): boolean => {
    setFormError(null);
    if (paymentMethod === 'CASH' && needsChange) {
      const parsedChange = toSafePrice(changeFor);
      if (parsedChange <= 0 || parsedChange < total) {
        setFormError(
          `O valor para troco deve ser maior ou igual ao total de ${formatCurrencyBRL(total)}.`
        );
        return false;
      }
    }
    return true;
  };

  // Final Order Submission (Protected against duplicate taps and preserves cart on failure)
  const handleSubmitOrder = async () => {
    if (submittingRef.current || isSubmitting) return;

    if (items.length === 0) {
      setFormError('Seu carrinho está vazio.');
      return;
    }

    if (!validateStep1() || !validateStep2() || !validateStep3()) {
      return;
    }

    try {
      submittingRef.current = true;
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
            ? toSafePrice(changeFor)
            : undefined,
        notes: notes.trim() || undefined,
        idempotencyKey,
      };

      const result = await api.createOrder(tenant.slug, payload);

      if (result && result.order) {
        setOrderCompleted(result.order, result.whatsappUrl || '');
      } else {
        throw new Error('Não foi possível confirmar o registro do pedido. Tente novamente.');
      }
    } catch (err: any) {
      console.error('[CHECKOUT] Order creation error:', err);
      setFormError(
        err?.message || 'Erro ao processar seu pedido. Seus itens continuam salvos; tente novamente.'
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <CartCheckoutErrorBoundary
      contextName="CheckoutModal"
      onReset={() => {
        setFormError(null);
        revalidateCart();
      }}
      onBackToCart={handleReturnToCart}
    >
      <div
        className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-label="Finalizar Pedido"
      >
        <div className="bg-white w-full max-w-xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[94dvh] animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4);
                  }}
                  className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Etapa anterior"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReturnToCart}
                  className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Voltar ao carrinho"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}

              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight truncate">
                  Finalizar Pedido
                </h2>
                <span className="text-[11px] text-slate-500 font-medium block truncate">
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
              aria-label="Fechar finalização"
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar Indicator */}
          <div className="w-full bg-slate-100 h-1.5 shrink-0">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${(step / 4) * 100}%`,
                backgroundColor: primaryColor,
              }}
            />
          </div>

          {/* Error Alert with Recovery Options */}
          {(formError || (revalidationError && hasItemsWaitingPrice)) && (
            <div className="mx-4 sm:mx-5 mt-3.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2 shrink-0">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-semibold break-words">
                  {formError || revalidationError}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    revalidateCart();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Tentar Novamente</span>
                </button>
                <button
                  type="button"
                  onClick={handleReturnToCart}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Voltar ao Carrinho</span>
                </button>
              </div>
            </div>
          )}

          {/* Body Steps */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
            {items.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                <h3 className="text-sm font-bold text-slate-900">Seu carrinho está vazio</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Adicione produtos ao carrinho antes de iniciar a finalização do pedido.
                </p>
                <button
                  type="button"
                  onClick={handleReturnToCart}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
                >
                  Voltar ao Carrinho
                </button>
              </div>
            ) : isValidating && hasItemsWaitingPrice ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-slate-600 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-800">
                    Preparando a finalização do seu pedido...
                  </h3>
                  <p className="text-xs text-slate-500">
                    Validando preços atualizados e opções de entrega.
                  </p>
                </div>
              </div>
            ) : (
              <>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {deliverySettings.pickupEnabled !== false && (
                        <button
                          type="button"
                          onClick={() => setFulfillmentType('pickup')}
                          className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition-all cursor-pointer ${
                            fulfillmentType === 'pickup'
                              ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Store
                              className={`w-5 h-5 shrink-0 ${
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

                      {deliverySettings.deliveryEnabled !== false && hasDeliveryFeature && (
                        <button
                          type="button"
                          onClick={() => setFulfillmentType('delivery')}
                          className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition-all cursor-pointer ${
                            fulfillmentType === 'delivery'
                              ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Truck
                              className={`w-5 h-5 shrink-0 ${
                                fulfillmentType === 'delivery' ? 'text-indigo-600' : 'text-slate-400'
                              }`}
                            />
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md truncate">
                              {deliverySettings.deliveryEstimateText || 'Delivery'}
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
                          <MapPin className="w-4 h-4 text-slate-600 shrink-0" />
                          <span>Local de Retirada:</span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-6 break-words">
                          {validatedData?.tenant?.address ||
                            `${tenant.name} - Consulte detalhes pelo WhatsApp`}
                        </p>
                        {deliverySettings.pickupInstructions && (
                          <div className="mt-2 pt-2 border-t border-slate-200/60 pl-6 text-[11px] text-slate-500 italic break-words">
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Complemento{' '}
                              <span className="text-[10px] text-slate-400 font-normal">(Apto, Bloco)</span>
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
                              Ponto de Referência{' '}
                              <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
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
                            className={`p-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 border ${
                              deliveryResult.isCovered
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-rose-50 border-rose-200 text-rose-900'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-semibold">
                              {deliveryResult.isCovered ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              )}
                              <span>
                                {deliveryResult.isCovered
                                  ? deliveryResult.isFreeDelivery
                                    ? 'Entrega Grátis para seu endereço!'
                                    : `Taxa de entrega calculada: ${formatCurrencyBRL(deliveryResult.fee)}`
                                  : 'Endereço fora da área de entrega.'}
                              </span>
                            </div>
                            {deliveryResult.isCovered && deliverySettings.deliveryEstimateText && (
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
                          <div key={pm.id || pm.type} className="space-y-2">
                            <button
                              type="button"
                              onClick={() => setPaymentMethod(pm.type)}
                              className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
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
                                <div className="min-w-0">
                                  <strong className="block text-xs font-bold text-slate-900 truncate">
                                    {pm.label}
                                  </strong>
                                  <span className="text-[10px] text-slate-500 block truncate">
                                    {pm.type === 'PIX' && 'Chave informada no atendimento'}
                                    {pm.type === 'CASH' && 'Pagamento em espécie'}
                                    {pm.type === 'CREDIT_CARD_ON_DELIVERY' && 'Máquina levada na entrega'}
                                    {pm.type === 'DEBIT_CARD_ON_DELIVERY' && 'Máquina levada na entrega'}
                                    {pm.type === 'PAYMENT_ON_PICKUP' && 'Pagar no balcão ao retirar'}
                                  </span>
                                </div>
                              </div>

                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
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
                                      Troco para quanto? (Total do pedido: {formatCurrencyBRL(total)})
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
                                        placeholder={formatPriceBRL(total)}
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
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                        <div className="min-w-0">
                          <strong className="block text-slate-900 truncate">{customerName}</strong>
                          <span className="text-slate-500">{customerPhone}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 shrink-0">
                          {fulfillmentType === 'delivery' ? 'Entrega no Endereço' : 'Retirada no Local'}
                        </span>
                      </div>

                      {fulfillmentType === 'delivery' ? (
                        <div className="text-slate-600 space-y-0.5 text-[11px] break-words">
                          <p className="font-semibold text-slate-800">
                            {street}, {number} {complement && `(${complement})`}
                          </p>
                          <p>
                            {neighborhood} - {city}/{state} - CEP: {cep}
                          </p>
                          {reference && <p className="italic text-slate-500">Ref: {reference}</p>}
                        </div>
                      ) : (
                        <div className="text-slate-600 text-[11px] break-words">
                          <p className="font-semibold text-slate-800">
                            Local: {validatedData?.tenant?.address || tenant.name}
                          </p>
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                        <span className="text-slate-500 font-medium">Forma de Pagamento:</span>
                        <span className="font-bold text-slate-900 text-right">
                          {paymentMethods.find((pm: PaymentMethodConfig) => pm.type === paymentMethod)
                            ?.label || paymentMethod}
                          {paymentMethod === 'CASH' &&
                            needsChange &&
                            changeFor &&
                            ` (Troco para ${formatCurrencyBRL(toSafePrice(changeFor))})`}
                        </span>
                      </div>

                      {notes && (
                        <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 break-words">
                          <strong className="text-slate-700 block">Observação:</strong>
                          <span>{notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Items Snapshot */}
                    <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Itens do Pedido ({displayItems.length})
                      </span>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {displayItems.map((it: ValidatedCartItem) => (
                          <div key={it.id} className="flex justify-between items-start gap-2 text-xs">
                            <div className="min-w-0 flex-1 break-words">
                              <span className="font-bold text-slate-900">{it.quantity}x</span>{' '}
                              <span className="text-slate-700">{it.productName}</span>
                              {it.variantName && (
                                <span className="text-[10px] text-slate-400 ml-1">
                                  ({it.variantName})
                                </span>
                              )}
                            </div>
                            <span className="font-bold text-slate-900 whitespace-nowrap shrink-0">
                              {formatCurrencyBRL(it.subtotal)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Price Breakdown */}
                    <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2 text-xs">
                      <div className="flex justify-between gap-2 text-slate-600">
                        <span>Subtotal dos itens</span>
                        <span className="font-bold whitespace-nowrap" data-testid="checkout-subtotal">
                          {formatCurrencyBRL(subtotal)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 text-slate-600">
                        <span>Taxa de Entrega</span>
                        <span className="font-bold text-emerald-700 whitespace-nowrap">
                          {fulfillmentType === 'pickup'
                            ? 'Grátis (Retirada)'
                            : deliveryFee === 0
                            ? 'GRÁTIS'
                            : formatCurrencyBRL(deliveryFee)}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-indigo-200/80 flex justify-between items-baseline gap-2">
                        <span className="text-sm font-extrabold text-slate-900">Total a Pagar</span>
                        <span
                          className="text-lg sm:text-xl font-black text-slate-900 whitespace-nowrap"
                          data-testid="checkout-total"
                        >
                          {formatCurrencyBRL(total)}
                        </span>
                      </div>
                    </div>

                    {/* Notice */}
                    <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                      Ao clicar em <strong>Confirmar e Enviar Pedido</strong>, o pedido será gravado no sistema e uma janela segura será aberta com os detalhes formatados para você enviar à loja pelo WhatsApp.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Navigation Buttons */}
          {items.length > 0 && (
            <div className="p-3.5 sm:p-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2.5 shrink-0">
              {step > 1 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setFormError(null);
                    setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                >
                  Voltar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReturnToCart}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                >
                  Ver Carrinho
                </button>
              )}

              {step < 4 ? (
                <button
                  type="button"
                  disabled={isValidating && hasItemsWaitingPrice}
                  onClick={() => {
                    if (step === 1 && validateStep1()) setStep(2);
                    else if (step === 2 && validateStep2()) setStep(3);
                    else if (step === 3 && validateStep3()) setStep(4);
                  }}
                  className="flex-1 py-3 px-4 sm:px-5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: primaryColor }}
                >
                  <span>Avançar</span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting || (isValidating && hasItemsWaitingPrice)}
                  onClick={handleSubmitOrder}
                  data-testid="checkout-submit-button"
                  className={`flex-1 py-3 px-4 sm:px-5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    isSubmitting ? 'opacity-70 cursor-wait' : 'hover:opacity-95 active:scale-[0.99]'
                  }`}
                  style={{ backgroundColor: '#25D366' }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Registrando Pedido...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Confirmar e Enviar Pedido</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </CartCheckoutErrorBoundary>
  );
};
