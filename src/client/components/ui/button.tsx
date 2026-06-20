import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils.js";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] border text-[inherit] leading-none transition-[background,border-color,color,filter,box-shadow] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.18)] disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-[var(--border)] bg-[var(--field)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
        primary: "border-transparent bg-[var(--accent)] font-black text-white hover:brightness-105",
        danger: "border-red-200 bg-red-50 font-black text-[var(--danger)] hover:border-[var(--danger)]",
        ghost: "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--text)]",
        soft: "border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--field))] font-black text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_48%,var(--border))]"
      },
      size: {
        default: "min-h-10 px-3 text-[13px]",
        sm: "min-h-8 px-2.5 text-xs",
        icon: "h-8 w-8 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ asChild = false, className, size, type = "button", variant, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ size, variant }), className)}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}

export { buttonVariants };
