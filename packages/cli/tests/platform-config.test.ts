import { describe, expect, it } from "vitest";
import { resolvePlatformConfig } from "../src/lib/platform-config.ts";

describe("resolvePlatformConfig", () => {
  it("defaults to the production deployment", () => {
    expect(resolvePlatformConfig({})).toEqual({
      apiBaseUrl: "https://api.tableverse.io",
      webBaseUrl: "https://tableverse.io",
      clientId: "tvk-cli",
    });
  });

  it("points at a local platform-api and platform-web when both are set", () => {
    const config = resolvePlatformConfig({
      TABLEVERSE_API_URL: "http://localhost:3000",
      TABLEVERSE_WEB_URL: "http://localhost:5000",
    });

    expect(config.apiBaseUrl).toBe("http://localhost:3000");
    expect(config.webBaseUrl).toBe("http://localhost:5000");
  });

  it("overrides each base URL independently", () => {
    const config = resolvePlatformConfig({
      TABLEVERSE_API_URL: "https://api.example.test",
    });

    expect(config.apiBaseUrl).toBe("https://api.example.test");
    expect(config.webBaseUrl).toBe("https://tableverse.io");
  });

  it("strips a trailing slash so joined paths do not double up", () => {
    const config = resolvePlatformConfig({
      TABLEVERSE_API_URL: "http://localhost:3000/",
      TABLEVERSE_WEB_URL: "http://localhost:5000/",
    });

    expect(config.apiBaseUrl).toBe("http://localhost:3000");
    expect(config.webBaseUrl).toBe("http://localhost:5000");
  });

  it("always reports the public CLI client id", () => {
    expect(
      resolvePlatformConfig({ TABLEVERSE_API_URL: "http://x" }).clientId,
    ).toBe("tvk-cli");
  });
});
