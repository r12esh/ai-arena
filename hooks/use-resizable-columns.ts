"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const STORAGE_KEY = "ai-arena-column-ratios";
const MIN_COLUMN_PX = 280;

export interface UseResizableColumnsReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  activeHandle: number | null;
  ratios: [number, number, number];
  startDragging: (handleIndex: number, e: React.PointerEvent) => void;
  resetRatios: () => void;
  handleKeyDown: (handleIndex: number, e: React.KeyboardEvent) => void;
}

const DEFAULT_RATIOS: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];

function loadSavedRatios(): [number, number, number] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length === 3 &&
        parsed.every((n) => typeof n === "number" && !isNaN(n) && n > 0)
      ) {
        const sum = parsed[0] + parsed[1] + parsed[2];
        if (sum > 0) {
          return [parsed[0] / sum, parsed[1] / sum, parsed[2] / sum];
        }
      }
    }
  } catch (err) {
    console.warn("Failed to read column ratios from localStorage:", err);
  }
  return null;
}

function saveRatios(ratios: [number, number, number]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ratios));
  } catch (err) {
    console.warn("Failed to save column ratios to localStorage:", err);
  }
}

export function useResizableColumns(): UseResizableColumnsReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Always initialize with DEFAULT_RATIOS for matching SSR and initial client render
  const [ratios, setRatios] = useState<[number, number, number]>(DEFAULT_RATIOS);
  const ratiosRef = useRef<[number, number, number]>(DEFAULT_RATIOS);

  // Sync ref with ratios in effect
  useEffect(() => {
    ratiosRef.current = ratios;
  }, [ratios]);

  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  // Apply CSS custom variables directly to container
  const applyCssVariables = useCallback((r: [number, number, number]) => {
    const container = containerRef.current;
    if (!container) return;
    container.style.setProperty("--col-0", `${r[0]}fr`);
    container.style.setProperty("--col-1", `${r[1]}fr`);
    container.style.setProperty("--col-2", `${r[2]}fr`);
  }, []);

  // Load from localStorage on client mount only to prevent hydration mismatch
  useEffect(() => {
    const saved = loadSavedRatios();
    if (saved) {
      requestAnimationFrame(() => {
        setRatios(saved);
        applyCssVariables(saved);
      });
    } else {
      applyCssVariables(DEFAULT_RATIOS);
    }
  }, [applyCssVariables]);

  const resetRatios = useCallback(() => {
    const defaultRatios: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];
    setRatios(defaultRatios);
    applyCssVariables(defaultRatios);
    saveRatios(defaultRatios);
  }, [applyCssVariables]);

  // Pointer drag handling: setPointerCapture, rAF write to CSS variables, commit on pointerup
  const startDragging = useCallback(
    (handleIndex: number, e: React.PointerEvent) => {
      // handleIndex = 0 (between col 0 and 1) or 1 (between col 1 and 2)
      const container = containerRef.current;
      if (!container) return;

      const targetEl = e.currentTarget as HTMLElement;
      targetEl.setPointerCapture(e.pointerId);

      setIsDragging(true);
      setActiveHandle(handleIndex);

      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const initialClientX = e.clientX;

      // Current pixels of all 3 columns at start of drag
      const currentRatios = ratiosRef.current;
      const initialPx = [
        currentRatios[0] * containerWidth,
        currentRatios[1] * containerWidth,
        currentRatios[2] * containerWidth,
      ];

      let latestDeltaX = 0;
      let rafId: number | null = null;
      let tentativeRatios: [number, number, number] = [...currentRatios];

      const onPointerMove = (moveEv: PointerEvent) => {
        latestDeltaX = moveEv.clientX - initialClientX;

        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;

          const colLeftIdx = handleIndex;
          const colRightIdx = handleIndex + 1;

          let newLeftPx = initialPx[colLeftIdx] + latestDeltaX;
          let newRightPx = initialPx[colRightIdx] - latestDeltaX;

          // Clamp to MIN_COLUMN_PX
          if (newLeftPx < MIN_COLUMN_PX) {
            const diff = MIN_COLUMN_PX - newLeftPx;
            newLeftPx = MIN_COLUMN_PX;
            newRightPx -= diff;
          }
          if (newRightPx < MIN_COLUMN_PX) {
            const diff = MIN_COLUMN_PX - newRightPx;
            newRightPx = MIN_COLUMN_PX;
            newLeftPx -= diff;
          }

          if (newLeftPx < MIN_COLUMN_PX || newRightPx < MIN_COLUMN_PX) {
            return;
          }

          const newPx = [...initialPx];
          newPx[colLeftIdx] = newLeftPx;
          newPx[colRightIdx] = newRightPx;

          const totalPx = newPx[0] + newPx[1] + newPx[2];
          tentativeRatios = [
            newPx[0] / totalPx,
            newPx[1] / totalPx,
            newPx[2] / totalPx,
          ];

          // Write directly to CSS variables without triggering React re-renders
          applyCssVariables(tentativeRatios);
        });
      };

      const onPointerUp = (upEv: PointerEvent) => {
        try {
          targetEl.releasePointerCapture(upEv.pointerId);
        } catch {}

        targetEl.removeEventListener("pointermove", onPointerMove);
        targetEl.removeEventListener("pointerup", onPointerUp);
        targetEl.removeEventListener("pointercancel", onPointerUp);

        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        setIsDragging(false);
        setActiveHandle(null);

        // Commit final calculated ratios to React state and localStorage once
        setRatios(tentativeRatios);
        saveRatios(tentativeRatios);
      };

      targetEl.addEventListener("pointermove", onPointerMove);
      targetEl.addEventListener("pointerup", onPointerUp);
      targetEl.addEventListener("pointercancel", onPointerUp);
    },
    [applyCssVariables]
  );

  // Keyboard accessibility (role="separator")
  const handleKeyDown = useCallback(
    (handleIndex: number, e: React.KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home") {
        return;
      }
      e.preventDefault();

      if (e.key === "Home") {
        resetRatios();
        return;
      }

      const step = e.shiftKey ? 0.05 : 0.02;
      const delta = e.key === "ArrowLeft" ? -step : step;

      const container = containerRef.current;
      const containerWidth = container ? container.getBoundingClientRect().width : 1200;
      const minRatio = MIN_COLUMN_PX / containerWidth;

      const curr = [...ratiosRef.current] as [number, number, number];
      const leftIdx = handleIndex;
      const rightIdx = handleIndex + 1;

      let newLeft = curr[leftIdx] + delta;
      let newRight = curr[rightIdx] - delta;

      if (newLeft < minRatio) {
        newRight -= minRatio - newLeft;
        newLeft = minRatio;
      }
      if (newRight < minRatio) {
        newLeft -= minRatio - newRight;
        newRight = minRatio;
      }

      if (newLeft < minRatio || newRight < minRatio) return;

      curr[leftIdx] = newLeft;
      curr[rightIdx] = newRight;

      const total = curr[0] + curr[1] + curr[2];
      const normalized: [number, number, number] = [
        curr[0] / total,
        curr[1] / total,
        curr[2] / total,
      ];

      setRatios(normalized);
      applyCssVariables(normalized);
      saveRatios(normalized);
    },
    [applyCssVariables, resetRatios]
  );

  return {
    containerRef,
    isDragging,
    activeHandle,
    ratios,
    startDragging,
    resetRatios,
    handleKeyDown,
  };
}
