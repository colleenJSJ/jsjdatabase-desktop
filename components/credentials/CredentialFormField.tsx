'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CredentialFormFieldProps = {
  id?: string;
  label: string;
  children: ReactNode;
  required?: boolean;
  helperText?: ReactNode;
  labelSuffix?: ReactNode;
  description?: ReactNode;
  className?: string;
  labelClassName?: string;
};

export function CredentialFormField({
  id,
  label,
  children,
  required = false,
  helperText,
  labelSuffix,
  description,
  className,
  labelClassName,
}: CredentialFormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-3">
        <label
          htmlFor={id}
          className={cn('text-sm font-medium text-neutral-300', labelClassName)}
        >
          {label}
          {required ? ' *' : ''}
        </label>
        {labelSuffix ? <div className="text-sm text-neutral-400">{labelSuffix}</div> : null}
      </div>
      {description ? <div className="text-sm text-neutral-400">{description}</div> : null}
      {children}
      {helperText ? <p className="text-sm text-neutral-400">{helperText}</p> : null}
    </div>
  );
}
