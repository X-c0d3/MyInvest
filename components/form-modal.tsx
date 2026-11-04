"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A native <dialog> whose open state comes from the URL (?new=1 or ?edit=<id>).
 * Closing navigates to `closeHref`; a successful save redirects to the list URL, which closes it too.
 */
export function FormModal({
  open,
  title,
  emoji,
  closeHref,
  children,
}: {
  open: boolean;
  title: string;
  emoji: string;
  closeHref: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => router.replace(closeHref, { scroll: false });

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault(); // Esc: let the URL drive the close so state stays in sync
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(); // click on the backdrop
      }}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-visible rounded-3xl border border-line bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:animate-[modal-in_160ms_ease-out]"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="flex items-center gap-3 text-lg font-semibold">
            <span
              className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-xl"
              aria-hidden
            >
              {emoji}
            </span>
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            className="icon-btn"
            title="ปิด"
          >
            <X className="size-5" />
            <span className="sr-only">ปิด</span>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </dialog>
  );
}
