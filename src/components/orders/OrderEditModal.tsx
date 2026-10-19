import React, { useState, useEffect } from 'react';
import { X, Loader2, Save, Trash2, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Order, OrderItem } from '../../types/order';
import { Product } from '../../types/product';
import { api } from '../../services/api';

interface OrderEditModalProps {
  isOpen: boolean;
  order: Order;
  onClose: () => void;
  onOrderUpdated: (updated: Order) => void;
}

export const OrderEditModal: React.FC<OrderEditModalProps> = ({
  isOpen,
  order,
  onClose,
  onOrderUpdated,
}) => {
  const [customerName, setCustomerName] = useState(order.customerName);
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone);
  const [customerEmail, setCustomerEmail] = useState(order.customerEmail || '');
  const [notes, setNotes] = useState(order.notes || '');
  const [deliveryFee, setDeliveryFee] = useState(String(order.deliveryFee));

  // Editable items list
  const [items, setItems] = useState<Array<{ productId: string; variantId?: string | null; quantity: number }>>(
    order.items.map((i) => ({
      productId: i.productId || '',
      variantId: i.variantId || null,
      quantity: i.quantity,
    }))
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCustomerName(order.customerName);
      setCustomerPhone(order.customerPhone);
      setCustomerEmail(order.customerEmail || '');
      setNotes(order.notes || '');
      setDeliveryFee(String(order.deliveryFee));
      setItems(
        order.items.map((i) => ({
          productId: i.productId || '',
          variantId: i.variantId || null,
          quantity: i.quantity,
        }))
      );
      setError(null);
      loadProducts();
    }
  }, [isOpen, order]);

  const loadProducts = async () => {
    try {
      setLoadingProducts(true);
      const data = await api.getProducts({ isActive: true });
      setProducts(data || []);
    } catch (err) {
      console.error('Erro ao carregar produtos para edição:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  if (!isOpen) return null;

  const handleAddItem = () => {
    if (products.length === 0) return;
    setItems((prev) => [...prev, { productId: products[0].id, variantId: null, quantity: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === 'productId') {
        copy[index].variantId = null; // reset variant when product changes
      }
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setError('O pedido precisa ter pelo menos um item.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        notes: notes.trim() || undefined,
        deliveryFee: parseFloat(deliveryFee) || 0,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId || undefined,
          quantity: Number(i.quantity) || 1,
        })),
      };

      const updated = await api.updateOrder(order.id, payload);
      onOrderUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar pedido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">Editar Pedido #{order.orderNumber}</h3>
            <p className="text-xs text-slate-500">Modifique itens, dados de contato ou taxas e recalcule o total.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Cliente *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone / WhatsApp *</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail (Opcional)</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Taxa de Entrega (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Items Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Itens do Pedido</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Item</span>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                const selectedProduct = products.find((p) => p.id === item.productId);
                return (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
                    <div className="flex-1">
                      <select
                        value={item.productId}
                        onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (R$ {(p.promotionalPrice !== null && p.promotionalPrice !== undefined ? p.promotionalPrice : p.price || 0).toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-24">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs text-center font-semibold"
                        placeholder="Qtd"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length <= 1}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Observações Gerais</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 -mx-6 -mb-6">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Salvar Alterações e Recalcular</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
