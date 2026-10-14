import { Check, CheckCheck, Circle, FileStack, MinusCircle, Plus, Trash2, Undo2 } from "lucide-react";
import type { InferSelectModel } from "drizzle-orm";
import type { loanDocuments } from "@/db/schema";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Progress } from "@/components/ui/stat";
import { cn } from "@/lib/cn";
import { addDocAction, deleteDocAction, setDocStatusAction } from "@/server/dsa/actions";
import { DOC_NEXT_STATUS, DOC_STATUS_LABELS } from "@/server/dsa/constants";

type Doc = InferSelectModel<typeof loanDocuments>;

const icon = {
  pending: <Circle className="h-4 w-4" />,
  received: <Check className="h-4 w-4" />,
  submitted: <CheckCheck className="h-4 w-4" />,
  not_needed: <MinusCircle className="h-4 w-4" />,
};
const iconTone = {
  pending: "bg-solid text-fg-subtle ring-1 ring-line-strong hover:ring-amber-400 hover:text-amber-600",
  received: "bg-emerald-500 text-white",
  submitted: "bg-sky-500 text-white",
  not_needed: "bg-muted text-fg-subtle",
};

export function DocChecklist({ fileId, docs }: { fileId: string; docs: Doc[] }) {
  const needed = docs.filter((d) => d.status !== "not_needed");
  const inHand = needed.filter((d) => d.status === "received" || d.status === "submitted").length;
  const submitted = needed.filter((d) => d.status === "submitted").length;
  const pct = needed.length ? Math.round((inHand / needed.length) * 100) : 0;
  const allIn = needed.length > 0 && inHand === needed.length;
  return (
    <Card>
      <CardHeader
        title="Document checklist"
        icon={<FileStack className="h-4.5 w-4.5" />}
        description={needed.length ? (allIn ? "Everything's in — ready to log in 🎉" : `${inHand} of ${needed.length} received${submitted ? ` · ${submitted} submitted` : ""}`) : "Add what this lender needs"}
      />
      <CardBody className="space-y-4">
        <Progress value={pct} tone={allIn ? "good" : pct >= 50 ? "brand" : "warn"} />
        <p className="text-xs text-fg-subtle">Tap the circle to cycle: pending → received → submitted to lender.</p>
        <ul className="stagger space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className={cn("group flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-muted/60", d.status === "not_needed" && "opacity-60")}>
              <ActionButton
                action={setDocStatusAction}
                hidden={{ id: d.id, status: DOC_NEXT_STATUS[d.status] }}
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7 shrink-0 rounded-full p-0 hover:bg-transparent", iconTone[d.status])}
                title={`${DOC_STATUS_LABELS[d.status]} — tap for ${DOC_STATUS_LABELS[DOC_NEXT_STATUS[d.status]].toLowerCase()}`}
              >
                {icon[d.status]}
              </ActionButton>
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-medium text-fg", d.status === "not_needed" && "line-through")}>{d.name}</div>
                {d.status !== "pending" ? <div className="text-[11px] text-fg-subtle">{DOC_STATUS_LABELS[d.status]}</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                {d.status === "not_needed" ? (
                  <ActionButton action={setDocStatusAction} hidden={{ id: d.id, status: "pending" }} variant="ghost" size="icon" className="h-7 w-7" title="Needed after all">
                    <Undo2 className="h-3.5 w-3.5" />
                  </ActionButton>
                ) : (
                  <ActionButton action={setDocStatusAction} hidden={{ id: d.id, status: "not_needed" }} variant="ghost" size="icon" className="h-7 w-7" title="Mark not needed">
                    <MinusCircle className="h-3.5 w-3.5" />
                  </ActionButton>
                )}
                <ActionButton action={deleteDocAction} hidden={{ id: d.id }} variant="ghost" size="icon" className="h-7 w-7" title="Remove item" confirm={`Remove “${d.name}”?`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
        <ActionForm action={addDocAction} className="flex gap-2">
          <input type="hidden" name="fileId" value={fileId} />
          <Input name="name" placeholder="Add a document, e.g. Rent agreement" required />
          <SubmitButton variant="soft" size="md" className="shrink-0">
            <Plus className="h-4 w-4" /> Add
          </SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
