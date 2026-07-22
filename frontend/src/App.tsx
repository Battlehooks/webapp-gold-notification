import { useState } from "react";
import "./App.css";
import { Admin } from "./pages/Admin";
import { Chat } from "./pages/Chat";
import { Dashboard } from "./pages/Dashboard";

type Page = "dashboard" | "chat" | "admin";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="app">
      <header className="app-header">
        <h1>gold-notification</h1>
        <nav>
          <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>
            Dashboard
          </button>
          <button className={page === "chat" ? "active" : ""} onClick={() => setPage("chat")}>
            Chat
          </button>
          <button className={page === "admin" ? "active" : ""} onClick={() => setPage("admin")}>
            Admin
          </button>
        </nav>
      </header>
      <main>
        {page === "dashboard" && <Dashboard />}
        {page === "chat" && <Chat />}
        {page === "admin" && <Admin />}
      </main>
    </div>
  );
}
