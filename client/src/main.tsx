import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { StudyRoomGateway } from "./api/gateway";
import { App } from "./App";
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

void createGateway().then((gateway) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App gateway={gateway} />
    </StrictMode>,
  );
});
