"use client";

import { FormEvent, useState } from "react";

type Props = {
  open: boolean;
  creating: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    description: string;
    source_type: "youtube" | "zoom" | "upload";
    source_url: string;
  }) => Promise<void>;
};

export default function AddContentModal({ open, creating, error, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceType, setSourceType] = useState<"youtube" | "zoom" | "upload">("youtube");
  const [sourceUrl, setSourceUrl] = useState("");
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
    });

    setTitle("");
    setDescription("");
    setSourceType("youtube");
    setSourceUrl("");
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
            onChange={(e) => setSourceType(e.target.value as "youtube" | "zoom" | "upload")}
            className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 focus:ring"
          >
            <option value="youtube">YouTube</option>
            <option value="zoom">Zoom</option>
            <option value="upload">Upload Link</option>
          </select>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="YouTube or Zoom URL"
            className="w-full rounded-md border border-soft bg-canvas px-3 py-2 text-sm text-text outline-none ring-accent/40 placeholder:text-muted focus:ring"
          />

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
