"use client";
import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { celebrate } from "./celebrate";

export const ModalCloseContext = createContext<(() => void) | null>(null);

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * Form bound to a server action returning ActionResult. Shows a toast on success or error,
 * fires confetti when `celebrate` is set, closes the surrounding <Modal>, and resets itself.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const close = useContext(ModalCloseContext);
  const router = useRouter();

  useEffect(() => {
    if (!state) return;
    if (state.error) {
      toast.error(state.error);
      return;
    }
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (state.celebrate) celebrate();
      if (resetOnSuccess) ref.current?.reset();
      close?.();
      onSuccess?.();
      if (state.redirectTo) router.push(state.redirectTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingText,
  name,
  value,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, size, className)}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/**
 * A one-button form for quick actions (Mark done, Mark paid, Delete).
 * Pass `confirm` to ask before running it.
 */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "sm",
  className,
  confirm,
  hidden,
  title,
}: {
  action: Action;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  confirm?: string;
  hidden?: Record<string, string | number | null | undefined>;
  title?: string;
}) {
  return (
    <ActionForm action={action} className="inline-flex" resetOnSuccess={false}>
      {hidden
        ? Object.entries(hidden).map(([k, v]) => (v == null ? null : <input key={k} type="hidden" name={k} value={String(v)} />))
        : null}
      <ConfirmingSubmit variant={variant} size={size} className={className} confirm={confirm} title={title}>
        {children}
      </ConfirmingSubmit>
    </ActionForm>
  );
}

function ConfirmingSubmit({ children, confirm, variant, size, className, title }: { children: ReactNode; confirm?: string; variant: ButtonVariant; size: ButtonSize; className?: string; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      title={title}
      aria-label={title}
      disabled={pending}
      className={buttonClass(variant, size, className)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}
