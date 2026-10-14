"use client";

import React, { memo } from "react";

interface ColumnResizerProps {
  index: number;
  isActive: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  ariaValueNow?: number;
}

export const ColumnResizer = memo(function ColumnResizer({
  index,
  isActive,
  onPointerDown,
  onDoubleClick,
  onKeyDown,
  ariaValueNow = 33,
}: ColumnResizerProps) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize column ${index + 1} and ${index + 2}`}
      aria-valuenow={Math.round(ariaValueNow)}
      aria-valuemin={15}
      aria-valuemax={85}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      title="Drag to resize columns, double-click to reset"
      className={`group relative flex-none w-2 cursor-col-resize select-none touch-none focus:outline-none flex items-center justify-center -mx-1 z-20 transition-colors ${
        isActive ? "z-30" : ""
      }`}
    >
      {/* 2px visible divider line with hover/active highlights */}
      <div
        className={`w-[2px] h-full rounded-full transition-all duration-150 ${
          isActive
            ? "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.7)]"
            : "bg-zinc-800/80 group-hover:bg-indigo-500/60 group-focus-visible:bg-indigo-400 group-focus-visible:shadow-[0_0_6px_rgba(129,140,248,0.5)]"
        }`}
      />
    </div>
  );
});
