"use client";

import { Database } from "lucide-react";

export function DatabaseEditorPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-[--spacing-4xl] gap-[--spacing-md]">
      <div className="w-16 h-16 bg-game-bg-panel border border-game-border rounded-sm flex items-center justify-center">
        <Database className="w-8 h-8 text-game-text-dim" />
      </div>
      <h3 className="font-display text-sm tracking-wider text-game-text-main">
        Database Editor
      </h3>
      <p className="text-game-text-muted text-xs text-center max-w-sm font-mono">
        Directly edit task counters, XP values, and other database fields.
        Coming soon.
      </p>
    </div>
  );
}
