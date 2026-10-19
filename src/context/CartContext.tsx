import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CartItemInput, ValidatedCartResponse, Order } from '../types/order';
import { Tenant } from '../types/saas';
import { api } from '../services/api';

interface CartToast {
  show: boolean;
  message: string;
  productName?: string;
}

interface CartContextType {
  items: CartItemInput[];
  itemCount: number;
  validatedData: ValidatedCartResponse | null;
  isValidating: boolean;
  isCartOpen: boolean;
  isCheckoutOpen: boolean;
  completedOrder: Order | null;
  whatsappUrl: string | null;
  cartWarnings: string[];
  addedToast: CartToast | null;
  openCart: () => void;
  closeCart: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  addToCart: (productId: string, variantId?: string | null, quantity?: number, productName?: string) => void;
  updateQuantity: (productId: string, variantId: string | null | undefined, quantity: number) => void;
  removeFromCart: (productId: string, variantId?: string | null) => void;
  clearCart: () => void;
  revalidateCart: () => Promise<ValidatedCartResponse | null>;
  setOrderCompleted: (order: Order, whatsappUrl: string) => void;
  closeOrderSuccess: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

interface CartProviderProps {
  tenant: Tenant;
  children: React.ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ tenant, children }) => {
  const storageKey = `localhub_cart_${tenant.slug}`;

  // Read initial cart items from localStorage (stores only unprivileged identifier and quantity)
  const [items, setItems] = useState<CartItemInput[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (it: any) => it && typeof it.productId === 'string' && typeof it.quantity === 'number' && it.quantity > 0
          );
        }
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  const [validatedData, setValidatedData] = useState<ValidatedCartResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [cartWarnings, setCartWarnings] = useState<string[]>([]);
  const [addedToast, setAddedToast] = useState<CartToast | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Storage quota or disabled
    }
  }, [items, storageKey]);

  // Server revalidation
  const revalidateCart = useCallback(async (): Promise<ValidatedCartResponse | null> => {
    if (items.length === 0) {
      setValidatedData(null);
      setCartWarnings([]);
      return null;
    }

    try {
      setIsValidating(true);
      const res = await api.validateCart(tenant.slug, items);
      setValidatedData(res);
      setCartWarnings(res.warnings || []);

      // If server filtered out unavailable items, synchronize local items
      if (res.items) {
        const validKeys = new Set(res.items.map((i) => `${i.productId}_${i.variantId || 'base'}`));
        const synchronizedItems: CartItemInput[] = [];

        items.forEach((it) => {
          const key = `${it.productId}_${it.variantId || 'base'}`;
          if (validKeys.has(key)) {
            const serverItem = res.items.find((si) => si.productId === it.productId && (si.variantId || null) === (it.variantId || null));
            if (serverItem) {
              synchronizedItems.push({
                productId: it.productId,
                variantId: it.variantId || null,
                quantity: serverItem.quantity,
              });
            }
          }
        });

        // Only update if changed
        if (synchronizedItems.length !== items.length) {
          setItems(synchronizedItems);
        }
      }

      return res;
    } catch (err: any) {
      console.warn('[CART] Revalidation warning:', err.message);
      return null;
    } finally {
      setIsValidating(false);
    }
  }, [items, tenant.slug]);

  // Revalidate whenever cart drawer opens
  useEffect(() => {
    if (isCartOpen || isCheckoutOpen) {
      revalidateCart();
    }
  }, [isCartOpen, isCheckoutOpen, revalidateCart]);

  // Total items quantity
  const itemCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

  // Open/Close
  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  const openCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };
  const closeCheckout = () => setIsCheckoutOpen(false);

  // Add Item to cart
  const addToCart = (
    productId: string,
    variantId?: string | null,
    quantity = 1,
    productName?: string
  ) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex(
        (it) => it.productId === productId && (it.variantId || null) === (variantId || null)
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        const newQty = Math.min(99, updated[existingIndex].quantity + quantity);
        updated[existingIndex] = { ...updated[existingIndex], quantity: newQty };
        return updated;
      }

      return [...prev, { productId, variantId: variantId || null, quantity: Math.min(99, Math.max(1, quantity)) }];
    });

    // Provide visual feedback
    setAddedToast({
      show: true,
      message: 'Item adicionado ao carrinho!',
      productName,
    });

    setTimeout(() => {
      setAddedToast((current) => (current ? { ...current, show: false } : null));
    }, 3000);
  };

  // Update item quantity
  const updateQuantity = (
    productId: string,
    variantId: string | null | undefined,
    quantity: number
  ) => {
    if (quantity <= 0) {
      removeFromCart(productId, variantId);
      return;
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.productId === productId && (it.variantId || null) === (variantId || null)) {
          return { ...it, quantity: Math.min(99, Math.max(1, quantity)) };
        }
        return it;
      })
    );
  };

  // Remove item
  const removeFromCart = (productId: string, variantId?: string | null) => {
    setItems((prev) =>
      prev.filter(
        (it) => !(it.productId === productId && (it.variantId || null) === (variantId || null))
      )
    );
  };

  // Clear cart
  const clearCart = () => {
    setItems([]);
    setValidatedData(null);
    setCartWarnings([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
  };

  // Order completion
  const setOrderCompleted = (order: Order, url: string) => {
    setCompletedOrder(order);
    setWhatsappUrl(url);
    setIsCheckoutOpen(false);
    clearCart();
  };

  const closeOrderSuccess = () => {
    setCompletedOrder(null);
    setWhatsappUrl(null);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        validatedData,
        isValidating,
        isCartOpen,
        isCheckoutOpen,
        completedOrder,
        whatsappUrl,
        cartWarnings,
        addedToast,
        openCart,
        closeCart,
        openCheckout,
        closeCheckout,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        revalidateCart,
        setOrderCompleted,
        closeOrderSuccess,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

const defaultCartContext: CartContextType = {
  items: [],
  itemCount: 0,
  validatedData: null,
  isValidating: false,
  isCartOpen: false,
  isCheckoutOpen: false,
  completedOrder: null,
  whatsappUrl: null,
  cartWarnings: [],
  addedToast: null,
  openCart: () => {},
  closeCart: () => {},
  openCheckout: () => {},
  closeCheckout: () => {},
  addToCart: () => {},
  updateQuantity: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
  revalidateCart: async () => null,
  setOrderCompleted: () => {},
  closeOrderSuccess: () => {},
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  return context || defaultCartContext;
};
