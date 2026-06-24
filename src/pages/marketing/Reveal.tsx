import type { CSSProperties, ReactNode } from 'react';
import { useReveal } from '@/hooks/useReveal';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms (applied as animation-delay once revealed). */
  delay?: number;
  style?: CSSProperties;
}

/**
 * Fades + rises its children in the first time they scroll into view. Honours
 * `prefers-reduced-motion` (the CSS disables the animation and shows content).
 */
export function Reveal({ children, className = '', delay = 0, style }: RevealProps) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-in' : ''} ${className}`}
      style={delay ? { ...style, animationDelay: `${delay}ms` } : style}
    >
      {children}
    </div>
  );
}
