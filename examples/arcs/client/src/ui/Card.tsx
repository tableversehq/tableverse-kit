import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const BASE = import.meta.env.BASE_URL;
export const actionArt = (id: string) => `${BASE}assets/actions/${id}.webp`;
export const courtArt = (id: string) => `${BASE}assets/cards/${id}.jpg`;

export function CardImage({
  src,
  alt,
  className = "",
  zoom = true,
  zoomAbove = false,
  zoomWidth = 280,
  children,
  onClick,
  label,
}: {
  src: string;
  alt: string;
  className?: string;
  zoom?: boolean;
  zoomAbove?: boolean;
  zoomWidth?: number;
  children?: ReactNode;
  onClick?: () => void;
  label?: string;
}) {
  const [peek, setPeek] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`card ${className}`}
      onClick={onClick}
      aria-label={label ?? alt}
      onMouseEnter={(e) => {
        if (!zoom) return;
        const r = e.currentTarget.getBoundingClientRect();
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setPeek(r), 350);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setPeek(null);
      }}
    >
      <img src={src} alt={alt} draggable={false} />
      {children}
      {peek &&
        zoom &&
        createPortal(
          <div
            className="card-zoom"
            role="tooltip"
            style={zoomStyle(peek, zoomAbove, zoomWidth)}
          >
            <img src={src} alt="" />
          </div>,
          document.body,
        )}
    </Tag>
  );
}

function zoomStyle(r: DOMRect, above: boolean, wanted: number) {
  const ZOOM_W = Math.min(wanted, (window.innerHeight - 16) / 1.4);
  const ZOOM_H = ZOOM_W * 1.4;
  if (above)
    return {
      width: ZOOM_W,
      left: Math.min(
        Math.max(r.left + r.width / 2, ZOOM_W / 2 + 8),
        window.innerWidth - ZOOM_W / 2 - 8,
      ),
      top: r.top - 12,
      transform: "translate(-50%, -100%)",
    };
  const right = r.left + r.width / 2 < window.innerWidth / 2;
  return {
    width: ZOOM_W,
    left: right ? r.right + 14 : r.left - 14 - ZOOM_W,
    top: Math.min(
      Math.max(8, r.top + r.height / 2 - ZOOM_H / 2),
      window.innerHeight - ZOOM_H - 8,
    ),
  };
}

export function CardBack({
  className = "",
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`card back ${className}`}>
      <div className="card-back-art">
        <span>ARCS</span>
      </div>
      {children}
    </div>
  );
}
