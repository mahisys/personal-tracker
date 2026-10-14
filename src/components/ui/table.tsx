import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Wrap tables in this so they scroll sideways on phones instead of breaking the page. */
export function TableWrap({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("glass overflow-x-auto rounded-[var(--radius-card)] border border-line shadow-card", className)} {...props} />;
}
export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)} {...props} />;
}
export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("border-b border-line text-left text-[11px] font-bold uppercase tracking-wider text-fg-subtle", className)} {...props} />;
}
export function TH({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("px-4 py-3 font-bold", className)} {...props} />;
}
export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line last:border-0 transition-colors hover:bg-brand-soft/60", className)} {...props} />;
}
export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle text-fg", className)} {...props} />;
}
