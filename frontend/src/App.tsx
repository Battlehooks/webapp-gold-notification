import { useState } from "react";
import "./App.css";
import { AppContext, useApp, type AppCtx } from "./appContext";
import { AskPanel } from "./components/AskPanel";
import { HoldingsDialog } from "./components/HoldingsDialog";
import { fmtJakarta } from "./format";
import { useHoldings } from "./holdings";
import { holdingsContext, latestRunTime, OVERVIEW_CHIPS, positions as toPositions } from "./model";
import { Admin } from "./pages/Admin";
import { AgentChat } from "./pages/AgentChat";
import { AssetDetail } from "./pages/AssetDetail";
import { Overview } from "./pages/Overview";
import { Phone } from "./pages/Phone";
import { useAsk } from "./useAsk";
import { useIsPhone } from "./useIsPhone";
import { useMarket } from "./useMarket";
import { go, useRoute } from "./useRoute";

export default function App() {
  const route = useRoute();
  const isPhone = useIsPhone();
  const market = useMarket();
  const holdings = useHoldings();
  const positions = toPositions(holdings, market.bySource);
  const ask = useAsk(() => holdingsContext(positions));
  const [askOpen, setAskOpen] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);

  const ctx: AppCtx = {
    market,
    holdings,
    positions,
    held: new Set(positions.map((p) => p.holding.source)),
    ask,
    openAsk: (question) => {
      if (isPhone) go("/ask");
      else setAskOpen(true);
      if (question) ask.ask(question);
    },
    openHoldings: () => setHoldingsOpen(true),
  };

  const detailAsset = route.page === "asset" ? market.bySource[route.source] : undefined;
  const chips = detailAsset
    ? [
        `What's driving ${detailAsset.meta.display}'s signal?`,
        `Any news behind ${detailAsset.meta.display}'s move?`,
        `Compare ${detailAsset.meta.display} with my other holdings`,
      ]
    : OVERVIEW_CHIPS;

  let body;
  if (route.page === "admin" || route.page === "agent") {
    body = (
      <div className={isPhone ? "legacy-page legacy-page-phone" : "app"}>
        {isPhone ? (
          <div style={{ padding: "12px 0" }}>
            <button className="btn btn-ghost" onClick={() => go("/")}>
              <i className="ph ph-arrow-left" />
              Home
            </button>
          </div>
        ) : (
          <WebNav page={route.page} onAsk={() => setAskOpen(true)} />
        )}
        <h4>{route.page === "admin" ? "Subscribers" : "Ops agent"}</h4>
        {route.page === "admin" ? <Admin /> : <AgentChat />}
      </div>
    );
  } else if (isPhone) {
    body = <Phone route={route} />;
  } else {
    body = (
      <div className="app">
        <WebNav page="home" onAsk={() => setAskOpen(true)} />
        {route.page === "asset" ? <AssetDetail source={route.source} onBack={() => go("/")} /> : <Overview />}
      </div>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-bg">{body}</div>
      {!isPhone && <AskPanel open={askOpen} onClose={() => setAskOpen(false)} chips={chips} />}
      {holdingsOpen && <HoldingsDialog onClose={() => setHoldingsOpen(false)} />}
    </AppContext.Provider>
  );
}

function WebNav({ page, onAsk }: { page: "home" | "admin" | "agent"; onAsk: () => void }) {
  const { market } = useApp();
  const updated = latestRunTime(market.runs);
  return (
    <nav className="nav app-nav">
      <a href="#/" className="nav-brand app-brand">
        <i className="ph ph-coins" />
        gold-notification
      </a>
      <a href="#/" aria-current={page === "home" ? "page" : undefined}>
        Overview
      </a>
      <a href="#/admin" aria-current={page === "admin" ? "page" : undefined}>
        Admin
      </a>
      <a href="#/agent" aria-current={page === "agent" ? "page" : undefined}>
        Agent
      </a>
      <span className="meta-text">
        {updated ? `Updated ${fmtJakarta(updated)}` : market.groups.every((g) => market.runs[g]) && market.groups.length ? "No runs yet" : ""}
      </span>
      <button className="btn btn-primary" onClick={onAsk}>
        <i className="ph ph-sparkle" />
        Ask AI
      </button>
    </nav>
  );
}
