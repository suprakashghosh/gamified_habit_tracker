"use client";

import { Sun, CalendarDays, CalendarRange, Star } from "lucide-react";

type Tier = "daily" | "weekly" | "monthly" | "longterm";

interface MobileTabBarProps {
  activeTab: Tier;
  onTabChange: (tab: Tier) => void;
}

const TABS: { key: Tier; Icon: typeof Sun }[] = [
  { key: "daily", Icon: Sun },
  { key: "weekly", Icon: CalendarDays },
  { key: "monthly", Icon: CalendarRange },
  { key: "longterm", Icon: Star },
];

export function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-game-bg-panel border-t border-game-border pb-4"
      aria-label="Quest tabs"
      role="tablist"
    >
      <div className="flex items-center justify-around h-16">
        {TABS.map(({ key, Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={[
                "flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-3 rounded-sm transition-colors duration-150 focus-ring",
                isActive ? "text-game-lunar" : "text-game-text-dim",
              ].join(" ")}
              aria-label={`Show ${key} quests`}
              role="tab"
              aria-selected={isActive}
            >
              <Icon className="w-5 h-5" />
              <span className="font-display text-[10px] uppercase tracking-wider">
                {key}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
