export default function Home() {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr_auto] items-center justify-items-center p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-8 row-start-2 items-center">
        <h1 className="font-[--font-display-xl] tracking-[--tracking-display-xl] text-ink">
          QuestBoard
        </h1>
        <p className="font-[--font-body-lg] text-body max-w-md text-center">
          Gamified Habit Tracker. Turn your todos into quests.
        </p>
        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <a
            className="flex items-center gap-2 rounded-pill bg-primary text-on-primary h-12 px-6 font-[--font-button-lg] hover:opacity-90 transition-opacity"
            href="/admin"
          >
            Go to Admin
          </a>
          <a
            className="flex items-center gap-2 rounded-full border border-hairline px-4 py-2 font-[--font-body-sm] text-body hover:border-hairline-strong transition-colors"
            href="https://nextjs.org/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center font-[--font-caption] text-mute">
        <a href="https://nextjs.org/learn" target="_blank" rel="noopener noreferrer">
          Learn
        </a>
        <a href="https://vercel.com/templates" target="_blank" rel="noopener noreferrer">
          Templates
        </a>
        <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer">
          Next.js
        </a>
      </footer>
    </div>
  );
}
