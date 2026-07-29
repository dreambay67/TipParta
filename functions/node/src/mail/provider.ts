import { sendBrevoEmail } from "./brevo.js";
import { sendMailjetEmail } from "./mailjet.js";
import { cleanEnvValue, type EmailEnv, type SendEmailInput, type SendEmailOptions, type SendEmailResult } from "./types.js";

export type { EmailEnv, SendEmailInput, SendEmailOptions, SendEmailResult } from "./types.js";

type EmailProvider = "brevo" | "mailjet";

const DEFAULT_EMAIL_PROVIDER: EmailProvider = "brevo";

function selectedEmailProvider(env: EmailEnv = process.env): EmailProvider {
  const provider = cleanEnvValue(env.EMAIL_PROVIDER)?.toLowerCase();

  if (!provider) {
    return DEFAULT_EMAIL_PROVIDER;
  }

  if (provider === "brevo" || provider === "mailjet") {
    return provider;
  }

  throw new Error(`Unknown email provider "${provider}". Use "brevo" or "mailjet".`);
}

export async function sendEmail(
  input: SendEmailInput,
  options: SendEmailOptions = {}
): Promise<SendEmailResult> {
  const provider = selectedEmailProvider(options.env ?? process.env);
  return provider === "mailjet" ? sendMailjetEmail(input, options) : sendBrevoEmail(input, options);
}
