import { motion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Header } from '~/components/header/Header';
import { UserProfile } from '~/components/sidebar/UserProfile';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import TermsOfService from '~/pages/TermsOfService';
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
    <div className="w-full bg-white dark:bg-black">
      <ClientOnly>{() => <Menu />}</ClientOnly>
      <div className="fixed top-0 w-full">
        <Header />
      </div>
      <TermsOfService />;
    </div>
  );
};

export default about;
