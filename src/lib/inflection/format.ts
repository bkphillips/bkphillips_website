import type { ShiftEvent } from "./types";

export function formatValue(v: number, unit = ""): string {
  const abs = Math.abs(v);
  const text =
    abs >= 1e6
      ? new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 }).format(v)
      : abs >= 100
        ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v)
        : new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(v);
  return unit === "USD" ? `$${text}` : text;
}

const signed = (v: number, digits = 0) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: digits })}`;

export function formatRate(rate: number, log: boolean, unit = ""): string {
  if (log) return `${signed(rate, Math.abs(rate) < 10 ? 1 : 0)}%`;
  const abs = Math.abs(rate);
  const body = formatValue(abs, unit);
  return `${rate > 0 ? "+" : rate < 0 ? "−" : ""}${body}`;
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** One plain sentence saying what the model saw at a change point. */
export function describeShift(e: ShiftEvent, unit = ""): string {
  if (e.model === "trend" && e.rateBefore !== undefined && e.rateAfter !== undefined) {
    const trend = `${formatRate(e.rateBefore, e.log, unit)} to ${formatRate(e.rateAfter, e.log, unit)} a year`;
    // A trend break can also be a sudden step; say so when the step is material.
    const jump = e.before !== 0 ? ((e.after - e.before) / Math.abs(e.before)) * 100 : 0;
    if (Math.abs(jump) >= 4) {
      return `${jump > 0 ? "Jumped" : "Dropped"} ${Math.abs(jump).toFixed(0)}%, and the trend went from ${trend}`;
    }
    return `Trend changed from ${trend}`;
  }
  const direction = e.after > e.before ? "rose" : "fell";
  const pct =
    e.before > 0 && e.after > 0 ? ` (${signed(((e.after - e.before) / e.before) * 100)}%)` : "";
  return `Typical level ${direction} from ${formatValue(e.before, unit)} to ${formatValue(e.after, unit)}${pct}`;
}
