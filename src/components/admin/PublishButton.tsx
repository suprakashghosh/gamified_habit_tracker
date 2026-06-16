"use client";

import { Loader2, Rocket } from "lucide-react";

interface PublishButtonProps {
  onPublish: () => void;
  isLoading: boolean;
}

export function PublishButton({ onPublish, isLoading }: PublishButtonProps) {
  return (
    <button
      type="button"
      onClick={onPublish}
      disabled={isLoading}
      className="inline-flex items-center justify-center gap-[--spacing-xs] bg-game-uncommon px-[--spacing-lg] py-[--spacing-sm] font-display text-[10px] uppercase tracking-wider text-game-bg-main transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 rounded-sm focus-ring"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Rocket className="h-4 w-4" />
      )}
      {isLoading ? "Publishing..." : "Publish"}
    </button>
  );
}
