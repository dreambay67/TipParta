import { defineSecret, type SecretParam } from "firebase-functions/params";

export const apiFootballKeySecret = defineSecret("API_FOOTBALL_KEY");
export const footballDataApiKeySecret = defineSecret("FOOTBALL_DATA_API_KEY");
export const sportsDataApiKeySecret = defineSecret("SPORTS_DATA_API_KEY");
export const settlementWorkerUrlSecret = defineSecret("SETTLEMENT_WORKER_URL");
export const settlementWorkerTokenSecret = defineSecret("SETTLEMENT_WORKER_TOKEN");
export const brevoApiKeySecret = defineSecret("BREVO_API_KEY");
export const mailjetApiKeySecret = defineSecret("MAILJET_API_KEY");
export const mailjetSecretKeySecret = defineSecret("MAILJET_SECRET_KEY");
export const openRouterApiKeySecret = defineSecret("OPENROUTER_API_KEY");

export const sportsDataSecrets = [
  apiFootballKeySecret,
  footballDataApiKeySecret,
  sportsDataApiKeySecret
];

export const resultImportSecrets = [
  ...sportsDataSecrets,
  settlementWorkerUrlSecret,
  settlementWorkerTokenSecret
];

export const emailProviderSecrets = [brevoApiKeySecret, mailjetApiKeySecret, mailjetSecretKeySecret];
export const mailjetSecrets = [mailjetApiKeySecret, mailjetSecretKeySecret];
export const aiProviderSecrets = [openRouterApiKeySecret];

export function secretValue(secret: SecretParam, envName: string): string | undefined {
  try {
    const value = secret.value();
    if (value) {
      return value;
    }
  } catch {
    // Local tests and non-Firebase runtimes can use process.env fallback.
  }

  return process.env[envName];
}
