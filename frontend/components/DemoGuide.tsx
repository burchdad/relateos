"use client";

import { useEffect, useMemo, useState } from "react";

type DemoStep = {
  title: string;
  script: string;
  location: string;
  talkTrack: string;
};

const STEPS: DemoStep[] = [
  {
    title: "Step 1: Start On Dashboard",
    script: "Open Dashboard and lead with priority clarity.",
    location: "/dashboard",
    talkTrack:
      "This is our control tower. In seconds, I can see who needs outreach now, why they are high priority, and what should happen next.",
  },
  {
    title: "Step 2: Enter Relationships Context",
    script: "Move into Relationships to show decision context and relationship momentum.",
    location: "/relationships",
    talkTrack:
      "Each relationship includes context, timeline, and recommended next action, so reps are not guessing what to do or say.",
  },
  {
    title: "Step 3: Show Message + Action",
    script: "Generate an AI message in your voice and execute the next touchpoint.",
    location: "/relationships",
    talkTrack:
      "RelateOS drafts messages that sound like me, then logs interactions so the system gets smarter after every action.",
  },
  {
    title: "Step 4: Unified Import Intelligence",
    script: "Open the new Imports wizard and pick source in one flow.",
    location: "/imports",
    talkTrack:
      "Instead of separate import blocks, we now choose source type once, analyze workbook or Google Sheet, review mappings, then commit with confidence.",
  },
  {
    title: "Step 5: Analyze Before Commit",
    script: "Run Analyze to preview detected tabs, headers, mappings, and sample rows.",
    location: "/imports",
    talkTrack:
      "This is BI-style safety: analyze first, select tabs, override mappings, then run import. It reduces bad writes and preserves unmapped fields.",
  },
  {
    title: "Step 6: AI Event Capture Automation",
    script: "Show that engagement events are now auto-enriched by AI on create/import/capture.",
    location: "/signals",
    talkTrack:
      "Every event now gets structured intelligence: summary, intent, engagement score, tags, confidence, and suggested next action.",
  },
  {
    title: "Step 7: Agent Mailbox Invite Intake",
    script: "Demo inbound invite ingestion for agent mailbox workflows.",
    location: "/meetings",
    talkTrack:
      "Forward an invite to the agent mailbox and we auto-create meeting, parse attendees, and log a meeting_invite_received engagement signal.",
  },
  {
    title: "Step 8: Close With Compound Intelligence",
    script: "Return to Dashboard to show closed-loop execution.",
    location: "/dashboard",
    talkTrack:
      "This is the full loop: capture activity automatically, enrich with AI, and turn it into prioritized actions that move pipeline every day.",
  },
];

const STORAGE_KEY = "relateos_demo_tour_seen";

export default function DemoGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const seen = window.localStorage.getItem(STORAGE_KEY);
    setIsOpen(!seen);
  }, []);

  const step = useMemo(() => STEPS[stepIndex], [stepIndex]);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const close = () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setIsOpen(false);
  };

  const restart = () => {
    setStepIndex(0);
    setIsOpen(true);
  };

  if (!isOpen) {
    return (
      <button
        onClick={restart}
        className="fixed bottom-5 right-5 z-40 rounded-full border border-soft bg-panel px-4 py-2 text-xs font-medium text-text shadow-card hover:bg-soft"
      >
        Run Demo Script
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-canvas/70 backdrop-blur-sm" aria-hidden="true" />
      <aside className="fixed bottom-5 right-5 z-50 w-full max-w-sm rounded-2xl border border-soft bg-panel p-5 shadow-card">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Guided Demo</p>
        <h3 className="mt-2 text-lg font-semibold text-text">{step.title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{step.script}</p>
        <p className="mt-2 rounded-md border border-soft bg-base px-2 py-1 text-[11px] text-muted">
          Navigate: <span className="font-mono text-text">{step.location}</span>
        </p>
        <p className="mt-2 text-sm leading-6 text-text">{step.talkTrack}</p>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-soft">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {stepIndex + 1} of {STEPS.length}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={isFirst}
            className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft disabled:opacity-40"
          >
            Back
          </button>
          {!isLast ? (
            <button
              onClick={() => setStepIndex((current) => Math.min(STEPS.length - 1, current + 1))}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:brightness-110"
            >
              Next
            </button>
          ) : (
            <button
              onClick={close}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:brightness-110"
            >
              Finish
            </button>
          )}
          <button
            onClick={close}
            className="ml-auto rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
          >
            Skip
          </button>
        </div>
      </aside>
    </>
  );
}
