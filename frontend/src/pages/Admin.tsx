import { useEffect, useState } from "react";
import { notificationAdmin, type Subscriber } from "../api";

export function Admin() {
  const [token, setToken] = useState(() => localStorage.getItem("admin-token") ?? "");
  const [draftToken, setDraftToken] = useState(token);
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function connect() {
    localStorage.setItem("admin-token", draftToken);
    setToken(draftToken);
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    notificationAdmin
      .subscribers(token)
      .then((res) => {
        if (cancelled) return;
        setSubscribers(res.subscribers);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setSubscribers(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function refresh() {
    if (!token) return;
    try {
      const res = await notificationAdmin.subscribers(token);
      setSubscribers(res.subscribers);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function approve(chatId: string) {
    await notificationAdmin.approve(chatId, token);
    void refresh();
  }

  async function deny(chatId: string) {
    await notificationAdmin.deny(chatId, token);
    void refresh();
  }

  const pending = subscribers?.filter((s) => s.status === "pending") ?? [];
  const others = subscribers?.filter((s) => s.status !== "pending") ?? [];

  return (
    <div className="admin-page">
      <form
        className="admin-token-row"
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        Admin token
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="password"
            value={draftToken}
            onChange={(e) => setDraftToken(e.target.value)}
            placeholder="ADMIN_TOKEN from the Notification Service's .env"
          />
          <button type="submit">Connect</button>
        </div>
      </form>

      {error && <div className="banner error">{error}</div>}
      {!token && <p className="muted">Enter the admin token to manage subscribers.</p>}

      {subscribers && (
        <>
          <h3>Pending requests ({pending.length})</h3>
          {pending.length === 0 && <p className="muted">Nothing pending.</p>}
          <table className="admin-table">
            <tbody>
              {pending.map((s) => (
                <tr key={s.chat_id}>
                  <td>{s.chat_id}</td>
                  <td>{s.username ? `@${s.username}` : "(no username)"}</td>
                  <td>{s.requested_at}</td>
                  <td>
                    <button onClick={() => approve(s.chat_id)}>Approve</button>
                    <button onClick={() => deny(s.chat_id)}>Deny</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>All subscribers</h3>
          <table className="admin-table">
            <tbody>
              {others.map((s) => (
                <tr key={s.chat_id}>
                  <td>{s.chat_id}</td>
                  <td>{s.username ? `@${s.username}` : "(no username)"}</td>
                  <td>{s.status}</td>
                  <td>{s.decided_at ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
