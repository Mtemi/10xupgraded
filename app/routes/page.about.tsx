import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '~/components/header/Header';
import { UserProfile } from '~/components/sidebar/UserProfile';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import About from '~/pages/About';
import { cubicEasingFn } from '~/utils/easings';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-150px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

const about = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const enterThreshold = 40;
    const exitThreshold = 40;

    function onMouseMove(event: MouseEvent) {
      if (event.pageX < enterThreshold) {
        setOpen(true);
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  return (
    <div className="w-full min-h-screen bg-bolt-elements-background-depth-1">
      <ClientOnly>{() => <Menu />}</ClientOnly>
      <div className="fixed top-0 w-full z-20">
        <Header />
      </div>
      {/* Add top padding to account for fixed header */}
      <div className="pt-[var(--header-height)]">
        <About />
      </div>
    </div>
  );
};

export default about;
