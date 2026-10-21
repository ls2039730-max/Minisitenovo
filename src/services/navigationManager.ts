import React, { useEffect, useRef } from 'react';

/**
 * Overlay item descriptor for modals, drawers, slide-overs and dialogs.
 */
export interface OverlayItem {
  id: string;
  name?: string;
  close: () => boolean | void; // returns false if close was prevented/interrupted
  priority: number; // Higher numbers close first (e.g. nested confirmation dialog = 30, parent modal = 20)
  createdAt: number;
}

export interface InternalRouteState {
  type: 'client' | 'admin' | 'public_site' | 'table_catalog' | 'login';
  tab?: string;
  adminTab?: string;
  tenantId?: string | null;
  slug?: string | null;
  url: string;
}

class NavigationManager {
  private overlayStack: OverlayItem[] = [];
  private internalHistory: InternalRouteState[] = [];
  private initialized = false;
  private isProgrammaticBack = false;
  private poppedOverlayIds = new Set<string>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  /**
   * Initializes baseline history and global popstate interception.
   * Safe to call multiple times (idempotent).
   */
  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    window.addEventListener('popstate', this.handleGlobalPopState, { capture: true });
  }

  /**
   * Destroys listeners (for cleanup / testing)
   */
  public destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.handleGlobalPopState, { capture: true });
    }
    this.overlayStack = [];
    this.internalHistory = [];
    this.initialized = false;
    this.isProgrammaticBack = false;
    this.poppedOverlayIds.clear();
  }

  /**
   * Registers an open modal, drawer or dialog.
   * Pushes a lightweight history marker so browser/Android Back button closes it first.
   * Returns an unregister cleanup function.
   */
  public registerOverlay(item: Omit<OverlayItem, 'createdAt'>): () => void {
    if (typeof window === 'undefined') return () => {};

    // Ensure listeners are active
    this.init();

    // Remove any existing entry with the same ID to prevent duplicates
    this.overlayStack = this.overlayStack.filter((o) => o.id !== item.id);

    const overlayItem: OverlayItem = {
      ...item,
      createdAt: Date.now(),
    };

    this.overlayStack.push(overlayItem);
    // Sort descending by priority, then by creation time (LIFO)
    this.overlayStack.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.createdAt - a.createdAt;
    });

    // Push or update overlay state in browser history so Android / Browser Back pops it
    // without piling up redundant history entries or racing during overlay switches
    try {
      const currentState = (window.history && window.history.state) || {};
      if (currentState && currentState._lh_overlay) {
        window.history.replaceState(
          { ...currentState, _lh_overlay: this.overlayStack[0]?.id || item.id },
          '',
          window.location.href
        );
      } else {
        window.history.pushState(
          { ...currentState, _lh_overlay: item.id },
          '',
          window.location.href
        );
      }
    } catch (e) {
      // Fallback
    }

    let unregistered = false;

    return () => {
      if (unregistered) return;
      unregistered = true;
      this.unregisterOverlay(item.id);
    };
  }

  /**
   * Unregisters an overlay (called when component unmounts or closes via on-screen UI)
   */
  public unregisterOverlay(id: string) {
    const existingIndex = this.overlayStack.findIndex((o) => o.id === id);
    if (existingIndex !== -1) {
      this.overlayStack.splice(existingIndex, 1);
    }

    // If this unregister was already triggered by the browser popping state, do not modify history
    if (this.poppedOverlayIds.has(id)) {
      this.poppedOverlayIds.delete(id);
      return;
    }

    // If overlay was closed via UI (not by browser popstate), update history state synchronously
    // via replaceState instead of asynchronous window.history.back() which causes race conditions
    // and white-screen navigation on mobile browsers when opening another overlay immediately.
    if (typeof window !== 'undefined') {
      try {
        const state = window.history.state;
        if (state && state._lh_overlay) {
          if (this.overlayStack.length > 0) {
            window.history.replaceState(
              { ...state, _lh_overlay: this.overlayStack[0].id },
              '',
              window.location.href
            );
          } else {
            const { _lh_overlay, ...restState } = state;
            window.history.replaceState(restState, '', window.location.href);
          }
        }
      } catch (e) {
        // Fallback
      }
    }
  }

  /**
   * Closes the topmost active overlay.
   * Returns true if an overlay was closed, false if stack was empty or close prevented.
   */
  public closeTopmostOverlay(): boolean {
    if (this.overlayStack.length === 0) return false;

    const topmost = this.overlayStack[0];
    this.poppedOverlayIds.add(topmost.id);

    const preventDefault = topmost.close();
    if (preventDefault === false) {
      // Close was cancelled or intercepted internally (e.g. step back or unsaved changes confirm)
      this.poppedOverlayIds.delete(topmost.id);
      // Re-push history entry since browser already popped it
      try {
        const currentState = window.history.state || {};
        window.history.pushState(
          { ...currentState, _lh_overlay: topmost.id },
          '',
          window.location.href
        );
      } catch (e) {}
      // Return true because the popstate event was consumed by the overlay logic
      return true;
    }

    this.overlayStack.shift();
    return true;
  }

  public hasActiveOverlays(): boolean {
    return this.overlayStack.length > 0;
  }

  public getActiveOverlaysCount(): number {
    return this.overlayStack.length;
  }

  /**
   * Records an internal route transition in session memory.
   * Avoids duplicate consecutive entries.
   */
  public recordRoute(route: InternalRouteState) {
    const last = this.internalHistory[this.internalHistory.length - 1];
    if (
      last &&
      last.type === route.type &&
      last.tab === route.tab &&
      last.adminTab === route.adminTab &&
      last.tenantId === route.tenantId &&
      last.slug === route.slug
    ) {
      return;
    }
    this.internalHistory.push(route);
  }

  public getPreviousRoute(): InternalRouteState | null {
    if (this.internalHistory.length <= 1) return null;
    return this.internalHistory[this.internalHistory.length - 2] || null;
  }

  public popCurrentRoute(): InternalRouteState | null {
    return this.internalHistory.pop() || null;
  }

  public getHistoryLength(): number {
    return this.internalHistory.length;
  }

  /**
   * Centralized 'Go Back' action triggered by on-screen UI buttons (e.g. <ArrowLeft /> Voltar).
   * Follows the exact same priority rules:
   * 1. Close overlay if one is open.
   * 2. Go back in history if internal navigation exists.
   * 3. Fallback to valid module root if opened directly.
   */
  public goBack(fallbackAction?: () => void) {
    if (typeof window === 'undefined') return;

    // 1. If an overlay is open, close it first
    if (this.hasActiveOverlays()) {
      const closed = this.closeTopmostOverlay();
      if (closed) return;
    }

    // 2. If fallback action is provided (e.g. navigateSelectTenant(null) or navigateClientTab('home'))
    if (fallbackAction) {
      fallbackAction();
      return;
    }

    // 3. Default browser back if history has depth
    if (window.history.length > 1) {
      window.history.back();
    }
  }

  /**
   * Intercepts browser / Android popstate event
   */
  private handleGlobalPopState = (event: PopStateEvent) => {
    // If popstate was triggered by our own programmatic cleanup, consume and reset
    if (this.isProgrammaticBack) {
      this.isProgrammaticBack = false;
      event.stopImmediatePropagation();
      return;
    }

    // 1. PRIORITY 1: Close active overlay/modal/drawer without leaving the page
    if (this.hasActiveOverlays()) {
      this.closeTopmostOverlay();
      // Always stop propagation when overlays are open to prevent leaking into page navigation
      event.stopImmediatePropagation();
      return;
    }

    // If no overlays were open, let the popstate event bubble normally to App.tsx and module listeners!
  };
}

export const navigationManager = new NavigationManager();

/**
 * React hook to register any modal, drawer or overlay with the central Back button system.
 * When the modal is open:
 * - Pressing Android Back closes this modal without changing the page.
 * - Pressing Browser Back closes this modal without changing the page.
 * - Nested modals close in proper LIFO order (highest priority first).
 * - Closing via UI button cleanly unregisters and discards the modal history entry.
 */
export function useBackHandler({
  isOpen,
  onClose,
  priority = 10,
  name,
}: {
  isOpen: boolean;
  onClose: () => boolean | void;
  priority?: number;
  name?: string;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const idRef = useRef<string>(name || `overlay_${Math.random().toString(36).substring(2, 9)}`);
  if (name && idRef.current !== name) {
    idRef.current = name;
  }

  useEffect(() => {
    if (!isOpen) return;

    const overlayId = idRef.current;
    const unregister = navigationManager.registerOverlay({
      id: overlayId,
      name,
      close: () => onCloseRef.current(),
      priority,
    });

    return () => {
      unregister();
    };
  }, [isOpen, priority, name]);
}
