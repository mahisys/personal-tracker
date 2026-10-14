import { NextResponse } from "next/server";
import { getUser } from "@/server/auth";
import { buildWorkbook } from "@/server/reports/export";
import { todayIST } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/export?format=xlsx — every business table as an Excel workbook (signed-in user only). */
export async function GET(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const format = new URL(req.url).searchParams.get("format") ?? "xlsx";
  if (format !== "xlsx") return NextResponse.json({ error: "Only format=xlsx is supported" }, { status: 400 });
  const wb = await buildWorkbook();
  const buf = await wb.xlsx.writeBuffer();
  const filename = `command-center-${todayIST()}.xlsx`;
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
