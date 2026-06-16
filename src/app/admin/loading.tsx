import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function AdminLoading() {
  return (
    <div className="min-h-dvh bg-game-bg-main p-[--spacing-md]">
      <div className="max-w-4xl mx-auto">
        <div className="h-10 w-48 rounded-sm bg-game-bg-panel animate-pulse mb-4" />
        <LoadingSkeleton count={3} variant="dark" />
      </div>
    </div>
  );
}
