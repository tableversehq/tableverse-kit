import { describe, expect, it } from "vitest";
import { buildDeploymentUrl } from "../../src/lib/upload/deployment-url.ts";

describe("buildDeploymentUrl", () => {
  it("builds the dashboard path with the version as a query param", () => {
    expect(
      buildDeploymentUrl({
        webBaseUrl: "https://dev.example.test",
        gameId: "game-123",
        buildId: "b1",
        versionNumber: 4,
      }),
    ).toBe("https://dev.example.test/studio/games/game-123/deployments/b1?v=4");
  });

  it("percent-encodes identifiers with URL-significant characters", () => {
    expect(
      buildDeploymentUrl({
        webBaseUrl: "https://dev.example.test",
        gameId: "a/b",
        buildId: "c d",
        versionNumber: 1,
      }),
    ).toBe("https://dev.example.test/studio/games/a%2Fb/deployments/c%20d?v=1");
  });
});
