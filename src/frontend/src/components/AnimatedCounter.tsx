import React, { useEffect, useState, useRef } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({ 
  value, 
  duration = 1500 
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const animationFrameRef = useRef<number | null>(null);
  const previousValueRef = useRef(value);
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip animation on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    // Cancel any ongoing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const startTime = Date.now();
    const startValue = previousValueRef.current;
    const valueChange = value - startValue;

    // If no change, just update and return
    if (valueChange === 0) {
      setDisplayValue(value);
      previousValueRef.current = value;
      return;
    }

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = Math.round(startValue + valueChange * easeOutQuart);
      
      // Ensure we stay within bounds
      const boundedValue = valueChange > 0 
        ? Math.min(currentValue, value)
        : Math.max(currentValue, value);
      
      setDisplayValue(boundedValue);
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
        previousValueRef.current = value;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup function to cancel animation on unmount or value change
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [value, duration]);

  return <>{displayValue.toLocaleString()}</>;
};
