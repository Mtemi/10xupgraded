import { useRef, useCallback } from 'react';

export function useSnapScroll() {
  const autoScrollRef = useRef(true);
  const scrollNodeRef = useRef<HTMLDivElement>();
  const onScrollRef = useRef<() => void>();
  const observerRef = useRef<ResizeObserver>();
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  const messageRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const observer = new ResizeObserver(() => {
        // Only auto-scroll if:
        // 1. Auto-scroll is enabled (user is at bottom)
        // 2. User is not actively scrolling
        if (autoScrollRef.current && !isUserScrollingRef.current && scrollNodeRef.current) {
          const { scrollHeight, clientHeight } = scrollNodeRef.current;
          const scrollTarget = scrollHeight - clientHeight;

          scrollNodeRef.current.scrollTo({
            top: scrollTarget,
            behavior: 'auto', // Use 'auto' for instant scroll during content updates
          });
        }
      });

      observer.observe(node);
      observerRef.current = observer;
    } else {
      observerRef.current?.disconnect();
      observerRef.current = undefined;
    }
  }, []);

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      onScrollRef.current = () => {
        const { scrollTop, scrollHeight, clientHeight } = node;
        const scrollTarget = scrollHeight - clientHeight;

        // More generous threshold: within 150px of bottom = auto-scroll enabled
        const threshold = 150;
        const distanceFromBottom = scrollTarget - scrollTop;

        // If user is near bottom, enable auto-scroll
        if (distanceFromBottom <= threshold) {
          autoScrollRef.current = true;
        } else {
          // User has scrolled up significantly - disable auto-scroll
          autoScrollRef.current = false;
        }
      };

      // Detect when user starts scrolling manually
      const handleWheel = () => {
        isUserScrollingRef.current = true;

        // Clear existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // Mark user as done scrolling after 150ms of no scroll events
        scrollTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 150);
      };

      const handleTouchStart = () => {
        isUserScrollingRef.current = true;
      };

      const handleTouchEnd = () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 150);
      };

      node.addEventListener('scroll', onScrollRef.current, { passive: true });
      node.addEventListener('wheel', handleWheel, { passive: true });
      node.addEventListener('touchstart', handleTouchStart, { passive: true });
      node.addEventListener('touchend', handleTouchEnd, { passive: true });

      scrollNodeRef.current = node;
    } else {
      if (onScrollRef.current) {
        scrollNodeRef.current?.removeEventListener('scroll', onScrollRef.current);
      }

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollNodeRef.current = undefined;
      onScrollRef.current = undefined;
    }
  }, []);

  return [messageRef, scrollRef];
}
