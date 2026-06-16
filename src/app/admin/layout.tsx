export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark-game min-h-dvh bg-game-bg-main text-game-text-main">
      {children}
    </div>
  );
}
