import type { Firestore } from "firebase-admin/firestore";
import type { FactsPacket } from "./factsPacket.js";
import { buildDeterministicRecap, buildRecapPrompt, type RecapPromptEventType } from "./templates.js";
import { stripUndefinedDeep } from "./aiItems.js";

export type RecapProviderRequest = {
  system: string;
  user: string;
  factsPacket: FactsPacket;
};

export type RecapProviderResult = {
  text: string;
};

export type RecapProvider = (request: RecapProviderRequest) => Promise<RecapProviderResult>;

export type RecapValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      unknownPlayers: string[];
      unknownMatches: string[];
    };

export type RecapGenerationResult =
  | {
      status: "fallback";
      aiText: null;
      fallbackText: string;
      rejectionReason?: string;
      playersMentioned?: string[];
      usedStoryFacts?: string[];
    }
  | {
      status: "accepted";
      aiText: string;
      fallbackText: string;
      playersMentioned: string[];
      usedStoryFacts: string[];
    }
  | {
      status: "rejected";
      aiText: null;
      fallbackText: string;
      rejectionReason: string;
      playersMentioned?: string[];
      usedStoryFacts?: string[];
    };

export type RecapDraftPayload = {
  status: "draft";
  factsPacket: FactsPacket;
  aiText: string | null;
  fallbackText: string;
  reviewedByAdmin: false;
};

type RecapDraftWriteRef = {
  set(data: RecapDraftPayload, options?: { merge?: boolean }): Promise<unknown>;
};

type RecapDraftCollection = {
  doc(id: string): RecapDraftWriteRef;
};

export type RecapDraftDb = Pick<Firestore, "collection"> | {
  collection(name: string): RecapDraftCollection;
};

const SLOVAK_SIGNAL_PATTERNS = [
  /(^|\s)že(\s|$)/u,
  /(^|\s)de[nň](\s|$)/u,
  /zapas/u,
  /hrac/u,
  /tabul/u,
  /studio/u,
  /presn/u,
  /vyhral/u,
  /prehral/u,
  /trafil/u,
  /skoncil/u,
  /skocil/u,
  /berie/u,
  /drzi/u,
  /hlasi/u,
  /dnes/u,
  /zajtra/u
];

const ENGLISH_MARKER_PATTERN =
  /(^|\s)(won|match|leader|because|after|keeps|badge|day|player|score|exact|lost|winner|loser|is|still|top|table|standings|points|result|results|draw|goal|goals|hit|hits)(\s|$)/u;
const NARRATIVE_MATCH_VERB_PATTERN =
  /(^|\s)(porazil|porazila|porazili|porazilo|zdolal|zdolala|zdolali|zdolalo|prehral|prehrala|prehrali|prehralo|remizoval|remizovala|remizovali|remizovalo|vyhral|vyhrala|vyhrali|vyhralo)(\s|$)/u;
const FORBIDDEN_CONTENT_PATTERNS = [
  /https?:\/\//iu,
  /\[[^\]]+\]\([^)]+\)/u,
  /\*\*/u,
  /<[^>]+>/u,
  /\b(koeficient\w*|vzorec|vzorc\w*|formula|formul\w*|alokac\w*|zaokr[úu]h\w*)\b/iu
];

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("sk")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchSides(label: string): [string, string] | null {
  const parts = label.split(/\s+[-–—]\s+/u);

  if (parts.length !== 2 || parts.some((part) => part.trim().length === 0)) {
    return null;
  }

  return [parts[0].trim(), parts[1].trim()];
}

function matchPairKey(left: string, right: string): string {
  return [normalizeLabel(left), normalizeLabel(right)].sort().join("\n");
}

function knownMatchPairSet(matchLabels: string[]): Set<string> {
  return new Set(
    matchLabels
      .map((label) => matchSides(label))
      .filter((sides): sides is [string, string] => sides !== null)
      .map(([left, right]) => matchPairKey(left, right))
  );
}

function teamSides(matchLabels: string[]): string[] {
  return unique(
    matchLabels
      .map((label) => matchSides(label))
      .filter((sides): sides is [string, string] => sides !== null)
      .flat()
  );
}

function findNormalizedTermPositions(text: string, term: string): number[] {
  const positions: number[] = [];
  const pattern = new RegExp(`(^|\\s)(${escapeRegExp(term)})(?=\\s|$)`, "gu");

  for (const match of text.matchAll(pattern)) {
    const fullMatch = match[0] ?? "";
    positions.push(match.index + fullMatch.lastIndexOf(match[2]));
  }

  return positions;
}

function matchMentions(text: string): string[] {
  return [
    ...text.matchAll(
      /(\p{Lu}[\p{Letter}\p{M}\p{Number}]*(?:\s+\p{Lu}[\p{Letter}\p{M}\p{Number}]*)*)\s+(?:-|–|—)\s+(\p{Lu}[\p{Letter}\p{M}\p{Number}]*(?:\s+\p{Lu}[\p{Letter}\p{M}\p{Number}]*)*)/gu
    )
  ].map((match) => `${match[1]} - ${match[2]}`);
}

function narrativeMatchMentions(text: string, packet: FactsPacket): string[] {
  const normalizedText = normalizeLabel(text);
  const sides = teamSides(packet.knownMatches)
    .map((label) => ({ label, normalized: normalizeLabel(label) }))
    .filter((side) => side.normalized.length > 0);
  const positionsBySide = new Map(
    sides.map((side) => [side.normalized, findNormalizedTermPositions(normalizedText, side.normalized)])
  );
  const knownPairs = knownMatchPairSet(packet.knownMatches);
  const unknownMentions = new Set<string>();

  for (const left of sides) {
    const leftPositions = positionsBySide.get(left.normalized) ?? [];
    for (const right of sides) {
      if (left.normalized === right.normalized) {
        continue;
      }

      if (knownPairs.has(matchPairKey(left.label, right.label))) {
        continue;
      }

      const rightPositions = positionsBySide.get(right.normalized) ?? [];
      for (const leftPosition of leftPositions) {
        for (const rightPosition of rightPositions) {
          if (rightPosition <= leftPosition) {
            continue;
          }

          const between = normalizedText.slice(
            leftPosition + left.normalized.length,
            rightPosition
          );

          if (between.length <= 80 && NARRATIVE_MATCH_VERB_PATTERN.test(between)) {
            unknownMentions.add(`${left.label} - ${right.label}`);
          }
        }
      }
    }
  }

  return [...unknownMentions];
}

function stripKnownFacts(text: string, packet: FactsPacket): string {
  const factLabels = [
    ...packet.knownPlayers,
    ...packet.knownPlayerAliases,
    ...packet.knownMatches,
    packet.ticket.label,
    packet.ticket.dateLabel,
    ...packet.changedBadges.map((badge) => badge.badgeName),
    ...packet.badgeContext.flatMap((badge) => [
      badge.badgeName,
      badge.caption ?? "",
      badge.explainer ?? "",
      ...badge.indicators
    ]),
    ...packet.storyFacts
  ].filter((label) => label.trim().length > 0);

  return factLabels.reduce(
    (current, label) =>
      current.replaceAll(label, " ").replaceAll(label.replace(" - ", " – "), " "),
    text
  );
}

function hasSlovakSignal(text: string, packet: FactsPacket): boolean {
  const textWithoutFacts = stripKnownFacts(text, packet);
  const normalized = normalizeLabel(textWithoutFacts);
  const hasDiacriticSignal = /[áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/u.test(
    textWithoutFacts
  );
  const hasWordSignal = SLOVAK_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized));
  const hasEnglishMarker = ENGLISH_MARKER_PATTERN.test(normalized);

  return (hasDiacriticSignal || hasWordSignal) && !hasEnglishMarker;
}

export function validateRecapText(text: string, packet: FactsPacket): RecapValidationResult {
  const forbiddenContent = FORBIDDEN_CONTENT_PATTERNS.some((pattern) => pattern.test(text));
  const unknownPlayers: string[] = [];
  const knownMatches = new Set(packet.knownMatches.map(normalizeLabel));
  const knownPairs = knownMatchPairSet(packet.knownMatches);
  const unknownMatches = [
    ...new Set(
      [
        ...matchMentions(text).filter((mention) => {
          const sides = matchSides(mention);
          return (
            !knownMatches.has(normalizeLabel(mention)) &&
            (sides === null || !knownPairs.has(matchPairKey(sides[0], sides[1])))
          );
        }),
        ...narrativeMatchMentions(text, packet)
      ]
    )
  ];
  const hasRequiredSlovakSignal = hasSlovakSignal(text, packet);

  if (forbiddenContent || unknownPlayers.length > 0 || unknownMatches.length > 0 || !hasRequiredSlovakSignal) {
    const parts = [
      forbiddenContent ? "forbidden content" : undefined,
      unknownPlayers.length ? `unknown players: ${unknownPlayers.join(", ")}` : undefined,
      unknownMatches.length ? `unknown matches: ${unknownMatches.join(", ")}` : undefined,
      !hasRequiredSlovakSignal ? "non-Slovak output" : undefined
    ].filter((part): part is string => part !== undefined);

    return {
      ok: false,
      reason: parts.join("; "),
      unknownPlayers,
      unknownMatches
    };
  }

  return { ok: true };
}

export async function generateRecap(
  factsPacket: FactsPacket,
  options: { provider?: RecapProvider; eventType?: RecapPromptEventType } = {}
): Promise<RecapGenerationResult> {
  const fallbackText = buildDeterministicRecap(factsPacket);

  if (!options.provider) {
    return {
      status: "fallback",
      aiText: null,
      fallbackText
    };
  }

  const prompt = buildRecapPrompt(factsPacket, options.eventType);
  let providerResult: RecapProviderResult;

  try {
    providerResult = await options.provider({
      ...prompt,
      factsPacket
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      status: "fallback",
      aiText: null,
      fallbackText,
      rejectionReason: `provider error: ${message}`
    };
  }

  const output = extractProviderOutput(providerResult.text);
  const declaredPlayerValidation = validateDeclaredPlayers(output.playersMentioned, factsPacket);
  if (!declaredPlayerValidation.ok) {
    return {
      status: "rejected",
      aiText: null,
      fallbackText,
      rejectionReason: declaredPlayerValidation.reason,
      playersMentioned: output.playersMentioned,
      usedStoryFacts: output.usedStoryFacts
    };
  }

  const validation = validateRecapText(output.text, factsPacket);

  if (!validation.ok) {
    return {
      status: "rejected",
      aiText: null,
      fallbackText,
      rejectionReason: validation.reason,
      playersMentioned: output.playersMentioned,
      usedStoryFacts: output.usedStoryFacts
    };
  }

  return {
    status: "accepted",
    aiText: output.text,
    fallbackText,
    playersMentioned: output.playersMentioned,
    usedStoryFacts: output.usedStoryFacts
  };
}

type ExtractedProviderOutput = {
  text: string;
  playersMentioned: string[];
  usedStoryFacts: string[];
};

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function stripJsonFences(rawText: string): string {
  return rawText
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function normalizeProviderText(value: string): string {
  return value
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractProviderOutput(rawText: string): ExtractedProviderOutput {
  const trimmed = stripJsonFences(rawText);

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      const data = parsed as {
        text?: unknown;
        tickerLine?: unknown;
        headline?: unknown;
        paragraphs?: unknown;
        tvHighlights?: unknown;
        tickerLines?: unknown;
        playersMentioned?: unknown;
        mentionedPlayers?: unknown;
        usedStoryFacts?: unknown;
      };
      const maybeText = data.text;
      if (typeof maybeText === "string" && maybeText.trim().length > 0) {
        return {
          text: normalizeProviderText(maybeText),
          playersMentioned: textArray(data.playersMentioned ?? data.mentionedPlayers),
          usedStoryFacts: textArray(data.usedStoryFacts)
        };
      }

      if (typeof data.tickerLine === "string" && data.tickerLine.trim().length > 0) {
        return {
          text: normalizeProviderText(data.tickerLine),
          playersMentioned: textArray(data.playersMentioned ?? data.mentionedPlayers),
          usedStoryFacts: textArray(data.usedStoryFacts)
        };
      }

      const headline = typeof data.headline === "string" ? data.headline.trim() : "";
      const paragraphs = textArray(data.paragraphs);
      const tvHighlights = textArray(data.tvHighlights);
      const tickerLines = textArray(data.tickerLines);
      const bodyParts = [
        headline,
        ...paragraphs,
        ...(tvHighlights.length ? [`TV zvýraznenie: ${tvHighlights.join(" | ")}`] : []),
        ...tickerLines
      ].filter((part) => part.length > 0);

      if (bodyParts.length > 0) {
        return {
          text: normalizeProviderText(bodyParts.join("\n\n")),
          playersMentioned: textArray(data.playersMentioned ?? data.mentionedPlayers),
          usedStoryFacts: textArray(data.usedStoryFacts)
        };
      }
    }
  } catch {
    // Plain-text providers are still accepted for tests and local fallbacks.
  }

  return {
    text: normalizeProviderText(trimmed),
    playersMentioned: [],
    usedStoryFacts: []
  };
}

function validateDeclaredPlayers(
  playersMentioned: string[],
  packet: FactsPacket
): { ok: true } | { ok: false; reason: string } {
  const allowed = new Set([...packet.knownPlayers, ...packet.knownPlayerAliases].map(normalizeLabel));
  const unknownPlayers = playersMentioned.filter((player) => !allowed.has(normalizeLabel(player)));

  if (unknownPlayers.length > 0) {
    return {
      ok: false,
      reason: `unknown declared players: ${[...new Set(unknownPlayers)].join(", ")}`
    };
  }

  return { ok: true };
}

export function buildRecapDraftPayload(input: {
  factsPacket: FactsPacket;
  aiText: string | null;
  fallbackText: string;
}): RecapDraftPayload {
  return {
    status: "draft",
    factsPacket: input.factsPacket,
    aiText: input.aiText,
    fallbackText: input.fallbackText,
    reviewedByAdmin: false
  };
}

export async function saveRecapDraft(
  db: RecapDraftDb,
  draftId: string,
  payload: RecapDraftPayload
): Promise<void> {
  await db.collection("aiRecapDrafts").doc(draftId).set(stripUndefinedDeep(payload));
}
