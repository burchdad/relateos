"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveApiUrl } from "@/components/api";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantAction = {
  type: string;
  label: string;
  status: string;
  href: string | null;
  metadata: Record<string, unknown>;
};

type AssistantResponse = {
  reply: string;
  actions: AssistantAction[];
  navigate_to: string | null;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const starterMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "What should we get done?",
  },
];

export default function FloatingAssistant() {
  const API_URL = useMemo(resolveApiUrl, []);
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const finalTranscriptRef = useRef("");
  const liveTranscriptRef = useRef("");
  const autoSubmitVoiceRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcriptPreview, setTranscriptPreview] = useState("");
  const [error, setError] = useState("");

  const speechSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const submit = async (event?: FormEvent<HTMLFormElement>, directInput?: string) => {
    event?.preventDefault();
    const text = (directInput || input).trim();
    if (!text) return;
    if (loading) {
      requestAbortRef.current?.abort();
    }
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setTranscriptPreview("");
    setLoading(true);
    setError("");
    const controller = new AbortController();
    requestAbortRef.current = controller;
    try {
      const res = await fetch(`${API_URL}/ai/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          history: messages.slice(-8),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Teifke AI could not complete that.");
      }
      const payload = (await res.json()) as AssistantResponse;
      setMessages([...nextMessages, { role: "assistant", content: payload.reply }]);
      setActions(payload.actions || []);
      if (payload.navigate_to) {
        router.push(payload.navigate_to as never);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages([...nextMessages, { role: "assistant", content: "Stopped." }]);
        return;
      }
      const message = err instanceof Error ? err.message : "Teifke AI could not complete that.";
      setError(message);
      setMessages([...nextMessages, { role: "assistant", content: message }]);
    } finally {
      setLoading(false);
      requestAbortRef.current = null;
    }
  };

  const startVoice = (autoSubmit = true) => {
    if (!speechSupported || typeof window === "undefined") {
      setError("Voice input is not supported in this browser.");
      return;
    }
    if (listening) {
      return;
    }

    const SpeechCtor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      || (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SpeechCtor) return;

    const recognition = new SpeechCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    finalTranscriptRef.current = "";
    liveTranscriptRef.current = "";
    autoSubmitVoiceRef.current = autoSubmit;
    setTranscriptPreview("");
    recognition.onresult = event => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (const result of Array.from(event.results)) {
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      const transcript = (finalTranscript || interimTranscript).trim();
      liveTranscriptRef.current = transcript;
      if (finalTranscript.trim()) finalTranscriptRef.current = finalTranscript.trim();
      setTranscriptPreview(transcript);
      setInput(transcript);
    };
    recognition.onend = () => {
      setListening(false);
      const transcript = (finalTranscriptRef.current || liveTranscriptRef.current).trim();
      if (autoSubmitVoiceRef.current && transcript) {
        void submit(undefined, transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError("Voice input stopped. Try typing the command instead.");
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const interrupt = () => {
    requestAbortRef.current?.abort();
    recognitionRef.current?.stop();
    setListening(false);
    setLoading(false);
  };

  const runAction = (action: AssistantAction) => {
    const confirmCommand = typeof action.metadata?.confirm_command === "string" ? action.metadata.confirm_command : "";
    if (action.status === "needs_confirmation" && confirmCommand) {
      void submit(undefined, confirmCommand);
      return;
    }
    if (action.href) {
      router.push(action.href as never);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 hidden md:block">
      {open ? (
        <section className="w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-soft bg-panel shadow-card">
          <header className="flex items-center justify-between border-b border-soft px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Teifke AI</p>
              <h2 className="text-sm font-semibold text-text">Command Assistant</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-soft px-2 py-1 text-xs text-text hover:bg-soft/40"
            >
              Close
            </button>
          </header>
          <div className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-8 border-accent/40 bg-accent/20 text-text"
                    : "mr-8 border-soft bg-white text-text"
                }`}
              >
                {message.content}
              </div>
            ))}
            {actions.length ? (
              <div className="rounded-lg border border-soft bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Actions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {actions.map((action, index) => (
                    action.href || action.status === "needs_confirmation" ? (
                      <button
                        type="button"
                        key={`${action.type}-${index}`}
                        onClick={() => runAction(action)}
                        className={`rounded-md border px-3 py-1.5 text-xs text-text hover:bg-soft/40 ${
                          action.status === "needs_confirmation" ? "border-accent/60 bg-accent/30 font-semibold" : "border-soft"
                        }`}
                      >
                        {action.label}
                      </button>
                    ) : (
                      <span key={`${action.type}-${index}`} className="rounded-md border border-soft px-3 py-1.5 text-xs text-muted">
                        {action.label}
                      </span>
                    )
                  ))}
                </div>
              </div>
            ) : null}
            {loading ? <p className="text-xs text-muted">Thinking...</p> : null}
            {listening ? (
              <div className="rounded-lg border border-accent/50 bg-accent/20 px-3 py-2 text-sm text-text">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Listening</p>
                <p className="mt-1">{transcriptPreview || "Speak now..."}</p>
              </div>
            ) : null}
            {error ? <p className="text-xs text-red-700">{error}</p> : null}
          </div>
          <form onSubmit={submit} className="border-t border-soft p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="Ask or command Teifke AI"
                className="min-w-0 flex-1 rounded-md border border-soft bg-white px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
              />
              <button
                type="button"
                onPointerDown={event => {
                  event.preventDefault();
                  startVoice(true);
                }}
                onPointerUp={stopVoice}
                onPointerCancel={stopVoice}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") startVoice(true);
                }}
                onKeyUp={event => {
                  if (event.key === "Enter" || event.key === " ") stopVoice();
                }}
                className={`h-10 w-10 rounded-md border border-soft text-sm font-semibold ${listening ? "bg-accent text-text" : "bg-white text-text hover:bg-soft/40"}`}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
              >
                {listening ? "Stop" : "Mic"}
              </button>
              {loading ? (
                <button
                  type="button"
                  onClick={interrupt}
                  className="rounded-md border border-soft bg-white px-3 py-2 text-sm font-semibold text-text hover:bg-soft/40"
                >
                  Stop
                </button>
              ) : null}
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-text disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/50 bg-text text-lg font-semibold text-accent shadow-card hover:brightness-110"
          aria-label="Open Teifke AI assistant"
        >
          AI
        </button>
      )}
    </div>
  );
}
