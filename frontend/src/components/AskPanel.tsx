import { useEffect, useRef, useState } from "react";
import { useApp } from "../appContext";
import { fmtJakarta } from "../format";
import { groupLabel } from "../useMarket";

function introText(runs: ReturnType<typeof useApp>["market"]["runs"], groups: string[]): string {
  const parts = groups.map((g) => {
    const t = runs[g]?.[0]?.created_at;
    return `${groupLabel(g)} ${t ? `at ${fmtJakarta(t)}` : "(no run yet)"}`;
  });
  return (
    "Ask about any asset or your holdings." +
    (parts.length ? ` I can see the latest runs: ${parts.join(", ")}.` : "")
  );
}

/** Message list + chips + input. Used inside the web slide-over and as the phone Ask tab. */
export function AskThread({ chips, phone }: { chips: string[]; phone?: boolean }) {
  const { ask, market } = useApp();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [ask.msgs, ask.pending]);

  const bubbleBg = phone ? "var(--color-surface)" : "var(--color-bg)";
  const msgs = [{ role: "ai" as const, text: introText(market.runs, market.groups) }, ...ask.msgs];

  return (
    <>
      <div className={phone ? "ask-log ask-log-phone" : "ask-log"}>
        {msgs.map((m, i) => (
          <div
            key={i}
            className="ask-msg"
            style={
              m.role === "user"
                ? { alignSelf: "flex-end", background: "var(--color-accent-800)" }
                : { alignSelf: "flex-start", background: bubbleBg, boxShadow: "var(--shadow-sm)" }
            }
          >
            {m.text}
          </div>
        ))}
        {ask.pending && (
          <div className="ask-dots" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className={phone ? "ask-chips ask-chips-phone" : "ask-chips"}>
        {chips.map((c) => (
          <button key={c} className="btn btn-secondary ask-chip" disabled={ask.pending} onClick={() => ask.ask(c)}>
            {c}
          </button>
        ))}
      </div>
      <form
        className={phone ? "ask-form ask-form-phone" : "ask-form"}
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || ask.pending) return;
          ask.ask(draft);
          setDraft("");
        }}
      >
        <input
          className="input"
          placeholder={phone ? "Ask anything…" : "Ask about any asset or your holdings…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn btn-primary btn-icon" type="submit" aria-label="Send" disabled={ask.pending}>
          <i className="ph ph-paper-plane-right" />
        </button>
      </form>
    </>
  );
}

/** Web: right-hand slide-over with a backdrop. */
export function AskPanel({ open, onClose, chips }: { open: boolean; onClose: () => void; chips: string[] }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="ask-backdrop" onClick={onClose} />
      <aside className="ask-panel" aria-label="Ask about your assets">
        <div className="ask-head">
          <span>
            <i className="ph ph-sparkle" style={{ color: "var(--color-accent)" }} />
            Ask about your assets
          </span>
          <button className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close">
            <i className="ph ph-x" />
          </button>
        </div>
        <AskThread chips={chips} />
      </aside>
    </>
  );
}
