export type MotionPresetId =
  | 'editorial_premium'
  | 'cinematic'
  | 'luxury_fashion'
  | 'gastronomia'
  | 'minimalist'
  | 'tech_modern'
  | 'conversion'
  | 'subtle'
  | 'custom';

export type MotionEntranceEffect = 'fade' | 'slide_up' | 'slide_down' | 'mask_reveal' | 'stagger' | 'none';
export type MotionDirection = 'up' | 'down' | 'left' | 'right' | 'none';
export type MotionViewportTrigger = 'once' | 'always';
export type MotionParallaxIntensity = 'none' | 'subtle' | 'medium' | 'high';
export type MotionSpeed = 'fast' | 'balanced' | 'cinematic';
export type MotionEasing = 'smooth_cubic' | 'snappy_spring' | 'editorial_gentle' | 'linear';
export type MotionHoverEffect = 'none' | 'zoom' | 'lift' | 'glow' | 'tilt3d';
export type MotionProductHover = 'none' | 'zoom' | 'lift' | 'border_glow';
export type MotionButtonFeedback = 'scale' | 'glow' | 'none';

export interface MotionEntranceSettings {
  effect: MotionEntranceEffect;
  direction: MotionDirection;
  wordReveal: boolean;
  cinematicImages: boolean;
  staggerChildren: boolean;
}

export interface MotionScrollSettings {
  viewportTrigger: MotionViewportTrigger;
  parallaxIntensity: MotionParallaxIntensity;
  scrollProgressBar: boolean;
  scrollImageScale: boolean;
  continuousMarquee: boolean;
  marqueeSpeed: 'slow' | 'normal' | 'fast';
  marqueeText?: string;
  marqueeMessages?: string[];
  marqueeTextColor?: string;
  marqueeBgColor?: string;
  marqueeDirection?: 'left' | 'right';
  marqueeFontSize?: 'xs' | 'sm' | 'base' | 'lg';
  marqueeSpacing?: 'compact' | 'normal' | 'spacious';
}

export interface MotionInteractionsSettings {
  imageHoverEffect: MotionHoverEffect;
  productCardHover: MotionProductHover;
  buttonTapResponse: MotionButtonFeedback;
  animatedLinkUnderline: boolean;
  card3dTilt: boolean;
  desktopMagnetic: boolean;
}

export interface MotionTransitionsSettings {
  sectionTransition: 'fade' | 'slide' | 'none';
  productModalTransition: 'scale_up' | 'slide_up' | 'fade';
  lightboxEnabled: boolean;
}

export interface MotionTimingSettings {
  speed: MotionSpeed;
  easing: MotionEasing;
  delay: number; // in seconds
  mobileOptimized: boolean;
  respectReducedMotion: boolean;
}

export interface MotionStudioSettings {
  enabled: boolean;
  presetId?: MotionPresetId;
  entrance: MotionEntranceSettings;
  scroll: MotionScrollSettings;
  interactions: MotionInteractionsSettings;
  transitions: MotionTransitionsSettings;
  timing: MotionTimingSettings;
}

export interface MotionPresetDefinition {
  id: MotionPresetId;
  name: string;
  badge: string;
  description: string;
  recommendedSegments: string[];
  settings: MotionStudioSettings;
}
