import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions, type WorkspaceKey } from "@/db/schema";
import { createTransaction } from "@/server/ledger";
import { logActivity } from "@/server/activity";
import { batchImportHashes, normaliseRows, suggestCategory, suggestWorkspace, type ColumnMapping, type StatementLine } from "./import";

export type ImportPreviewLine = StatementLine & {
  hash: string;
  categoryId: string | null;
  workspace: WorkspaceKey;
  /** Already in the books from an earlier import */
  duplicate: boolean;
};

export type ImportLine = {
  hash: string;
  date: string;
  description: string;
  reference: string | null;
  amountPaise: number;
  type: "income" | "expense";
  categoryId: string | null;
  workspace: WorkspaceKey;
};

/** Normalises rows, suggests a category and workspace for each, and flags lines imported before. */
export async function buildImportPreview(accountId: string, rows: string[][], mapping: ColumnMapping, fallbackWs: WorkspaceKey): Promise<ImportPreviewLine[]> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new Error("Account not found");
  const cats = await db.select().from(categories).where(eq(categories.archived, false));
  const lines = normaliseRows(rows, mapping);
  const valid = lines.filter((l) => !l.error) as (StatementLine & { date: string })[];
  const hashes = batchImportHashes(accountId, valid);
  const hashByRow = new Map(valid.map((l, i) => [l.row, hashes[i]]));
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 500) {
    const chunk = hashes.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const found = await db.select({ h: transactions.importHash }).from(transactions).where(inArray(transactions.importHash, chunk));
    for (const f of found) if (f.h) existing.add(f.h);
  }
  return lines.map((l) => {
    const cat = l.error ? null : suggestCategory(l.description, l.type, cats);
    const hash = hashByRow.get(l.row) ?? "";
    return {
      ...l,
      hash,
      categoryId: cat?.id ?? null,
      workspace: suggestWorkspace(cat?.workspace, account.workspace, fallbackWs),
      duplicate: hash !== "" && existing.has(hash),
    };
  });
}

/**
 * Imports lines into an account through createTransaction(). Lines whose hash already exists are
 * counted as "already existed" (the unique index on import_hash is the final guard).
 */
export async function importStatementLines(accountId: string, lines: ImportLine[]): Promise<{ imported: number; existed: number }> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new Error("Account not found");
  const cats = new Map((await db.select().from(categories)).map((c) => [c.id, c]));
  const unique = [...new Map(lines.map((l) => [l.hash, l])).values()];
  const existing = new Set<string>();
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500).map((l) => l.hash);
    const found = await db.select({ h: transactions.importHash }).from(transactions).where(inArray(transactions.importHash, chunk));
    for (const f of found) if (f.h) existing.add(f.h);
  }
  let imported = 0;
  let existed = lines.length - unique.length;
  for (const l of unique) {
    if (existing.has(l.hash)) {
      existed++;
      continue;
    }
    const cat = l.categoryId ? cats.get(l.categoryId) : undefined;
    try {
      await createTransaction({
        workspace: l.workspace,
        type: l.type,
        date: l.date,
        accountId,
        amountPaise: l.amountPaise,
        categoryId: cat && cat.kind === l.type ? cat.id : null,
        description: l.description,
        reference: l.reference,
        importHash: l.hash,
        tags: ["imported"],
      });
      imported++;
    } catch (e) {
      // A concurrent import may have inserted the same line; the unique index rejects it.
      if (String((e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code) === "23505") existed++;
      else throw e;
    }
  }
  if (imported > 0) await logActivity("account", accountId, "imported", `Imported ${imported} entr${imported === 1 ? "y" : "ies"} from a bank statement`);
  return { imported, existed };
}
