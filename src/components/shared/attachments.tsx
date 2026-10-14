import { and, desc, eq } from "drizzle-orm";
import { Paperclip, Trash2, FileText } from "lucide-react";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { deleteAttachment, uploadAttachment } from "@/server/attachments-actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

/** Files attached to any record. `path` is the page to refresh after changes. */
export async function Attachments({ entityType, entityId, path }: { entityType: string; entityId: string; path: string }) {
  const rows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
    .orderBy(desc(attachments.createdAt));
  return (
    <Card>
      <CardHeader title="Files" icon={<Paperclip className="h-4.5 w-4.5" />} description={rows.length ? `${rows.length} attached` : "Receipts, documents, photos"} />
      <CardBody className="space-y-3">
        {rows.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line bg-solid/50 px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-brand" />
            <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-fg hover:text-brand">
              {a.fileName}
            </a>
            <span className="text-xs text-fg-subtle tabular-nums">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</span>
            <ActionButton action={deleteAttachment} hidden={{ id: a.id, path }} variant="ghost" size="icon" confirm="Remove this file?" title="Remove file">
              <Trash2 className="h-4 w-4" />
            </ActionButton>
          </div>
        ))}
        <ActionForm action={uploadAttachment} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="path" value={path} />
          <input
            type="file"
            name="file"
            multiple
            className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand hover:file:bg-brand/15"
          />
          <SubmitButton size="sm" variant="soft" pendingText="Uploading…">
            Upload
          </SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
