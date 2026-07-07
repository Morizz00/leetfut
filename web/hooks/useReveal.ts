"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Finish } from "@/lib/types";
import { type DuelPhase, type RevealPhase, duelSequenceFor, sequenceFor } from "@/lib/reveal";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useReveal(finish: Finish): RevealPhase {
  const [phase, setPhase] = useState<RevealPhase>(
    () => sequenceFor(finish, false)[0]?.phase ?? "rise",
  );

  useIsomorphicLayoutEffect(() => {
    const steps = sequenceFor(finish, prefersReducedMotion());
    setPhase(steps[0].phase);
    const timers = steps.slice(1).map((s) => setTimeout(() => setPhase(s.phase), s.at));
    return () => timers.forEach(clearTimeout);
  }, [finish]);

  return phase;
}

export function useDuelReveal(): { phase: DuelPhase; skip: () => void } {
  const [phase, setPhase] = useState<DuelPhase>(
    () => duelSequenceFor(false)[0]?.phase ?? { kind: "walkout" },
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useIsomorphicLayoutEffect(() => {
    const steps = duelSequenceFor(prefersReducedMotion());
    setPhase(steps[0].phase);
    timers.current = steps.slice(1).map((s) => setTimeout(() => setPhase(s.phase), s.at));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const skip = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase({ kind: "settled" });
  }, []);

  return { phase, skip };
}
