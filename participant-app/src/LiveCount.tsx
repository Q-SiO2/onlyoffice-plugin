import { useReducedMotion } from 'motion/react';
import { CountUp } from './vendor/count-up.tsx';

export function LiveCount({ value }: { value: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="live-count">
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{reduce ? value : <CountUp to={value} duration={0.45} />}</span>
    </span>
  );
}
