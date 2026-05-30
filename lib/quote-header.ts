// Builds the default reply/forward quote header and runs it through the
// emailHooks.onBuildQuoteHeader transform so plugins can replace it (e.g.
// with an Outlook-style From/Sent/To/Cc/Subject block).
//
// This module is the single source of truth for the default header strings -
// the composer keeps the same defaults inline as a fallback, but production
// flow goes through here.

import { formatDateTime } from "@/lib/utils";
import { emailHooks } from "@/lib/plugin-hooks";
import type { QuoteHeader, QuoteHeaderContext } from "@/lib/plugin-types";

// Localized label set the caller passes in. Labels live on the client where
// useTranslations is available; this module stays framework-agnostic.
export interface QuoteHeaderLabels {
  /** ICU-formatted reply line, e.g. "On {date}, {from} wrote:" with placeholders already substituted. */
  formatReplyLine: (vars: { date: string; from: string }) => string;
  forwardedSeparator: string;
  fromLabel: string;
  dateLabel: string;
  subjectLabel: string;
}

interface BuildArgs {
  mode: "reply" | "replyAll" | "forward";
  email: {
    from?: { email?: string; name?: string }[];
    to?: { email?: string; name?: string }[];
    cc?: { email?: string; name?: string }[];
    subject?: string;
    receivedAt?: string;
  };
  newTo: string[];
  newCc: string[];
  locale: string;
  timeFormat: "12h" | "24h";
  unknownLabel: string;
  /**
   * Localized labels. Optional for backward compatibility; falls back to
   * English (matching the original hardcoded behaviour) when not supplied.
   */
  labels?: QuoteHeaderLabels;
}

const DEFAULT_LABELS: QuoteHeaderLabels = {
  formatReplyLine: ({ date, from }) => `On ${date}, ${from} wrote:`,
  forwardedSeparator: "---------- Forwarded message ----------",
  fromLabel: "From",
  dateLabel: "Date",
  subjectLabel: "Subject",
};

function defaultHeader(args: BuildArgs): QuoteHeader {
  const { mode, email, timeFormat, unknownLabel } = args;
  const labels = args.labels ?? DEFAULT_LABELS;
  const date = email.receivedAt
    ? formatDateTime(email.receivedAt, timeFormat, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";
  const from = email.from?.[0];
  const fromStr = from ? `${from.name || from.email}` : unknownLabel;
  // Forward header "From:" shows the full sender incl. address ("Name
  // <email>"), like every mail client. The reply line keeps the bare name
  // (reads more naturally in "On … wrote:").
  const fromStrFull = from
    ? (from.name && from.email && from.name !== from.email
        ? `${from.name} <${from.email}>`
        : (from.email || from.name || unknownLabel))
    : unknownLabel;
  const subject = email.subject || "";

  if (mode === "forward") {
    const text = `${labels.forwardedSeparator}\n${labels.fromLabel}: ${fromStrFull}\n${labels.dateLabel}: ${date}\n${labels.subjectLabel}: ${subject}\n`;
    const html = `<div>${labels.forwardedSeparator}<br>${labels.fromLabel}: ${fromStrFull}<br>${labels.dateLabel}: ${date}<br>${labels.subjectLabel}: ${subject}<br><br></div>`;
    return { html, text, wrapInBlockquote: false };
  }

  const replyLine = labels.formatReplyLine({ date, from: fromStr });
  const text = `${replyLine}\n`;
  const html = `<div>${replyLine}<br></div>`;
  return { html, text, wrapInBlockquote: true };
}

export async function buildQuoteHeader(args: BuildArgs): Promise<QuoteHeader> {
  const def = defaultHeader(args);
  const ctx: QuoteHeaderContext = {
    mode: args.mode,
    newTo: args.newTo,
    newCc: args.newCc,
    from: args.email.from?.[0]?.email
      ? { name: args.email.from[0].name, email: args.email.from[0].email }
      : null,
    to: (args.email.to ?? [])
      .filter((r): r is { email: string; name?: string } => !!r.email)
      .map((r) => ({ name: r.name, email: r.email })),
    cc: (args.email.cc ?? [])
      .filter((r): r is { email: string; name?: string } => !!r.email)
      .map((r) => ({ name: r.name, email: r.email })),
    subject: args.email.subject ?? "",
    date: args.email.receivedAt
      ? formatDateTime(args.email.receivedAt, args.timeFormat, {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "",
    receivedAt: args.email.receivedAt,
    locale: args.locale,
  };
  return emailHooks.onBuildQuoteHeader.transform<QuoteHeader>(def, ctx);
}
