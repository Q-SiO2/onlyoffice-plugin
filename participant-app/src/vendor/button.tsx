// Adapted from Unlumen UI's free public registry (button).
// Copyright (c) 2026 Léo Wicki. MIT; see docs/licenses/UNLUMEN-MIT.txt.
'use client';

import { motion, type HTMLMotionProps } from 'motion/react';

import { Slot, type WithAsChild } from './slot.tsx';

type ButtonProps = WithAsChild<
  HTMLMotionProps<'button'> & {
    hoverScale?: number;
    tapScale?: number;
  }
>;

function Button({ hoverScale = 1.05, tapScale = 0.95, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : motion.button;

  return <Component whileTap={{ scale: tapScale }} whileHover={{ scale: hoverScale }} {...props} />;
}

export { Button, type ButtonProps };
