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

type BrevoConfig = {
  apiKey?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
};

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

function readConfig(env: EmailEnv = process.env): BrevoConfig {
  return {
    apiKey: cleanEnvValue(env.BREVO_API_KEY),
    fromEmail: cleanEnvValue(env.MAIL_FROM_EMAIL) ?? DEFAULT_FROM_EMAIL,
    fromName: cleanEnvValue(env.MAIL_FROM_NAME) ?? DEFAULT_FROM_NAME,
    replyTo: cleanEnvValue(env.MAIL_REPLY_TO)
  };
}

function buildBrevoPayload(input: SendEmailInput, config: BrevoConfig): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    sender: {
      email: config.fromEmail,
      name: config.fromName
    },
    to: [
      {
        email: input.to
      }
    ],
    subject: input.subject,
    htmlContent: input.html,
    textContent: textPartFor(input)
  };

  if (config.replyTo) {
    payload.replyTo = {
      email: config.replyTo
    };
  }

  return payload;
}

async function readResponseText(response: Response): Promise<string> {
  return response.text().catch(() => "");
}

function brevoErrorDetails(responseText: string): string {
  if (!responseText.trim()) {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(responseText);

    if (isRecord(parsed)) {
      const code = typeof parsed.code === "string" ? parsed.code : undefined;
      const message = typeof parsed.message === "string" ? parsed.message : undefined;
      return [code, message].filter((part): part is string => Boolean(part)).join(" ");
    }
  } catch {
    // Keep the raw response text below.
  }

  return responseText;
}

function providerMessageId(responseText: string): string | undefined {
  if (!responseText.trim()) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(responseText);
    return isRecord(parsed) && typeof parsed.messageId === "string" ? parsed.messageId : undefined;
  } catch {
    return undefined;
  }
}

export async function sendBrevoEmail(
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
    provider: "brevo",
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
    if (!config.apiKey) {
      throw new Error("Brevo API key is not configured.");
    }

    const response = await fetchImpl(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildBrevoPayload(input, config))
    });
    const responseText = await readResponseText(response);

    if (!response.ok) {
      const details = brevoErrorDetails(responseText);
      throw new Error(`Brevo rejected email with status ${response.status}${details ? `: ${details}` : ""}`);
    }

    const sentAt = now().toISOString();
    const messageId = providerMessageId(responseText);
    await doc.update({
      status: "sent",
      sentAt,
      updatedAt: sentAt,
      ...(messageId ? { providerMessageId: messageId } : {})
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
