import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  Ref,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

import { cn } from "../../lib/utils.js";

export function Field({
  children,
  className,
  label,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { label?: ReactNode }) {
  return (
    <label className={cn("grid gap-1.5 text-[12px] font-bold text-[var(--muted)]", className)} {...props}>
      {label}
      {children}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--field)] px-3 text-[13px] font-semibold text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(10,163,148,.12)]",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--field)] px-3 text-[13px] font-semibold text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(10,163,148,.12)]",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[92px] w-full rounded-[8px] border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-[13px] font-semibold leading-relaxed text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(10,163,148,.12)]",
        className
      )}
      {...props}
    />
  );
}
