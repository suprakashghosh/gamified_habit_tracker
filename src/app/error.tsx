"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="dark-game min-h-dvh bg-canvas-soft flex items-center justify-center p-[--spacing-md]">
      <div className="text-center space-y-4">
        <h2 className="font-[--font-display-md] tracking-[--tracking-display-md] text-ink">
          Something went wrong
        </h2>
        <p className="font-[--font-body-sm] text-mute">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={() => { reset(); router.refresh(); }}
          className="px-4 py-2 rounded-[--radius-pill-sm] bg-primary text-on-primary font-[--font-button-md] hover:opacity-90 transition-opacity focus-ring"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
