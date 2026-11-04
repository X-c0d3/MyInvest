"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteAction } from "@/app/actions";
import type { DeletableTable } from "@/lib/data";

/** Two-step delete: the first click arms it, the second confirms. */
export function DeleteButton({ table, id, label }: { table: DeletableTable; id: number; label: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!armed) {
    return (
      <button type="button" className="icon-btn hover:!bg-neg-soft hover:!text-neg" title="ลบ" onClick={() => setArmed(true)}>
        <Trash2 className="size-4" />
        <span className="sr-only">ลบ</span>
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" title={`ลบ ${label}`}>
      <button
        type="button"
        disabled={pending}
        className="rounded-lg bg-neg px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        onClick={() => startTransition(() => deleteAction(table, id))}
      >
        {pending ? "กำลังลบ…" : "ยืนยันลบ"}
      </button>
      <button type="button" disabled={pending} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-subtle" onClick={() => setArmed(false)}>
        ยกเลิก
      </button>
    </span>
  );
}
