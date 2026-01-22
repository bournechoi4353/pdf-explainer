"use client";

import { useEffect, useRef } from "react";

export default function MouseGlow() {
  const rafRef = useRef<number | null>(null);
  const latest = useRef({ x: 50, y: 50 });

  useEffect(() => {
    const update = () => {
      document.documentElement.style.setProperty("--mouse-x", `${latest.current.x}%`);
      document.documentElement.style.setProperty("--mouse-y", `${latest.current.y}%`);
      rafRef.current = null;
    };

    const onMove = (e: MouseEvent) => {
      latest.current.x = (e.clientX / window.innerWidth) * 100;
      latest.current.y = (e.clientY / window.innerHeight) * 100;

      // throttle to animation frames (smooth + cheap)
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(update);
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return null;
}