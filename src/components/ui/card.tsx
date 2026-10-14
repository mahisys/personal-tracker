import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, interactive, ...props }: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "glass rounded-[var(--radius-card)] border border-line shadow-card",
        interactive && "transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ title, description, actions, icon, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">{icon}</div> : null}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold text-fg">{title}</h3>
          {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}
