import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "soft";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]";

const variants: Record<ButtonVariant, string> = {
  primary:
    "text-white bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] shadow-[0_8px_20px_-8px_var(--brand)] hover:shadow-[0_12px_28px_-8px_var(--brand)] hover:-translate-y-px",
  secondary: "bg-solid text-fg border border-line-strong shadow-sm hover:bg-muted hover:-translate-y-px",
  ghost: "text-fg-muted hover:text-fg hover:bg-brand-soft",
  soft: "bg-brand-soft text-brand hover:bg-brand/15",
  danger: "bg-bad/10 text-bad hover:bg-bad hover:text-white",
  success: "text-white bg-[linear-gradient(135deg,#10b981,#22c1a3)] shadow-[0_8px_20px_-8px_#10b981] hover:-translate-y-px",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-9 w-9 p-0",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
