import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Right sheet (UI-SPEC 4, e.g. PlInsurerEditDrawer 560px): header, scrolling body, sticky footer. Esc / backdrop closes. */
export function Drawer({
  title,
  subtitle,
  width = 560,
  onClose,
  footer,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(28,29,31,0.35)' }}
      onMouseDown={onClose}
    >
      <aside
        className="flex h-full w-full flex-col bg-white shadow-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold tracking-[-0.1px] text-brand">{title}</div>
            {subtitle && <div className="mt-0.5 text-dense text-ink-2">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-2 hover:bg-card-alt"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
