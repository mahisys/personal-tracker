import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runAutomations = vi.fn(async () => ({ ok: true, rules: [] }));
vi.mock("@/server/automations/engine", () => ({ runAutomations: (...a: unknown[]) => runAutomations(...(a as [])) }));

import { GET, POST } from "./route";
import { secretMatches } from "@/server/automations/cron-auth";

const req = (headers: Record<string, string> = {}, method = "POST") => new Request("http://localhost/api/cron/run", { method, headers });

describe("cron endpoint auth", () => {
  const saved = process.env.CRON_SECRET;
  beforeEach(() => runAutomations.mockClear());
  afterEach(() => {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  });

  it("503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req({ "x-cron-secret": "anything" }));
    expect(res.status).toBe(503);
    expect(runAutomations).not.toHaveBeenCalled();
  });

  it("401 without or with a wrong secret", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req({ "x-cron-secret": "s3cret-valuX" }))).status).toBe(401);
    expect((await GET(req({ "x-cron-secret": "short" }, "GET"))).status).toBe(401);
    expect(runAutomations).not.toHaveBeenCalled();
  });

  it("200 with the right secret, for POST and GET", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    const res = await POST(req({ "x-cron-secret": "s3cret-value" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect((await GET(req({ "x-cron-secret": "s3cret-value" }, "GET"))).status).toBe(200);
    expect(runAutomations).toHaveBeenCalledTimes(2);
  });

  it("compares secrets safely", () => {
    expect(secretMatches("a", "a")).toBe(true);
    expect(secretMatches("a", "ab")).toBe(false);
    expect(secretMatches(null, "a")).toBe(false);
  });
});
