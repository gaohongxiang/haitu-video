import { CheckCircle2, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "../lib/utils.js";

export function CompactChoiceDropdown<T extends string>({
  label,
  value,
  options,
  formatOption,
  onChange,
  disabled = false,
  layout = "stacked",
  density = "comfortable"
}: {
  label: ReactNode;
  value: T;
  options: T[];
  formatOption: (option: T) => string;
  onChange: (option: T) => void;
  disabled?: boolean;
  layout?: "stacked" | "inline" | "pill";
  density?: "comfortable" | "compact" | "micro";
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = formatOption(value);
  const dropdownDisabled = disabled || options.length === 0;
  const compact = density === "compact";
  const micro = density === "micro";
  const pill = layout === "pill";

  return (
    <div
      className={cn(
        "compact-choice-dropdown relative grid min-w-0",
        layout === "inline"
          ? "min-h-11 grid-cols-[44px_minmax(0,1fr)] items-center gap-2 rounded-[13px] border border-[var(--border-strong)] bg-[var(--field)] px-3 text-[13px] shadow-[0_8px_18px_rgba(96,64,43,.05)] transition"
          : "gap-1.5",
        pill && "block",
        layout === "inline" && open && "border-[color-mix(in_srgb,var(--accent)_65%,var(--border-strong))] shadow-[0_0_0_3px_rgba(10,163,148,.12),0_8px_18px_rgba(96,64,43,.05)]"
      )}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      {pill ? null : (
        <div className={cn(
          "truncate font-black text-[var(--muted)]",
          layout === "inline" ? "text-[13px]" : (compact || micro) ? "text-[11px]" : "text-xs"
        )}>{label}</div>
      )}
      <button
        type="button"
        className={cn(
          "flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-[13px] border bg-[var(--field)] px-3 text-left text-sm font-black text-[var(--text)] shadow-[0_8px_18px_rgba(96,64,43,.05)] transition",
          compact && "min-h-9 rounded-[10px] px-2.5 text-[13px] shadow-none",
          layout === "inline" && "h-full min-h-11 border-0 bg-transparent px-0 shadow-none hover:border-0 hover:bg-transparent",
          pill && "min-h-9 w-full rounded-[8px] border-[var(--border)] bg-[var(--field)] px-2.5 text-xs shadow-none hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border-strong))]",
          pill && micro && "min-h-7 rounded-[7px] border-transparent bg-transparent px-1.5 text-[11px] font-bold text-[color-mix(in_srgb,var(--text)_78%,var(--muted))] hover:border-transparent hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]",
          dropdownDisabled && "cursor-not-allowed opacity-60 shadow-none",
          layout === "stacked" && (open
            ? "border-[color-mix(in_srgb,var(--accent)_65%,var(--border-strong))] shadow-[0_0_0_3px_rgba(10,163,148,.12),0_8px_18px_rgba(96,64,43,.05)]"
            : "border-[var(--border-strong)] hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border-strong))]")
        )}
        disabled={dropdownDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (dropdownDisabled) return;
          setOpen((current) => !current);
        }}
      >
        {pill ? <span className="shrink-0 text-[var(--muted)]">{label}</span> : null}
        <span className="min-w-0 truncate">{activeLabel}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--muted)] transition", open && "rotate-180 text-[var(--accent)]")} />
      </button>
      {open && !dropdownDisabled ? (
        <div
          className={cn(
            "absolute right-0 top-[calc(100%+8px)] z-40 grid max-h-[240px] gap-1 overflow-auto rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] p-1.5 shadow-[0_18px_42px_rgba(96,64,43,.16)]",
            "left-0"
          )}
          role="listbox"
        >
          {options.map((option) => {
            const active = option === value;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={active}
                className={cn(
                  "grid min-h-10 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-black transition",
                  active
                    ? "bg-[color-mix(in_srgb,var(--accent)_12%,var(--panel))] text-[var(--text)]"
                    : "text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
                )}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span className={cn("grid h-4 w-4 place-items-center rounded-full", active ? "text-[var(--accent)]" : "text-transparent")}>
                  <CheckCircle2 size={14} />
                </span>
                <span className="min-w-0 truncate">{formatOption(option)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
