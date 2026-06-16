"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-game-bg-main flex items-center justify-center p-4">
      <div className="bg-game-bg-panel border border-game-border rounded-sm p-6 max-w-md text-center">
        <h2 className="font-display text-sm tracking-wider text-game-text-main">
          Admin Error
        </h2>
        <p className="font-mono text-xs text-game-text-muted mt-2 mb-4">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="bg-game-bg-header border border-game-border text-game-text-main font-display text-[10px] uppercase tracking-wider px-4 py-2 rounded-sm hover:border-game-border-highlight transition-colors focus-ring"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
