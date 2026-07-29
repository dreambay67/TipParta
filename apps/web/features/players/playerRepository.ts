'use client';

import type { Player, PaymentStatus } from "@tipparta/shared";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db } from "@/lib/firebase/client";
import { functions } from "@/lib/firebase/functions";

export type PlayerDocument = Player & {
  blocked?: boolean;
  paymentQrUrl?: string | null;
  paymentLinkUrl?: string | null;
};

export type InvitePreview = {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  status: string;
  expiresAt: string | null;
};

export type CreatedInvite = {
  token: string;
  inviteUrl: string;
};

type CreateInviteInput = {
  email: string;
  firstName: string;
  lastName: string;
};

type AcceptInviteInput = {
  token: string;
};

type ResendInviteInput = {
  token: string;
  extraMessage?: string;
};

type SetPlayerPaymentStatusInput = {
  playerId: string;
  paymentStatus: PaymentStatus;
};

type SetPlayerBlockedStatusInput = {
  playerId: string;
  blocked: boolean;
};

function playerFromData(id: string, data: Record<string, unknown>): PlayerDocument {
  return {
    id,
    email: typeof data.email === "string" ? data.email : "",
    displayName: typeof data.displayName === "string" ? data.displayName : "Hráč",
    role: data.role === "admin" ? "admin" : "player",
    isPlayer: data.isPlayer === true,
    status: data.status === "blocked" ? "blocked" : "active",
    blocked: typeof data.blocked === "boolean" ? data.blocked : data.status === "blocked",
    paymentStatus: data.paymentStatus === "paid" ? "paid" : "unpaid",
    registrationOrder:
      typeof data.registrationOrder === "number" && Number.isFinite(data.registrationOrder)
        ? data.registrationOrder
        : 9999,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    paymentQrUrl: typeof data.paymentQrUrl === "string" ? data.paymentQrUrl : null,
    paymentLinkUrl: typeof data.paymentLinkUrl === "string" ? data.paymentLinkUrl : null
  };
}

export async function getPlayer(playerId: string): Promise<PlayerDocument | null> {
  const snap = await getDoc(doc(db, "players", playerId));
  return snap.exists() ? playerFromData(snap.id, snap.data()) : null;
}

export async function getCurrentPlayer(user: User | null = auth.currentUser): Promise<PlayerDocument | null> {
  return user ? getPlayer(user.uid) : null;
}

export async function listPlayers(): Promise<PlayerDocument[]> {
  const snap = await getDocs(query(collection(db, "players"), orderBy("registrationOrder", "asc")));
  return snap.docs.map((playerSnap) => playerFromData(playerSnap.id, playerSnap.data()));
}

export async function updatePlayerPaymentStatus(
  playerId: string,
  paymentStatus: PaymentStatus
): Promise<void> {
  const setPlayerPaymentStatus = httpsCallable<SetPlayerPaymentStatusInput, unknown>(
    functions,
    "setPlayerPaymentStatus"
  );
  await setPlayerPaymentStatus({ playerId, paymentStatus });
}

export async function updatePlayerBlockedStatus(
  playerId: string,
  blocked: boolean
): Promise<void> {
  const setPlayerBlockedStatus = httpsCallable<SetPlayerBlockedStatusInput, unknown>(
    functions,
    "setPlayerBlockedStatus"
  );
  await setPlayerBlockedStatus({ playerId, blocked });
}

export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  const snap = await getDoc(doc(db, "invites", token));
  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  return {
    email: typeof data.email === "string" ? data.email : "",
    firstName: typeof data.firstName === "string" ? data.firstName : "",
    lastName: typeof data.lastName === "string" ? data.lastName : "",
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    status: typeof data.status === "string" ? data.status : "",
    expiresAt:
      data.expiresAt && typeof data.expiresAt === "object" && "toDate" in data.expiresAt
        ? (data.expiresAt as { toDate(): Date }).toDate().toISOString()
        : typeof data.expiresAt === "string"
          ? data.expiresAt
          : null
  };
}

export async function createPlayerInvite(input: CreateInviteInput): Promise<CreatedInvite> {
  const createInvite = httpsCallable<CreateInviteInput, CreatedInvite>(functions, "createInvite");
  const result = await createInvite(input);
  return result.data;
}

export async function acceptPlayerInvite(input: AcceptInviteInput): Promise<void> {
  const acceptInvite = httpsCallable<AcceptInviteInput, unknown>(functions, "acceptInvite");
  await acceptInvite(input);
}

export async function resendPlayerInvite(input: ResendInviteInput): Promise<void> {
  const resendInvite = httpsCallable<ResendInviteInput, unknown>(functions, "resendInvite");
  await resendInvite(input);
}

