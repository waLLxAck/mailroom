import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../.lakebed/artifacts/mailroom-lakebed.claimed.json",
      import.meta.url,
    ),
  ),
);
const { default: server } = await import(
  "data:text/javascript;base64," + artifact.artifact.server.source.bundle
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const auth = {
  userId: "google:usr_test000000000000",
  subject: "google:usr_test000000000000",
  displayName: "Test owner",
  email: "owner@example.com",
  emailVerified: true,
  provider: "google",
  isGuest: false,
  isSignedIn: true,
  isAuthenticated: true,
  identityAliases: [],
};
await page.addInitScript(() => {
  const claims = {
    identity_version: 2,
    lakebed_sub: "usr_test000000000000",
    pairwise_sub: "test-pairwise",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  localStorage.setItem(
    "lakebed_identity",
    JSON.stringify({
      version: 1,
      userId: claims.lakebed_sub,
      token:
        "test." +
        btoa(JSON.stringify(claims))
          .replace(/=+$/, "")
          .replace(/\+/g, "-")
          .replace(/\//g, "_") +
        ".mock",
    }),
  );
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const emails = Array.from({ length: 7 }, (_, i) => ({
  id: `1234567${i}`,
  threadId: `1234567${i}`,
  from: "Example sender <sender@example.com>",
  subject: i === 0 ? "A newsletter with an optional offer" : `Message ${i + 1}`,
  date: "2026-09-25",
  snippet: "A readable preview",
  unread: true,
}));
let failPreview = true,
  seenClassifications = 0;
await page.route("**/__lakebed/auth/**", (r) =>
  r.fulfill({ json: { auth, requireSignIn: false } }),
);
const initialSettings = (
  await server.queries.status({
    auth: { requireSignedIn: () => auth },
    db: { accounts: { withIndex: () => ({ first: async () => null }) } },
    env: {},
  })
).settings;
const accountStatus = {
  allowed: true,
  needsEnrollment: false,
  connected: true,
  ready: true,
  email: "owner@example.com",
  remaining: 700,
  hasApiKey: true,
  settings: initialSettings,
  settingsVersion: 0,
};
await page.routeWebSocket("**/__lakebed/ws*", (ws) => {
  let subscription;
  const sendStatus = () => {
    if (subscription)
      ws.send(
        JSON.stringify({
          op: "query.result",
          id: subscription.id,
          name: subscription.name,
          args: subscription.args,
          data: accountStatus,
        }),
      );
  };
  ws.onMessage((raw) => {
    const m = JSON.parse(raw.toString());
    if (m.op === "query.subscribe") {
      subscription = m;
      sendStatus();
    }
    if (m.op === "mutation.run") {
      let result = { ok: true };
      if (m.name === "saveApiKey") {
        assert.match(m.args[0], /^sk-or-/);
        accountStatus.hasApiKey = true;
        sendStatus();
      }
      if (m.name === "removeApiKey") {
        accountStatus.hasApiKey = false;
        sendStatus();
      }
      if (m.name === "saveSettings") {
        accountStatus.settings = m.args[0];
        accountStatus.settingsVersion++;
        sendStatus();
      }

      if (m.name === "list")
        result = { ok: true, ids: emails.map((e) => e.id), nextPageToken: "" };
      if (m.name === "previews")
        result = {
          ok: true,
          results: m.args[0].map((id) => {
            if (id === "12345676" && failPreview) {
              failPreview = false;
              return { ok: false, error: "Provider temporarily unavailable" };
            }
            return { ok: true, email: emails.find((e) => e.id === id) };
          }),
        };
      if (m.name === "read")
        result = {
          ok: true,
          email: {
            ...emails.find((e) => e.id === m.args[0]),
            body: "<script>window.INJECTED=true</script> This is text, not HTML.",
          },
        };
      if (m.name === "classify") {
        seenClassifications++;
        result = {
          ok: true,
          result: {
            requestMs: 240,
            settings: accountStatus.settings,
            settingsVersion: accountStatus.settingsVersion,
            model: "typesafe/jev-1.13",
            answers: {
              ...Object.fromEntries(
                accountStatus.settings.rules
                  .filter((r) => r.enabled)
                  .map((r) => r.id)
                  .map((k) => [k, { type: "noul", noul: 0.04 }]),
              ),
              category: {
                type: "choice",
                choice:
                  accountStatus.settings.categories.length > 9
                    ? accountStatus.settings.categories.at(-1).id
                    : "marketing",
                confidence: 0.98,
              },
              urgency: { type: "score", score: 0 },
            },
          },
        };
      }
      ws.send(
        JSON.stringify({ op: "mutation.result", id: m.id, ok: true, result }),
      );
    }
  });
});
try {
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:3002");
  await page
    .getByRole("button", { name: "Load emails", exact: true })
    .waitFor({ timeout: 5000 })
    .catch(async (e) => {
      console.log(await page.locator("body").innerText(), errors);
      throw e;
    });
  const classify = page.getByRole("button", {
    name: "✧ Classify inbox",
    exact: true,
  });
  const colors = await classify.evaluate((e) => ({
    background: getComputedStyle(e).backgroundColor,
    color: getComputedStyle(e).color,
  }));
  assert.notEqual(colors.background, "rgb(255, 255, 255)");
  await page.getByRole("spinbutton", { name: "Maximum emails" }).fill("1001");
  assert.equal(
    await page
      .getByRole("button", { name: "Load emails", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("spinbutton", { name: "Maximum emails" }).fill("7");
  await page.getByRole("button", { name: "Load emails", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume 1 remaining" })
    .waitFor({ timeout: 15000 });
  assert.match(await page.locator("body").innerText(), /6 emails loaded/);
  await page.getByRole("button", { name: "Resume 1 remaining" }).click();
  await page
    .getByText("7 emails loaded · Last 24 hours · Inbox only")
    .waitFor();
  await page.getByRole("button", { name: "Read email", exact: true }).click();
  await page
    .getByText(
      "<script>window.INJECTED=true</script> This is text, not HTML.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await page.evaluate(() => window.INJECTED), undefined);
  await page
    .getByRole("button", { name: "Classify this email", exact: true })
    .click();
  await page.getByText("240 ms", { exact: true }).waitFor();
  assert.equal(seenClassifications, 1);
  assert.match(await page.locator("body").innerText(), /No reply expected/);
  assert.match(await page.locator("body").innerText(), /Marketing/i);
  await page
    .getByRole("button", { name: "Classify again", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.body.innerText.includes("Jev is reading"),
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `overflow at ${width}`,
    );
  }
  await page
    .getByRole("button", { name: "Connection and privacy settings" })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Connection and privacy settings" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("sk-or-…").fill("sk-or-v1-" + "c".repeat(64));
  await dialog
    .getByRole("button", { name: "Save API key", exact: true })
    .click();
  await dialog.getByText("API key validated and saved securely.").waitFor();
  assert.equal(await dialog.getByPlaceholder("sk-or-…").inputValue(), "");
  await dialog.getByRole("button", { name: "Categories", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Add category", exact: true })
    .click();
  await dialog.getByLabel("Category 10 name", { exact: true }).fill("Travel");
  await dialog
    .getByLabel("Category 10 description", { exact: true })
    .fill("Trips, bookings, flights and hotels.");
  await dialog
    .getByRole("button", { name: "Save classification settings", exact: true })
    .click();
  await dialog
    .getByText(
      "Saved to your account. New classifications will use these settings.",
    )
    .waitFor();
  await dialog
    .getByRole("button", { name: "Classifications", exact: true })
    .click();
  await dialog
    .getByRole("spinbutton", { name: /Confidence threshold/ })
    .fill("80");
  await dialog
    .getByRole("group", { name: "Reply expected", exact: true })
    .getByRole("checkbox")
    .uncheck();
  await dialog
    .getByRole("button", { name: "Add classification question", exact: true })
    .click();
  const custom = dialog.getByRole("group").last();
  await custom.getByLabel("Name", { exact: true }).fill("Travel plans");
  await custom
    .getByLabel("Question and instructions")
    .fill("Does this email concern a trip?");
  await custom
    .getByLabel("When the answer is yes")
    .fill("Flight or hotel bookings.");
  await custom.getByLabel("When the answer is no").fill("No travel content.");
  await page.screenshot({
    path: "test-results/custom-settings.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Save classification settings", exact: true })
    .click();
  await dialog
    .getByText(
      "Saved to your account. New classifications will use these settings.",
    )
    .waitFor();
  await dialog.getByRole("button", { name: "Close settings" }).click();
  await page
    .getByRole("navigation", { name: "Categories", exact: true })
    .getByRole("button", { name: "Travel", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Classify again", exact: true })
    .click();
  await page
    .locator('[aria-label="Jev decisions"]')
    .getByText("Travel plans", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('[aria-label="Jev decisions"]')
      .getByText("Reply expected", { exact: true })
      .count(),
    0,
  );
  assert.equal(accountStatus.settings.threshold, 80);
  assert.deepEqual(errors, []);
  console.log(
    "UI passed: progressive load, partial resume, count validation, inert email content, Noul results, measured timings, modal keyboard behavior, responsive widths.",
  );
} finally {
  await browser.close();
}
