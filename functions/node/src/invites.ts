type CreateInviteInput = {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
};

type BuildInviteUrlInput = {
  appBaseUrl: string;
  token: string;
};

type InviteEmailInput = {
  displayName: string;
  inviteUrl: string;
  extraMessage?: string;
};

type InviteEmailJobInput = {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  inviteUrl: string;
  createdAt: string;
  extraMessage?: string;
};

type PendingInviteDocumentsInput = {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  inviteUrl: string;
  createdBy: string;
  createdAtIso: string;
  createdAt: unknown;
  expiresAt: unknown;
};

type ExistingPlayerInput = {
  role?: unknown;
  isPlayer?: unknown;
  status?: unknown;
  blocked?: unknown;
  paymentStatus?: unknown;
  registrationOrder?: unknown;
  createdAt?: unknown;
};

type AcceptedPlayerRecordInput = {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  nowIso: string;
  registrationOrder: number;
  existingPlayer?: ExistingPlayerInput;
};

type PaymentStatus = "paid" | "unpaid";
type PlayerStatus = "active" | "blocked";

type SetPlayerPaymentStatusInput = {
  playerId: string;
  paymentStatus: PaymentStatus;
};

type SetPlayerBlockedStatusInput = {
  playerId: string;
  blocked: boolean;
};

export type PlayerPaymentStatusUpdate = {
  paymentStatus: PaymentStatus;
  updatedAt: string;
};

export type PlayerBlockedStatusUpdate = {
  blocked: boolean;
  status: PlayerStatus;
  updatedAt: string;
};

export type ResendInviteInput = {
  token: string;
  extraMessage?: string;
};

export type AcceptedPlayerRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: "admin" | "player";
  isPlayer: true;
  status: "active" | "blocked";
  blocked: boolean;
  paymentStatus: "paid" | "unpaid";
  registrationOrder: number;
  createdAt: string;
  updatedAt: string;
};

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Platný e-mail je povinný.");
  }

  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Platný e-mail je povinný.");
  }

  return email;
}

export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Meno hráča je povinné.");
  }

  const displayName = value.trim().replace(/\s+/g, " ");
  if (displayName.length === 0) {
    throw new Error("Meno hráča je povinné.");
  }

  if (displayName.length > 80) {
    throw new Error("Meno hráča môže mať najviac 80 znakov.");
  }

  return displayName;
}

function normalizeNamePart(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} je povinné.`);
  }

  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0) {
    throw new Error(`${label} je povinné.`);
  }

  if (name.length > 40) {
    throw new Error(`${label} môže mať najviac 40 znakov.`);
  }

  return name;
}

function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.split(" ");

  return {
    firstName: parts[0] ?? displayName,
    lastName: parts.slice(1).join(" ") || "-"
  };
}

function normalizePlayerId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Platné ID hráča je povinné.");
  }

  const playerId = value.trim();
  if (playerId.length === 0 || playerId.length > 128 || playerId.includes("/")) {
    throw new Error("Platné ID hráča je povinné.");
  }

  return playerId;
}

function normalizePaymentStatus(value: unknown): PaymentStatus {
  if (value !== "paid" && value !== "unpaid") {
    throw new Error("Platný platobný stav je povinný.");
  }

  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function parseCreateInviteInput(input: unknown): CreateInviteInput {
  if (!input || typeof input !== "object") {
    throw new Error("Pozvánka potrebuje e-mail a meno hráča.");
  }

  const fields = input as Record<string, unknown>;
  const email = normalizeEmail(fields.email);

  if (typeof fields.firstName === "string" || typeof fields.lastName === "string") {
    const firstName = normalizeNamePart(fields.firstName, "Meno hráča");
    const lastName = normalizeNamePart(fields.lastName, "Priezvisko hráča");

    return {
      email,
      firstName,
      lastName,
      displayName: normalizeDisplayName(`${firstName} ${lastName}`)
    };
  }

  const displayName = normalizeDisplayName(fields.displayName);

  return {
    email,
    ...splitDisplayName(displayName),
    displayName
  };
}

export function parseAcceptInviteInput(input: unknown): {
  token: string;
} {
  if (!input || typeof input !== "object") {
    throw new Error("Pozvánka potrebuje platný token.");
  }

  const fields = input as Record<string, unknown>;
  if (typeof fields.token !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(fields.token)) {
    throw new Error("Pozvánka potrebuje platný token.");
  }

  return { token: fields.token };
}

export function parseResendInviteInput(input: unknown): ResendInviteInput {
  if (!input || typeof input !== "object") {
    throw new Error("Opätovné odoslanie potrebuje platný token.");
  }

  const fields = input as Record<string, unknown>;
  if (typeof fields.token !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(fields.token)) {
    throw new Error("Opätovné odoslanie potrebuje platný token.");
  }

  const extraMessage =
    typeof fields.extraMessage === "string" && fields.extraMessage.trim().length > 0
      ? fields.extraMessage.trim().replace(/\s+/g, " ").slice(0, 500)
      : undefined;

  return {
    token: fields.token,
    extraMessage
  };
}

export function parseSetPlayerPaymentStatusInput(input: unknown): SetPlayerPaymentStatusInput {
  if (!input || typeof input !== "object") {
    throw new Error("Zmena platby potrebuje ID hráča a stav platby.");
  }

  const fields = input as Record<string, unknown>;

  return {
    playerId: normalizePlayerId(fields.playerId),
    paymentStatus: normalizePaymentStatus(fields.paymentStatus)
  };
}

export function parseSetPlayerBlockedStatusInput(input: unknown): SetPlayerBlockedStatusInput {
  if (!input || typeof input !== "object") {
    throw new Error("Zmena prístupu potrebuje ID hráča a stav prístupu.");
  }

  const fields = input as Record<string, unknown>;
  if (typeof fields.blocked !== "boolean") {
    throw new Error("Stav blokovania musí byť áno alebo nie.");
  }

  return {
    playerId: normalizePlayerId(fields.playerId),
    blocked: fields.blocked
  };
}

export function buildPlayerPaymentStatusUpdate(
  paymentStatus: PaymentStatus,
  updatedAt: string
): PlayerPaymentStatusUpdate {
  return {
    paymentStatus,
    updatedAt
  };
}

export function buildPlayerBlockedStatusUpdate(
  blocked: boolean,
  updatedAt: string
): PlayerBlockedStatusUpdate {
  return {
    blocked,
    status: blocked ? "blocked" : "active",
    updatedAt
  };
}

export function buildInviteUrl({ appBaseUrl, token }: BuildInviteUrlInput): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/pozvanka?token=${encodeURIComponent(token)}`;
}

export function buildInviteEmail({ displayName, inviteUrl, extraMessage }: InviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(inviteUrl);
  const safeExtraMessage =
    typeof extraMessage === "string" && extraMessage.trim().length > 0
      ? escapeHtml(extraMessage.trim())
      : "";

  return {
    subject: "Pozvánka do TipParta MS 26",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #101820;">
        <h1 style="margin: 0 0 16px;">TipParta MS 26</h1>
        <p>Ahoj ${safeName},</p>
        <p>partia ťa pozýva do súkromnej tipovačky TipParta MS 26.</p>
        <p>Po otvorení odkazu si nastavíš heslo. Meno a e-mail už budú pripravené, aby sa v tabuľkách nič nemiešalo.</p>
        <p>V aplikácii nájdeš denné tikety, dlhodobé tipy, prehľady tipov, výsledky, rebríčky a odznaky. Prvýkrát sa prihlás ešte pred uzávierkou prvého tiketu, do ktorého chceš tipovať.</p>
        ${
          safeExtraMessage
            ? `<p style="border-left: 4px solid #ffdd45; padding-left: 12px;"><strong>Odkaz od admina:</strong><br>${safeExtraMessage}</p>`
            : ""
        }
        <p>
          <a href="${safeUrl}" style="display: inline-block; background: #111820; color: #ffdd45; padding: 12px 16px; text-decoration: none; font-weight: bold;">
            Vytvoriť účet
          </a>
        </p>
        <p>Ak tlačidlo nefunguje, otvor tento odkaz: ${safeUrl}</p>
      </div>
    `,
    text: [
      `Ahoj ${displayName},`,
      "partia ťa pozýva do súkromnej tipovačky TipParta MS 26.",
      "Po otvorení odkazu si nastavíš heslo. Meno a e-mail už budú pripravené, aby sa v tabuľkách nič nemiešalo.",
      "V aplikácii nájdeš denné tikety, dlhodobé tipy, prehľady tipov, výsledky, rebríčky a odznaky. Prvýkrát sa prihlás ešte pred uzávierkou prvého tiketu, do ktorého chceš tipovať.",
      ...(extraMessage ? ["", `Odkaz od admina: ${extraMessage}`] : []),
      "",
      "Vytvoriť účet:",
      inviteUrl
    ].join("\n")
  };
}

export function buildInviteEmailJob({
  token,
  email,
  firstName,
  lastName,
  displayName,
  inviteUrl,
  createdAt,
  extraMessage
}: InviteEmailJobInput): {
  id: string;
  data: Record<string, unknown>;
} {
  return {
    id: `invite_${token}`,
    data: {
      type: "invite",
      status: "queued",
      inviteToken: token,
      email,
      firstName,
      lastName,
      displayName,
      inviteUrl,
      ...(extraMessage ? { extraMessage } : {}),
      createdAt,
      updatedAt: createdAt
    }
  };
}

export function buildReinviteEmailJob(input: InviteEmailJobInput): {
  id: string;
  data: Record<string, unknown>;
} {
  const suffix = input.createdAt.replace(/[^0-9A-Za-z]+/g, "-").replace(/-+$/g, "");
  const baseJob = buildInviteEmailJob(input);

  return {
    id: `invite_${input.token}_${suffix}`,
    data: baseJob.data
  };
}

export function buildPendingInviteDocuments({
  token,
  email,
  firstName,
  lastName,
  displayName,
  inviteUrl,
  createdBy,
  createdAtIso,
  createdAt,
  expiresAt
}: PendingInviteDocumentsInput): {
  invite: Record<string, unknown>;
  emailJob: {
    id: string;
    data: Record<string, unknown>;
  };
} {
  return {
    invite: {
      token,
      email,
      firstName,
      lastName,
      displayName,
      inviteUrl,
      status: "pending",
      acceptedAt: null,
      acceptedBy: null,
      createdBy,
      createdAt,
      expiresAt
    },
    emailJob: buildInviteEmailJob({
      token,
      email,
      firstName,
      lastName,
      displayName,
      inviteUrl,
      createdAt: createdAtIso
    })
  };
}

export function buildAcceptedPlayerRecord({
  uid,
  email,
  firstName,
  lastName,
  displayName,
  nowIso,
  registrationOrder,
  existingPlayer
}: AcceptedPlayerRecordInput): AcceptedPlayerRecord {
  const existingOrder =
    typeof existingPlayer?.registrationOrder === "number"
      ? existingPlayer.registrationOrder
      : undefined;

  const status = existingPlayer?.status === "blocked" ? "blocked" : "active";
  const blocked =
    typeof existingPlayer?.blocked === "boolean" ? existingPlayer.blocked : status === "blocked";

  return {
    id: uid,
    email,
    firstName: normalizeNamePart(firstName, "Meno hráča"),
    lastName: normalizeNamePart(lastName, "Priezvisko hráča"),
    displayName: normalizeDisplayName(displayName),
    role: existingPlayer?.role === "admin" ? "admin" : "player",
    isPlayer: true,
    status,
    blocked,
    paymentStatus: existingPlayer?.paymentStatus === "paid" ? "paid" : "unpaid",
    registrationOrder: existingOrder ?? registrationOrder,
    createdAt: typeof existingPlayer?.createdAt === "string" ? existingPlayer.createdAt : nowIso,
    updatedAt: nowIso
  };
}
