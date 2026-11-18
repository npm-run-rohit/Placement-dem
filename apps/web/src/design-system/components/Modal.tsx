import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** PlModal -> Modal: md 560 / lg 860 / xl 1000, sunk footer right-aligned (UI-SPEC 4). */
export function Modal({
  title,
  subtitle,
  size = 'md',
  onClose,
  footer,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const width = { md: 560, lg: 860, xl: 1000 }[size];
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(28,29,31,0.45)' }}
      onMouseDown={onClose}
    >
      <div
        className="animate-modal flex max-h-[86vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold tracking-[-0.1px] text-brand">{title}</div>
            {subtitle && <div className="mt-0.5 text-[13px] text-ink-2">{subtitle}</div>}
          </div>
          <button
            className="rounded-lg p-1 text-ink-2 hover:bg-brand-50 hover:text-brand"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line-soft bg-card-sunk px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
