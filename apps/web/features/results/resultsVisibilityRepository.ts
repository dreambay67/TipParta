"use client";

import {
  normalizeResultsVisibility,
  type ResultsVisibilitySection,
  type ResultsVisibilitySettings
} from "@tipparta/shared";
import { db } from "@/lib/firebase/client";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe
} from "firebase/firestore";

const RESULTS_VISIBILITY_REF = doc(db, "runtimeSettings", "resultsVisibility");

const hiddenFieldBySection: Record<ResultsVisibilitySection, keyof ResultsVisibilitySettings> = {
  leaderboards: "leaderboardsHidden",
  previousDay: "previousDayHidden",
  badges: "badgesHidden",
  records: "recordsHidden"
};

export function subscribeResultsVisibilitySettings(
  onChange: (settings: ResultsVisibilitySettings) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    RESULTS_VISIBILITY_REF,
    (snapshot) => {
      onChange(normalizeResultsVisibility(snapshot.exists() ? snapshot.data() : undefined));
    },
    onError
  );
}

export async function setResultsSectionHidden(
  section: ResultsVisibilitySection,
  hidden: boolean
): Promise<void> {
  await setDoc(
    RESULTS_VISIBILITY_REF,
    {
      [hiddenFieldBySection[section]]: hidden,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
