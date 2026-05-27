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

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        {[
          {
            name: "Skool",
            status: "Agent sync",
            detail: "Scan the classroom archive, import Thursday recordings, and pair sessions with Meeting Intelligence.",
          },
          {
            name: "Read.ai",
            status: "Intake endpoint ready",
            detail: "Push meeting summaries, transcripts, action items, and participants into Meeting Intelligence.",
          },
          {
            name: "Calendar + Gmail",
            status: "Next",
            detail: "Capture invites, attendees, and follow-up context from internal meeting flow.",
          },
          {
            name: "Zoom / Meet",
            status: "Provider-backed",
            detail: "Use Read.ai first, then add native provider APIs where the client workflow requires it.",
          },
          {
            name: "CRM",
            status: "Planned",
            detail: "Sync contacts, stages, and deal context once contact taxonomy is stable.",
          },
        ].map((item) => (
          <article key={item.name} className="rounded-lg border border-soft bg-panel/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-text">{item.name}</h2>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
                {item.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{item.detail}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
