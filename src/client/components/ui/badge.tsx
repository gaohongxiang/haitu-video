import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.js";

type BadgeTone = "neutral" | "ok" | "danger" | "warn";

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2 text-[11px] font-black",
        tone === "ok" && "border-emerald-200 bg-emerald-50 text-[var(--ok)]",
        tone === "danger" && "border-red-200 bg-red-50 text-[var(--danger)]",
        tone === "warn" && "border-amber-200 bg-amber-50 text-[var(--warn)]",
        tone === "neutral" && "border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]",
        className
      )}
      {...props}
    />
  );
}
