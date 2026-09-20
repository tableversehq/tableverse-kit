import { describe, expect, it } from "vitest";
import { buildFrameUrl } from "../src/lib/frame-url.ts";

describe("buildFrameUrl", () => {
  it("carries the seat and the server address", () => {
    const url = new URL(
      buildFrameUrl({
        frontendUrl: "http://localhost:5173",
        serverUrl: "http://127.0.0.1:5100",
        viewer: "p2",
      }),
    );

    expect(url.origin).toBe("http://localhost:5173");
    expect(url.searchParams.get("tvk-dev-viewer")).toBe("p2");
    expect(url.searchParams.get("tvk-dev-server")).toBe(
      "http://127.0.0.1:5100",
    );
  });

  it("keeps a path and query the frontend address already carries", () => {
    const url = new URL(
      buildFrameUrl({
        frontendUrl: "http://localhost:5173/table?debug=1",
        serverUrl: "http://127.0.0.1:5100",
        viewer: "p1",
      }),
    );

    expect(url.pathname).toBe("/table");
    expect(url.searchParams.get("debug")).toBe("1");
    expect(url.searchParams.get("tvk-dev-viewer")).toBe("p1");
  });
});
