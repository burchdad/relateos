"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import ContentTargetsPanel from "@/components/ContentTargetsPanel";
import FollowUpPanel from "@/components/FollowUpPanel";
import { CampaignExecutionSummary, ContentCampaignStats, ContentFollowUpStep, ContentItem, ContentTarget } from "@/components/types";

const extractYouTubeId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "") || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/embed/")[1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
};

type Props = {
  item: ContentItem;
  targets: ContentTarget[];
  followups: ContentFollowUpStep[];
  stats?: ContentCampaignStats;
  loadingTargets: boolean;
  loadingFollowups: boolean;
  onViewTargets: (contentId: string) => Promise<void>;
  onViewFollowups: (contentId: string) => Promise<void>;
  onSendMessage: (relationshipId: string, message: string) => Promise<void>;
  onBulkSend: (
    contentId: string,
    dayOffset: number,
    relationshipIds: string[],
    dispatchMode: "immediate" | "queued",
    delayWindowMinutes: number
  ) => Promise<{
    executedCount: number;
    queuedCount: number;
    mode: "immediate" | "queued";
    campaignSummary?: CampaignExecutionSummary;
  }>;
  onMarkEngagement: (contentId: string, relationshipId: string, status: "responded" | "ignored") => Promise<void>;
};

export default function ContentCard({
  item,
  targets,
  followups,
  stats,
  loadingTargets,
  loadingFollowups,
  onViewTargets,
  onViewFollowups,
  onSendMessage,
  onBulkSend,
  onMarkEngagement,
}: Props) {
  const [showTargets, setShowTargets] = useState(false);
  const [showFollowups, setShowFollowups] = useState(false);

  const youtubeEmbedUrl = useMemo(() => {
    if (item.source_type !== "youtube") {
      return null;
    }
    const videoId = extractYouTubeId(item.source_url);
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  }, [item.source_type, item.source_url]);

  return (
    <article className="card-reveal rounded-xl border border-soft bg-panel p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-text">{item.title}</h3>
          <p className="mt-1 text-xs uppercase tracking-wider text-muted">{item.source_type}</p>
          {item.experiment_key ? (
            <p className="mt-2 text-xs text-muted">
              Experiment <span className="text-text">{item.experiment_key}</span>
              {item.experiment_variant ? ` • ${item.experiment_variant}` : ""}
            </p>
          ) : null}
        </div>
        <a
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-soft px-3 py-1.5 text-xs text-text hover:bg-soft"
        >
          Open Source
        </a>
      </div>

      <p className="mt-3 text-sm text-muted">{item.description}</p>

      {youtubeEmbedUrl ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-soft">
          <iframe
            src={youtubeEmbedUrl}
            title={`${item.title} preview`}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt={item.title} className="mt-3 h-40 w-full rounded-lg border border-soft object-cover" />
      ) : null}

      <div className="mt-3 rounded-md border border-soft bg-canvas/70 p-3 text-sm text-text/95">
        {item.latest_insight?.summary || "Summary not generated yet. Generate and refine this content angle."}
      </div>

      <div className="mt-3 grid gap-2 rounded-md border border-soft bg-canvas/60 p-3 text-xs text-muted sm:grid-cols-4">
        <p>Sent: <span className="font-semibold text-text">{stats?.sent_count ?? 0}</span></p>
        <p>Engaged: <span className="font-semibold text-emerald-200">{stats?.responded_count ?? 0}</span></p>
        <p>Ignored: <span className="font-semibold text-amber-200">{stats?.ignored_count ?? 0}</span></p>
        <p>Pending: <span className="font-semibold text-text">{stats?.pending_count ?? 0}</span></p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={async () => {
            const next = !showTargets;
            setShowTargets(next);
            if (next) {
              await onViewTargets(item.id);
            }
          }}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:brightness-110"
        >
          {showTargets ? "Hide Targets" : "View Targets"}
        </button>
        <button
          onClick={async () => {
            const next = !showFollowups;
            setShowFollowups(next);
            if (next) {
              await onViewFollowups(item.id);
            }
          }}
          className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
        >
          {showFollowups ? "Hide Follow-Ups" : "View Follow-Ups"}
        </button>
        <Link
          href={`/relationships?intent=targets&content_id=${item.id}`}
          className="rounded-md border border-soft px-3 py-1.5 text-sm text-text hover:bg-soft"
        >
          View Targets in Relationships
        </Link>
      </div>

      {showTargets ? (
        <div className="mt-3">
          <ContentTargetsPanel
            loading={loadingTargets}
            targets={targets}
            onMarkEngagement={(relationshipId, status) => onMarkEngagement(item.id, relationshipId, status)}
          />
        </div>
      ) : null}

      {showFollowups ? (
        <div className="mt-3">
          <FollowUpPanel
            loading={loadingFollowups}
            steps={followups}
            contentId={item.id}
            onSend={onSendMessage}
            onBulkSend={onBulkSend}
          />
        </div>
      ) : null}
    </article>
  );
}
