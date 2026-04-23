export default function SettingsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
      <header className="rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">System-level controls and profile configuration for workspace behavior.</p>
      </header>

      <section className="mt-4 rounded-2xl border border-soft bg-panel/50 p-5 text-sm text-muted">
        Settings surface is prepared for user preferences, notification controls, and policy limits.
      </section>
    </main>
  );
}
