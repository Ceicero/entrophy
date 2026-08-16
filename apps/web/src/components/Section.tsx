import type { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: 'section' | 'div';
}

/** Consistent section shell: max-width container, generous vertical rhythm, optional eyebrow/title/subtitle. */
export function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  className,
  as = 'section',
  ...rest
}: SectionProps) {
  const Tag = as;
  return (
    <Tag id={id} className={clsx('mx-auto max-w-6xl px-6 py-16 sm:py-24', className)} {...rest}>
      {(eyebrow || title || subtitle) && (
        <div className="mb-12 max-w-2xl">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-widest text-grey-3">{eyebrow}</p>
          )}
          {title && (
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-grey-7 sm:text-4xl">{title}</h2>
          )}
          {subtitle && <p className="mt-4 text-base leading-relaxed text-grey-3">{subtitle}</p>}
        </div>
      )}
      {children}
    </Tag>
  );
}
