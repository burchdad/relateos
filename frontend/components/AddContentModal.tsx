"use client";

import { FormEvent, useState } from "react";
import type { ContentSourceType } from "@/components/types";

const SOURCE_OPTIONS: { value: ContentSourceType; label: string; placeholder: string }[] = [
  { value: "skool", label: "Skool", placeholder: "https://www.skool.com/..." },
  { value: "youtube", label: "YouTube", placeholder: "https://youtube.com/watch?v=..." },
  { value: "facebook", label: "Facebook", placeholder: "https://facebook.com/..." },
  { value: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { value: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/..." },
  { value: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/..." },
  { value: "zoom", label: "Zoom", placeholder: "Zoom recording or meeting URL" },
  { value: "podcast", label: "Podcast", placeholder: "Podcast episode URL" },
  { value: "newsletter", label: "Newsletter", placeholder: "Newsletter issue URL" },
  { value: "website", label: "Website", placeholder: "Article, landing page, or resource URL" },
  { value: "upload", label: "Upload Link", placeholder: "Drive, Dropbox, or file URL" },
];

type Props = {
  open: boolean;
  creating: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    description: string;
    source_type: ContentSourceType;
    source_url: string;
    experiment_key?: string;
    experiment_variant?: "control" | "optimized";
  }) => Promise<void>;
};

export default function AddContentModal({ open, creating, error, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState<ContentSourceType>("skool");
  const [sourceUrl, setSourceUrl] = useState("");
  const [experimentKey, setExperimentKey] = useState("");
  const [experimentVariant, setExperimentVariant] = useState<"control" | "optimized" | "">("");
  const [localError, setLocalError] = useState("");

  if (!open) {
    return null;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");

    if (!title.trim() || !description.trim() || !sourceUrl.trim()) {
      setLocalError("Title, description, and source URL are required.");
      return;
    }

    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      source_type: sourceType,
      source_url: sourceUrl.trim(),
      experiment_key: experimentKey.trim() || undefined,
      experiment_variant: experimentVariant || undefined,
    });

    setTitle("");
    setDescription("");
    setSourceType("skool");
    setSourceUrl("");
    setExperimentKey("");
    setExperimentVariant("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-soft bg-panel p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Add Content</h2>
          <button onClick={onClose} className="rounded-md border border-soft px-3 py-1 text-xs text-muted hover:bg-soft">
            Close
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            rows={4}
            className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
          />
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as ContentSourceType)}
            className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
          >
            {SOURCE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder={SOURCE_OPTIONS.find(option => option.value === sourceType)?.placeholder || "Source URL"}
            className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
          />
          <input
            value={experimentKey}
            onChange={(e) => setExperimentKey(e.target.value)}
            placeholder="Experiment key (optional, e.g. q2-proof-loop)"
            className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
          />
          <select
            value={experimentVariant}
            onChange={(e) => setExperimentVariant(e.target.value as "control" | "optimized" | "")}
            className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
          >
            <option value="">No experiment variant</option>
            <option value="control">Control</option>
            <option value="optimized">Optimized</option>
          </select>

          {localError ? <p className="text-sm text-red-300">{localError}</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-canvas hover:brightness-110 disabled:opacity-60"
            >
              {creating ? "Saving..." : "Save Content"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-soft px-3 py-2 text-sm text-text hover:bg-soft"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
