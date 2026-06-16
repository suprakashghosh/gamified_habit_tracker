"use client";

interface LoadingSkeletonProps {
  count?: number;
  variant?: "light" | "dark";
}

export function LoadingSkeleton({ count = 6, variant = "dark" }: LoadingSkeletonProps) {
  const isDark = variant === "dark";

  const bgPanel = isDark ? "bg-game-bg-panel" : "bg-white";
  const border = isDark ? "border-game-border" : "border-gray-200";
  const bgMain = isDark ? "bg-game-bg-main" : "bg-gray-100";
  const muted = isDark ? "bg-game-border" : "bg-gray-200";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-sm ${bgPanel} border ${border} overflow-hidden`}
        >
          {/* Top stripe */}
          <div className={`h-1 w-full ${muted}`} />

          {/* Main content */}
          <div className="flex gap-3 p-3">
            {/* Icon square */}
            <div className={`w-16 h-16 shrink-0 rounded-sm ${bgMain} border ${border}`} />

            {/* Text lines */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {/* Title */}
              <div className={`h-3 w-3/4 rounded-sm ${muted}`} />
              {/* Description */}
              <div className={`h-2 w-full rounded-sm ${muted}`} />
              <div className={`h-2 w-1/2 rounded-sm ${muted}`} />
              {/* Tags */}
              <div className="flex gap-1.5 mt-1">
                <div className={`h-4 w-12 rounded-sm ${bgMain} border ${border}`} />
                <div className={`h-4 w-16 rounded-sm ${bgMain} border ${border}`} />
              </div>
            </div>
          </div>

          {/* Bottom progress bar */}
          <div className={`h-1 w-full ${bgMain}`}>
            <div className={`h-full w-2/3 ${muted}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
