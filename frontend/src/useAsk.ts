import { useCallback, useState } from "react";
import { insight } from "./api";

export interface AskMessage {
  role: "user" | "ai";
  text: string;
}

// Same key the old Chat page used, so an existing conversation keeps its
// server-side history in insight's chat_history.
const CHAT_ID_KEY = "gold-notification-web-chat-id";

function chatId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(CHAT_ID_KEY);
    if (!id) {
      id = `web-${crypto.randomUUID()}`;
      localStorage.setItem(CHAT_ID_KEY, id);
    }
  } catch {
    id ??= `web-${crypto.randomUUID()}`;
  }
  return id;
}

export interface Ask {
  msgs: AskMessage[];
  pending: boolean;
  ask: (question: string) => void;
}

/** `getContext` supplies the per-turn holdings text sent alongside the question. */
export function useAsk(getContext: () => string): Ask {
  const [msgs, setMsgs] = useState<AskMessage[]>([]);
  const [pending, setPending] = useState(false);

  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || pending) return;
      setMsgs((m) => [...m, { role: "user", text: q }]);
      setPending(true);
      insight
        .chat(chatId(), q, getContext())
        .then((res) => setMsgs((m) => [...m, { role: "ai", text: res.reply.trim() }]))
        .catch(() =>
          setMsgs((m) => [...m, { role: "ai", text: "I couldn't reach the insight service just now. Try again in a moment." }])
        )
        .finally(() => setPending(false));
    },
    [pending, getContext]
  );

  return { msgs, pending, ask };
}
