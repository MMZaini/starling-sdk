import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("account controls update the actual component and its copyable example", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  const section = page.locator("#account-card");
  const preview = page.locator("#accounts");
  await section.getByLabel("Account", { exact: true }).selectOption("EUR");
  await expect(preview).toContainText("Euro account");
  await expect(preview).toContainText("€856.24");
  await section.getByRole("switch", { name: "Hide balance" }).click();
  await expect(
    preview.getByLabel("Effective balance hidden", { exact: true }),
  ).toBeVisible();
  await section.getByRole("switch", { name: "Show footer" }).click();
  await expect(preview.locator("footer")).toHaveCount(0);
  await section.getByLabel("Status", { exact: true }).selectOption("loading");
  await expect(preview.getByRole("status")).toContainText("Loading account");
  await section.getByLabel("Status", { exact: true }).selectOption("error");
  await expect(preview.getByRole("alert")).toHaveText(
    "Unable to load this account.",
  );
  await section.getByRole("button", { name: "Code", exact: true }).click();
  await expect(section.locator("pre")).toContainText('status="error"');
  await expect(section.locator("pre")).toContainText("hideBalance={true}");
  await section.getByRole("button", { name: "Copy AccountCard code" }).click();
  await expect(
    section.getByRole("button", { name: "Copy AccountCard code" }),
  ).toContainText("Copied");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.replaceAll("\r\n", "\n")).toBe(
    await section.locator("pre").innerText(),
  );
  await section.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(section.getByLabel("Account", { exact: true })).toHaveValue(
    "EUR",
  );
  await section.getByLabel("Status", { exact: true }).selectOption("ready");
  await expect(
    preview.getByRole("heading", { name: "Euro account" }),
  ).toBeVisible();
});

test("balance and identifier variants remain accessible and match the selected props", async ({
  page,
}) => {
  await page.goto("./");
  const balance = page.locator("#balance");
  await balance.getByLabel("Currency", { exact: true }).selectOption("EUR");
  await balance.getByLabel("Locale", { exact: true }).selectOption("de-DE");
  await expect(balance.locator(".starling-balance-value").first()).toHaveText(
    "2.486,50 €",
  );
  await balance.getByRole("switch", { name: "Mask amounts" }).click();
  for (const value of await balance.locator(".starling-balance-value").all())
    await expect(value).toHaveAttribute("aria-label", /hidden$/);
  const details = page.locator("#account-details");
  await details
    .getByLabel("Identifiers", { exact: true })
    .selectOption("international");
  await expect(details.locator("dl")).not.toContainText(
    "GB72SRLG60837112345678",
  );
  await details.getByRole("button", { name: "Reveal identifiers" }).click();
  await expect(details.locator("dl")).toContainText("GB72SRLG60837112345678");
  await details.getByRole("button", { name: "Code", exact: true }).click();
  await expect(details.locator("pre")).toContainText("masked={false}");
  await details.getByRole("button", { name: "Preview", exact: true }).click();
  await details
    .getByLabel("Identifiers", { exact: true })
    .selectOption("empty");
  await expect(details.locator("#identifiers-preview")).toContainText(
    "Account details unavailable",
  );
  await details.locator("summary").click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("money formatter supports fraction digits and recovers from invalid input", async ({
  page,
}) => {
  await page.goto("./#format-money");
  const section = page.locator("#format-money");
  const amount = section.getByLabel("Minor units");
  await expect(section.locator("output")).toHaveText("£123.45");
  await section.getByLabel("Currency", { exact: true }).selectOption("JPY");
  await expect(section.locator("output")).toHaveText("JP¥12,345");
  await section.getByLabel("Currency", { exact: true }).selectOption("KWD");
  await expect(section.locator("output")).toContainText("12.345");
  for (const invalid of ["", "1.5", "oops", "9007199254740992"]) {
    await amount.fill(invalid);
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(section.getByRole("alert")).toBeVisible();
    await expect(section.locator("pre")).toContainText("Enter a safe integer");
  }
  await amount.fill("-12345");
  await expect(amount).toHaveAttribute("aria-invalid", "false");
  await expect(section.getByRole("alert")).toHaveCount(0);
  await expect(section.locator("output")).toContainText("-KWD");
  await expect(section.locator("pre")).toContainText("minorUnits: -12345");
});

test("mobile navigation supports keyboard dismissal and deep links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.click();
  await expect(page.getByRole("navigation")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(page.getByRole("navigation")).toBeHidden();
  await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Balance", exact: false })
    .click();
  await expect(page).toHaveURL(/#balance$/);
  await expect(page.getByRole("navigation")).toBeHidden();
  await expect(page.locator("#balance-title")).toBeInViewport();
  await page.reload();
  await expect(page.locator("#balance-title")).toBeInViewport();
});

test("copy failures reveal selectable code and visible feedback on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Clipboard permission denied");
        },
      },
    });
  });
  await page.goto("./");
  const section = page.locator("#account-card");
  await section.getByRole("button", { name: "Copy AccountCard code" }).click();
  await expect(section.locator("pre")).toBeVisible();
  await expect(
    section.getByRole("status").filter({ hasText: "Select the code below" }),
  ).toBeVisible();
  await section.locator("pre").focus();
  await expect(section.locator("pre")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("navigation tracks the bottom section and the text brand returns to the top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.locator("#overview-title").waitFor();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Installation" }),
  ).toHaveAttribute("aria-current", "location");
  await page.getByRole("link", { name: "Starling React home" }).click();
  await expect(page.locator("#overview-title")).toBeInViewport();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Overview" }),
  ).toHaveAttribute("aria-current", "location");
});

for (const width of [320, 768, 1024, 1440]) {
  test(`all examples, code and expanded references fit at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await page
      .locator("#account-card")
      .getByLabel("Account", { exact: true })
      .selectOption("EUR");
    await page.getByRole("button", { name: "Show account details" }).click();
    await page
      .locator("#account-details")
      .getByLabel("Identifiers", { exact: true })
      .selectOption("international");
    await page.getByRole("button", { name: "Reveal identifiers" }).click();
    await page
      .locator("#balance")
      .getByLabel("Currency", { exact: true })
      .selectOption("KWD");
    for (const summary of await page.locator("summary").all())
      await summary.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const button of await page
      .getByRole("button", { name: "Code", exact: true })
      .all())
      await button.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}
