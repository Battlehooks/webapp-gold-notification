import { useState } from "react";
import { insight } from "../api";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

function chatId(): string {
  const key = "gold-notification-web-chat-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text }]);
    setSending(true);
    try {
      const res = await insight.chat(chatId(), text);
      setTurns((t) => [...t, { role: "assistant", text: res.reply }]);
    } catch (err) {
      setTurns((t) => [...t, { role: "assistant", text: `(error: ${String(err)})` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-log">
        {turns.length === 0 && (
          <p className="muted">
            Ask about the current BUY/SELL/WAIT signal, price stats, or recent
            news -- grounded in the same rule engine as the Telegram bot.
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={`chat-turn ${turn.role}`}>
            <span className="chat-role">{turn.role === "user" ? "You" : "Bot"}</span>
            <p>{turn.text}</p>
          </div>
        ))}
        {sending && <div className="chat-turn assistant muted">thinking...</div>}
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
          placeholder="Ask a question..."
        />
        <button type="submit" disabled={sending}>
          Send
        </button>
      </form>
    </div>
  );
}
