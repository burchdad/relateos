export default function ConnectionsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
      <header className="rounded-2xl border border-soft bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">RelateOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Connections</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Connect external systems like Zoho, Gmail, Twilio, and YouTube to expand execution and data flow.
        </p>
      </header>

      <section className="mt-4 rounded-2xl border border-soft bg-panel/50 p-5 text-sm text-muted">
        Integration management surface is staged for provider onboarding and status checks.
      </section>
    </main>
  );
}
