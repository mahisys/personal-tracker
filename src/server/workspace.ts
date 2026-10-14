import "server-only";
import { cookies } from "next/headers";
import { WORKSPACE_KEYS, type WorkspaceKey } from "@/db/schema";

export const WS_COOKIE = "ws";

/** The workspace selected in the header switcher, or null for "All". */
export async function getWorkspaceFilter(): Promise<WorkspaceKey | null> {
  const v = (await cookies()).get(WS_COOKIE)?.value;
  return WORKSPACE_KEYS.includes(v as WorkspaceKey) ? (v as WorkspaceKey) : null;
}

export function parseWorkspace(v: FormDataEntryValue | string | null | undefined, fallback: WorkspaceKey = "mahisys"): WorkspaceKey {
  return WORKSPACE_KEYS.includes(v as WorkspaceKey) ? (v as WorkspaceKey) : fallback;
}
