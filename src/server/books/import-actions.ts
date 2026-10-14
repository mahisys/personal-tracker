"use server";
import { revalidatePath } from "next/cache";
import { WORKSPACE_KEYS, type WorkspaceKey } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { DATE_FORMATS, guessMapping, parseCsv, type ColumnMapping } from "./import";
import { buildImportPreview, importStatementLines, type ImportLine, type ImportPreviewLine } from "./import-service";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

export type ReadStatementResult =
  | { ok: true; fileName: string; headers: string[]; rows: string[][]; mapping: ColumnMapping }
  | { ok: false; error: string };

/** Step 1: read the uploaded CSV and guess the column mapping. */
export async function readStatement(form: FormData): Promise<ReadStatementResult> {
  await requireUser();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file first" };
  if (file.size > MAX_BYTES) return { ok: false, error: "That file is larger than 5 MB — try a shorter date range" };
  if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text/.test(file.type)) {
    return { ok: false, error: "Please upload a CSV (most banks offer “Download as CSV” or Excel → Save as CSV)" };
  }
  const { headers, rows } = parseCsv(await file.text());
  if (headers.length < 2 || rows.length === 0) return { ok: false, error: "We couldn't find a table of transactions in that file" };
  if (rows.length > MAX_ROWS) return { ok: false, error: `That's ${rows.length} lines — please import at most ${MAX_ROWS} at a time` };
  return { ok: true, fileName: file.name, headers, rows, mapping: guessMapping(headers, rows) };
}

function validMapping(m: ColumnMapping, width: number): string | null {
  const inRange = (i: number | null | undefined) => i != null && Number.isInteger(i) && i >= 0 && i < width;
  if (!inRange(m.date)) return "Pick the date column";
  if (!inRange(m.description)) return "Pick the description column";
  if (!DATE_FORMATS.includes(m.dateFormat)) return "Pick a date format";
  if (m.amountMode === "split" && !inRange(m.debit) && !inRange(m.credit)) return "Pick the debit and credit columns";
  if (m.amountMode === "signed" && !inRange(m.amount)) return "Pick the amount column";
  return null;
}

export type PreviewResult = { ok: true; lines: ImportPreviewLine[] } | { ok: false; error: string };

/** Step 2: apply the mapping and suggest categories, flagging lines already imported. */
export async function previewStatement(input: { accountId: string; rows: string[][]; mapping: ColumnMapping; workspace: string }): Promise<PreviewResult> {
  await requireUser();
  if (!input.accountId) return { ok: false, error: "Pick the account this statement belongs to" };
  const width = input.rows[0]?.length ?? 0;
  const bad = validMapping(input.mapping, width);
  if (bad) return { ok: false, error: bad };
  const ws: WorkspaceKey = WORKSPACE_KEYS.includes(input.workspace as WorkspaceKey) ? (input.workspace as WorkspaceKey) : "personal";
  try {
    return { ok: true, lines: await buildImportPreview(input.accountId, input.rows.slice(0, MAX_ROWS), input.mapping, ws) };
  } catch {
    return { ok: false, error: "That account no longer exists" };
  }
}

export type CommitResult = { ok: true; imported: number; existed: number; message: string } | { ok: false; error: string };

/** Step 3: import the selected lines. */
export async function commitImport(input: { accountId: string; lines: ImportLine[] }): Promise<CommitResult> {
  await requireUser();
  const lines = (input.lines ?? []).filter(
    (l) =>
      /^[0-9a-f]{64}$/.test(l.hash) &&
      /^\d{4}-\d{2}-\d{2}$/.test(l.date) &&
      Number.isInteger(l.amountPaise) &&
      l.amountPaise > 0 &&
      (l.type === "income" || l.type === "expense") &&
      WORKSPACE_KEYS.includes(l.workspace),
  );
  if (lines.length === 0) return { ok: false, error: "Select at least one line to import" };
  try {
    const { imported, existed } = await importStatementLines(input.accountId, lines);
    for (const p of ["/books", "/books/transactions", "/books/accounts", `/books/accounts/${input.accountId}`, "/"]) revalidatePath(p);
    const parts = [`${imported} imported`];
    if (existed) parts.push(`${existed} already existed`);
    return { ok: true, imported, existed, message: parts.join(", ") };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message === "Account not found" ? "That account no longer exists" : "Import failed — nothing after the error was saved" };
  }
}
