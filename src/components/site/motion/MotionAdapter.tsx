import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { MotionStudioSettings } from '../../../types/motion';
import { DEFAULT_MOTION_SETTINGS } from '../../../constants/motionPresets';

interface MotionStudioContextValue {
  settings: MotionStudioSettings;
  isReducedMotion: boolean;
  getDuration: () => number;
  getEasing: () => any;
}

const MotionStudioContext = createContext<MotionStudioContextValue>({
  settings: DEFAULT_MOTION_SETTINGS,
  isReducedMotion: false,
  getDuration: () => 0.65,
  getEasing: () => [0.22, 1, 0.36, 1],
});

export const useMotionStudio = () => useContext(MotionStudioContext);

interface MotionStudioProviderProps {
  settings?: MotionStudioSettings | null;
  children: React.ReactNode;
}

export const MotionStudioProvider: React.FC<MotionStudioProviderProps> = ({
  settings: customSettings,
  children,
}) => {
  const systemReduced = useReducedMotion();
  const settings: MotionStudioSettings = useMemo(() => {
    if (!customSettings) return DEFAULT_MOTION_SETTINGS;
    return {
      enabled: customSettings.enabled ?? DEFAULT_MOTION_SETTINGS.enabled,
      presetId: customSettings.presetId ?? DEFAULT_MOTION_SETTINGS.presetId,
      entrance: { ...DEFAULT_MOTION_SETTINGS.entrance, ...(customSettings.entrance || {}) },
      scroll: { ...DEFAULT_MOTION_SETTINGS.scroll, ...(customSettings.scroll || {}) },
      interactions: { ...DEFAULT_MOTION_SETTINGS.interactions, ...(customSettings.interactions || {}) },
      transitions: { ...DEFAULT_MOTION_SETTINGS.transitions, ...(customSettings.transitions || {}) },
      timing: { ...DEFAULT_MOTION_SETTINGS.timing, ...(customSettings.timing || {}) },
    };
  }, [customSettings]);

  const isReducedMotion = !!(settings.timing?.respectReducedMotion && systemReduced);

  const duration = useMemo(() => {
    switch (settings.timing.speed) {
      case 'fast':
        return 0.35;
      case 'cinematic':
        return 1.1;
      case 'balanced':
      default:
        return 0.65;
    }
  }, [settings.timing.speed]);

  const easing = useMemo(() => {
    switch (settings.timing.easing) {
      case 'snappy_spring':
        return [0.175, 0.885, 0.32, 1.15];
      case 'editorial_gentle':
        return [0.16, 1, 0.3, 1];
      case 'linear':
        return 'linear';
      case 'smooth_cubic':
      default:
        return [0.22, 1, 0.36, 1];
    }
  }, [settings.timing.easing]);

  const value = useMemo(
    () => ({
      settings,
      isReducedMotion,
      getDuration: () => duration,
      getEasing: () => easing,
    }),
    [settings, isReducedMotion, duration, easing]
  );

  return (
    <MotionStudioContext.Provider value={value}>
      {/* Top Scroll Progress Bar */}
      {settings.enabled && settings.scroll.scrollProgressBar && !isReducedMotion && (
        <MotionProgressBar />
      )}
      {children}
    </MotionStudioContext.Provider>
  );
};

/**
 * Top Scroll Progress Indicator
 */
export const MotionProgressBar: React.FC<{ color?: string }> = ({ color }) => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 z-50 origin-left"
      style={{
        scaleX,
        backgroundColor: color || 'var(--motion-primary, #6366f1)',
      }}
    />
  );
};

/**
 * Smart Viewport Entrance Reveal
 */
interface MotionRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  distance?: number;
  effectOverride?: 'fade' | 'slide_up' | 'slide_down' | 'mask_reveal' | 'none';
}

export const MotionReveal: React.FC<MotionRevealProps> = ({
  children,
  className = '',
  delay = 0,
  direction,
  distance = 32,
  effectOverride,
}) => {
  const { settings, isReducedMotion, getDuration, getEasing } = useMotionStudio();

  if (!settings.enabled || isReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const effect = effectOverride || settings.entrance.effect;
  if (effect === 'none') {
    return <div className={className}>{children}</div>;
  }

  const activeDirection = direction || settings.entrance.direction;
  const computedDelay = (settings.timing.delay || 0) + delay;
  const duration = getDuration();
  const ease = getEasing();

  const offset = {
    x: activeDirection === 'left' ? -distance : activeDirection === 'right' ? distance : 0,
    y: activeDirection === 'up' ? distance : activeDirection === 'down' ? -distance : 0,
  };

  if (effect === 'mask_reveal') {
    return (
      <div className={`overflow-hidden ${className}`}>
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: settings.scroll.viewportTrigger === 'once', margin: '-30px' }}
          transition={{
            duration,
            delay: computedDelay,
            ease,
          }}
        >
          {children}
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: offset.x,
        y: offset.y,
        scale: settings.entrance.cinematicImages ? 0.98 : 1,
      }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
      }}
      viewport={{ once: settings.scroll.viewportTrigger === 'once', margin: '-40px' }}
      transition={{
        duration,
        delay: computedDelay,
        ease,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/**
 * Masked Headline / Word-by-word Reveal
 */
interface MotionTextRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const MotionTextReveal: React.FC<MotionTextRevealProps> = ({
  children,
  className = '',
  delay = 0,
}) => {
  const { settings, isReducedMotion, getDuration, getEasing } = useMotionStudio();

  if (!settings.enabled || isReducedMotion || !settings.entrance.wordReveal) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className="overflow-hidden">
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: settings.scroll.viewportTrigger === 'once', margin: '-20px' }}
        transition={{
          duration: getDuration(),
          delay: (settings.timing.delay || 0) + delay,
          ease: getEasing(),
        }}
        className={className}
      >
        {children}
      </motion.div>
    </div>
  );
};

/**
 * Image Reveal with Smooth Cinematic Zoom
 */
interface MotionImageRevealProps {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  aspectRatioClass?: string;
  overlayClass?: string;
}

export const MotionImageReveal: React.FC<MotionImageRevealProps> = ({
  src,
  alt,
  className = '',
  imgClassName = '',
  aspectRatioClass = 'aspect-[16/10]',
  overlayClass,
}) => {
  const { settings, isReducedMotion } = useMotionStudio();
  const [loaded, setLoaded] = useState(false);

  const hoverEffect = settings.interactions.imageHoverEffect;
  const hoverZoomClass =
    hoverEffect === 'zoom'
      ? 'group-hover:scale-106'
      : hoverEffect === 'lift'
      ? 'group-hover:-translate-y-1 group-hover:scale-102'
      : hoverEffect === 'glow'
      ? 'group-hover:brightness-110'
      : '';

  return (
    <div className={`relative overflow-hidden group bg-stone-900/10 ${aspectRatioClass} ${className}`}>
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover object-center transition-all duration-700 ease-out ${hoverZoomClass} ${
          loaded ? 'opacity-100 filter-none' : 'opacity-0 blur-sm'
        } ${imgClassName}`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      {overlayClass && <div className={`absolute inset-0 pointer-events-none ${overlayClass}`} />}
    </div>
  );
};

/**
 * Infinite 60fps Typography Marquee Banner
 */
interface MotionMarqueeProps {
  text?: string;
  className?: string;
  speed?: 'slow' | 'normal' | 'fast';
  bgColor?: string;
  textColor?: string;
  direction?: 'left' | 'right';
  fontSize?: 'xs' | 'sm' | 'base' | 'lg';
  spacing?: 'compact' | 'normal' | 'spacious';
}

export const MotionMarquee: React.FC<MotionMarqueeProps> = ({
  text,
  className = '',
  speed,
  bgColor,
  textColor,
  direction: propDirection,
  fontSize: propFontSize,
  spacing: propSpacing,
}) => {
  const { settings, isReducedMotion } = useMotionStudio();

  if (!settings.enabled || isReducedMotion || !settings.scroll.continuousMarquee) {
    return null;
  }

  const activeText = text || settings.scroll.marqueeText || 'QUALIDADE CERTIFICADA • ATENDIMENTO EXCLUSIVO • LOCALHUB';
  const activeSpeed = speed || settings.scroll.marqueeSpeed || 'normal';
  const activeBg = bgColor || settings.scroll.marqueeBgColor || '#0f172a';
  const activeColor = textColor || settings.scroll.marqueeTextColor || '#f8fafc';
  const activeDirection = propDirection || settings.scroll.marqueeDirection || 'left';
  const activeFontSize = propFontSize || settings.scroll.marqueeFontSize || 'sm';
  const activeSpacing = propSpacing || settings.scroll.marqueeSpacing || 'normal';

  const durationSec = activeSpeed === 'fast' ? 14 : activeSpeed === 'slow' ? 36 : 22;

  const fontClass =
    activeFontSize === 'xs'
      ? 'text-[10px] sm:text-xs'
      : activeFontSize === 'base'
      ? 'text-sm sm:text-base'
      : activeFontSize === 'lg'
      ? 'text-base sm:text-lg'
      : 'text-xs sm:text-sm';

  const gapClass =
    activeSpacing === 'compact'
      ? 'gap-5 sm:gap-6'
      : activeSpacing === 'spacious'
      ? 'gap-12 sm:gap-16'
      : 'gap-8 sm:gap-10';

  // Support list of messages or delimiter split
  const rawList = (settings.scroll.marqueeMessages && settings.scroll.marqueeMessages.length > 0)
    ? settings.scroll.marqueeMessages
    : activeText.includes('•')
    ? activeText.split('•').map((s) => s.trim()).filter(Boolean)
    : [activeText];

  // Repeat sequence 4 times so infinite marquee is completely seamless without blanks
  const sequence = [...rawList, ...rawList, ...rawList, ...rawList];

  return (
    <div
      className={`w-full max-w-full overflow-hidden py-2.5 sm:py-3.5 uppercase tracking-widest font-black select-none border-y border-white/10 ${fontClass} ${className}`}
      style={{ backgroundColor: activeBg, color: activeColor }}
    >
      <div className="flex w-max items-center max-w-full">
        <motion.div
          animate={{ x: activeDirection === 'right' ? ['-50%', '0%'] : ['0%', '-50%'] }}
          transition={{
            repeat: Infinity,
            repeatType: 'loop',
            duration: durationSec,
            ease: 'linear',
          }}
          className={`flex items-center ${gapClass} whitespace-nowrap px-4 will-change-transform`}
        >
          {sequence.map((msg, idx) => (
            <React.Fragment key={idx}>
              <span>{msg}</span>
              <span className="opacity-60 text-xs">✦</span>
            </React.Fragment>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

/**
 * Tactile Button with interactive micro-tap feedback
 */
interface MotionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

export const MotionButton: React.FC<MotionButtonProps> = ({
  children,
  className = '',
  onClick,
  disabled,
  ...props
}) => {
  const { settings, isReducedMotion } = useMotionStudio();

  if (!settings.enabled || isReducedMotion || settings.interactions.buttonTapResponse === 'none') {
    return (
      <button onClick={onClick} disabled={disabled} className={className} {...props}>
        {children}
      </button>
    );
  }

  const isGlow = settings.interactions.buttonTapResponse === 'glow';

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={onClick}
      disabled={disabled}
      className={`${className} ${isGlow ? 'hover:shadow-lg hover:shadow-indigo-500/25' : ''}`}
      {...(props as any)}
    >
      {children}
    </motion.button>
  );
};

/**
 * Interactive Card with subtle 3D tilt or elevation
 */
interface MotionCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const MotionCard: React.FC<MotionCardProps> = ({
  children,
  className = '',
  onClick,
}) => {
  const { settings, isReducedMotion } = useMotionStudio();

  if (!settings.enabled || isReducedMotion) {
    return (
      <div className={className} onClick={onClick}>
        {children}
      </div>
    );
  }

  const tilt = settings.interactions.card3dTilt;
  const hoverProduct = settings.interactions.productCardHover;

  return (
    <motion.div
      whileHover={{
        y: hoverProduct === 'lift' ? -6 : -2,
        scale: hoverProduct === 'zoom' ? 1.02 : 1,
      }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={`${className} ${tilt ? 'perspective-1000' : ''}`}
    >
      {children}
    </motion.div>
  );
};
