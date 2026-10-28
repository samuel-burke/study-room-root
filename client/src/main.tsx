import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { StudyRoomGateway } from "./api/gateway";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// The mode is fixed at build time, so the production bundle never contains
// the demo engine and the demo bundle never touches the Root client SDK.
async function createGateway(): Promise<StudyRoomGateway> {
  if (import.meta.env.MODE === "demo") {
    const { DemoGateway, demoOptionsFromSearch } = await import("./api/demoGateway");
    return DemoGateway.create(demoOptionsFromSearch(window.location.search));
  }
  const { RootGateway } = await import("./api/rootGateway");
  return new RootGateway();
}

const root = createRoot(document.getElementById("root")!);
createGateway().then(
  (gateway) =>
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App gateway={gateway} />
        </ErrorBoundary>
      </StrictMode>,
    ),
  // A failed chunk load would otherwise leave a blank screen.
  (error: unknown) => {
    console.error("Study Squad failed to load", error);
    root.render(
      <div className="status-screen" role="alert">
        Study Squad couldn&apos;t load. Close and reopen the app.
      </div>,
    );
  },
);
