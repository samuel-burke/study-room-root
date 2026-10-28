import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoGateway } from "../src/api/demoGateway";
import { App } from "../src/App";

async function renderApp(options: Partial<Parameters<typeof DemoGateway.create>[0]> = {}) {
  const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0, ...options });
  const user = userEvent.setup();
  render(<App gateway={gateway} />);
  await screen.findByRole("timer");
  return { gateway, user };
}

function mockViewport(compact: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: compact && query.includes("max-width"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Study Squad app", () => {
  it("opens on an idle room with an empty board", async () => {
    await renderApp();
    expect(screen.getByRole("timer")).toHaveTextContent("25:00");
    expect(screen.getByText("Room timer is free")).toBeInTheDocument();
    expect(screen.getByText(/The room is quiet/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Focusing now · 0" })).toBeInTheDocument();
  });

  it("joins the room timer with a goal and shows your card on the board", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Join room timer" }));
    const dialog = screen.getByRole("dialog", { name: "What are you working on?" });
    expect(within(dialog).getByRole("radio", { name: /Join the room timer/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.type(within(dialog).getByLabelText("Goals for this session"), "Make 20 flashcards");
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const board = screen.getByRole("region", { name: "Who is in the room" });
    const card = within(board).getByRole("listitem", { name: /You, Room timer/ });
    expect(card).toHaveTextContent("Make 20 flashcards");
    expect(screen.getByText("Focus · round 1 of 4")).toBeInTheDocument();
    // Like the mockup, the dot for the round in progress is filled.
    const dots = document.querySelectorAll(".round-dot");
    expect([...dots].map((d) => d.getAttribute("data-done"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    expect(screen.getByRole("button", { name: "Leave room timer" })).toBeInTheDocument();
  });

  it("shows only 'Focusing' to the room when goals are private", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Join room timer" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Goals for this session"), "Secret thesis plan");
    await user.click(within(dialog).getByRole("switch", { name: "Keep my goals private" }));
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));

    const card = await screen.findByRole("listitem", { name: /You, Room timer/ });
    expect(card).toHaveTextContent("Focusing");
    expect(card).not.toHaveTextContent("Secret thesis plan");
    // You still see your own goal in your private list.
    expect(
      within(screen.getByRole("region", { name: "Your session" })).getByText("Secret thesis plan"),
    ).toBeInTheDocument();
  });

  it("starts a solo timer with a chosen length", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Start a solo timer" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "45 min" }));
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));
    expect(await screen.findByRole("listitem", { name: /You, Solo · 45:00/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End solo timer" })).toBeInTheDocument();
  });

  it("adds and completes goals, earning XP once", async () => {
    const { user } = await renderApp();
    const panel = screen.getByRole("region", { name: "Your session" });
    expect(within(panel).getByText("365 / 500 XP")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Add a goal" }));
    await user.type(within(panel).getByLabelText("New goal"), "Stats HW 5{Enter}");
    const checkbox = await within(panel).findByRole("checkbox", { name: "Stats HW 5" });
    await user.click(checkbox);
    await waitFor(() => expect(within(panel).getByText("390 / 500 XP")).toBeInTheDocument());
    await user.click(checkbox);
    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(within(panel).getByText("390 / 500 XP")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Remove goal: Stats HW 5" }));
    await waitFor(() => expect(within(panel).queryByText("Stats HW 5")).not.toBeInTheDocument());
  });

  it("closes sheets with Escape and returns focus", async () => {
    const { user } = await renderApp();
    const opener = screen.getByRole("button", { name: "Room settings" });
    await user.click(opener);
    expect(screen.getByRole("dialog", { name: "Room settings" })).toHaveTextContent("25 / 5");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("shows server errors without losing the room", async () => {
    const { gateway, user } = await renderApp();
    vi.spyOn(gateway, "addGoal").mockRejectedValueOnce({
      code: 1001,
      message: "You can have up to 8 open goals.",
    });
    const panel = screen.getByRole("region", { name: "Your session" });
    await user.click(within(panel).getByRole("button", { name: "Add a goal" }));
    await user.type(within(panel).getByLabelText("New goal"), "One more{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("You can have up to 8 open goals.");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("offers a retry when the room can't load", async () => {
    const gateway = await DemoGateway.create({ bots: false, elapsedMinutes: 0 });
    const spy = vi.spyOn(gateway, "getSnapshot").mockRejectedValueOnce(new Error("offline"));
    render(<App gateway={gateway} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't reach Study Squad/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("opens the progress screen and comes back", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Your progress" }));
    expect(await screen.findByText("5 day streak")).toBeInTheDocument();
    expect(screen.getByText("1 freeze left")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Focus time, last 5 weeks" }).children).toHaveLength(
      35,
    );
    await user.click(screen.getByRole("button", { name: "Back to the room" }));
    expect(await screen.findByRole("timer")).toBeInTheDocument();
  });

  it("uses the phone layout with a bottom action bar on small screens", async () => {
    mockViewport(true);
    const { user } = await renderApp();
    const bar = screen.getByRole("navigation", { name: "Session" });
    await user.click(within(bar).getByRole("button", { name: "Start focusing" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Start focusing" }),
    );
    await waitFor(() =>
      expect(within(bar).getByRole("button", { name: "Leave timer" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("listitem", { name: /You, Room timer/ })).toHaveTextContent("Room");
  });

  it("celebrates and shows the break moment when the round ends", async () => {
    const { user } = await renderApp({ focusMinutes: 0.02, breakMinutes: 1 });
    await user.click(screen.getByRole("button", { name: "Join room timer" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Goals for this session"), "Read ch. 4");
    await user.click(within(dialog).getByRole("button", { name: "Start focusing" }));
    const breakSheet = await screen.findByRole("dialog", { name: "Nice work" }, { timeout: 4_000 });
    expect(breakSheet).toHaveTextContent("Round 1 complete");
    expect(breakSheet).toHaveTextContent("6 days");
    expect(screen.getByRole("status")).toHaveTextContent("Round 1 complete");
    await act(async () => {
      await user.click(within(breakSheet).getByRole("button", { name: /Done/ }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      within(screen.getByRole("region", { name: "Your session" })).getByRole("checkbox", {
        name: "Read ch. 4",
      }),
    ).toBeChecked();
  });
});
