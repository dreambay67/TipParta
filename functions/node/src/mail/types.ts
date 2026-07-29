import { adminDb } from "../firebaseAdmin.js";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult = {
  id: string;
  status: "sent" | "failed";
};

export type EmailEnv = Partial<
  Record<
    | "EMAIL_PROVIDER"
    | "BREVO_API_KEY"
    | "MAILJET_API_KEY"
    | "MAILJET_SECRET_KEY"
    | "MAIL_FROM_EMAIL"
    | "MAIL_FROM_NAME"
    | "MAIL_REPLY_TO",
    string
  >
>;

type EmailDocumentRef = {
  id: string;
  set(data: Record<string, unknown>): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
};

export type EmailDb = {
  collection(name: "emails"): {
    doc(id?: string): EmailDocumentRef;
  };
};

export type FetchImpl = typeof fetch;

export type SendEmailOptions = {
  db?: EmailDb;
  env?: EmailEnv;
  fetchImpl?: FetchImpl;
  now?: () => Date;
};

export const DEFAULT_EMAIL_DB = adminDb as unknown as EmailDb;
export const DEFAULT_FROM_EMAIL = "tipy@tipparta.fun";
export const DEFAULT_FROM_NAME = "TipParta MS 26";

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

export function cleanEnvValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function decodeCodePoint(codePoint: number, fallback: string): string {
  return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
}

function decodeHtmlEntity(match: string, entity: string): string {
  const named = HTML_ENTITIES[entity.toLowerCase()];

  if (named) {
    return named;
  }

  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return decodeCodePoint(codePoint, match);
  }

  if (entity.startsWith("#")) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return decodeCodePoint(codePoint, match);
  }

  return match;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeHtmlEntity);
}

function deriveTextFromHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<\/(p|div|h[1-6]|li|tr|table|section|article)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textPartFor(input: SendEmailInput): string {
  if (input.text?.trim()) {
    return input.text;
  }

  return deriveTextFromHtml(input.html) || input.subject;
}

export function emailErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Neznama chyba odosielania e-mailu.";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
