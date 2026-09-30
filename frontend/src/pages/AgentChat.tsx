import { useState } from "react";
import { agent } from "../api";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

function sessionId(): string {
  const key = "gold-notification-web-agent-session-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function AgentChat() {
  const [token, setToken] = useState(() => localStorage.getItem("agent-token") ?? "");
  const [draftToken, setDraftToken] = useState(token);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  function connect() {
    localStorage.setItem("agent-token", draftToken);
    setToken(draftToken);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !token) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text }]);
    setSending(true);
    try {
      const res = await agent.chat(token, sessionId(), text);
      setTurns((t) => [...t, { role: "assistant", text: res.reply }]);
    } catch (err) {
      setTurns((t) => [...t, { role: "assistant", text: `(error: ${String(err)})` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="agent-page">
      <form
        className="admin-token-row"
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        Agent token
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="password"
            value={draftToken}
            onChange={(e) => setDraftToken(e.target.value)}
            placeholder="AGENT_TOKEN from the Agent Service's .env"
          />
          <button type="submit">Connect</button>
        </div>
      </form>

      {!token && (
        <p className="muted">
          Enter the agent token to chat with the ops agent. It has real, unsandboxed
          shell access to the VPS -- owner use only.
        </p>
      )}

      {token && (
        <div className="chat-page">
          <div className="chat-log">
            {turns.length === 0 && (
              <p className="muted">
                Ask it to check disk/memory, list or restart containers, tail logs, or
                manage Telegram subscribers. Every action it takes is logged.
              </p>
            )}
            {turns.map((turn, i) => (
              <div key={i} className={`chat-turn ${turn.role}`}>
                <span className="chat-role">{turn.role === "user" ? "You" : "Agent"}</span>
                <p>{turn.text}</p>
              </div>
            ))}
            {sending && <div className="chat-turn assistant muted">working...</div>}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent to do something..."
            />
            <button type="submit" disabled={sending}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
