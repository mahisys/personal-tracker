import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";
import { STAGE_KINDS } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { listStages } from "@/server/crm/queries";
import { deleteStage, moveStage, saveStage } from "@/server/crm/actions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { CrmNav } from "@/components/crm/crm-nav";
import { WORKSPACE_META } from "@/lib/workspaces";
import { cn } from "@/lib/cn";

export const metadata = { title: "Pipeline stages" };

const KIND_LABEL = { open: "Open", won: "Won", lost: "Lost" } as const;

export default async function StagesPage() {
  await requireUser();
  const ws = (await getWorkspaceFilter()) ?? "mahisys";
  const rows = await listStages(ws);

  return (
    <>
      <Link href="/crm" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Pipeline
      </Link>
      <PageHeader eyebrow="CRM settings" title="Pipeline stages" description={`The steps a ${WORKSPACE_META[ws].name} deal moves through. Probability is applied when a lead enters the stage.`} />
      <CrmNav active="/crm/stages" />

      <Card className="mb-6">
        <CardBody className="space-y-3">
          {rows.length === 0 ? <p className="text-sm text-fg-subtle">No stages for this workspace yet{ws !== "mahisys" ? " — leads use the MahiSys pipeline until you add some" : ""}.</p> : null}
          <ol className="stagger space-y-2.5">
            {rows.map(({ stage: s, n }, i) => (
              <li key={s.id} className={cn("rounded-2xl border border-line bg-solid/50 p-3", s.kind === "won" && "border-emerald-500/25", s.kind === "lost" && "border-rose-500/25")}>
                <ActionForm action={saveStage} resetOnSuccess={false} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[28px_minmax(0,1fr)_110px_110px_auto] sm:items-center">
                  <input type="hidden" name="id" value={s.id} />
                  <span className="hidden text-center text-xs font-bold tabular-nums text-fg-subtle sm:block">{i + 1}</span>
                  <Input name="name" defaultValue={s.name} required aria-label="Stage name" className="col-span-2 sm:col-span-1" />
                  <div className="relative">
                    <Input name="probability" type="number" min={0} max={100} defaultValue={s.probability} aria-label="Default probability" className="pr-7 text-right tabular-nums" />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-subtle">%</span>
                  </div>
                  <Select name="kind" defaultValue={s.kind} aria-label="Kind">
                    {STAGE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1">
                    <span className="text-[11px] text-fg-subtle sm:hidden">
                      {n} lead{n === 1 ? "" : "s"}
                    </span>
                    <SubmitButton size="sm" variant="soft">
                      Save
                    </SubmitButton>
                  </div>
                </ActionForm>
                <div className="mt-2 flex items-center justify-end gap-1 sm:pl-9">
                  <span className="mr-auto hidden text-[11px] text-fg-subtle sm:inline">
                    {n} lead{n === 1 ? "" : "s"} in this stage
                  </span>
                  <ActionButton action={moveStage} hidden={{ id: s.id, dir: "up" }} variant="ghost" size="icon" title="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </ActionButton>
                  <ActionButton action={moveStage} hidden={{ id: s.id, dir: "down" }} variant="ghost" size="icon" title="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </ActionButton>
                  <ActionButton action={deleteStage} hidden={{ id: s.id }} variant="ghost" size="icon" title="Delete stage" confirm={`Delete the “${s.name}” stage?`}>
                    <Trash2 className="h-4 w-4" />
                  </ActionButton>
                </div>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Add a stage" icon={<Plus className="h-4.5 w-4.5" />} description="New stages are added at the end — move them into place." />
        <CardBody>
          <ActionForm action={saveStage} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_110px_110px_auto]">
            <input type="hidden" name="workspace" value={ws} />
            <Input name="name" placeholder="e.g. Demo scheduled" required className="col-span-2 sm:col-span-1" />
            <Input name="probability" type="number" min={0} max={100} defaultValue={30} aria-label="Default probability %" className="text-right" />
            <Select name="kind" defaultValue="open" aria-label="Kind">
              {STAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <SubmitButton className="col-span-2 sm:col-span-1">Add stage</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
