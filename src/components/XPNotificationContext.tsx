"use client";
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export interface XPNotification {
  id: string;
  amount: number;
  x: number;         // tap X coordinate (viewport-relative)
  y: number;         // tap Y coordinate (viewport-relative)
  timestamp: number;
}

interface LevelUpInfo {
  newLevel: number;
  totalXP: number;
}

interface XPNotificationContextType {
  notifications: XPNotification[];
  addNotification: (amount: number, x: number, y: number) => void;
  removeNotification: (id: string) => void;
  levelUpInfo: LevelUpInfo | null;
  triggerLevelUp: (newLevel: number, totalXP: number) => void;
  dismissLevelUp: () => void;
}

const XPNotificationContext = createContext<XPNotificationContextType | null>(null);

export function useXPNotification() {
  const ctx = useContext(XPNotificationContext);
  if (!ctx) throw new Error("useXPNotification must be used within XPNotificationProvider");
  return ctx;
}

export function XPNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<XPNotification[]>([]);
  const [levelUpInfo, setLevelUpInfo] = useState<LevelUpInfo | null>(null);
  const pendingTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());
  
  const addNotification = useCallback((amount: number, x: number, y: number) => {
    const id = `xp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const notification: XPNotification = { id, amount, x, y, timestamp: Date.now() };
    setNotifications((prev) => [...prev, notification]);
    // Auto-remove after 1.5s
    const timeoutId = setTimeout(() => {
      pendingTimeouts.current.delete(timeoutId);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 1500);
    pendingTimeouts.current.add(timeoutId);
  }, []);
  
  // Cleanup all pending timeouts on unmount
  useEffect(() => {
    const timeouts = pendingTimeouts.current;
    return () => {
      timeouts.forEach((id) => clearTimeout(id));
      timeouts.clear();
    };
  }, []);
  
  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);
  
  const triggerLevelUp = useCallback((newLevel: number, totalXP: number) => {
    setLevelUpInfo({ newLevel, totalXP });
  }, []);
  
  const dismissLevelUp = useCallback(() => {
    setLevelUpInfo(null);
  }, []);
  
  return (
    <XPNotificationContext.Provider value={{
      notifications,
      addNotification,
      removeNotification,
      levelUpInfo,
      triggerLevelUp,
      dismissLevelUp,
    }}>
      {children}
    </XPNotificationContext.Provider>
  );
}
