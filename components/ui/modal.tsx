'use client';

import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  className?: string;
  closeOnOverlayClick?: boolean;
  ariaLabel?: string;
};

export function Modal({
  isOpen,
  onClose,
  children,
  size = 'lg',
  className,
  closeOnOverlayClick = false,
  ariaLabel,
}: ModalProps) {
  if (!isOpen) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  const handleOverlayClick = () => {
    if (closeOnOverlayClick) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden
        onClick={handleOverlayClick}
      />
      <div className={cn('relative z-10 w-full', sizeClass)}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className={cn(
            'relative overflow-hidden rounded-2xl border border-gray-600/30 bg-background-secondary shadow-2xl shadow-black/40',
            className
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type ModalSectionProps = {
  children: ReactNode;
  className?: string;
};

export function ModalHeader({ children, className }: ModalSectionProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-gray-600/30 px-6 py-4', className)}>
      {children}
    </div>
  );
}

export function ModalBody({ children, className }: ModalSectionProps) {
  return <div className={cn('px-6 py-5', className)}>{children}</div>;
}

export function ModalFooter({ children, className }: ModalSectionProps) {
  return (
    <div className={cn('flex flex-col-reverse gap-3 border-t border-gray-600/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-end', className)}>
      {children}
    </div>
  );
}

type ModalTitleProps = {
  children: ReactNode;
  className?: string;
};

export function ModalTitle({ children, className }: ModalTitleProps) {
  return <h2 className={cn('text-xl font-semibold text-text-primary', className)}>{children}</h2>;
}

export function ModalDescription({ children, className }: ModalTitleProps) {
  return <p className={cn('text-sm text-text-muted', className)}>{children}</p>;
}

type ModalCloseButtonProps = {
  onClose: () => void;
  className?: string;
};

export function ModalCloseButton({ onClose, className }: ModalCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClose}
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-white/5 hover:text-text-primary', className)}
      aria-label="Close"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
