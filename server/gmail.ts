import { decode } from "./crypto";
import { cleanText } from "../shared/email";
export class ProviderError extends Error {
  constructor(
    message: string,
    public code = "provider",
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}
export async function fetchJson(
  url: string,
  options: RequestInit = {},
  budget = 3000,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(budget),
    });
  } catch {
    throw new ProviderError(
      "The provider took too long. Try again.",
      "timeout",
      2000,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason;
    if (
      response.status === 429 ||
      ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(
        reason,
      )
    )
      throw new ProviderError(
        "Gmail is limiting requests. Your loaded emails are still here.",
        "rate_limit",
        Math.max(
          5000,
          Math.min(
            120000,
            Number(response.headers.get("retry-after") || 5) * 1000,
          ),
        ),
      );
    if (response.status === 401 || data.error === "invalid_grant")
      throw new ProviderError(
        "Your Gmail connection has expired. Reconnect Gmail.",
        "reconnect",
      );
    throw new ProviderError(
      `The provider could not complete this request (${response.status}).`,
    );
  }
  return data;
}
export function metadata(data: any) {
  const h = Object.fromEntries(
    (data.payload?.headers || []).map((x: any) => [
      x.name.toLowerCase(),
      x.value,
    ]),
  );
  return {
    id: data.id,
    threadId: data.threadId,
    from: (h.from || "Unknown sender").slice(0, 500),
    subject: (h.subject || "(No subject)").slice(0, 1000),
    date: h.date || "",
    snippet: (data.snippet || "").slice(0, 500),
    unread: data.labelIds?.includes("UNREAD") || false,
  };
}
export function emailBody(data: any) {
  const plain: string[] = [],
    html: string[] = [];
  function walk(part: any, depth = 0) {
    if (!part || depth > 20 || part.filename) return;
    if (part.body?.data) {
      const s = new TextDecoder().decode(decode(part.body.data));
      if (part.mimeType === "text/plain") plain.push(s);
      else if (part.mimeType === "text/html") html.push(s);
    }
    for (const child of part.parts || []) walk(child, depth + 1);
  }
  walk(data.payload);
  // HTML is converted to inert text. It is never inserted into the DOM as markup.
  const raw = plain.length
    ? plain.join("\n")
    : html
        .join("\n")
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<\/(p|div|li|tr)>|<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
  const body = cleanText(raw || data.snippet || "");
  return { body: body.slice(0, 24000), inputTruncated: body.length > 24000 };
}
