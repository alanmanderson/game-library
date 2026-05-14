import { useEffect, useRef } from 'react';
import { useStore, type AnimationEvent } from '../store/store';

/**
 * Processes the animation queue sequentially.
 * Each event plays for its `duration` ms, then is dequeued.
 * Exposes `currentAnimation` and `isAnimating` from the store.
 */
export function useAnimationQueue() {
  const queue = useStore((s) => s.animationQueue);
  const currentAnimation = useStore((s) => s.currentAnimation);
  const isAnimating = useStore((s) => s.isAnimating);
  const setCurrentAnimation = useStore((s) => s.setCurrentAnimation);
  const dequeueAnimation = useStore((s) => s.dequeueAnimation);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef<string | null>(null);

  useEffect(() => {
    // If we have items in the queue and nothing is currently processing
    if (queue.length > 0 && !currentAnimation) {
      const next = queue[0];
      // Prevent double-processing the same event
      if (processingRef.current === next.id) return;
      processingRef.current = next.id;
      setCurrentAnimation(next);

      timerRef.current = setTimeout(() => {
        dequeueAnimation();
        processingRef.current = null;
        timerRef.current = null;
      }, next.duration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [queue, currentAnimation, setCurrentAnimation, dequeueAnimation]);

  return { currentAnimation, isAnimating };
}
