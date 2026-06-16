"use client";

import { MessageSquare, Database } from "lucide-react";

type Tab = "chat" | "editor";

interface AdminSidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { key: Tab; label: string; Icon: typeof MessageSquare }[] = [
  { key: "chat", label: "Chat", Icon: MessageSquare },
  { key: "editor", label: "Editor", Icon: Database },
];

export function AdminSidebar({ activeTab, onTabChange }: AdminSidebarProps) {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r border-game-border bg-game-bg-header p-4 gap-2 shrink-0">
      <nav className="flex flex-col gap-1" aria-label="Admin tools">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={[
              "flex items-center gap-3 px-3 h-9 rounded-sm text-[11px] uppercase tracking-wider transition-all duration-150 text-left focus-ring",
              activeTab === key
                ? "bg-game-text-muted/15 text-game-text-main border border-game-text-muted/20"
                : "text-game-text-dim hover:text-game-text-muted hover:bg-game-bg-panel border border-transparent",
            ].join(" ")}
            aria-label={label}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="font-display text-[10px]">{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
