import { Car, Mail, MessageCircle, MessagesSquare, NotebookPen, Phone, Trash2, Users } from "lucide-react";
import type { InferSelectModel } from "drizzle-orm";
import type { activities } from "@/db/schema";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { formatDateTime, toDateTimeLocalIST } from "@/lib/dates";
import { addActivityAction, deleteActivityAction } from "@/server/dsa/actions";

type Activity = InferSelectModel<typeof activities>;

const TYPES = {
  call: { label: "Call", icon: Phone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  visit: { label: "Visit", icon: Car },
  meeting: { label: "Meeting", icon: Users },
  email: { label: "Email", icon: Mail },
  note: { label: "Note", icon: NotebookPen },
} as const;

/** Calls, visits and notes with the borrower or the lender's RM. */
export function ActivityLog({ items, loanFileId, borrowerId, title = "Calls & visits" }: { items: Activity[]; loanFileId?: string; borrowerId?: string; title?: string }) {
  return (
    <Card>
      <CardHeader
        title={title}
        icon={<MessagesSquare className="h-4.5 w-4.5" />}
        description={items.length ? `${items.length} logged` : "Log every call — future you will thank you"}
        actions={
          <Modal trigger="Log" variant="soft" size="sm" title="Log an interaction" description="With the borrower, the lender's RM, or a note to self.">
            <ActionForm action={addActivityAction}>
              {loanFileId ? <input type="hidden" name="loanFileId" value={loanFileId} /> : null}
              {borrowerId ? <input type="hidden" name="borrowerId" value={borrowerId} /> : null}
              <FormGrid>
                <Field label="Type">
                  <Select name="type" defaultValue="call">
                    {Object.entries(TYPES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="When">
                  <Input type="datetime-local" name="at" defaultValue={toDateTimeLocalIST(new Date())} />
                </Field>
                <Field label="About" className="sm:col-span-2">
                  <Input name="subject" required placeholder="e.g. Called RM about credit query" />
                </Field>
                <Field label="Details" className="sm:col-span-2">
                  <Textarea name="body" rows={3} />
                </Field>
                <Field label="Outcome">
                  <Input name="outcome" placeholder="e.g. Will share ITR tomorrow" />
                </Field>
                <Field label="Next step">
                  <Input name="nextStep" placeholder="e.g. Follow up Friday" />
                </Field>
              </FormGrid>
              <ModalActions>
                <SubmitButton>Save</SubmitButton>
              </ModalActions>
            </ActionForm>
          </Modal>
        }
      />
      <CardBody>
        {items.length === 0 ? (
          <p className="text-sm text-fg-subtle">Nothing logged yet.</p>
        ) : (
          <ol className="stagger space-y-3">
            {items.map((a) => {
              const t = TYPES[a.type as keyof typeof TYPES] ?? TYPES.note;
              const Icon = t.icon;
              return (
                <li key={a.id} className="group flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-700 dark:text-amber-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-fg">{a.subject}</div>
                      <ActionButton action={deleteActivityAction} hidden={{ id: a.id }} variant="ghost" size="icon" className="h-7 w-7 opacity-60 sm:opacity-0 sm:group-hover:opacity-100" confirm="Delete this entry?" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </ActionButton>
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {t.label} · {formatDateTime(a.at)}
                    </div>
                    {a.body ? <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{a.body}</p> : null}
                    {a.outcome || a.nextStep ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                        {a.outcome ? <span className="rounded-lg bg-muted px-2 py-0.5 text-fg-muted">Outcome: {a.outcome}</span> : null}
                        {a.nextStep ? <span className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-amber-800 dark:text-amber-300">Next: {a.nextStep}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
