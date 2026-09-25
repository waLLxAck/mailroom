import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { createClient, signOut } from "lakebed/client";
import type app from "../server/index";
import { defaults, validateSettings } from "../shared/settings";
const client = createClient<typeof app>();
const button =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-600";
const primary =
  "rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-600";
const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-2 focus:outline-blue-600";
export function Settings({
  status,
  close,
  busy,
  disconnect,
  reconnect,
  onSaved,
}: any) {
  const deleteAccount = client.useMutation("deleteAccount");
  const [deleting, setDeleting] = useState(false);
  const saveKey = client.useMutation("saveApiKey"),
    removeKey = client.useMutation("removeApiKey"),
    saveConfig = client.useMutation("saveSettings");
  const [tab, setTab] = useState("API key"),
    [key, setKey] = useState(""),
    [draft, setDraft] = useState(() =>
      structuredClone(status.settings || defaults()),
    ),
    [version, setVersion] = useState(status.settingsVersion || 0),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const ref = useRef<HTMLElement>(null),
    lock = useRef(false);
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape" && !lock.current) close();
      if (e.key === "Tab") {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]",
          ) || [],
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      before?.focus();
    };
  }, []);
  async function act(fn: any) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const r = await fn();
      if (!r.ok) throw new Error(r.error);
      return true;
    } catch (e: any) {
      setError(e.message || "Could not save. Try again.");
      return false;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  async function save() {
    let validated;
    try {
      validated = validateSettings(draft);
    } catch (e: any) {
      setError(e.message);
      return;
    }
    if (await act(() => saveConfig(validated, version))) {
      setVersion(version + 1);
      setNotice(
        "Saved to your account. New classifications will use these settings.",
      );
      onSaved();
    }
  }
  const patchCategory = (i: number, values: any) =>
    setDraft({
      ...draft,
      categories: draft.categories.map((c: any, n: number) =>
        n === i ? { ...c, ...values } : c,
      ),
    });
  const patchRule = (i: number, values: any) =>
    setDraft({
      ...draft,
      rules: draft.rules.map((r: any, n: number) =>
        n === i ? { ...r, ...values } : r,
      ),
    });
  const disabled = busy || saving;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-3 md:p-6"
      onClick={() => {
        if (!saving) close();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="settings-title" className="text-xl font-semibold">
              Your Mailroom settings
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Powered by Jev. Tuned by you.
            </p>
          </div>
          <button
            className={button}
            aria-label="Close settings"
            disabled={saving}
            onClick={close}
          >
            ×
          </button>
        </header>
        <nav
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-4 py-2"
        >
          {["API key", "Categories", "Classifications", "Privacy"].map((t) => (
            <button
              onClick={() => {
                setTab(t);
                setError("");
                setNotice("");
              }}
              aria-pressed={t === tab}
              className={
                "whitespace-nowrap rounded-lg px-3 py-2 text-sm " +
                (t === tab
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-slate-500 hover:bg-slate-50")
              }
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="overflow-y-auto px-6 py-5">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {notice}
            </p>
          )}
          {tab === "API key" && (
            <div>
              <h3 className="text-lg font-semibold">
                Bring your own OpenRouter key
              </h3>
              <p className="my-3 text-sm leading-6 text-slate-600">
                Your classifications use your OpenRouter account and credits.
                Your key is encrypted on the server, saved to your account, and
                never shown again.
              </p>
              <p className="my-4 text-sm font-medium text-blue-700">
                {status.hasApiKey
                  ? "A key is saved to your account."
                  : "No API key saved yet."}
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act(() => saveKey(key.trim()))) {
                    setKey("");
                    setNotice("API key validated and saved securely.");
                  }
                }}
              >
                <label className="grid gap-2 text-sm">
                  {status.hasApiKey ? "Replace API key" : "OpenRouter API key"}
                  <input
                    type="password"
                    value={key}
                    onInput={(e) => setKey(e.currentTarget.value)}
                    className={field}
                    autoComplete="off"
                    spellcheck={false}
                    placeholder="sk-or-…"
                    maxLength={512}
                    required
                    disabled={disabled}
                  />
                </label>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className={primary}
                    disabled={disabled || !key.trim()}
                  >
                    Save API key
                  </button>
                  {status.hasApiKey && (
                    <button
                      type="button"
                      className={button}
                      disabled={disabled}
                      onClick={async () => {
                        if (await act(() => removeKey())) {
                          setKey("");
                          setNotice("Saved key removed.");
                        }
                      }}
                    >
                      Remove saved key
                    </button>
                  )}
                  <a
                    href="https://openrouter.ai/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={button}
                  >
                    Get an OpenRouter key ↗
                  </a>
                </div>
              </form>
              <p className="mt-5 text-xs leading-5 text-slate-500">
                Model: TypeSafe Jev (typesafe/jev-1.13). Make sure your key has
                credits and access to Jev. Mailroom never falls back to someone
                else’s key.
              </p>
            </div>
          )}
          {tab === "Categories" && (
            <div>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">
                    Your inbox categories
                  </h3>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
                    Jev picks one category for each email. Describe what belongs
                    in each; saved categories appear in your inbox sidebar.
                  </p>
                </div>
                <button
                  className={button}
                  disabled={disabled || draft.categories.length >= 16}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      categories: [
                        ...draft.categories,
                        {
                          id:
                            "cat_" +
                            crypto.randomUUID().replace(/-/g, "").slice(0, 16),
                          label: "New category",
                          description: "Describe which emails belong here.",
                        },
                      ],
                    })
                  }
                >
                  Add category
                </button>
              </div>
              <div className="space-y-4">
                {draft.categories.map((c: any, i: number) => (
                  <fieldset
                    key={c.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <legend className="px-1 text-xs text-slate-500">
                      Category {i + 1}
                    </legend>
                    <div className="flex items-end gap-3">
                      <label className="grid flex-1 gap-2 text-xs text-slate-600">
                        Name
                        <input
                          aria-label={`Category ${i + 1} name`}
                          className={field}
                          value={c.label}
                          maxLength={60}
                          disabled={disabled}
                          onInput={(e) =>
                            patchCategory(i, { label: e.currentTarget.value })
                          }
                        />
                      </label>
                      <button
                        className={button}
                        aria-label={`Remove category ${i + 1}`}
                        disabled={disabled || draft.categories.length <= 2}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            categories: draft.categories.filter(
                              (_: any, n: number) => n !== i,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <label className="mt-3 grid gap-2 text-xs text-slate-600">
                      What belongs here?
                      <textarea
                        aria-label={`Category ${i + 1} description`}
                        className={field}
                        rows={2}
                        value={c.description}
                        maxLength={600}
                        disabled={disabled}
                        onInput={(e) =>
                          patchCategory(i, {
                            description: e.currentTarget.value,
                          })
                        }
                      />
                    </label>
                  </fieldset>
                ))}
              </div>
            </div>
          )}
          {tab === "Classifications" && (
            <div>
              <h3 className="text-lg font-semibold">
                What should Jev look for?
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Edit reply expectations, spam rules, deadlines or add your own
                yes/no question. Jev returns a Noul probability for every
                enabled question.
              </p>
              <label className="my-5 grid gap-2 text-sm">
                Confidence threshold (%)
                <input
                  type="number"
                  min="51"
                  max="99"
                  value={draft.threshold}
                  disabled={disabled}
                  onInput={(e) =>
                    setDraft({
                      ...draft,
                      threshold: Number(e.currentTarget.value),
                    })
                  }
                  className={field + " max-w-28"}
                />
                <span className="text-xs text-slate-500">
                  At least {draft.threshold}% means likely; at most{" "}
                  {100 - draft.threshold}% means unlikely. Between them is
                  uncertain.
                </span>
              </label>
              <div className="space-y-4">
                {draft.rules.map((r: any, i: number) => (
                  <fieldset
                    key={r.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <legend className="px-1 text-sm font-medium">
                      {r.label}
                    </legend>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          disabled={disabled}
                          onChange={(e) =>
                            patchRule(i, { enabled: e.currentTarget.checked })
                          }
                        />
                        Enabled
                      </label>
                      <button
                        className={button}
                        disabled={disabled}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            rules: draft.rules.filter(
                              (_: any, n: number) => n !== i,
                            ),
                          })
                        }
                      >
                        Remove question
                      </button>
                    </div>
                    <label className="grid gap-2 text-xs text-slate-600">
                      Name
                      <input
                        className={field}
                        value={r.label}
                        maxLength={60}
                        disabled={disabled}
                        onInput={(e) =>
                          patchRule(i, { label: e.currentTarget.value })
                        }
                      />
                    </label>
                    <label className="mt-3 grid gap-2 text-xs text-slate-600">
                      Question and instructions
                      <textarea
                        className={field}
                        rows={3}
                        value={r.instructions}
                        maxLength={1500}
                        disabled={disabled}
                        onInput={(e) =>
                          patchRule(i, { instructions: e.currentTarget.value })
                        }
                      />
                    </label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-xs text-slate-600">
                        When the answer is yes
                        <textarea
                          className={field}
                          rows={3}
                          value={r.yes}
                          maxLength={600}
                          disabled={disabled}
                          onInput={(e) =>
                            patchRule(i, { yes: e.currentTarget.value })
                          }
                        />
                      </label>
                      <label className="grid gap-2 text-xs text-slate-600">
                        When the answer is no
                        <textarea
                          className={field}
                          rows={3}
                          value={r.no}
                          maxLength={600}
                          disabled={disabled}
                          onInput={(e) =>
                            patchRule(i, { no: e.currentTarget.value })
                          }
                        />
                      </label>
                    </div>
                  </fieldset>
                ))}
              </div>
              <button
                className={button + " mt-4"}
                disabled={disabled || draft.rules.length >= 12}
                onClick={() =>
                  setDraft({
                    ...draft,
                    rules: [
                      ...draft.rules,
                      {
                        id:
                          "q_" +
                          crypto.randomUUID().replace(/-/g, "").slice(0, 16),
                        label: "Custom question",
                        instructions:
                          "Does this email need my attention for a specific reason?",
                        yes: "Describe the evidence that should count as yes.",
                        no: "Describe what should count as no.",
                        enabled: true,
                      },
                    ],
                  })
                }
              >
                Add classification question
              </button>
            </div>
          )}
          {tab === "Privacy" && (
            <div className="space-y-4 text-sm leading-6 text-slate-600">
              <h3 className="text-lg font-semibold text-slate-800">
                Your account and data
              </h3>
              <p>
                Gmail access is read-only. Mailroom cannot send, delete or
                relabel your messages.
              </p>
              <p>
                Only when you classify, selected email text (up to 24,000
                characters), sender, subject, date, and your Gmail address are
                sent to OpenRouter and TypeSafe Jev using your key.
              </p>
              <p>
                Email content and results stay in this tab’s memory. Your
                account stores encrypted Gmail credentials, your encrypted
                OpenRouter key and your classification settings. Other accounts
                cannot access them.
              </p>
              <p>
                Disconnecting Gmail deletes the stored Gmail tokens. Removing
                your API key deletes it separately. Google and OpenRouter grants
                can also be revoked in their own settings.
              </p>
              <p>
                You have {status.remaining ?? "—"} of 700 account calls
                remaining today. Lakebed also enforces shared hosting limits;
                this public beta uses its alpha infrastructure.
              </p>
              <div className="flex flex-wrap gap-3">
                {status.connected && (
                  <>
                    <button
                      className={button}
                      disabled={disabled}
                      onClick={reconnect}
                    >
                      Reconnect Gmail
                    </button>
                    <button
                      className={button}
                      disabled={disabled}
                      onClick={disconnect}
                    >
                      Disconnect Gmail
                    </button>
                  </>
                )}
                <button
                  className={button}
                  disabled={disabled}
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
              </div>
              <div className="border-t border-slate-200 pt-4">
                {deleting ? (
                  <>
                    <p className="mb-3 text-red-700">
                      Delete your saved Gmail credentials, OpenRouter key and
                      settings? This cannot be undone. Your mailbox is
                      unchanged.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className={button}
                        disabled={disabled}
                        onClick={() => setDeleting(false)}
                      >
                        Keep account
                      </button>
                      <button
                        className={button}
                        disabled={disabled}
                        onClick={async () => {
                          if (await act(() => deleteAccount())) await signOut();
                        }}
                      >
                        Delete my Mailroom account
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className={button}
                    disabled={disabled}
                    onClick={() => setDeleting(true)}
                  >
                    Delete account data
                  </button>
                )}
              </div>
              <p>
                <a
                  className="text-blue-700 underline"
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy notice
                </a>{" "}
                ·{" "}
                <a
                  className="text-blue-700 underline"
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Terms
                </a>
              </p>
            </div>
          )}
        </div>
        {(tab === "Categories" || tab === "Classifications") && (
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <button
              className={button}
              disabled={disabled}
              onClick={() => {
                setDraft(defaults());
                setNotice("Defaults restored in this draft. Save to apply.");
              }}
            >
              Reset defaults
            </button>
            <button
              className={primary}
              disabled={disabled}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save classification settings"}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
