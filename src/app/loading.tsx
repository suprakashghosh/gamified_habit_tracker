import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return (
    <div className="dark-game min-h-dvh bg-canvas-soft p-[--spacing-md]">
      <div className="max-w-6xl mx-auto">
        <div className="h-12 w-32 rounded-[--radius-md] bg-canvas-soft-2 animate-pulse mb-4" />
        <LoadingSkeleton />
      </div>
    </div>
  );
}
