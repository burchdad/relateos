"use client";

import { useState } from "react";

type Props = {
  initialMessage: string;
  onSend: (message: string) => Promise<void>;
};

export default function MessageComposer({ initialMessage, onSend }: Props) {
  const [message, setMessage] = useState(initialMessage);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    setIsSending(true);
    try {
      await onSend(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full min-h-24 rounded-lg border border-soft bg-canvas p-3 text-sm text-text outline-none focus:border-accent"
      />
      <button
        onClick={handleSend}
        disabled={isSending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas transition hover:brightness-110 disabled:opacity-60"
      >
        {isSending ? "Sending..." : "Confirm Send"}
      </button>
    </div>
  );
}
