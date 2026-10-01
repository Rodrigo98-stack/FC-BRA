"use client";
import { useEffect, useRef } from "react";

/**
 * Inclina o conteúdo em 3D acompanhando o ponteiro dentro do elemento-pai
 * marcado com data-tilt-host. Desligado com prefers-reduced-motion.
 */
export function Tilt({ children, className, max = 7 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = (el.closest("[data-tilt-host]") as HTMLElement | null) ?? el;
    let frame = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.transform = `perspective(1000px) rotateY(${(x * max * 2).toFixed(2)}deg) rotateX(${(-y * max * 2).toFixed(2)}deg)`;
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.style.transform = "";
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [max]);
  return (
    <div ref={ref} className={`transition-transform duration-500 ease-out [transform-style:preserve-3d] ${className ?? ""}`}>
      {children}
    </div>
  );
}
