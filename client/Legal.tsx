export function Legal({ page }: { page: string }) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-700">
      <a href="/" className="text-sm font-semibold text-blue-700">
        ← Mailroom · Powered by Jev
      </a>
      <h1 className="mb-8 mt-10 text-3xl font-semibold tracking-tight">
        {page === "privacy" ? "Privacy notice" : "Terms of use"}
      </h1>
      <div className="space-y-6 text-sm leading-7">
        {page === "privacy" ? (
          <>
            <p>
              Mailroom is a public beta that helps you classify your Gmail
              inbox. This notice describes the app’s data use.
            </p>
            <h2 className="text-lg font-semibold">What we store</h2>
            <p>
              Your signed-in account identifier, Gmail address, classification
              settings and usage counters are stored on Lakebed. Gmail OAuth
              credentials and your OpenRouter API key are encrypted on the
              server. Keys are not returned to the browser after saving.
              Mailroom does not store email bodies, subjects, previews or
              classification results in its hosted database; those remain in the
              current tab and clear when it closes or reloads.
            </p>
            <h2 className="text-lg font-semibold">When email is shared</h2>
            <p>
              When you load or open mail, the server retrieves it from Gmail.
              When you explicitly classify a message or batch, Mailroom sends
              the sender, subject, date, your Gmail address and up to 24,000
              characters of cleaned message text to OpenRouter and TypeSafe Jev,
              together with your classification instructions. Your own
              OpenRouter key pays for these requests. We do not use email
              content for advertising or sell it.
            </p>
            <p>
              Mailroom’s use and transfer of information received from Google
              APIs follows the{" "}
              <a
                className="text-blue-700 underline"
                href="https://developers.google.com/terms/api-services-user-data-policy"
              >
                Google API Services User Data Policy
              </a>
              , including its Limited Use requirements. Classification supports
              your direct use of the app; Mailroom does not use this data to
              train general-purpose AI models.
            </p>
            <h2 className="text-lg font-semibold">Your controls</h2>
            <p>
              Gmail access is read-only. You can disconnect Gmail, remove your
              OpenRouter key, change classification settings, or delete your
              Mailroom account in Settings. Disconnect removes stored Gmail
              credentials. Removing the API key deletes that saved key. Account
              deletion deletes the app account row, credentials and settings.
              Sign-out clears access in the current browser, but does not delete
              saved settings.
            </p>
            <p>
              You can also revoke access through{" "}
              <a
                className="text-blue-700 underline"
                href="https://myaccount.google.com/connections"
              >
                Google Account connections
              </a>{" "}
              and{" "}
              <a
                className="text-blue-700 underline"
                href="https://openrouter.ai/settings/keys"
              >
                OpenRouter key settings
              </a>
              . Platform backups and provider operational records may have
              separate retention periods.
            </p>
            <h2 className="text-lg font-semibold">Privacy contact</h2>
            <p>For privacy and data-protection matters only, contact <a className="text-blue-700 underline" href="mailto:svilen.petrov97@gmail.com">svilen.petrov97@gmail.com</a>. Technical support is not provided.</p>
            <h2 className="text-lg font-semibold">Service providers</h2>
            <p>
              Hosting and sign-in use Lakebed; mail access uses Google;
              classification uses OpenRouter and TypeSafe. Their own privacy and
              retention policies also apply. Essential authentication storage
              keeps you signed in. The app does not add advertising analytics or
              load tracking images from your emails.
            </p>
          </>
        ) : (
          <>
            <p>
              Mailroom is a public beta powered by Jev and hosted on Lakebed’s
              alpha infrastructure. Availability, persistence and capacity are
              limited, and service can change or be interrupted.
            </p>
            <p>
              You must use an account and API key you are authorized to use.
              OpenRouter charges your account for classification. You are
              responsible for your provider limits and credits. Mailroom does
              not supply a shared classification key.
            </p>
            <p>
              Classification probabilities are assistance, not guarantees.
              Review the underlying email before acting, especially for
              deadlines, phishing and financial requests. Mailroom does not send
              replies or alter your mailbox.
            </p>
            <p>
              Use the app lawfully, respect other people’s privacy, and do not
              attempt to access other accounts or evade service limits. You can
              stop using the app and delete your saved account data in Settings.
            </p>
          </>
        )}
        <p>Mailroom is free, <a className="text-blue-700 underline" href="https://github.com/waLLxAck/mailroom">open-source software</a>, provided without warranty or technical support. Mailroom charges no fees; any OpenRouter usage charges are paid through your own account.</p>
        <p className="border-t border-slate-200 pt-6 text-xs text-slate-500">
          Last updated September 25, 2026. Public Gmail availability remains
          subject to Google’s verification and account policies.
        </p>
      </div>
    </main>
  );
}
