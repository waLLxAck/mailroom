// @ts-nocheck
export const ranges = [
  { value: "all", label: "Any time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "1mo", label: "Last month" },
  { value: "3mo", label: "Last 3 months" },
  { value: "custom", label: "Custom period" },
];
export const defaultSelection = {
  range: "all",
  limit: 100,
  amount: 14,
  unit: "days",
};
export function parseSelection(input = {}) {
  const range = input.range ?? defaultSelection.range;
  const number = (value, fallback, max, label) => {
    if (value === undefined) value = fallback;
    if (typeof value !== "number" && typeof value !== "string")
      throw new Error(`${label} must be a whole number between 1 and ${max}.`);
    if (
      String(value).trim() === "" ||
      !Number.isInteger(Number(value)) ||
      Number(value) < 1 ||
      Number(value) > max
    )
      throw new Error(`${label} must be a whole number between 1 and ${max}.`);
    return Number(value);
  };
  if (!ranges.some((r) => r.value === range))
    throw new Error("Choose a supported time range.");
  const limit = number(input.limit, 100, 1000, "Email count");
  const amount =
    range === "custom"
      ? number(input.amount, 14, 365, "Time period")
      : defaultSelection.amount;
  const unit =
    range === "custom" ? (input.unit ?? "days") : defaultSelection.unit;
  if (!["hours", "days", "weeks", "months"].includes(unit))
    throw new Error("Choose hours, days, weeks or months.");
  return { range, limit, amount, unit };
}
export function rangeLabel(s) {
  return s.range === "custom"
    ? `Last ${s.amount} ${s.unit}`
    : ranges.find((r) => r.value === s.range)?.label || "Any time";
}
export function queryForSelection(selection, now = new Date()) {
  const s = parseSelection(selection);
  if (s.range === "all") return "";
  let amount, unit;
  if (s.range === "24h") {
    amount = 24;
    unit = "hours";
  } else if (s.range === "7d") {
    amount = 7;
    unit = "days";
  } else if (s.range === "1mo" || s.range === "3mo") {
    amount = s.range === "1mo" ? 1 : 3;
    unit = "months";
  } else {
    amount = s.amount;
    unit = s.unit;
  }
  let cutoff;
  if (unit === "months") {
    cutoff = new Date(now);
    const day = cutoff.getUTCDate();
    cutoff.setUTCDate(1);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - amount);
    const lastDay = new Date(
      Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
    ).getUTCDate();
    cutoff.setUTCDate(Math.min(day, lastDay));
  } else
    cutoff = new Date(
      now.getTime() -
        amount * { hours: 3600000, days: 86400000, weeks: 604800000 }[unit],
    );
  return `after:${Math.floor(cutoff.getTime() / 1000)}`;
}
