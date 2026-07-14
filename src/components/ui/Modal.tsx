import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-lg border border-line-strong bg-surface p-0 text-ink backdrop:bg-black/60"
    >
      <div className="p-5">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </dialog>
  );
}
