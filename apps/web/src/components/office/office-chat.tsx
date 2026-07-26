"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import type { DondieChatMessage, DondieChatReply, DondieChatThread } from "@trading/types";
import { apiFetch } from "../../lib/api";
import { useSessionStore } from "../../store/session";

const SUGGESTIONS = ["What are you working on?", "What's your strategy?"] as const;

export function OfficeChat({
  onSpeechBubble
}: {
  readonly onSpeechBubble?: ((text: string | null) => void) | undefined;
}): ReactElement {
  const token = useSessionStore((state) => state.accessToken);
  const [messages, setMessages] = useState<readonly DondieChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const thread = await apiFetch<DondieChatThread>("/dondie/chat", {}, token);
        if (!cancelled) {
          setMessages(thread.messages);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const send = async (text: string): Promise<void> => {
    const content = text.trim();
    if (!content || !token || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const optimistic: DondieChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    try {
      const reply = await apiFetch<DondieChatReply>(
        "/dondie/chat",
        { method: "POST", body: JSON.stringify({ message: content }) },
        token
      );
      setMessages(reply.thread.messages);
      onSpeechBubble?.(reply.speechBubble);
      window.setTimeout(() => onSpeechBubble?.(null), 4_500);
    } catch (err) {
      setMessages((prev) => prev.filter((entry) => entry.id !== optimistic.id));
      setDraft(content);
      setError(err instanceof Error ? err.message : "Could not reach Dondie.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void send(draft);
  };

  return (
    <div className="office-chat" data-testid="office-chat">
      <p className="office-inspector__label">Talk to Dondie</p>
      <div className="office-chat__suggestions">
        {SUGGESTIONS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="office-chat__chip"
            data-testid={`office-chat-suggest-${prompt === SUGGESTIONS[0] ? "work" : "strategy"}`}
            disabled={busy || !token}
            onClick={() => void send(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="office-chat__messages" ref={listRef} data-testid="office-chat-messages">
        {!loaded ? (
          <p className="office-inspector__mono">Loading thread…</p>
        ) : messages.length === 0 ? (
          <p className="office-inspector__mono">Ask what he is working on or which strategy he is running.</p>
        ) : (
          messages.map((entry) => (
            <div
              key={entry.id}
              className="office-chat__bubble"
              data-role={entry.role}
              data-testid={`office-chat-msg-${entry.role}`}
            >
              <p className="office-chat__meta">{entry.role === "user" ? "You" : "Dondie"}</p>
              <p className="office-chat__text">{entry.content}</p>
            </div>
          ))
        )}
      </div>

      {error ? (
        <p className="office-chat__error" data-testid="office-chat-error">
          {error}
        </p>
      ) : null}

      <form className="office-chat__form" onSubmit={onSubmit}>
        <input
          className="office-chat__input"
          data-testid="office-chat-input"
          type="text"
          value={draft}
          maxLength={500}
          placeholder="Talk to Dondie…"
          disabled={busy || !token}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Message Dondie"
        />
        <button
          type="submit"
          className="office-inspector__action"
          data-tone="primary"
          data-testid="office-chat-send"
          disabled={busy || !token || !draft.trim()}
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
