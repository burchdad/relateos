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
    title: "Step 1: Dashboard",
    script: "This is the home screen. It shows what matters first.",
    location: "/dashboard",
    talkTrack:
      "Think of this like your mission board in a game. It tells you who needs attention now and what task to do next.",
  },
  {
    title: "Step 2: Contacts",
    script: "This page is your people and relationship tracker.",
    location: "/contacts",
    talkTrack:
      "Each person has a story card: where you are with them, what happened before, and what you should do next.",
  },
  {
    title: "Step 3: Deals",
    script: "This page tracks money opportunities.",
    location: "/deals",
    talkTrack:
      "If a deal is open, won, or stuck, you can see it here like a score tracker.",
  },
  {
    title: "Step 4: Partners",
    script: "This page shows companies and groups you work with.",
    location: "/organizations",
    talkTrack:
      "People belong to companies, so this page helps you see the team around each relationship.",
  },
  {
    title: "Step 5: Content",
    script: "This page is your content command center.",
    location: "/content",
    talkTrack:
      "You can create or reuse content, send it to the right people, and track who responded.",
  },
  {
    title: "Step 6: Events",
    script: "This page manages live events like webinars.",
    location: "/events",
    talkTrack:
      "You can schedule events and keep them connected to your relationships and campaigns.",
  },
  {
    title: "Step 7: Network Graph",
    script: "This page draws the connection map.",
    location: "/network/graph",
    talkTrack:
      "It is like a spider web of people and companies so you can spot who connects to who.",
  },
  {
    title: "Step 8: Scoreboard",
    script: "This page is your points table.",
    location: "/scoreboard",
    talkTrack:
      "It ranks what is going well and what needs help, so decisions are easier.",
  },
  {
    title: "Step 9: Meetings",
    script: "This page stores meeting memory.",
    location: "/meetings",
    talkTrack:
      "Meeting invites can be captured by the agent mailbox, then RelateOS saves attendees, notes, and follow-ups.",
  },
  {
    title: "Step 10: Imports",
    script: "This is the new all-in-one data import wizard.",
    location: "/imports",
    talkTrack:
      "Pick where data comes from, analyze it first, fix mappings, then import safely in one flow.",
  },
  {
    title: "Step 11: Content Funnels",
    script: "This page shows your content pipeline path.",
    location: "/funnels",
    talkTrack:
      "It helps you move people from first touch to stronger engagement step by step.",
  },
  {
    title: "Step 12: RelateOS AI",
    script: "This is your AI helper page.",
    location: "/relateos",
    talkTrack:
      "Use AI to get suggestions, summaries, and smart next actions faster.",
  },
  {
    title: "Step 13: Signals",
    script: "This page watches activity signals.",
    location: "/signals",
    talkTrack:
      "When people interact, events are auto-captured and AI adds meaning like intent and urgency.",
  },
  {
    title: "Step 14: Connections",
    script: "This page is for connecting outside tools.",
    location: "/connections",
    talkTrack:
      "Think of this as plugging in extra power-ups like email or calendar services.",
  },
  {
    title: "Step 15: Settings",
    script: "This page controls how your workspace behaves.",
    location: "/settings",
    talkTrack:
      "You can change defaults and preferences so the app fits your team.",
  },
  {
    title: "Step 16: Full Loop Recap",
    script: "Go back to Dashboard and show the full story.",
    location: "/dashboard",
    talkTrack:
      "Simple version: capture what happened, understand it with AI, and take the best next step.",
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
        aria-label="Run simple demo tour"
        className="fixed bottom-20 right-4 z-40 rounded-full border border-soft/70 bg-panel/70 px-2.5 py-1.5 text-[11px] font-medium text-muted shadow-[0_6px_18px_rgba(28,58,42,0.08)] backdrop-blur hover:bg-panel hover:text-text sm:bottom-5 sm:right-5 sm:px-3"
      >
        <span className="hidden sm:inline">Demo Tour</span>
        <span className="sm:hidden">Demo</span>
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-canvas/70 backdrop-blur-sm" aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-guide-title"
        className="fixed inset-x-3 bottom-4 z-50 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-soft/80 bg-panel p-4 shadow-card sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-full sm:max-w-sm sm:p-5"
      >
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Guided Demo</p>
        <h3 id="demo-guide-title" className="mt-2 text-lg font-semibold text-text">{step.title}</h3>
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
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text hover:brightness-110"
            >
              Next
            </button>
          ) : (
            <button
              onClick={close}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text hover:brightness-110"
            >
              Finish
            </button>
          )}
          <button
            onClick={close}
            className="ml-auto rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
          >
            Skip demo tour
          </button>
        </div>
      </aside>
    </>
  );
}
