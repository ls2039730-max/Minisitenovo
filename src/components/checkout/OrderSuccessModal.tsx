import React from 'react';
import {
  CheckCircle2,
  MessageCircle,
  ExternalLink,
  ArrowRight,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { Tenant } from '../../types/saas';
import { api } from '../../services/api';
import { useBackHandler } from '../../services/navigationManager';

interface OrderSuccessModalProps {
  tenant: Tenant;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({ tenant }) => {
  const { completedOrder, whatsappUrl, closeOrderSuccess } = useCart();

  useBackHandler({
    isOpen: !!completedOrder,
    onClose: closeOrderSuccess,
    priority: 25,
    name: 'OrderSuccessModal',
  });

  if (!completedOrder) return null;

  const handleOpenWhatsApp = () => {
    if (whatsappUrl) {
      // Mark whatsapp sent timestamp on backend
      api.markOrderWhatsAppSent(tenant.slug, completedOrder.id).catch((err) => {
        console.warn('[WHATSAPP] Failed to record sent timestamp:', err);
      });

      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
        {/* Success Icon */}
        <div className="w-20 h-20 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        {/* Title & Order info */}
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200">
            Pedido Registrado no Sistema
          </span>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Pedido Recebido!
          </h2>
          <div className="pt-2 flex items-center justify-center gap-3">
            <span className="text-sm font-bold text-slate-500">Número do pedido:</span>
            <span className="text-lg font-black text-indigo-600 bg-indigo-50 px-3 py-0.5 rounded-xl border border-indigo-200">
              #{completedOrder.orderNumber}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-600">
            Total:{' '}
            <strong className="text-base text-slate-900 font-black">
              R$ {completedOrder.total.toFixed(2).replace('.', ',')}
            </strong>
          </div>
        </div>

        {/* WhatsApp Instruction Box */}
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-left space-y-2 text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-bold">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Próximo Passo Importante:</span>
          </div>
          <p className="leading-relaxed">
            Seu pedido já está salvo em nosso banco de dados. Agora clique abaixo para abrir a conversa e enviar os detalhes para a loja pelo <strong>WhatsApp</strong>.
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-3 pt-2">
          {whatsappUrl && (
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="w-full py-4 px-6 rounded-2xl text-white font-extrabold text-sm shadow-xl hover:opacity-95 transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99]"
              style={{ backgroundColor: '#25D366' }}
            >
              <MessageCircle className="w-5 h-5 fill-current" />
              <span>Enviar Pedido no WhatsApp</span>
              <ExternalLink className="w-4 h-4 opacity-75" />
            </button>
          )}

          <button
            type="button"
            onClick={closeOrderSuccess}
            className="w-full py-3 px-4 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Voltar para o Site
          </button>
        </div>
      </div>
    </div>
  );
};
