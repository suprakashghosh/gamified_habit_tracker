"use client";
import { motion } from "framer-motion";

interface XPBarProps {
  progress: number; // 0-100
}

export function XPBar({ progress }: XPBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="h-2 w-full rounded-full bg-game-bg-main overflow-hidden">
      <motion.div
        className="h-full bg-game-lunar rounded-full"
        initial={false}
        animate={{ width: `${clampedProgress}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}
