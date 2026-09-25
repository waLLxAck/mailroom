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
import { questions } from "./questions";
import { validateAnswers, messageId } from "../shared/email";
import { parseSelection, queryForSelection } from "../shared/mail-selection";

// Native Lakebed identity is required in every data handler, then matched to the pinned owner.
async function owner(ctx: any) {
  const identity = ctx.auth.requireSignedIn();
  const row = await ctx.db.accounts
    .withIndex("by_slot", (q: any) => q.eq("slot", "owner"))
    .first();
  if (!row || row.ownerId !== identity.userId)
    throw new Error("This private pilot is restricted to its owner.");
  return row;
}
function configured(ctx: any) {
  return Boolean(
    ctx.env.GOOGLE_CLIENT_ID &&
      ctx.env.GOOGLE_CLIENT_SECRET &&
      ctx.env.OPENROUTER_API_KEY &&
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
      "This pilot’s daily request allowance is used. It resets at midnight UTC.",
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
  auth: { requireSignIn: true }, // Lakebed protects every data route; handlers additionally enforce the pinned owner.
  schema: {
    accounts: table({
      slot: string(),
      ownerId: userId(),
      email: string(),
      tokens: string().default(""),
      oauth: string().default(""),
      oauthExpires: number().default(0),
      nextAt: number().default(0),
      day: string().default(""),
      requests: number().default(0),
    }).index("by_slot", ["slot"]),
  },
  queries: {
    status: query(async (ctx) => {
      const identity = ctx.auth.requireSignedIn();
      const row = await ctx.db.accounts
        .withIndex("by_slot", (q) => q.eq("slot", "owner"))
        .first();
      if (row && row.ownerId !== identity.userId)
        return {
          allowed: false,
          needsEnrollment: false,
          connected: false,
          ready: false,
          email: "",
        };
      const invited =
        identity.emailVerified === true &&
        identity.email?.toLowerCase() === ctx.env.OWNER_EMAIL?.toLowerCase();
      return {
        allowed: Boolean(row) || invited,
        needsEnrollment: !row && invited,
        connected: Boolean(row?.tokens),
        ready: configured(ctx),
        email: row?.email || "",
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
        .withIndex("by_slot", (q) => q.eq("slot", "owner"))
        .first();
      if (existing) {
        if (existing.ownerId !== identity.userId)
          throw new Error("Access denied.");
        return { ok: true };
      }
      if (
        !ctx.env.OWNER_EMAIL ||
        !identity.emailVerified ||
        identity.email?.toLowerCase() !== ctx.env.OWNER_EMAIL.toLowerCase()
      )
        throw new Error("Access denied.");
      await ctx.db.accounts.insert({
        slot: "owner",
        ownerId: identity.userId,
        email: identity.email,
      });
      return { ok: true };
    }),
    connect: mutation(async (ctx) => {
      const row = await owner(ctx);
      if (!configured(ctx))
        return {
          ok: false,
          error: "The pilot is awaiting server configuration.",
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
        redirect_uri: `${appOrigin(ctx)}/gmail-connected`,
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
              redirect_uri: `${appOrigin(ctx)}/gmail-connected`,
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
            "Connect the same Gmail account that owns this pilot.",
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
              Authorization: `Bearer ${ctx.env.OPENROUTER_API_KEY}`,
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
              questions,
            }),
          },
          1800,
        );
        return {
          ok: true,
          result: {
            answers: validateAnswers(result.answers),
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
        { ok: true, stage: "pilot" },
        { headers: { "Cache-Control": "no-store" } },
      ),
    ),
  },
});
