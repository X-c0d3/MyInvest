import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { AssetType, Portfolio } from "@/lib/data";
import { ASSET_LABEL, fmt, portfolioEmoji } from "@/lib/format";
import { DeleteButton } from "./delete-button";
import type { DeletableTable } from "@/lib/data";

export function PageHeader({
  emoji,
  title,
  subtitle,
  children,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-xl"
          aria-hidden
        >
          {emoji}
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Card({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            {icon ? <span className="text-accent">{icon}</span> : null}
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  emoji,
  label,
  value,
  hint,
  tone = "",
  iconClassName = "bg-subtle",
}: {
  /** An emoji or an icon element. */
  emoji: ReactNode;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: string;
  iconClassName?: string;
}) {
  return (
    <div className="card flex items-center gap-3 py-3.5">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-lg ${iconClassName}`}
        aria-hidden
      >
        {emoji}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p
          className={`mt-0.5 truncate text-xl font-bold tracking-tight tabular-nums 2xl:text-2xl ${tone}`}
        >
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  wide,
  hint,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  return (
    <label
      className={`flex flex-col gap-1.5 text-sm ${wide ? "sm:col-span-2" : ""}`}
    >
      <span className="font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const portfolioLabel = (p: Portfolio) =>
  `${portfolioEmoji(p)} ${p.name}${p.currency !== "THB" ? ` (${p.currency})` : ""}`;

export function PortfolioSelect({
  portfolios,
  defaultValue,
}: {
  portfolios: Portfolio[];
  defaultValue?: number;
}) {
  return (
    <select
      name="portfolioId"
      defaultValue={defaultValue ?? portfolios[0]?.id}
      className="input"
      required
    >
      {portfolios.map((p) => (
        <option key={p.id} value={p.id}>
          {portfolioLabel(p)}
        </option>
      ))}
    </select>
  );
}

/** Tabs that filter a page by portfolio via ?p=<id>. */
export function PortfolioTabs({
  portfolios,
  current,
  basePath,
}: {
  portfolios: Portfolio[];
  current: number | null;
  basePath: string;
}) {
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-transparent bg-accent text-white shadow-sm dark:text-[#06281f]"
          : "border-line bg-surface hover:bg-subtle"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {tab(basePath, "🗂️ ทุกพอร์ต", current === null)}
      {portfolios.map((p) =>
        tab(`${basePath}?p=${p.id}`, portfolioLabel(p), current === p.id),
      )}
    </div>
  );
}

export function EmptyRow({
  cols,
  emoji = "🌱",
  text = "ยังไม่มีรายการ",
}: {
  cols: number;
  emoji?: string;
  text?: string;
}) {
  return (
    <tr>
      <td colSpan={cols} className="py-12 text-center text-muted">
        <div className="mb-2 text-3xl">{emoji}</div>
        {text}
      </td>
    </tr>
  );
}

export function AssetBadge({ type }: { type: AssetType }) {
  const a = ASSET_LABEL[type];
  return (
    <span className={`badge ${a.className}`}>
      {a.emoji} {a.label}
    </span>
  );
}

/** Amount with its currency code when it is not baht. */
export function Money({
  value,
  currency,
  digits,
}: {
  value: number;
  currency: string;
  digits?: number;
}) {
  return (
    <>
      {fmt(value, digits)}
      {currency !== "THB" ? (
        <span className="ml-1 text-xs text-muted">{currency}</span>
      ) : null}
    </>
  );
}

/** Opens the page's form modal via ?new=1, keeping the current portfolio filter. */
export function NewButton({
  basePath,
  current,
  href,
  label = "เพิ่มรายการ",
}: {
  basePath: string;
  current?: number | null;
  /** Full link override, for pages that keep other filters in the URL. */
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href ?? `${basePath}?new=1${current ? `&p=${current}` : ""}`}
      scroll={false}
      className="btn-primary"
    >
      <Plus className="size-4" strokeWidth={2.5} />
      {label}
    </Link>
  );
}

export function RowActions({
  href,
  table,
  id,
  label,
}: {
  href: string;
  table: DeletableTable;
  id: number;
  label: string;
}) {
  return (
    <div className="row-actions flex items-center justify-end gap-1">
      <Link href={href} scroll={false} className="icon-btn" title="แก้ไข">
        <Pencil className="size-4" />
        <span className="sr-only">แก้ไข</span>
      </Link>
      <DeleteButton table={table} id={id} label={label} />
    </div>
  );
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Reads ?p and keeps it only if it is one of the user's portfolios. */
export function pickPortfolio(
  portfolios: Portfolio[],
  raw: string | string[] | undefined,
) {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  return portfolios.some((p) => p.id === id) ? id : null;
}

export function pickEdit(raw: string | string[] | undefined) {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
