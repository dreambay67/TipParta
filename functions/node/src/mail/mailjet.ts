import {
  cleanEnvValue,
  DEFAULT_EMAIL_DB,
  DEFAULT_FROM_EMAIL,
  DEFAULT_FROM_NAME,
  emailErrorMessage,
  isRecord,
  textPartFor,
  type EmailEnv,
  type SendEmailInput,
  type SendEmailOptions,
  type SendEmailResult
} from "./types.js";

export type { SendEmailInput, SendEmailOptions, SendEmailResult } from "./types.js";

type MailjetConfig = {
  apiKey?: string;
  secretKey?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
};

const MAILJET_SEND_URL = "https://api.mailjet.com/v3.1/send";

function readConfig(env: EmailEnv = process.env): MailjetConfig {
  return {
    apiKey: cleanEnvValue(env.MAILJET_API_KEY),
    secretKey: cleanEnvValue(env.MAILJET_SECRET_KEY),
    fromEmail: cleanEnvValue(env.MAIL_FROM_EMAIL) ?? DEFAULT_FROM_EMAIL,
    fromName: cleanEnvValue(env.MAIL_FROM_NAME) ?? DEFAULT_FROM_NAME,
    replyTo: cleanEnvValue(env.MAIL_REPLY_TO)
  };
}

function basicAuth(apiKey: string, secretKey: string): string {
  return Buffer.from(`${apiKey}:${secretKey}`, "utf8").toString("base64");
}

function buildMailjetPayload(input: SendEmailInput, config: MailjetConfig): Record<string, unknown> {
  const message: Record<string, unknown> = {
    From: {
      Email: config.fromEmail,
      Name: config.fromName
    },
    To: [
      {
        Email: input.to
      }
    ],
    Subject: input.subject,
    TextPart: textPartFor(input),
    HTMLPart: input.html
  };

  if (config.replyTo) {
    message.ReplyTo = {
      Email: config.replyTo
    };
  }

  return {
    Messages: [message]
  };
}

async function readMailjetJson(response: Response): Promise<unknown> {
  const responseText = await response.text().catch(() => "");

  if (!responseText.trim()) {
    throw new Error("Mailjet response was empty.");
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`Mailjet response was not valid JSON: ${responseText}`);
  }
}

function firstMailjetMessage(responseBody: unknown): Record<string, unknown> | undefined {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.Messages)) {
    return undefined;
  }

  const [message] = responseBody.Messages;
  return isRecord(message) ? message : undefined;
}

function formatMailjetErrors(message: Record<string, unknown> | undefined): string {
  if (!message || !Array.isArray(message.Errors)) {
    return "";
  }

  return message.Errors.map((error) => {
    if (!isRecord(error)) {
      return undefined;
    }

    const code = typeof error.ErrorCode === "string" ? error.ErrorCode : undefined;
    const text = typeof error.ErrorMessage === "string" ? error.ErrorMessage : undefined;

    return [code, text].filter((part): part is string => Boolean(part)).join(" ");
  })
    .filter((detail): detail is string => Boolean(detail))
    .join("; ");
}

function assertMailjetMessageSucceeded(responseBody: unknown): void {
  const message = firstMailjetMessage(responseBody);
  const status = typeof message?.Status === "string" ? message.Status.toLowerCase() : "unknown";

  if (status === "success") {
    return;
  }

  const details = formatMailjetErrors(message);
  throw new Error(`Mailjet message status ${status}${details ? `: ${details}` : ""}`);
}

export async function sendMailjetEmail(
  input: SendEmailInput,
  {
    db = DEFAULT_EMAIL_DB,
    env = process.env,
    fetchImpl = fetch,
    now = () => new Date()
  }: SendEmailOptions = {}
): Promise<SendEmailResult> {
  const config = readConfig(env);
  const createdAt = now().toISOString();
  const doc = db.collection("emails").doc();

  await doc.set({
    provider: "mailjet",
    recipient: input.to,
    subject: input.subject,
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    replyTo: config.replyTo ?? null
  });

  try {
    if (!config.apiKey || !config.secretKey) {
      throw new Error("Mailjet credentials are not configured.");
    }

    const response = await fetchImpl(MAILJET_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(config.apiKey, config.secretKey)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildMailjetPayload(input, config))
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw new Error(
        `Mailjet rejected email with status ${response.status}${responseText ? `: ${responseText}` : ""}`
      );
    }

    assertMailjetMessageSucceeded(await readMailjetJson(response));

    const sentAt = now().toISOString();
    await doc.update({
      status: "sent",
      sentAt,
      updatedAt: sentAt
    });

    return {
      id: doc.id,
      status: "sent"
    };
  } catch (error) {
    const failedAt = now().toISOString();
    await doc.update({
      status: "failed",
      failedAt,
      updatedAt: failedAt,
      error: emailErrorMessage(error)
    });

    return {
      id: doc.id,
      status: "failed"
    };
  }
}

export const sendEmail = sendMailjetEmail;
