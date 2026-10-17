import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface GalleryItem {
  id?: string;
  url: string;
  caption?: string;
}

interface PremiumGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: GalleryItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export const PremiumGalleryModal: React.FC<PremiumGalleryModalProps> = ({
  isOpen,
  onClose,
  items,
  currentIndex,
  onIndexChange,
}) => {
  const currentItem = items[currentIndex];

  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    onIndexChange(currentIndex > 0 ? currentIndex - 1 : items.length - 1);
  }, [currentIndex, items.length, onIndexChange]);

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    onIndexChange(currentIndex < items.length - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, items.length, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || !currentItem) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/95 backdrop-blur-xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-50 cursor-pointer"
          aria-label="Fechar galeria"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Counter & Indicator */}
        <div className="absolute top-6 left-6 text-xs font-mono tracking-widest text-white/60 uppercase z-50">
          <span>{currentIndex + 1}</span>
          <span className="mx-1 text-white/30">/</span>
          <span>{items.length}</span>
        </div>

        {/* Navigation Arrows */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-50 cursor-pointer"
              aria-label="Foto anterior"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-50 cursor-pointer"
              aria-label="Próxima foto"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Image Content Container */}
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.3 }}
          className="max-w-5xl max-h-[85vh] flex flex-col items-center justify-center"
        >
          <img
            src={currentItem.url}
            alt={currentItem.caption || 'Foto da Galeria'}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
          />
          {currentItem.caption && (
            <p className="mt-4 text-center text-sm font-medium text-white/90 max-w-xl leading-relaxed">
              {currentItem.caption}
            </p>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
