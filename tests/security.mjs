import test from "node:test";
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
const { default: app } = await import(
  "data:text/javascript;base64," + artifact.artifact.server.source.bundle
);
const secret = "a".repeat(64);
function fixture(
  identity = {
    userId: "owner",
    email: "owner@example.com",
    emailVerified: true,
  },
) {
  let row = null;
  const db = {
    accounts: {
      withIndex() {
        return { first: async () => (row ? { ...row } : null) };
      },
      insert: async (value) => {
        row = {
          id: "row",
          tokens: "",
          oauth: "",
          oauthExpires: 0,
          nextAt: 0,
          day: "",
          requests: 0,
          ...value,
        };
        return "row";
      },
      update: async (id, value) => {
        assert.equal(id, "row");
        row = { ...row, ...value };
      },
    },
  };
  const ctx = {
    auth: {
      requireSignedIn() {
        if (!identity) throw new Error("Sign in required");
        return identity;
      },
    },
    db,
    env: {
      OWNER_EMAIL: "owner@example.com",
      APP_URL: "https://mail.example.com",
      GOOGLE_CLIENT_ID: "client",
      GOOGLE_CLIENT_SECRET: "secret",
      OPENROUTER_API_KEY: "key",
      DATA_ENCRYPTION_KEY: secret,
    },
  };
  return {
    ctx,
    get row() {
      return row;
    },
    as(next) {
      ctx.auth.requireSignedIn = () => {
        if (!next) throw new Error("Sign in required");
        return next;
      };
    },
  };
}
function providerMock(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  return () => {
    globalThis.fetch = original;
  };
}
const response = (data) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
test("all private operations reject guests before provider access", async () => {
  const f = fixture(null);
  let calls = 0;
  const restore = providerMock(async () => {
    calls++;
    throw new Error("unexpected");
  });
  try {
    for (const fn of Object.values(app.mutations))
      await assert.rejects(() => fn(f.ctx));
    await assert.rejects(() => app.queries.status(f.ctx));
    assert.equal(calls, 0);
  } finally {
    restore();
  }
});
test("owner invitation requires verified email, pins immutable ID, rejects an account sharing its email", async () => {
  const f = fixture({
    userId: "attacker",
    email: "owner@example.com",
    emailVerified: false,
  });
  await assert.rejects(() => app.mutations.enroll(f.ctx));
  f.as({ userId: "owner", email: "owner@example.com", emailVerified: true });
  await app.mutations.enroll(f.ctx);
  assert.equal(f.row.ownerId, "owner");
  f.as({ userId: "other-id", email: "owner@example.com", emailVerified: true });
  await assert.rejects(() => app.mutations.enroll(f.ctx));
  await assert.rejects(() => app.mutations.read(f.ctx, "12345678"));
  assert.equal((await app.queries.status(f.ctx)).allowed, false);
});
test("OAuth uses unique PKCE state, encrypts tokens, rejects state replay, and disconnect deletes credentials", async () => {
  const f = fixture();
  await app.mutations.enroll(f.ctx);
  const connected = await app.mutations.connect(f.ctx);
  const url = new URL(connected.url),
    state = url.searchParams.get("state");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("scope"),
    "https://www.googleapis.com/auth/gmail.readonly",
  );
  assert.ok(!f.row.oauth.includes(state));
  assert.equal(
    (await app.mutations.complete(f.ctx, "code", "wrong")).ok,
    false,
  );
  let calls = 0;
  const restore = providerMock(async (url) => {
    calls++;
    return response(
      String(url).includes("/token")
        ? {
            access_token: "private-access",
            refresh_token: "private-refresh",
            expires_in: 3600,
          }
        : { emailAddress: "owner@example.com" },
    );
  });
  try {
    assert.equal((await app.mutations.complete(f.ctx, "code", state)).ok, true);
    assert.equal(calls, 2);
    assert.ok(f.row.tokens.length > 50);
    assert.ok(!f.row.tokens.includes("private-access"));
    assert.ok(!f.row.tokens.includes("private-refresh"));
    assert.equal(f.row.oauth, "");
    assert.equal(
      (await app.mutations.complete(f.ctx, "code", state)).ok,
      false,
    );
    await app.mutations.disconnect(f.ctx);
    assert.equal(f.row.tokens, "");
  } finally {
    restore();
  }
});
test("invalid IDs, excessive batches, and malformed selections never call providers", async () => {
  const f = fixture();
  await app.mutations.enroll(f.ctx);
  let calls = 0;
  const restore = providerMock(async () => {
    calls++;
    throw new Error("unexpected");
  });
  try {
    assert.equal((await app.mutations.read(f.ctx, "../profile")).ok, false);
    assert.equal(
      (await app.mutations.previews(f.ctx, Array(6).fill("12345678"))).ok,
      false,
    );
    assert.equal(
      (await app.mutations.list(f.ctx, { range: "all", limit: 1001 })).ok,
      false,
    );
    assert.equal(calls, 0);
  } finally {
    restore();
  }
});
test("wrong Gmail account cannot be linked", async () => {
  const f = fixture();
  await app.mutations.enroll(f.ctx);
  const { url } = await app.mutations.connect(f.ctx);
  const restore = providerMock(async (url) =>
    response(
      String(url).includes("/token")
        ? { access_token: "access", refresh_token: "refresh" }
        : { emailAddress: "someone-else@example.com" },
    ),
  );
  try {
    assert.equal(
      (
        await app.mutations.complete(
          f.ctx,
          "code",
          new URL(url).searchParams.get("state"),
        )
      ).ok,
      false,
    );
    assert.equal(f.row.tokens, "");
    assert.equal(f.row.oauth, "");
  } finally {
    restore();
  }
});
test("rate and daily budgets stop provider requests; decrypted tokens never reach client results", async () => {
  const f = fixture();
  await app.mutations.enroll(f.ctx);
  const { url } = await app.mutations.connect(f.ctx);
  let calls = 0;
  const restore = providerMock(async (url) => {
    calls++;
    return response(
      String(url).includes("/token")
        ? {
            access_token: "private-access",
            refresh_token: "private-refresh",
            expires_in: 3600,
          }
        : String(url).endsWith("/profile")
          ? { emailAddress: "owner@example.com" }
          : { messages: [{ id: "12345678" }] },
    );
  });
  try {
    await app.mutations.complete(
      f.ctx,
      "code",
      new URL(url).searchParams.get("state"),
    );
    const result = await app.mutations.list(f.ctx, { range: "24h", limit: 5 });
    assert.equal(result.ok, true);
    assert.ok(!JSON.stringify(result).includes("private-access"));
    const before = calls;
    assert.equal(
      (await app.mutations.list(f.ctx, { range: "24h", limit: 5 })).code,
      "rate_limit",
    );
    assert.equal(calls, before);
    await f.ctx.db.accounts.update("row", {
      nextAt: 0,
      day: new Date().toISOString().slice(0, 10),
      requests: 700,
    });
    assert.equal(
      (await app.mutations.list(f.ctx, { range: "24h", limit: 5 })).code,
      "daily_limit",
    );
    assert.equal(calls, before);
  } finally {
    restore();
  }
});
test("classification returns validated Noul values and measured timing, rejects malformed provider answers", async () => {
  const f = fixture();
  await app.mutations.enroll(f.ctx);
  const { url } = await app.mutations.connect(f.ctx);
  let invalid = false;
  const answers = {
    ...Object.fromEntries(
      [
        "should_reply",
        "is_spam",
        "is_phishing",
        "action_required",
        "has_deadline",
      ].map((k) => [k, { type: "noul", noul: 0.04 }]),
    ),
    category: { type: "choice", choice: "newsletter", confidence: 0.99 },
    urgency: { type: "score", score: 0 },
  };
  const restore = providerMock(async (url, options) => {
    if (String(url).includes("/token"))
      return response({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
      });
    if (String(url).endsWith("/profile"))
      return response({ emailAddress: "owner@example.com" });
    if (String(url).includes("openrouter")) {
      const request = JSON.parse(options.body);
      assert.equal(request.model, "typesafe/jev-1.13");
      assert.ok(request.questions.has_deadline);
      assert.ok(request.state.email.body.includes("newsletter"));
      return response({
        answers: invalid
          ? { ...answers, should_reply: { type: "noul", noul: 2 } }
          : answers,
      });
    }
    return response({
      id: "12345678",
      payload: {
        mimeType: "text/plain",
        headers: [],
        body: {
          data: Buffer.from("A newsletter with an optional offer").toString(
            "base64url",
          ),
        },
      },
    });
  });
  try {
    await app.mutations.complete(
      f.ctx,
      "code",
      new URL(url).searchParams.get("state"),
    );
    const result = await app.mutations.classify(f.ctx, "12345678");
    assert.equal(result.ok, true);
    assert.equal(result.result.answers.has_deadline.noul, 0.04);
    assert.ok(result.result.requestMs >= 0);
    assert.equal(f.row.body, undefined);
    await f.ctx.db.accounts.update("row", { nextAt: 0 });
    invalid = true;
    assert.equal((await app.mutations.classify(f.ctx, "12345678")).ok, false);
  } finally {
    restore();
  }
});
