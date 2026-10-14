import { History as HistoryIcon } from "lucide-react";
import { getHistory } from "@/server/activity";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";

/** Timeline of changes to a record, newest first. */
export async function History({ entityType, entityId }: { entityType: string; entityId: string }) {
  const rows = await getHistory(entityType, entityId);
  return (
    <Card>
      <CardHeader title="History" icon={<HistoryIcon className="h-4.5 w-4.5" />} />
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-sm text-fg-subtle">No changes yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-line-strong pl-5">
            {rows.map((r) => (
              <li key={r.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-bg" />
                <div className="text-sm font-semibold text-fg">{r.summary}</div>
                <div className="text-xs text-fg-subtle">{formatDateTime(r.at)}</div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
