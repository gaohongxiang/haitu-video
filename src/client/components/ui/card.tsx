import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/utils.js";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[8px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  heading,
  icon,
  right,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  heading: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)} {...props}>
      <h2 className="m-0 flex min-w-0 items-center gap-2 text-[15px] font-black">
        <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[var(--panel2)] text-[var(--accent)]">
          {icon}
        </span>
        <span className="truncate">{heading}</span>
      </h2>
      {right}
    </div>
  );
}
