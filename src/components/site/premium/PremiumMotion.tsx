import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface PremiumScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
  distance?: number;
  scale?: boolean;
}

/**
 * High-performance viewport reveal wrapper using motion/react.
 * Automatically respects user's prefers-reduced-motion preferences.
 */
export const PremiumScrollReveal: React.FC<PremiumScrollRevealProps> = ({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  duration = 0.65,
  distance = 28,
  scale = false,
}) => {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  const offset = {
    x: direction === 'left' ? -distance : direction === 'right' ? distance : 0,
    y: direction === 'up' ? distance : direction === 'down' ? -distance : 0,
  };

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: offset.x,
        y: offset.y,
        scale: scale ? 0.97 : 1,
      }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
      }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1], // Smooth cubic bezier curve
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

interface PremiumTextRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

/**
 * Editorial masked headline / text reveal.
 */
export const PremiumTextReveal: React.FC<PremiumTextRevealProps> = ({
  children,
  className = '',
  delay = 0,
}) => {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className="overflow-hidden">
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: '-30px' }}
        transition={{
          duration: 0.75,
          delay,
          ease: [0.16, 1, 0.3, 1],
        }}
        className={className}
      >
        {children}
      </motion.div>
    </div>
  );
};

interface PremiumStaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

export const PremiumStaggerContainer: React.FC<PremiumStaggerContainerProps> = ({
  children,
  className = '',
}) => {
  return <div className={className}>{children}</div>;
};

interface PremiumParallaxImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatioClass?: string;
  overlayClass?: string;
}

export const PremiumParallaxImage: React.FC<PremiumParallaxImageProps> = ({
  src,
  alt,
  className = '',
  aspectRatioClass = 'aspect-[16/10]',
  overlayClass,
}) => {
  const [loaded, setLoaded] = React.useState(false);

  return (
    <div className={`relative overflow-hidden group bg-stone-900/10 ${aspectRatioClass} ${className}`}>
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover object-center group-hover:scale-105 transition-all duration-700 ease-out ${
          loaded ? 'opacity-100 filter-none' : 'opacity-0 blur-sm'
        }`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      {overlayClass && <div className={`absolute inset-0 pointer-events-none ${overlayClass}`} />}
    </div>
  );
};
