import { describe, expect, it } from "vitest";
import { connectionConfig } from "./connection";

describe("connectionConfig", () => {
  it("moves a unix socket host out of the URL", () => {
    const c = connectionConfig("postgres://app:pw@localhost/command_center?host=/cloudsql/p:asia-south1:db");
    expect(c.options.host).toBe("/cloudsql/p:asia-south1:db");
    expect(c.url).toBe("postgres://app:pw@localhost/command_center");
  });
  it("leaves TCP URLs alone", () => {
    const c = connectionConfig("postgres://postgres@localhost:5432/x");
    expect(c.options).toEqual({});
    expect(c.url).toBe("postgres://postgres@localhost:5432/x");
  });
});
