"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useXPNotification } from "./XPNotificationContext";
import { XPBar } from "./XPBar";
import { xpForLevel } from "@/lib/xp";

export function LevelUpOverlay() {
  const { levelUpInfo, dismissLevelUp } = useXPNotification();
  const [phase, setPhase] = useState<"flash" | "text" | "done">("flash");
  const [displayedLevel, setDisplayedLevel] = useState(0);

  // Animate level number from newLevel-1 to newLevel over ~600ms
  useEffect(() => {
    if (!levelUpInfo) return;
    const target = levelUpInfo.newLevel;
    const start = target - 1;
    setDisplayedLevel(start);
    const steps = 30;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= steps) {
        setDisplayedLevel(target);
        clearInterval(interval);
      } else {
        setDisplayedLevel(Math.round(start + (target - start) * (step / steps)));
      }
    }, 20);
    return () => clearInterval(interval);
  }, [levelUpInfo]);

  useEffect(() => {
    if (!levelUpInfo) return;
    
    setPhase("flash");
    const flashTimer = setTimeout(() => setPhase("text"), 250);
    const autoDismiss = setTimeout(() => dismissLevelUp(), 3000);

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(autoDismiss);
    };
  }, [levelUpInfo, dismissLevelUp]);

  // Escape key dismisses overlay
  useEffect(() => {
    if (!levelUpInfo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissLevelUp();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [levelUpInfo, dismissLevelUp]);

  if (!levelUpInfo) return null;

  const totalXP = levelUpInfo.totalXP;
  const newLevel = levelUpInfo.newLevel;
  const xpForCurrentLevel = xpForLevel(newLevel);
  const xpForNextLevel = xpForLevel(newLevel + 1);
  const progress = ((totalXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={dismissLevelUp}>
        {/* Phase 1: Flash */}
        {phase === "flash" && (
          <motion.div
            className="absolute inset-0 bg-game-lunar/30"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onAnimationComplete={() => setPhase("text")}
          />
        )}
        
        {/* Phase 2: Level up text */}
        {(phase === "text" || phase === "done") && (
          <motion.div
            className="bg-game-bg-panel border border-game-border rounded-sm p-8 flex flex-col items-center gap-4 text-center"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <motion.div
              className="font-display text-3xl tracking-wider text-game-text-main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              LEVEL UP!
            </motion.div>
            <motion.div
              className="h-20 w-20 rounded-full bg-game-lunar text-game-bg-main flex items-center justify-center font-display text-3xl tracking-wider"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
            >
              {displayedLevel}
            </motion.div>
            <div className="w-48">
              <XPBar progress={progress} />
            </div>
            <motion.button
              className="mt-4 px-6 py-2 bg-game-bg-header border border-game-border text-game-text-main font-display text-[10px] uppercase tracking-wider rounded-sm transition-colors hover:border-game-border-highlight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={(e) => { e.stopPropagation(); dismissLevelUp(); }}
            >
              Continue
            </motion.button>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
}
