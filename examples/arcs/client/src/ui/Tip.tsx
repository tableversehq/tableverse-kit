import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Tip({
  content,
  children,
  delay = 120,
}: {
  content: ReactNode;
  children: ReactNode;
  delay?: number;
}) {
  const [at, setAt] = useState<{
    x: number;
    top: number;
    bottom: number;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!content) return <>{children}</>;
  const below = at ? at.top < 160 : false;
  return (
    <span
      className="tip-anchor"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        clearTimeout(timer.current);
        timer.current = setTimeout(
          () =>
            setAt({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom }),
          delay,
        );
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setAt(null);
      }}
    >
      {children}
      {at &&
        createPortal(
          <div
            className="tip"
            role="tooltip"
            style={{
              left: Math.min(Math.max(at.x, 150), window.innerWidth - 150),
              top: below ? at.bottom + 8 : at.top - 8,
              transform: below
                ? "translate(-50%, 0)"
                : "translate(-50%, -100%)",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
