import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Tooltip } from "@cloudflare/kumo/components/tooltip";
import { ListIcon, MagicWandIcon, MoonIcon, ScanIcon, SignOutIcon, SunIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { DocList } from "./components/DocList";
import { DocWorkspace } from "./components/DocWorkspace";
import { NewHumanize } from "./components/HumanizeView";
import { Login } from "./components/Login";
import { Logo } from "./components/Logo";
import { NewCheck } from "./components/PangramView";
import { api, setUnauthorizedHandler, type Session } from "./lib/api";
import { onVersionCreated, pumpJobs } from "./lib/jobs";
import { currentRoute, navigate, useRoute } from "./lib/router";
import { store, storeReady, toasts, useDoc, useObservable } from "./lib/store";
import { useTheme } from "./lib/theme";
import type { Services, Tab } from "./lib/types";

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    api
      .session()
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
    setUnauthorizedHandler(() => {
      setSession((s) => {
        if (s?.authenticated) toasts.add({ title: "Session expired", description: "Sign in again to continue.", variant: "warning" });
        return { authenticated: false };
      });
    });
  }, []);

  if (!session) return <FullPageLoader />;
  if (!session.authenticated) return <Login onSuccess={setSession} />;
  return (
    <Workspace
      services={session.services}
      onLogout={async () => {
        await api.logout().catch(() => {});
        setSession({ authenticated: false });
      }}
    />
  );
}

function FullPageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-kumo-subtle">
      <Loader size="lg" />
    </div>
  );
}

function Workspace({ services, onLogout }: { services: Services; onLogout: () => void }) {
  const ready = useObservable(storeReady);
  const route = useRoute();
  const doc = useDoc(route.docId);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    store.init().then(pumpJobs);
    // Jump to a freshly humanized version if its document is open.
    return onVersionCreated((docId, versionId) => {
      const r = currentRoute();
      if (r.docId === docId && r.tab === "humanize") navigate({ ...r, versionId });
    });
  }, []);

  useEffect(() => setDrawerOpen(false), [route.docId, route.tab]);

  return (
    <div className="print-full flex h-full flex-col">
      <Header tab={route.tab} onLogout={onLogout} onMenu={() => setDrawerOpen(true)} />
      <div className="print-full flex min-h-0 flex-1">
        <aside className="no-print hidden w-72 shrink-0 flex-col border-r border-kumo-hairline bg-kumo-base md:flex">
          <DocList route={route} />
        </aside>
        <main className="print-full min-w-0 flex-1 overflow-y-auto" id="main">
          {!ready ? (
            <FullPageLoader />
          ) : doc ? (
            <DocWorkspace doc={doc} route={route} services={services} />
          ) : route.tab === "humanize" ? (
            <NewHumanize services={services} />
          ) : (
            <NewCheck services={services} />
          )}
        </main>
      </div>

      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog size="lg" className="flex h-[80vh] flex-col overflow-hidden p-0">
          <Dialog.Title className="border-b border-kumo-hairline px-4 py-3 text-base font-semibold">Documents</Dialog.Title>
          <DocList route={route} />
        </Dialog>
      </Dialog.Root>
    </div>
  );
}

const TAB_ITEMS = [
  {
    value: "humanize",
    label: (
      <span className="flex items-center gap-1.5">
        <MagicWandIcon size={16} />
        Humanize
      </span>
    ),
  },
  {
    value: "pangram",
    label: (
      <span className="flex items-center gap-1.5">
        <ScanIcon size={16} />
        Pangram
      </span>
    ),
  },
];

function Header({ tab, onLogout, onMenu }: { tab: Tab; onLogout: () => void; onMenu: () => void }) {
  const [mode, toggleTheme] = useTheme();

  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b border-kumo-hairline bg-kumo-base px-2 sm:gap-3 sm:px-4">
      <Button className="md:hidden" variant="ghost" shape="square" icon={ListIcon} aria-label="Documents" onClick={onMenu} />
      <a href="#/humanize" className="hidden items-center gap-2 rounded-md sm:flex">
        <Logo />
        <span className="hidden text-base font-semibold tracking-tight text-kumo-strong lg:inline">ZamWriter</span>
      </a>
      <Tabs
        className="ml-1 sm:ml-3"
        tabs={TAB_ITEMS}
        value={tab}
        onValueChange={(t) => navigate({ ...currentRoute(), tab: t as Tab })}
      />
      <div className="flex-1" />
      <Tooltip
        content={mode === "dark" ? "Light theme" : "Dark theme"}
        render={
          <Button
            variant="ghost"
            shape="square"
            icon={mode === "dark" ? SunIcon : MoonIcon}
            aria-label="Toggle theme"
            onClick={toggleTheme}
          />
        }
      />
      <Tooltip
        content="Sign out"
        render={<Button variant="ghost" shape="square" icon={SignOutIcon} aria-label="Sign out" onClick={onLogout} />}
      />
    </header>
  );
}
