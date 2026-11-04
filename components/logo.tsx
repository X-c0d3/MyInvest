import { TrendingUp } from "lucide-react";

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-sm dark:text-[#06281f]">
        <TrendingUp className="size-5" strokeWidth={2.5} />
      </span>
      <span className="text-lg font-bold tracking-tight">
        My<span className="text-accent">Invest</span>
      </span>
    </span>
  );
}
