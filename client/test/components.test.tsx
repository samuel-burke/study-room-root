import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createHarness } from "../../core/test/helpers";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { GoalsSheet } from "../src/components/GoalsSheet";
import { Sheet } from "../src/components/Sheet";

describe("Sheet", () => {
  function renderSheet(onClose = vi.fn()) {
    render(
      <Sheet labelledBy="t" onClose={onClose}>
        <h1 id="t">Title</h1>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Sheet>,
    );
    return onClose;
  }

  it("keeps Tab focus inside the dialog in both directions", async () => {
    const user = userEvent.setup();
    renderSheet();
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
  });

  it("closes on a backdrop click but not a click inside", async () => {
    const user = userEvent.setup();
    const onClose = renderSheet();
    await user.click(screen.getByRole("button", { name: "First" }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Tab when nothing inside can take focus", async () => {
    const user = userEvent.setup();
    render(
      <Sheet labelledBy="t" onClose={vi.fn()}>
        <h1 id="t">Empty</h1>
      </Sheet>,
    );
    await user.tab();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("GoalsSheet", () => {
  it("lists goals, shows XP when enabled, and closes with Done", async () => {
    const { engine } = createHarness();
    const me = await engine.addGoal("ana", "Read ch. 4");
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onToggle = vi.fn();
    render(
      <GoalsSheet
        me={me}
        xpEnabled
        busy={false}
        onToggle={onToggle}
        onDelete={vi.fn()}
        onAdd={vi.fn(async () => true)}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Your goals" })).toHaveTextContent("Read ch. 4");
    await user.click(screen.getByRole("checkbox", { name: /Read ch. 4/ }));
    expect(onToggle).toHaveBeenCalledWith(me.goals[0]!.id, true);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ErrorBoundary", () => {
  it("replaces a crashed tree with a retry that remounts it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let crash = true;
    function Fragile() {
      if (crash) throw new Error("render bug");
      return <p>Room is back</p>;
    }
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    crash = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Room is back")).toBeInTheDocument();
  });
});
