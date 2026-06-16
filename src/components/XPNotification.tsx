"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useXPNotification } from "./XPNotificationContext";

export function XPNotification() {
  const { notifications } = useXPNotification();

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      <AnimatePresence>
        {notifications.map((n, index) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: 0, scale: 0.8 }}
            animate={{ opacity: 1, y: -40, scale: 1 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ duration: 1.5, ease: "easeOut", delay: index * 0.08 }}
            className="absolute text-game-uncommon font-display text-sm uppercase tracking-wider font-bold whitespace-nowrap"
            style={{ left: n.x, top: n.y }}
          >
            +{n.amount} XP
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
