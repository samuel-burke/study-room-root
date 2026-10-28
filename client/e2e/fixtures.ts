import { test as base, expect, type Page } from "@playwright/test";

/** Fails any test whose page logs an error or throws, so silent breakage can't pass. */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await use(errors);
      expect(errors, "page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;

/** Opens the start sheet the way a member would on this layout. */
export async function openStartSheet(page: Page) {
  if (isPhone(page)) {
    await page
      .getByRole("navigation", { name: "Session" })
      .getByRole("button", { name: "Start focusing" })
      .click();
  } else {
    await page.getByRole("button", { name: "Join room timer" }).click();
  }
  return page.getByRole("dialog", { name: "What are you working on?" });
}
