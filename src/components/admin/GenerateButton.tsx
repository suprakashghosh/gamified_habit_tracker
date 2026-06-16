"use client";

import { Loader2, Sparkles } from "lucide-react";

interface GenerateButtonProps {
  onClick: () => void;
  isLoading: boolean;
}

export function GenerateButton({ onClick, isLoading }: GenerateButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className="inline-flex items-center justify-center gap-[--spacing-xs] bg-game-lunar px-[--spacing-lg] py-[--spacing-sm] font-display text-[10px] uppercase tracking-wider text-game-bg-main transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 rounded-sm focus-ring"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {isLoading ? "Generating..." : "Generate"}
    </button>
  );
}
