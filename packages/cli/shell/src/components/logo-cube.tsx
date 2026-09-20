import { cn } from "../lib/utils.ts";

export function LogoCube({ className }: { className?: string }) {
  return (
    <svg
      className={cn("cube", className)}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <polygon className="top" points="32,10 52,20 32,30 12,20" />
      <polygon className="left" points="12,20 32,30 32,54 12,44" />
      <polygon className="right" points="52,20 32,30 32,54 52,44" />
      <path
        className="spark"
        transform="translate(50, 8)"
        d="M0 -4 L1 -1 L4 0 L1 1 L0 4 L-1 1 L-4 0 L-1 -1 Z"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="flex items-center gap-2">
      <LogoCube className="size-6" />
      <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
        tvk dev
      </span>
    </span>
  );
}
