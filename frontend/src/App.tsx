import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { accounts, AccountError, type Account } from "./accounts";
import { syncAlerts, useAlerts } from "./alerts";
import { AppContext, useApp, type AppCtx } from "./appContext";
import { AccountDialog } from "./components/AccountDialog";
import { AlertsDialog } from "./components/AlertsDialog";
import { AskPanel } from "./components/AskPanel";
import { HoldingsDialog } from "./components/HoldingsDialog";
import { fmtJakarta } from "./format";
import { mergeLots, saveHoldings, useHoldingLots, type Holding } from "./holdings";
import { holdingsContext, latestRunTime, OVERVIEW_CHIPS, positions as toPositions } from "./model";
import { AgentChat } from "./pages/AgentChat";
import { AssetDetail } from "./pages/AssetDetail";
import { Overview } from "./pages/Overview";
import { Phone } from "./pages/Phone";
import { useAsk } from "./useAsk";
import { useIsPhone } from "./useIsPhone";
import { useMarket } from "./useMarket";
import { go, useRoute } from "./useRoute";

export default function App() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [accountOpen, setAccountOpen] = useState(false);
  const requestId = useRef(0);
  const accountChannel = useRef<BroadcastChannel | null>(null);
  const invalidateRefresh = useCallback(() => { requestId.current++; }, []);
  const refresh = useCallback(() => {
    const id = ++requestId.current;
    void accounts.current().then(({ account }) => {
      if (id === requestId.current) setAccount((previous) =>
        account && previous?.id === account.id && previous.revision > account.revision ? previous : account);
    }).catch(() => {
      if (id === requestId.current) setAccount((previous) => previous === undefined ? null : previous);
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("gold-notification-account");
    if (channel) channel.onmessage = refresh;
    accountChannel.current = channel;
    return () => {
      invalidateRefresh();
      window.removeEventListener("focus", refresh);
      channel?.close();
      accountChannel.current = null;
    };
  }, [invalidateRefresh, refresh]);

  function changeAccount(next: Account | null) {
    invalidateRefresh();
    setAccount(next);
    accountChannel.current?.postMessage("session-changed");
  }

  async function saveLots(lots: Holding[]) {
    if (!account) {
      saveHoldings(lots);
      return;
    }
    try {
      const saved = await accounts.save(account, lots);
      setAccount((current) => current?.id === account.id && current.revision <= saved.revision
        ? { ...current, ...saved }
        : current);
      accountChannel.current?.postMessage("portfolio-changed");
    } catch (error) {
      if (error instanceof AccountError && (error.status === 409 || error.status === 401)) refresh();
      throw error;
    }
  }

  if (account === undefined) {
    return <main className="app"><p role="status">Loading your dashboard?</p></main>;
  }

  return (
    <>
      <Dashboard key={account?.id ?? "guest"} account={account} saveLots={saveLots} openAccount={() => setAccountOpen(true)} />
      {accountOpen && <AccountDialog account={account} onChange={changeAccount}
        onClose={() => setAccountOpen(false)} refresh={refresh} />}
    </>
  );
}

interface DashboardProps {
  account: Account | null;
  saveLots: (lots: Holding[]) => Promise<void>;
  openAccount: () => void;
}

function Dashboard({ account, saveLots, openAccount }: DashboardProps) {
  const route = useRoute();
  const isPhone = useIsPhone();
  const market = useMarket();
  const guestLots = useHoldingLots();
  const lots = account?.lots ?? guestLots;
  const holdings = useMemo(() => mergeLots(lots), [lots]);
  const positions = toPositions(holdings, market.bySource);
  const ask = useAsk(() => holdingsContext(positions), !!account);
  const [askOpen, setAskOpen] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertStatus = useAlerts().status;

  // While alerts are on, the server checks holdings for take-profit/stop-loss,
  // so its copy follows every edit (and is refreshed once per visit).
  useEffect(() => {
    if (!account && alertStatus === "on") void syncAlerts(holdings);
  }, [holdings, alertStatus, account]);

  const ctx: AppCtx = {
    market,
    signedIn: !!account,
    openAccount,
    lots,
    guestLots,
    saveLots,
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
    openAlerts: () => setAlertsOpen(true),
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
  if (route.page === "agent") {
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
          <WebNav page={route.page} onAsk={() => setAskOpen(true)} onAlerts={() => setAlertsOpen(true)} />
        )}
        <h4>Ops agent</h4>
        <AgentChat />
      </div>
    );
  } else if (isPhone) {
    body = <Phone route={route} />;
  } else {
    body = (
      <div className="app">
        <WebNav page="home" onAsk={() => setAskOpen(true)} onAlerts={() => setAlertsOpen(true)} />
        {route.page === "asset" ? <AssetDetail source={route.source} onBack={() => go("/")} /> : <Overview />}
      </div>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-bg">{body}</div>
      {!isPhone && <AskPanel open={askOpen} onClose={() => setAskOpen(false)} chips={chips} />}
      {holdingsOpen && <HoldingsDialog onClose={() => setHoldingsOpen(false)} />}
      {alertsOpen && <AlertsDialog onClose={() => setAlertsOpen(false)} />}
    </AppContext.Provider>
  );
}

function WebNav({ page, onAsk, onAlerts }: { page: "home" | "agent"; onAsk: () => void; onAlerts: () => void }) {
  const { market, signedIn, openAccount } = useApp();
  const alertsOn = useAlerts().status === "on";
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
      <a href="#/agent" aria-current={page === "agent" ? "page" : undefined}>
        Agent
      </a>
      <span className="meta-text">
        {updated ? `Updated ${fmtJakarta(updated)}` : market.groups.every((g) => market.runs[g]) && market.groups.length ? "No runs yet" : ""}
      </span>
      {!signedIn && <button className="btn btn-secondary" onClick={onAlerts} aria-label={alertsOn ? "Alerts (on)" : "Alerts"}>
        <i className={alertsOn ? "ph-fill ph-bell-ringing" : "ph ph-bell"} />
        Alerts
      </button>}
      <button className="btn btn-secondary" onClick={openAccount}>
        <i className="ph ph-user-circle" aria-hidden="true" />
        {signedIn ? "Account" : "Sign in"}
      </button>
      <button className="btn btn-primary" onClick={onAsk}>
        <i className="ph ph-sparkle" />
        Ask AI
      </button>
    </nav>
  );
}
