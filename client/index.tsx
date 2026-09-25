import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  canAccessApp,
  createClient,
  retryAuth,
  SignInWithGoogle,
  signOut,
  useAuth,
} from "lakebed/client";
import type app from "../server/index";
import { categories, verdict } from "../shared/email";
import { parseSelection, rangeLabel } from "../shared/mail-selection";
const callback =
  location.pathname === "/gmail-connected"
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
  const auth = useAuth();
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
                A private Gmail pilot. Jev classifies your emails with
                probabilities you can inspect.
              </p>
            </section>
            <section className="self-center rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight">
                Your private workspace
              </h2>
              <p className="mb-6 mt-3 text-sm leading-6 text-slate-600">
                Sign in with the owner account. You’ll connect Gmail separately
                and choose which emails to classify.
              </p>
              {auth.error && (
                <p role="alert" className="mb-4 text-sm text-red-700">
                  {auth.error}
                </p>
              )}
              <SignInWithGoogle className={primary} />
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
                <li>No email bodies stored in the hosted database.</li>
                <li>
                  Classification sends selected email text to OpenRouter and
                  TypeSafe.
                </li>
              </ul>
              <p className="mt-6 text-xs leading-5 text-slate-500">
                Hosted on Lakebed’s public alpha. This is a pilot, not a
                production service.
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
    if (status?.needsEnrollment && !enrolling.current) {
      enrolling.current = true;
      enroll().catch(() => {
        setError("Could not activate this private workspace. Reload to retry.");
      });
    }
  }, [status?.needsEnrollment]);
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
          ? a?.should_reply.noul >= 0.7
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
  const targets = emails.filter((e) => !e.classification);
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
          This is a private workspace.
        </h1>
        <p className="my-5 text-slate-600">
          Sign in with the account invited to this Mailroom pilot.
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
          {status.email || "Your private workspace"}
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
              {f}
              <span className="text-xs">
                {f === "All mail"
                  ? emails.length
                  : f === "Unclassified"
                    ? targets.length
                    : emails.filter(
                        (e) =>
                          e.classification?.answers.should_reply.noul >= 0.7,
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
              {f}
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
          <p className="px-3 pt-2 text-xs text-slate-400">Lakebed pilot</p>
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
            available when the pilot is configured.
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
            {filter}{" "}
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
                  <option>{c}</option>
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
                      {email.classification?.answers.category.choice ||
                        "Unclassified"}
                    </span>
                    {email.classification && (
                      <span
                        className={
                          email.classification.answers.should_reply.noul >= 0.7
                            ? "text-blue-700"
                            : "text-slate-500"
                        }
                      >
                        {email.classification.answers.should_reply.noul >= 0.7
                          ? "Reply likely needed"
                          : email.classification.answers.should_reply.noul <=
                              0.3
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
          <span>Read-only Gmail · TypeSafe Jev · Lakebed alpha pilot</span>
          <button className="text-blue-700" onClick={() => setPrivacy(true)}>
            Privacy & limits
          </button>
        </footer>
      </main>
      {privacy && (
        <Privacy
          connected={status.connected}
          busy={!!busy}
          remaining={status.remaining}
          close={() => setPrivacy(false)}
          disconnect={() => void removeConnection()}
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
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">Should I reply?</p>
              <p className="mt-2 text-sm font-semibold">
                {a.should_reply.noul >= 0.7
                  ? "Reply likely needed"
                  : a.should_reply.noul <= 0.3
                    ? "No reply expected"
                    : "Uncertain — review this email"}
              </p>
            </div>
            <strong className="text-3xl font-semibold text-blue-700">
              {Math.round(a.should_reply.noul * 100)}%
            </strong>
          </div>
          <p className="mt-2 text-right text-[10px] text-slate-500">
            Noul · probability of yes
          </p>
          <div
            role="progressbar"
            aria-label="Reply probability"
            aria-valuenow={Math.round(a.should_reply.noul * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-1 overflow-hidden rounded bg-blue-100"
          >
            <div
              className="h-full bg-blue-600"
              style={{ width: `${a.should_reply.noul * 100}%` }}
            />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-5 xl:grid-cols-4">
            {[
              ["is_spam", "Spam"],
              ["is_phishing", "Phishing"],
              ["action_required", "Action required"],
              ["has_deadline", "Personal deadline"],
            ].map(([key, label]) => (
              <div
                title={
                  key === "has_deadline"
                    ? "An explicit due time for something you are expected to do. Sale expiry and newsletter dates do not count."
                    : `${label}: probability of yes`
                }
              >
                <p className="text-[11px] text-slate-500">{label}</p>
                <strong className="mt-2 block text-lg font-medium">
                  {Math.round(a[key].noul * 100)}%
                </strong>
                <p className="mt-1 text-[10px] text-slate-500">
                  {verdict(a[key].noul)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-blue-100 pt-4 text-xs">
            <span className="capitalize">
              {a.category.choice} · {Math.round(a.category.confidence * 100)}%
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
          Classify this email to see reply, spam, category and deadline
          probabilities.
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
function Privacy({ close, connected, busy, disconnect, remaining }: any) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href]",
          ) || [],
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-900/35 p-4"
      onClick={close}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        onClick={(e) => e.stopPropagation()}
        className="my-auto max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-7 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="privacy-title" className="text-xl font-semibold">
            Connection & privacy
          </h2>
          <button className="p-2" aria-label="Close settings" onClick={close}>
            ×
          </button>
        </div>
        <div className="mt-5 space-y-4 text-sm leading-6 text-slate-600">
          <p>
            Mailroom can read your Gmail inbox. It cannot send replies, delete
            messages, or change labels.
          </p>
          <p>
            When you classify an email, its sender, subject, date and up to
            24,000 characters of cleaned text are sent to OpenRouter and
            TypeSafe Jev. Classification uses your configured OpenRouter account
            and credits.
          </p>
          <p>
            Email content and decisions stay in this tab’s memory and clear when
            you reload or sign out. The hosted database stores your account ID
            and encrypted Gmail tokens. Disconnect deletes those tokens; you can
            also revoke access in your Google account.
          </p>
          <p>
            This Lakebed alpha pilot has a 700-call daily app budget, with{" "}
            {remaining ?? "—"} calls remaining. Each call may load five previews
            or classify one email. The platform also has daily limits. Work
            pauses safely when a limit is reached.
          </p>
          <p className="text-xs">
            Lakebed’s platform is not production-ready. Hosted data may be
            retained in platform backups or operational records.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {connected && (
            <button disabled={busy} className={button} onClick={disconnect}>
              Disconnect Gmail
            </button>
          )}
          <button
            disabled={busy}
            className={button}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
          <a
            className={button}
            rel="noopener noreferrer"
            target="_blank"
            href="https://myaccount.google.com/connections"
          >
            Google access settings ↗
          </a>
        </div>
      </section>
    </div>
  );
}
