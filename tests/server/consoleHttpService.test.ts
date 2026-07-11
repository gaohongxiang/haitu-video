import { describe, expect, it } from "vitest";

import { nodeResponseHeaders } from "../../src/server/consoleHttpService.js";

describe("console HTTP response headers", () => {
  it("preserves every Set-Cookie value as a separate Node response header", () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "session=one; Path=/; HttpOnly; Secure");
    headers.append("set-cookie", "marker=two; Path=/; Secure");

    expect(nodeResponseHeaders(headers)).toEqual({
      "content-type": "application/json",
      "set-cookie": [
        "session=one; Path=/; HttpOnly; Secure",
        "marker=two; Path=/; Secure"
      ]
    });
  });
});
