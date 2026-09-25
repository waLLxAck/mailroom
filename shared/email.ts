export const categories = [
  "work",
  "personal",
  "finance",
  "newsletter",
  "marketing",
  "promotion",
  "notification",
  "event",
  "other",
];
export const cleanText = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^(?:View image|Follow image link|Caption):?\s*$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
export const verdict = (p: number) =>
  p >= 0.7 ? "Likely" : p <= 0.3 ? "Unlikely" : "Uncertain";
export function validateAnswers(input: any) {
  const p = (v: any) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  for (const name of [
    "should_reply",
    "is_spam",
    "is_phishing",
    "action_required",
    "has_deadline",
  ])
    if (input?.[name]?.type !== "noul" || !p(input[name].noul))
      throw new Error("Jev returned an invalid decision.");
  if (
    input?.category?.type !== "choice" ||
    !categories.includes(input.category.choice) ||
    !p(input.category.confidence)
  )
    throw new Error("Jev returned an invalid category.");
  if (
    input?.urgency?.type !== "score" ||
    !Number.isFinite(input.urgency.score) ||
    input.urgency.score < 0 ||
    input.urgency.score > 4
  )
    throw new Error("Jev returned invalid urgency.");
  // Only retain validated values; never render or store arbitrary provider content.
  return Object.fromEntries([
    ...[
      "should_reply",
      "is_spam",
      "is_phishing",
      "action_required",
      "has_deadline",
    ].map((n) => [n, { type: "noul", noul: input[n].noul }]),
    [
      "category",
      {
        type: "choice",
        choice: input.category.choice,
        confidence: input.category.confidence,
      },
    ],
    ["urgency", { type: "score", score: input.urgency.score }],
  ]);
}
export function selectionLimit(value: any) {
  if (!Number.isInteger(value) || value < 1 || value > 1000)
    throw new Error("Choose 1–1,000 emails.");
  return value;
}
export function messageId(value: any) {
  if (typeof value !== "string" || !/^[a-f0-9]{8,40}$/.test(value))
    throw new Error("Invalid Gmail message.");
  return value;
}
