"use client";

import Link from "next/link";
import { Swords } from "lucide-react";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 bg-game-bg-panel border border-game-border rounded-sm flex items-center justify-center">
        {icon ? (
          <span className="text-2xl">{icon}</span>
        ) : (
          <Swords className="w-8 h-8 text-game-text-dim" />
        )}
      </div>
      <h3 className="font-display text-sm tracking-wider text-game-text-main text-center">
        {title}
      </h3>
      <p className="text-game-text-muted text-xs text-center max-w-sm font-mono">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-2 px-4 py-2 rounded-sm bg-game-bg-panel border border-game-border text-game-text-muted font-display text-[10px] tracking-wider uppercase hover:border-game-border-highlight hover:text-game-text-main transition-colors focus-ring"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
