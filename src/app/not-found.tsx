import Link from "next/link";

export default function NotFound() {
  return (
    <div className="dark-game min-h-dvh bg-canvas-soft flex items-center justify-center p-[--spacing-md]">
      <div className="text-center space-y-4">
        <h1 className="font-[--font-display-xl] tracking-[--tracking-display-xl] text-ink">
          404
        </h1>
        <p className="font-[--font-body-md] text-mute">Page not found</p>
        <Link
          href="/"
          className="px-4 py-2 rounded-[--radius-pill-sm] bg-primary text-on-primary font-[--font-button-md] hover:opacity-90 transition-opacity inline-block focus-ring"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
