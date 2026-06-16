import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@fontsource/orbitron/400.css";
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/600.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QuestBoard",
  description: "Gamified Habit Tracker — Turn your todos into quests.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{
          "--font-display": "'Orbitron', sans-serif",
          "--font-mono": "'JetBrains Mono', monospace",
        } as React.CSSProperties}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
