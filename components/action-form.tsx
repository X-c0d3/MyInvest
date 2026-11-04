"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { FormState } from "@/app/actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  editId?: number;
  cancelHref?: string;
  submitLabel?: string;
  className?: string;
};

/** Form shell shared by every entity: shows validation errors and pending state. Fields come from the server. */
export function ActionForm({ action, children, editId, cancelHref, submitLabel, className }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  // React resets the form after each submit; put the user's input back when the save failed.
  useEffect(() => {
    const form = formRef.current;
    if (!form || !state.values) return;
    for (const [name, value] of Object.entries(state.values)) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = value;
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className ?? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
      {editId ? <input type="hidden" name="id" value={editId} /> : null}
      {children}
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "กำลังบันทึก…" : (submitLabel ?? (editId ? "บันทึกการแก้ไข" : "เพิ่มรายการ"))}
        </button>
        {editId && cancelHref ? (
          <Link href={cancelHref} className="btn-ghost">
            ยกเลิก
          </Link>
        ) : null}
        {state.error ? <p className="rounded-lg bg-neg-soft px-3 py-1.5 text-sm text-neg">⚠️ {state.error}</p> : null}
      </div>
    </form>
  );
}
