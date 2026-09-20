import { DEV_SERVER_PARAM, DEV_VIEWER_PARAM } from "@tableverse-kit/client";

export interface FrameUrlInput {
  frontendUrl: string;
  serverUrl: string;
  viewer: string;
}

export function buildFrameUrl(input: FrameUrlInput): string {
  const url = new URL(input.frontendUrl);
  url.searchParams.set(DEV_VIEWER_PARAM, input.viewer);
  url.searchParams.set(DEV_SERVER_PARAM, input.serverUrl);
  return url.toString();
}
