"use client";

import { db } from "@/lib/firebase/client";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from "firebase/firestore";

export type BroadcastItem = {
  id: string;
  eventType: "daily_result" | "match_result" | "ticket_lock" | string;
  text: string;
  publishedAt: string;
  status: "published" | string;
};

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function dateLikeToIso(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toDate" in value) {
    const maybeTimestamp = value as { toDate?: unknown };
    if (typeof maybeTimestamp.toDate === "function") {
      return maybeTimestamp.toDate().toISOString();
    }
  }

  return "";
}

function normalizeBroadcastItem(snapshot: QueryDocumentSnapshot<DocumentData>): BroadcastItem | null {
  const data = snapshot.data();
  const text = stringValue(data.text);
  const status = stringValue(data.status);

  if (!text || status !== "published") {
    return null;
  }

  return {
    id: stringValue(data.id) ?? snapshot.id,
    eventType: stringValue(data.eventType) ?? "daily_result",
    text,
    publishedAt: dateLikeToIso(data.publishedAt),
    status
  };
}

export function subscribeBroadcastItems(
  onNext: (items: BroadcastItem[]) => void,
  onError?: (error: unknown) => void,
  count = 8
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "aiItems"), orderBy("publishedAt", "desc"), limit(count * 3)),
    (snapshot) => {
      onNext(
        snapshot.docs
          .map((item) => normalizeBroadcastItem(item))
          .filter((item): item is BroadcastItem => item !== null)
      );
    },
    (error) => {
      onError?.(error);
      onNext([]);
    }
  );
}
