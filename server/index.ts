import {
  capsule,
  mutation,
  query,
  endpoint,
  json,
  string,
  number,
  table,
  userId,
  type ServerContext,
} from "lakebed/server";
import { random, digest, encrypt, decrypt } from "./crypto";
import { fetchJson, ProviderError, metadata, emailBody } from "./gmail";
import {
  readSettings,
  validateSettings,
  buildQuestions,
  validateResult,
} from "../shared/settings";
import { messageId } from "../shared/email";
import { parseSelection, queryForSelection } from "../shared/mail-selection";

// Native Lakebed identity is required in every data handler, then scoped to the signed-in account.
async function owner(ctx: any) {
  const identity = ctx.auth.requireSignedIn();
  const row = await ctx.db.accounts
    .withIndex("by_owner", (q: any) => q.eq("ownerId", identity.userId))
    .first();
  if (!row || row.ownerId !== identity.userId)
    throw new Error("Set up your Mailroom account first.");
  return row;
}
function configured(ctx: any) {
  return Boolean(
    ctx.env.GOOGLE_CLIENT_ID &&
      ctx.env.GOOGLE_CLIENT_SECRET &&
      ctx.env.DATA_ENCRYPTION_KEY &&
      ctx.env.APP_URL,
  );
}
function appOrigin(ctx: any) {
  const url = new URL(ctx.env.APP_URL);
  if (url.protocol !== "https:")
    throw new Error("Secure hosting is not configured.");
  return url.origin;
}
function googleRedirect(ctx: any) {
  const url = new URL(
    ctx.env.GMAIL_REDIRECT_URI || `${appOrigin(ctx)}/gmail-connected`,
  );
  if (url.protocol !== "https:")
    throw new Error("Secure Google callback is not configured.");
  return url.href;
}
function fail(error: any) {
  return {
    ok: false as const,
    error:
      error instanceof ProviderError
        ? error.message
        : "This request could not be completed. Try again.",
    code: error instanceof ProviderError ? error.code : "request_failed",
    retryAfterMs: error instanceof ProviderError ? error.retryAfterMs : 0,
  };
}
async function paced(ctx: ServerContext, row: any, cost = 1) {
  const now = Date.now();
  if (row.nextAt > now)
    throw new ProviderError(
      "Please wait a moment before the next request.",
      "rate_limit",
      row.nextAt - now,
    );
  const day = new Date(now).toISOString().slice(0, 10),
    requests = row.day === day ? row.requests : 0;
  if (requests >= 700)
    throw new ProviderError(
      "Your daily request allowance is used. It resets at midnight UTC.",
      "daily_limit",
    );
  await ctx.db.accounts.update(row.id, {
    nextAt: now + cost * 400,
    day,
    requests: requests + 1,
  });
}
async function token(ctx: ServerContext, row: any) {
  if (!row.tokens) throw new ProviderError("Connect Gmail first.", "reconnect");
  const saved = await decrypt(
    row.tokens,
    ctx.env.DATA_ENCRYPTION_KEY,
    row.ownerId,
  );
  if (saved.expiresAt > Date.now() + 60000) return saved.access_token;
  const data = await fetchJson(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ctx.env.GOOGLE_CLIENT_ID,
        client_secret: ctx.env.GOOGLE_CLIENT_SECRET,
        refresh_token: saved.refresh_token,
        grant_type: "refresh_token",
      }).toString(),
    },
    1800,
  );
  if (!data.access_token)
    throw new ProviderError("Reconnect Gmail to continue.", "reconnect");
  const updated = {
    ...saved,
    access_token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  await ctx.db.accounts.update(row.id, {
    tokens: await encrypt(updated, ctx.env.DATA_ENCRYPTION_KEY, row.ownerId),
  });
  return updated.access_token;
}
const gmail = (access: string, path: string) =>
  fetchJson(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    { headers: { Authorization: `Bearer ${access}` } },
    2200,
  );

export default capsule({
  name: "Mailroom",
  auth: { requireSignIn: true }, // Lakebed protects every data route; handlers additionally enforce account ownership.
  schema: {
    accounts: table({
      slot: string(),
      ownerId: userId(),
      email: string(),
      tokens: string().default(""),
      apiKey: string().default(""),
      settings: string().default(""),
      settingsVersion: number().default(0),
      oauth: string().default(""),
      oauthExpires: number().default(0),
      nextAt: number().default(0),
      day: string().default(""),
      requests: number().default(0),
    })
      .index("by_slot", ["slot"])
      .index("by_owner", ["ownerId"]),
  },
  queries: {
    status: query(async (ctx) => {
      const identity = ctx.auth.requireSignedIn();
      const row = await ctx.db.accounts
        .withIndex("by_owner", (q) => q.eq("ownerId", identity.userId))
        .first();
      return {
        allowed: true,
        needsEnrollment: !row,
        connected: Boolean(row?.tokens),
        ready: configured(ctx),
        email: row?.email || identity.email || "",
        hasApiKey: Boolean(row?.apiKey),
        settings: readSettings(row?.settings),
        settingsVersion: row?.settingsVersion || 0,
        remaining:
          row?.day === new Date().toISOString().slice(0, 10)
            ? Math.max(0, 700 - row.requests)
            : 700,
      };
    }),
  },
  mutations: {
    enroll: mutation(async (ctx) => {
      const identity = ctx.auth.requireSignedIn();
      const existing = await ctx.db.accounts
        .withIndex("by_owner", (q) => q.eq("ownerId", identity.userId))
        .first();
      if (existing) {
        if (existing.ownerId !== identity.userId)
          throw new Error("Access denied.");
        return { ok: true };
      }
      if (!identity.emailVerified || !identity.email)
        throw new Error("Sign in with a verified Google email address.");
      await ctx.db.accounts.insert({
        slot: identity.userId,
        ownerId: identity.userId,
        email: identity.email,
      });
      return { ok: true };
    }),
    saveApiKey: mutation(async (ctx, key: string) => {
      const row = await owner(ctx);
      if (
        typeof key !== "string" ||
        key.length < 20 ||
        key.length > 512 ||
        !/^sk-or-[A-Za-z0-9_-]+$/.test(key)
      )
        return { ok: false, error: "Enter a valid OpenRouter API key." };
      try {
        await fetchJson(
          "https://openrouter.ai/api/v1/key",
          { headers: { Authorization: `Bearer ${key}` } },
          2000,
        );
        await ctx.db.accounts.update(row.id, {
          apiKey: await encrypt(
            key,
            ctx.env.DATA_ENCRYPTION_KEY,
            `${row.ownerId}:openrouter`,
          ),
        });
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            "OpenRouter could not validate this key. Check the key and try again.",
        };
      }
    }),
    removeApiKey: mutation(async (ctx) => {
      const row = await owner(ctx);
      await ctx.db.accounts.update(row.id, { apiKey: "" });
      return { ok: true };
    }),
    saveSettings: mutation(async (ctx, input: any, version: number) => {
      const row = await owner(ctx);
      if (version !== (row.settingsVersion || 0))
        return {
          ok: false,
          error:
            "Settings changed in another tab. Close and reopen settings before saving.",
        };
      try {
        const settings = validateSettings(input);
        await ctx.db.accounts.update(row.id, {
          settings: JSON.stringify(settings),
          settingsVersion: (row.settingsVersion || 0) + 1,
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }),
    deleteAccount: mutation(async (ctx) => {
      const row = await owner(ctx);
      await ctx.db.accounts.delete(row.id);
      return { ok: true };
    }),
    connect: mutation(async (ctx) => {
      const row = await owner(ctx);
      if (!configured(ctx))
        return {
          ok: false,
          error: "Gmail is awaiting server configuration.",
        };
      const state = random(),
        verifier = random();
      await ctx.db.accounts.update(row.id, {
        oauth: await encrypt(
          { state, verifier },
          ctx.env.DATA_ENCRYPTION_KEY,
          row.ownerId,
        ),
        oauthExpires: Date.now() + 600000,
      });
      const params = new URLSearchParams({
        client_id: ctx.env.GOOGLE_CLIENT_ID,
        redirect_uri: googleRedirect(ctx),
        response_type: "code",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: await digest(verifier),
        code_challenge_method: "S256",
      });
      return {
        ok: true,
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      };
    }),
    complete: mutation(async (ctx, code: string, state: string) => {
      const row = await owner(ctx);
      if (
        typeof code !== "string" ||
        code.length > 4096 ||
        typeof state !== "string" ||
        !row.oauth ||
        row.oauthExpires < Date.now()
      )
        return { ok: false, error: "Sign-in expired. Connect Gmail again." };
      const pending = await decrypt(
        row.oauth,
        ctx.env.DATA_ENCRYPTION_KEY,
        row.ownerId,
      );
      if (state !== pending.state)
        return {
          ok: false,
          error: "Sign-in did not match this browser account. Try again.",
        };
      await ctx.db.accounts.update(row.id, { oauth: "", oauthExpires: 0 });
      try {
        const data = await fetchJson(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              code_verifier: pending.verifier,
              client_id: ctx.env.GOOGLE_CLIENT_ID,
              client_secret: ctx.env.GOOGLE_CLIENT_SECRET,
              redirect_uri: googleRedirect(ctx),
              grant_type: "authorization_code",
            }).toString(),
          },
          1800,
        );
        if (!data.access_token || !data.refresh_token)
          throw new ProviderError(
            "Google did not provide offline access. Connect Gmail again.",
          );
        const profile = await gmail(data.access_token, "profile");
        if (profile.emailAddress?.toLowerCase() !== row.email.toLowerCase())
          throw new ProviderError(
            "Connect the same Gmail account you used to sign in.",
          );
        await ctx.db.accounts.update(row.id, {
          tokens: await encrypt(
            {
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
            },
            ctx.env.DATA_ENCRYPTION_KEY,
            row.ownerId,
          ),
        });
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    }),
    disconnect: mutation(async (ctx) => {
      const row = await owner(ctx);
      await ctx.db.accounts.update(row.id, {
        tokens: "",
        oauth: "",
        oauthExpires: 0,
      });
      return { ok: true };
    }),
    list: mutation(async (ctx, input: any, pageToken: string = "") => {
      const row = await owner(ctx);
      try {
        const selection = parseSelection(input);
        if (typeof pageToken !== "string" || pageToken.length > 2048)
          throw new Error("Invalid cursor.");
        await paced(ctx, row);
        const access = await token(ctx, row);
        const params = new URLSearchParams({
          labelIds: "INBOX",
          maxResults: String(Math.min(selection.limit, 500)),
          q: queryForSelection(selection),
        });
        if (pageToken) params.set("pageToken", pageToken);
        const data = await gmail(access, `messages?${params}`);
        return {
          ok: true,
          ids: (data.messages || []).map((x: any) => x.id),
          nextPageToken: data.nextPageToken || "",
          estimatedTotal: data.resultSizeEstimate || 0,
        };
      } catch (e) {
        return fail(e);
      }
    }),
    previews: mutation(async (ctx, ids: string[]) => {
      const row = await owner(ctx);
      try {
        if (!Array.isArray(ids) || !ids.length || ids.length > 5)
          throw new Error("Invalid batch.");
        ids.forEach(messageId);
        await paced(ctx, row, ids.length);
        const access = await token(ctx, row);
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const data = await gmail(
                access,
                `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
              );
              return { ok: true, email: metadata(data) };
            } catch (e) {
              return fail(e);
            }
          }),
        );
        return { ok: true, results };
      } catch (e) {
        return fail(e);
      }
    }),
    read: mutation(async (ctx, id: string) => {
      const row = await owner(ctx);
      try {
        messageId(id);
        await paced(ctx, row);
        const access = await token(ctx, row);
        const data = await gmail(access, `messages/${id}?format=full`);
        return { ok: true, email: { ...metadata(data), ...emailBody(data) } };
      } catch (e) {
        return fail(e);
      }
    }),
    classify: mutation(async (ctx, id: string) => {
      const row = await owner(ctx);
      try {
        messageId(id);
        if (!row.apiKey)
          throw new ProviderError(
            "Add your OpenRouter key in Settings before classifying.",
            "api_key_required",
          );
        const apiKey = await decrypt(
          row.apiKey,
          ctx.env.DATA_ENCRYPTION_KEY,
          `${row.ownerId}:openrouter`,
        );
        const settings = readSettings(row.settings);
        await paced(ctx, row, 2);
        const access = await token(ctx, row);
        const data = await gmail(access, `messages/${id}?format=full`),
          email = { ...metadata(data), ...emailBody(data) };
        const start = Date.now();
        const result = await fetchJson(
          "https://openrouter.ai/api/alpha/decisions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "typesafe/jev-1.13",
              state: {
                recipient: row.email,
                email: {
                  from: email.from,
                  subject: email.subject,
                  date: email.date,
                  body: email.body,
                },
              },
              questions: buildQuestions(settings),
            }),
          },
          1800,
        );
        return {
          ok: true,
          result: {
            answers: validateResult(result.answers, settings),
            settings,
            settingsVersion: row.settingsVersion || 0,
            requestMs: Date.now() - start,
            classifiedAt: new Date().toISOString(),
            inputTruncated: email.inputTruncated,
            model: "typesafe/jev-1.13",
          },
        };
      } catch (e) {
        return fail(e);
      }
    }),
  },
  endpoints: {
    health: endpoint({ method: "GET", path: "/healthz", readOnly: true }, () =>
      json(
        { ok: true, stage: "public-beta" },
        { headers: { "Cache-Control": "no-store" } },
      ),
    ),
  },
});
