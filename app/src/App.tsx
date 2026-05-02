import { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { AuthWizard } from "./components/AuthWizard";
import { Dashboard } from "./components/Dashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UpdateBanner } from "./components/UpdateBanner";
import { useUpdateCheck } from "./hooks/useUpdateCheck";
import "./App.css";

import { Toaster } from "sonner";
import { ConfirmProvider } from "./context/ConfirmContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { DropZoneProvider } from "./contexts/DropZoneContext";

const queryClient = new QueryClient();
type AuthState = "checking" | "auth" | "dashboard";

function AppContent() {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [authState, setAuthState] = useState<AuthState>(() => isTauri ? "checking" : "auth");
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { available, version, downloading, progress, downloadAndInstall, dismissUpdate } = useUpdateCheck();
  const showAuth = useCallback(() => {
    queryClient.clear();
    setAuthState("auth");
  }, []);
  const showDashboard = useCallback(() => {
    queryClient.clear();
    setAuthState("dashboard");
  }, []);

  useEffect(() => {
    if (!isTauri) {
      setAuthState("auth");
      return;
    }

    let cancelled = false;

    const restoreSession = async () => {
      try {
        const store = await load("config.json");
        const savedId = await store.get<string>("api_id");
        const apiId = savedId ? parseInt(savedId, 10) : NaN;

        if (!savedId || Number.isNaN(apiId)) {
          if (!cancelled) setAuthState("auth");
          return;
        }

        await invoke("cmd_connect", { apiId });
        const connected = await invoke<boolean>("cmd_check_connection");

        if (!cancelled) {
          setAuthState(connected ? "dashboard" : "auth");
        }
      } catch {
        if (!cancelled) setAuthState("auth");
      }
    };

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [isTauri]);

  return (
    <main className="h-screen w-screen text-telegram-text overflow-hidden selection:bg-telegram-primary/30 relative">
      <UpdateBanner
        available={available}
        version={version}
        downloading={downloading}
        progress={progress}
        onUpdate={downloadAndInstall}
        onDismiss={dismissUpdate}
      />
      <Toaster theme={theme} position="bottom-center" />
      {authState === "checking" ? (
        <div className="h-full w-full bg-telegram-bg flex flex-col items-center justify-center gap-4">
          <img src="/logo.svg" alt="Telegram Drive" className="w-16 h-16 drop-shadow-lg" />
          <div className="w-8 h-8 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-telegram-subtext">{t('common.checkingSession')}</p>
        </div>
      ) : authState === "dashboard" ? (
        <Dashboard onLogout={showAuth} onAddAccount={showAuth} />
      ) : (
        <AuthWizard onLogin={showDashboard} onCancel={showDashboard} />
      )}
    </main>
  );
}


function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <QueryClientProvider client={queryClient}>
            <ConfirmProvider>
              <DropZoneProvider>
                <AppContent />
              </DropZoneProvider>
            </ConfirmProvider>
          </QueryClientProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
