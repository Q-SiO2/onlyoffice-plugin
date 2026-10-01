import { type ComponentProps, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Button as ButtonPrimitive, type ButtonProps } from './vendor/button.tsx';
import '@fontsource-variable/manrope';

export function Button({ type = 'submit', className = '', ...props }: ButtonProps) {
  const reduce = useReducedMotion();
  return (
    <ButtonPrimitive
      type={type}
      hoverScale={reduce ? 1 : 1.015}
      tapScale={reduce ? 1 : 0.985}
      className={className}
      {...props}
    />
  );
}
export function Card({ as = 'div', ...props }: ComponentProps<'div'> & { as?: 'div' | 'section' }) {
  const Component = as;
  return <Component {...props} />;
}
export function Input(props: ComponentProps<'input'>) {
  return <input {...props} />;
}
export function Progress({
  value,
  max,
  ...props
}: ComponentProps<'div'> & { value: number; max: number }) {
  return (
    <div
      className="ui-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      {...props}
    >
      <div
        className="ui-progress__bar"
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}
export function SectionLabel({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <div className="section-label">
      <span className="section-icon" aria-hidden="true">
        {icon}
      </span>
      {children}
    </div>
  );
}
