import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  Router,
  Routes,
  Route,
  canAccessApp,
  createClient,
  retryAuth,
  SignInWithGoogle,
  signOut,
  useAuth,
} from "lakebed/client";
import type app from "../server/index";
import { defaults } from "../shared/settings";
import { Settings } from "./Settings";
import { Legal } from "./Legal";
import { parseSelection, rangeLabel } from "../shared/mail-selection";
// During domain migration, relay only to the canonical origin owned by this app.
const forwardToCanonical =
  [
    "https://svilen-mailroom.lakebed.app",
    "https://lucky-ridge-54fcc55777.lakebed.app",
  ].includes(location.origin) &&
  ["/", "/gmail-connected"].includes(location.pathname);
if (forwardToCanonical)
  location.replace(
    "https://mailroom.lakebed.app" + location.pathname + location.search,
  );
const callback =
  !forwardToCanonical && location.pathname === "/gmail-connected"
    ? new URLSearchParams(location.search)
    : null;
if (callback) history.replaceState({}, "", "/");
const referrer = document.createElement("meta");
referrer.name = "referrer";
referrer.content = "no-referrer";
document.head.appendChild(referrer);
const client = createClient<typeof app>();
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const field =
  "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-2 focus:outline-blue-600";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function Mark() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden="true"
    >
      <rect width="30" height="30" rx="8" fill="#3159d6" />
      <path
        d="M7 10h16v11H7zM7 10l8 6 8-6"
        stroke="white"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
    </svg>
  );
}
export function App() {
  return <Router><Routes>
    <Route path="/" element={<Mailroom />} />
    <Route path="/auth/callback" element={<Mailroom />} />
    <Route path="/gmail-connected" element={<Mailroom />} />
    <Route path="/privacy" element={<Legal page="privacy" />} />
    <Route path="/terms" element={<Legal page="terms" />} />
  </Routes></Router>;
}
function Mailroom() {
  const auth = useAuth();
  if (forwardToCanonical) return null;
  return (
    <div className="min-h-screen bg-[#f3f6fb] font-sans text-[#23344e] selection:bg-blue-100">
      {auth.isLoading ? (
        <main className="grid min-h-screen place-items-center" role="status">
          Checking your session…
        </main>
      ) : !canAccessApp() || !auth.isSignedIn ? (
        <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-12">
          <div className="grid w-full gap-14 md:grid-cols-2">
            <section>
              <div className="mb-16 flex items-center gap-3 text-2xl font-bold">
                <Mark />
                mailroom.
              </div>
              <h1 className="text-5xl font-semibold leading-tight tracking-tight">
                Your inbox,
                <br />
                decided.
              </h1>
              <p className="mt-6 max-w-sm text-lg leading-relaxed text-slate-600">
                See what needs a reply, what can wait, and what’s simply
                marketing.
              </p>
              <p className="mt-6 max-w-sm text-sm leading-relaxed text-slate-500">
                Your Gmail workspace. Jev classifies your emails with
                probabilities you can inspect.
              </p>
            </section>
            <section className="self-center rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight">
                Your personal workspace
              </h2>
              <p className="mb-6 mt-3 text-sm leading-6 text-slate-600">
                Sign in with Google. You’ll connect Gmail separately and choose
                which emails to classify.
              </p>
              {auth.error && (
                <p role="alert" className="mb-4 text-sm text-red-700">
                  {auth.error}
                </p>
              )}
              <SignInWithGoogle className={primary} />
              <p className="mt-4 text-xs text-slate-500">
                <a className="underline" href="/privacy">
                  Privacy
                </a>{" "}
                ·{" "}
                <a className="underline" href="/terms">
                  Terms
                </a>{" · "}<a className="underline" href="https://github.com/waLLxAck/mailroom">Source code</a>
              </p>
              {auth.error && (
                <button
                  className={button + " ml-2"}
                  onClick={() => void retryAuth()}
                >
                  Retry
                </button>
              )}
              <ul className="mt-8 space-y-3 border-t border-slate-100 pt-6 text-sm text-slate-600">
                <li>Gmail access is read-only.</li>
                <li>Your API key and settings stay with your account.</li>
                <li>
                  Classification sends selected email text to OpenRouter and
                  TypeSafe.
                </li>
              </ul>
              <p className="mt-6 text-xs leading-5 text-slate-500">
                Bring your own OpenRouter key. Customize your categories and
                decisions. Powered by Jev. Free and open source; no technical support.
              </p>
            </section>
          </div>
        </main>
      ) : (
        <Workspace />
      )}
    </div>
  );
}
function Workspace() {
  const status = client.useQuery("status");
  const config = status?.settings || defaults();
  const categories = config.categories.map((c) => c.id);
  const categoryLabel = (id: string) =>
    config.categories.find((c) => c.id === id)?.label || id;
  const enroll = client.useMutation("enroll"),
    connect = client.useMutation("connect"),
    complete = client.useMutation("complete"),
    disconnect = client.useMutation("disconnect"),
    list = client.useMutation("list"),
    previews = client.useMutation("previews"),
    read = client.useMutation("read"),
    classify = client.useMutation("classify");
  const [emails, setEmails] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("All mail"),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [privacy, setPrivacy] = useState(false),
    [detail, setDetail] = useState(false);
  const [selection, setSelection] = useState<any>({
      range: "24h",
      limit: 100,
      amount: 14,
      unit: "days",
    }),
    [applied, setApplied] = useState<any>(null),
    [pending, setPending] = useState<string[]>([]),
    [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 }),
    [run, setRun] = useState<any>(null),
    [clock, setClock] = useState(0);
  const locked = useRef(false),
    cancel = useRef(false),
    mounted = useRef(true),
    oauthOnce = useRef(false),
    enrolling = useRef(false);
  useEffect(
    () => () => {
      mounted.current = false;
      cancel.current = true;
    },
    [],
  );
  useEffect(() => {
    if (!run?.active) return;
    const timer = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(timer);
  }, [run?.active]);
  useEffect(() => {
    if (!status || enrolling.current) return;
    enrolling.current = true;
    if (status.needsEnrollment) {
      enroll().catch(() => {
        setError("Could not activate your workspace. Reload to retry.");
      });
    }
  }, [status]);
  useEffect(() => {
    if (
      !status?.allowed ||
      status.needsEnrollment ||
      oauthOnce.current ||
      !callback
    )
      return;
    oauthOnce.current = true;
    const code = callback.get("code"),
      state = callback.get("state");
    if (!code || !state) {
      setError("Google sign-in was cancelled. Connect Gmail to try again.");
      return;
    }
    locked.current = true;
    setBusy("Finishing Google sign-in");
    complete(code, state)
      .then((r: any) => {
        if (!r.ok) throw new Error(r.error);
        setNotice("Gmail connected. Choose a time range and load your inbox.");
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        locked.current = false;
        setBusy("");
      });
  }, [status?.allowed, status?.needsEnrollment]);
  async function invoke(fn: any, ...args: any[]): Promise<any> {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (cancel.current)
        throw new Error("Stopped. Your completed results are kept.");
      const result = await fn(...args);
      if (result.ok) return result;
      if (
        result.code === "rate_limit" &&
        result.retryAfterMs <= 30000 &&
        attempt < 4
      ) {
        setNotice(
          "Waiting for Gmail’s rate limit. Your progress is saved in this tab.",
        );
        await sleep(Math.max(500, result.retryAfterMs));
        continue;
      }
      if (result.code === "api_key_required") setPrivacy(true);
      throw new Error(result.error || "The request could not be completed.");
    }
  }
  function begin(label: string) {
    if (locked.current) return false;
    locked.current = true;
    cancel.current = false;
    setBusy(label);
    setError("");
    setNotice("");
    return true;
  }
  function finish() {
    locked.current = false;
    if (mounted.current) setBusy("");
  }
  async function connectGmail() {
    if (!begin("Opening Google sign-in")) return;
    try {
      const result: any = await connect();
      if (!result.ok) throw new Error(result.error);
      location.assign(result.url);
    } catch (e: any) {
      setError(e.message);
      finish();
    }
  }
  async function load(resume = false) {
    let input;
    try {
      input = parseSelection(resume ? applied : selection);
    } catch (e: any) {
      setError(e.message);
      return;
    }
    if (!begin(resume ? "Resuming inbox load" : "Loading inbox")) return;
    let ids = resume ? [...pending] : [],
      loaded = resume ? emails.length : 0;
    try {
      if (!resume) {
        setLoadProgress({ loaded: 0, total: 0 });
        let cursor = "";
        for (let page = 0; page < 2; page++) {
          const result = await invoke(list, input, cursor);
          ids = [...new Set([...ids, ...result.ids])].slice(0, input.limit);
          cursor = result.nextPageToken;
          if (!cursor || ids.length >= input.limit) break;
          await sleep(450);
        }
        setEmails([]);
        setSelected("");
        setApplied(input);
        setFilter("All mail");
        setSearch("");
        setRun(null);
      }
      setPending(ids);
      setLoadProgress({ loaded, total: loaded + ids.length });
      for (let offset = 0; offset < ids.length; offset += 5) {
        if (cancel.current) break;
        const batch = ids.slice(offset, offset + 5);
        const result = await invoke(previews, batch);
        const successes = result.results
          .filter((r: any) => r.ok)
          .map((r: any) => r.email);
        if (successes.length) {
          setEmails((old) => [
            ...old.filter((m) => !successes.some((n: any) => n.id === m.id)),
            ...successes,
          ]);
          setSelected((old) => old || successes[0].id);
          loaded += successes.length;
        }
        const failed = batch.filter(
          (id) => !successes.some((e: any) => e.id === id),
        );
        const remaining = [...failed, ...ids.slice(offset + 5)];
        setPending(remaining);
        setLoadProgress((p) => ({ ...p, loaded }));
        if (failed.length)
          throw new Error(
            result.results.find((r: any) => !r.ok)?.error ||
              "Some previews could not load. Use Resume.",
          );
        if (offset + 5 < ids.length) await sleep(2050);
      }
      setNotice(
        cancel.current
          ? "Loading stopped. Resume when you’re ready."
          : `${loaded} emails loaded. Full messages load when you open them.`,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      finish();
    }
  }
  async function openBody(email: any) {
    if (email.body !== undefined || !begin("Opening email")) return;
    try {
      const result = await invoke(read, email.id);
      setEmails((old) =>
        old.map((m) => (m.id === email.id ? { ...m, ...result.email } : m)),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      finish();
    }
  }
  async function classifyEmails(targets: any[]) {
    if (!status?.hasApiKey) {
      setPrivacy(true);
      setError("Add your OpenRouter API key in Settings to classify emails.");
      return;
    }
    if (!targets.length || !begin("Classifying emails")) return;
    const start = Date.now();
    setClock(start);
    setRun({
      active: true,
      start,
      end: 0,
      total: targets.length,
      done: [],
      failed: 0,
    });
    try {
      for (const email of targets) {
        if (cancel.current) break;
        const result = await invoke(classify, email.id);
        setEmails((old) =>
          old.map((m) =>
            m.id === email.id ? { ...m, classification: result.result } : m,
          ),
        );
        setRun((r: any) => ({
          ...r,
          done: [...r.done, { id: email.id, ms: result.result.requestMs }],
        }));
        await sleep(850);
      }
    } catch (e: any) {
      setError(e.message);
      setRun((r: any) => ({ ...r, failed: 1 }));
    } finally {
      setRun((r: any) => ({ ...r, active: false, end: Date.now() }));
      finish();
    }
  }
  async function removeConnection() {
    if (!begin("Disconnecting Gmail")) return;
    try {
      await disconnect();
      setEmails([]);
      setSelected("");
      setPending([]);
      setApplied(null);
      setRun(null);
      setNotice("Gmail disconnected. Stored access tokens were deleted.");
      setPrivacy(false);
    } catch {
      setError("Disconnect failed. Please try again.");
    } finally {
      finish();
    }
  }
  const visible = emails.filter((e) => {
    const a = e.classification?.answers;
    return (
      (filter === "All mail" ||
        (filter === "Needs reply"
          ? a?.should_reply?.noul >=
            (e.classification?.settings?.threshold || 70) / 100
          : filter === "Unclassified"
            ? !a
            : a?.category.choice === filter)) &&
      `${e.from} ${e.subject} ${e.snippet}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  const current = emails.find((e) => e.id === selected),
    done = run?.done || [],
    elapsed = run ? ((run.active ? clock : run.end) - run.start) / 1000 : 0,
    average = done.length
      ? Math.round(
          done.reduce((s: number, x: any) => s + x.ms, 0) / done.length,
        )
      : 0;
  const targets = emails.filter(
    (e) =>
      !e.classification ||
      (e.classification.settingsVersion || 0) !==
        (status?.settingsVersion || 0),
  );
  let valid = true;
  try {
    parseSelection(selection);
  } catch {
    valid = false;
  }
  if (!status)
    return (
      <main className="p-10" role="status">
        Opening your workspace…
      </main>
    );
  if (!status.allowed)
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <Mark />
        <h1 className="mt-8 text-3xl font-semibold">
          Sign in to your workspace.
        </h1>
        <p className="my-5 text-slate-600">
          Use your Google account to open Mailroom.
        </p>
        <button className={button} onClick={() => void signOut()}>
          Sign out
        </button>
      </main>
    );
  return (
    <div className="mx-auto flex min-h-screen max-w-[1800px]">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-7 lg:flex">
        <a
          href="/"
          className="mb-10 flex items-center gap-2 px-2 text-2xl font-bold"
        >
          <Mark />
          mailroom.
        </a>
        <p
          className="mb-5 truncate px-2 text-xs text-slate-500"
          title={status.email}
        >
          {status.email || "Your personal workspace"}
        </p>
        <nav aria-label="Inbox filters">
          {["All mail", "Needs reply", "Unclassified"].map((f) => (
            <button
              onClick={() => setFilter(f)}
              className={
                "mb-1 flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm " +
                (filter === f
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-slate-600 hover:bg-slate-50")
              }
            >
              {categoryLabel(f)}
              <span className="text-xs">
                {f === "All mail"
                  ? emails.length
                  : f === "Unclassified"
                    ? targets.length
                    : emails.filter(
                        (e) =>
                          e.classification?.answers.should_reply?.noul >=
                          (e.classification?.settings?.threshold || 70) / 100,
                      ).length}
              </span>
            </button>
          ))}
        </nav>
        <p className="mb-2 mt-8 px-3 text-xs text-slate-500">Categories</p>
        <nav aria-label="Categories">
          {categories.map((f) => (
            <button
              onClick={() => setFilter(f)}
              className={
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm capitalize " +
                (filter === f
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-slate-600 hover:bg-slate-50")
              }
            >
              {categoryLabel(f)}
              <span className="text-xs">
                {emails.filter(
                  (e) => e.classification?.answers.category.choice === f,
                ).length || ""}
              </span>
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-8">
          <button
            className="px-3 py-2 text-sm text-slate-600 hover:text-blue-700"
            onClick={() => setPrivacy(true)}
          >
            Connection & privacy
          </button>
          <p className="px-3 pt-2 text-xs text-slate-400">Powered by Jev</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5 text-sm">
          <a
            href="/"
            className="flex items-center gap-2 font-semibold lg:hidden"
          >
            <Mark />
            Mailroom
          </a>
          <span className="hidden text-slate-500 lg:block">
            Inbox / Your workspace
          </span>
          <div className="flex items-center gap-3">
            <span
              className={
                "flex items-center gap-2 text-xs " +
                (status.connected ? "text-emerald-700" : "text-slate-500")
              }
            >
              <span
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (status.connected ? "bg-emerald-600" : "bg-slate-400")
                }
              />
              {status.connected ? "Gmail connected" : "Gmail disconnected"}
            </span>
            <button
              onClick={() => setPrivacy(true)}
              className="rounded p-2 text-slate-500 hover:bg-white"
              aria-label="Connection and privacy settings"
            >
              Settings
            </button>
          </div>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-5 py-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Your inbox, decided.
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              From unread to understood. Watch Jev sort your mail in real time.
            </p>
          </div>
          {status.connected ? (
            <button
              disabled={!!busy || !emails.length}
              className={primary}
              onClick={() =>
                void classifyEmails(targets.length ? targets : emails)
              }
            >
              ✧{" "}
              {targets.length || !emails.length
                ? "Classify inbox"
                : "Classify again"}
            </button>
          ) : (
            <button
              disabled={!!busy || !status.ready || status.needsEnrollment}
              className={primary}
              onClick={() => void connectGmail()}
            >
              Connect Gmail
            </button>
          )}
        </div>
        {!status.ready && (
          <p className="mb-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Server setup is not complete yet. Gmail connection will become
            available when the service is configured.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-red-50 p-4 text-sm text-red-700"
          >
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="mb-4 text-sm text-slate-600">
            {notice}
          </p>
        )}
        {status.connected && (
          <section
            aria-label="Email selection"
            className="mb-6 rounded-xl border border-slate-200 bg-white p-5"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <label className="grid gap-2 text-xs text-slate-500">
                Time range
                <select
                  disabled={!!busy}
                  className={field}
                  value={selection.range}
                  onChange={(e) =>
                    setSelection({ ...selection, range: e.currentTarget.value })
                  }
                >
                  {[
                    ["24h", "Last 24 hours"],
                    ["7d", "Last 7 days"],
                    ["1mo", "Last month"],
                    ["3mo", "Last 3 months"],
                    ["all", "All time"],
                    ["custom", "Custom range"],
                  ].map(([value, label]) => (
                    <option value={value}>{label}</option>
                  ))}
                </select>
              </label>
              {selection.range === "custom" && (
                <>
                  <label className="grid gap-2 text-xs text-slate-500">
                    Last
                    <input
                      aria-label="Custom time amount"
                      disabled={!!busy}
                      type="number"
                      min="1"
                      max="365"
                      className={field + " w-24"}
                      value={selection.amount}
                      onInput={(e) =>
                        setSelection({
                          ...selection,
                          amount: Number(e.currentTarget.value),
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-xs text-slate-500">
                    Unit
                    <select
                      disabled={!!busy}
                      className={field}
                      value={selection.unit}
                      onChange={(e) =>
                        setSelection({
                          ...selection,
                          unit: e.currentTarget.value,
                        })
                      }
                    >
                      {["hours", "days", "weeks", "months"].map((u) => (
                        <option>{u}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="grid gap-2 text-xs text-slate-500">
                Maximum emails
                <input
                  disabled={!!busy}
                  type="number"
                  min="1"
                  max="1000"
                  required
                  className={field + " w-28"}
                  value={selection.limit}
                  onInput={(e) =>
                    setSelection({
                      ...selection,
                      limit: Number(e.currentTarget.value),
                    })
                  }
                />
              </label>
              <button disabled={!!busy || !valid} className={button}>
                Load emails
              </button>
              {pending.length > 0 && !busy && (
                <button
                  type="button"
                  className={button}
                  onClick={() => void load(true)}
                >
                  Resume {pending.length} remaining
                </button>
              )}
              {busy && (
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    cancel.current = true;
                    setNotice("Stopping after the current request…");
                  }}
                >
                  Stop
                </button>
              )}
            </form>
            <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <p>
                {emails.length} emails loaded
                {applied ? ` · ${rangeLabel(applied)}` : ""} · Inbox only
              </p>
              <p>Up to 1,000 previews. Bodies load on demand.</p>
            </div>
            {busy && (
              <div role="status" className="mt-4">
                <div className="mb-2 flex justify-between text-xs text-blue-700">
                  <span>{busy}</span>
                  {busy.includes("inbox") && (
                    <span>
                      {loadProgress.loaded} / {loadProgress.total || "…"}
                    </span>
                  )}
                </div>
                {busy.includes("inbox") && (
                  <div
                    role="progressbar"
                    aria-label="Email loading progress"
                    aria-valuenow={loadProgress.loaded}
                    aria-valuemin={0}
                    aria-valuemax={loadProgress.total || 1}
                    className="h-1 overflow-hidden rounded bg-blue-100"
                  >
                    <div
                      className="h-full bg-blue-600"
                      style={{
                        width: `${loadProgress.total ? (loadProgress.loaded / loadProgress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        <section
          aria-label="Classification speed"
          className="mb-6 border-y border-slate-200 py-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <h2 className="text-sm font-semibold">
                {run?.active
                  ? "Jev is reading your inbox"
                  : done.length
                    ? "Your classification run"
                    : "A clear decision, measured"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {run
                  ? `${done.length} of ${run.total} classified${run.failed ? " · stopped on an error" : ""}`
                  : "Every mark is a completed email. Timings appear after classification."}
              </p>
            </div>
            <div className="flex gap-8 tabular-nums">
              <div>
                <strong className="text-2xl font-semibold">
                  {run ? elapsed.toFixed(1) : "—"}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    s
                  </span>
                </strong>
                <p className="text-xs text-slate-500">Elapsed</p>
              </div>
              <div>
                <strong className="text-2xl font-semibold">
                  {done.length ? average : "—"}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    ms
                  </span>
                </strong>
                <p className="text-xs text-slate-500">Average Jev round trip</p>
              </div>
            </div>
          </div>
          {done.length > 0 && (
            <div
              className="mt-4 flex max-h-20 flex-wrap gap-1 overflow-auto"
              aria-label={`${done.length} completed classifications`}
            >
              {done.map((d: any) => (
                <span
                  key={d.id}
                  title={`${d.ms} ms`}
                  className="h-5 w-2 rounded-sm bg-emerald-600"
                />
              ))}
            </div>
          )}
        </section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold capitalize">
            {categoryLabel(filter)}{" "}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {visible.length}
            </span>
          </h2>
          <div className="flex min-w-0 flex-wrap gap-2">
            <select
              aria-label="Filter emails"
              className={field + " lg:hidden"}
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value)}
            >
              {["All mail", "Needs reply", "Unclassified", ...categories].map(
                (c) => (
                  <option value={c}>{categoryLabel(c)}</option>
                ),
              )}
            </select>
            <input
              type="search"
              aria-label="Search emails"
              placeholder="Search your mail"
              className={field + " min-w-0 max-w-full"}
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
          </div>
        </div>
        <section
          aria-label="Inbox"
          className="grid min-h-[480px] overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-[minmax(240px,35%)_1fr]"
        >
          <div
            className={
              (detail ? "hidden md:block " : "") +
              "max-h-[760px] overflow-auto border-r border-slate-200"
            }
          >
            {visible.length ? (
              visible.map((email) => (
                <button
                  key={email.id}
                  onClick={() => {
                    setSelected(email.id);
                    setDetail(true);
                  }}
                  className={
                    "block w-full border-b border-slate-100 px-5 py-5 text-left focus-visible:outline-2 focus-visible:outline-blue-600 " +
                    (selected === email.id
                      ? "border-l-2 border-l-blue-600 bg-blue-50/70"
                      : "hover:bg-slate-50")
                  }
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold">
                      {email.from.replace(/<.*>/, "").replace(/"/g, "")}
                    </span>
                    <time className="shrink-0 text-[10px] text-slate-500">
                      {dateLabel(email.date)}
                    </time>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-medium leading-6">
                    {email.subject}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                    {email.snippet}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="rounded border border-slate-200 bg-white px-2 py-1 capitalize text-slate-600">
                      {categoryLabel(
                        email.classification?.answers.category.choice,
                      ) || "Unclassified"}
                    </span>
                    {email.classification?.answers.should_reply && (
                      <span
                        className={
                          email.classification.answers.should_reply?.noul >=
                          (email.classification?.settings?.threshold || 70) /
                            100
                            ? "text-blue-700"
                            : "text-slate-500"
                        }
                      >
                        {email.classification.answers.should_reply?.noul >=
                        (email.classification?.settings?.threshold || 70) / 100
                          ? "Reply likely needed"
                          : email.classification.answers.should_reply?.noul <=
                              1 -
                                (email.classification.settings?.threshold ||
                                  70) /
                                  100
                            ? "No reply expected"
                            : "Reply uncertain"}
                      </span>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium">
                  {emails.length
                    ? "No emails match this view"
                    : applied
                      ? "No emails in this selection"
                      : "Your inbox starts here"}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {emails.length
                    ? "Try another category or search."
                    : status.connected
                      ? "Choose a time range, then load emails."
                      : "Connect Gmail to bring your inbox into view."}
                </p>
              </div>
            )}
          </div>
          <div className={(detail ? "" : "hidden md:block ") + "min-w-0"}>
            {current ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 text-xs">
                  <button
                    className="text-blue-700 md:hidden"
                    onClick={() => setDetail(false)}
                  >
                    Back to inbox
                  </button>
                  <span className="hidden text-slate-400 md:inline">
                    Gmail message
                  </span>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700"
                    href={`https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(current.threadId)}`}
                  >
                    Open in Gmail ↗
                  </a>
                </div>
                <div className="p-6 md:p-8">
                  <h2 className="text-2xl font-semibold leading-snug tracking-tight">
                    {current.subject}
                  </h2>
                  <p className="mt-4 break-words text-xs leading-6 text-slate-500">
                    {current.from}
                    <br />
                    {current.date}
                  </p>
                  <Decisions
                    email={current}
                    busy={!!busy}
                    classify={() => void classifyEmails([current])}
                  />
                  <div className="mt-7 border-t border-slate-100 pt-6">
                    <h3 className="mb-4 text-xs font-medium text-slate-500">
                      Email content
                    </h3>
                    {current.body !== undefined ? (
                      <>
                        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 [overflow-wrap:anywhere]">
                          {current.body || "No readable text in this message."}
                        </p>
                        {current.inputTruncated && (
                          <p className="mt-4 text-xs text-amber-800">
                            Long message: showing the first 24,000 characters.
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="mb-4 text-sm leading-6 text-slate-500">
                          Full email text loads when you ask for it.
                          Classification reads it securely on the server.
                        </p>
                        <button
                          disabled={!!busy}
                          className={button}
                          onClick={() => void openBody(current)}
                        >
                          Read email
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="grid h-full min-h-80 place-items-center px-6 text-center text-sm text-slate-400">
                Select an email to see its decisions.
              </div>
            )}
          </div>
        </section>
        <footer className="flex flex-wrap justify-between gap-3 py-6 text-xs leading-5 text-slate-500">
          <span>
            Read-only Gmail · TypeSafe Jev · Powered by Jev · Public beta
          </span>
          <button className="text-blue-700" onClick={() => setPrivacy(true)}>
            Privacy & limits
          </button>
        </footer>
      </main>
      {privacy && (
        <Settings
          connected={status.connected}
          busy={!!busy}
          status={status}
          onSaved={() => setFilter("All mail")}
          close={() => setPrivacy(false)}
          disconnect={() => void removeConnection()}
          reconnect={() => void connectGmail()}
        />
      )}
    </div>
  );
}
function dateLabel(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function Decisions({
  email,
  busy,
  classify,
}: {
  email: any;
  busy: boolean;
  classify: () => void;
}) {
  const result = email.classification,
    a = result?.answers;
  return (
    <section
      aria-label="Jev decisions"
      className="mt-7 rounded-xl border border-blue-100 bg-[#f8faff] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-blue-800">
          ✧ Jev’s read on this email
        </h3>
        {result && (
          <span className="text-xs text-blue-700">{result.requestMs} ms</span>
        )}
      </div>
      {a ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-5">
            {(result.settings || defaults()).rules
              .filter((r) => r.enabled && a[r.id])
              .map((r) => {
                const probability = a[r.id].noul,
                  threshold = (result.settings?.threshold || 70) / 100;
                const label =
                  probability >= threshold
                    ? "Likely"
                    : probability <= 1 - threshold
                      ? "Unlikely"
                      : "Uncertain";
                return (
                  <div
                    key={r.id}
                    className={
                      r.id === "should_reply"
                        ? "col-span-2 border-b border-blue-100 pb-4"
                        : ""
                    }
                    title={r.instructions}
                  >
                    <p className="text-xs text-slate-500">{r.label}</p>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <strong className="text-2xl font-semibold text-blue-700">
                        {Math.round(probability * 100)}%
                      </strong>
                      <span className="text-xs">
                        {r.id === "should_reply"
                          ? label === "Likely"
                            ? "Reply likely needed"
                            : label === "Unlikely"
                              ? "No reply expected"
                              : "Reply uncertain"
                          : label}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={r.label + " probability"}
                      aria-valuenow={Math.round(probability * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-3 h-1 overflow-hidden rounded bg-blue-100"
                    >
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${probability * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="mt-3 text-[10px] text-slate-500">
            Noul · probability of yes
          </p>
          <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-blue-100 pt-4 text-xs">
            <span>
              {(result.settings || defaults()).categories.find(
                (c) => c.id === a.category.choice,
              )?.label || a.category.choice}{" "}
              · {Math.round(a.category.confidence * 100)}%
            </span>
            <span>Urgency {a.urgency.score.toFixed(1)} / 4</span>
          </div>
          {result.inputTruncated && (
            <p className="mt-3 text-xs text-amber-800">
              Classification used the first 24,000 characters.
            </p>
          )}
          <details className="mt-4 text-xs text-slate-500">
            <summary className="cursor-pointer">Raw decisions</summary>
            <pre className="mt-3 overflow-auto text-[10px]">
              {JSON.stringify(a, null, 2)}
            </pre>
          </details>
        </>
      ) : (
        <p className="my-5 text-sm leading-6 text-slate-500">
          Classify this email using your saved categories and questions.
        </p>
      )}
      <button
        disabled={busy}
        onClick={classify}
        className={button + " mt-5 text-xs"}
      >
        {a ? "Classify again" : "Classify this email"}
      </button>
      <p className="mt-4 text-[10px] leading-5 text-slate-500">
        Probabilities are guidance. Check the email before acting.
      </p>
    </section>
  );
}
