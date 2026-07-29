import { HttpsError } from "firebase-functions/v2/https";
import { adminDb } from "./firebaseAdmin.js";

type CallableAuth = {
  uid: string;
  token: {
    email?: unknown;
    name?: unknown;
  };
};

const DEFAULT_BOOTSTRAP_ADMIN_EMAIL = "deny7571@gmail.com";

function bootstrapAdminEmail(): string {
  return (
    process.env.BOOTSTRAP_ADMIN_EMAIL ??
    process.env.ADMIN_EMAIL ??
    DEFAULT_BOOTSTRAP_ADMIN_EMAIL
  )
    .trim()
    .toLowerCase();
}

function authEmail(auth: CallableAuth): string {
  return typeof auth.token.email === "string" ? auth.token.email.trim().toLowerCase() : "";
}

function authDisplayName(auth: CallableAuth, email: string): string {
  if (typeof auth.token.name === "string" && auth.token.name.trim().length > 0) {
    return auth.token.name.trim();
  }

  return email.split("@")[0] || "Admin";
}

export async function ensureBootstrapAdminProfile(auth: CallableAuth): Promise<boolean> {
  const email = authEmail(auth);
  if (!email || email !== bootstrapAdminEmail()) {
    return false;
  }

  const playerRef = adminDb.collection("players").doc(auth.uid);
  const playerSnap = await playerRef.get();
  const player = playerSnap.data() ?? {};
  const nowIso = new Date().toISOString();
  const displayName =
    typeof player.displayName === "string" && player.displayName.trim().length > 0
      ? player.displayName
      : authDisplayName(auth, email);

  await playerRef.set(
    {
      id: auth.uid,
      email,
      displayName,
      role: "admin",
      isPlayer: true,
      status: "active",
      blocked: false,
      paymentStatus: "paid",
      registrationOrder: typeof player.registrationOrder === "number" ? player.registrationOrder : 1,
      createdAt: typeof player.createdAt === "string" ? player.createdAt : nowIso,
      updatedAt: nowIso
    },
    { merge: true }
  );

  return true;
}

export async function assertAdminAuth(auth: CallableAuth | undefined, message: string): Promise<void> {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Prihlásenie je povinné.");
  }

  const snap = await adminDb.collection("players").doc(auth.uid).get();
  if (snap.data()?.role === "admin") {
    return;
  }

  if (await ensureBootstrapAdminProfile(auth)) {
    return;
  }

  throw new HttpsError("permission-denied", message);
}
