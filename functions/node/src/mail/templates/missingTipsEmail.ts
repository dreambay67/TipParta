import {
  baseEmailShell,
  type BuiltEmail,
  escapeHtml,
  normalizeAppUrl,
  SENDER_IDENTITY
} from "./helpers.js";

export type MissingTipsEmailInput = {
  appUrl: string;
  displayName: string;
  ticketLabel: string;
  lockAtSk: string;
  ticketKind?: "matchday" | "longTerm";
};

const SUBJECT = "Nedodané tipy - TipParta MS 26";

export function buildMissingTipsEmail(input: MissingTipsEmailInput): BuiltEmail {
  const isLongTerm = input.ticketKind === "longTerm";
  const missingLine = isLongTerm
    ? `v lístku <strong>${escapeHtml(input.ticketLabel)}</strong> ešte nemáš uložené všetky dlhodobé tipy.`
    : `v lístku <strong>${escapeHtml(input.ticketLabel)}</strong> ešte nemáš uložené všetky tipy.`;
  const consequenceLine = isLongTerm
    ? "Ak ich nestihneš doplniť, v prehľade dlhodobých tipov zostanú tvoje prázdne miesta."
    : "Ak tip nestihneš doplniť, zápas sa ráta ako automatická strata 5 €.";
  const body = `
    <p style="margin:0 0 12px;font-size:15px;line-height:22px;color:#f8f0d0;">Ahoj <strong>${escapeHtml(
      input.displayName
    )}</strong>, ${missingLine}</p>
    <p style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#55d8ff;text-transform:uppercase;">Uzávierka: ${escapeHtml(
      input.lockAtSk
    )}</p>
    <p style="margin:0;font-size:14px;line-height:21px;color:#f8f0d0;">${escapeHtml(consequenceLine)}</p>`;

  return {
    subject: SUBJECT,
    html: baseEmailShell({
      title: "Nedodané tipy",
      eyebrow: "TipParta MS 26 / posledná hodina",
      intro: "Do uzávierky ostáva hodina a tabuľa hlási chýbajúce tipy.",
      appUrl: input.appUrl,
      body
    }),
    text: [
      "Nedodané tipy",
      `Ahoj ${input.displayName},`,
      isLongTerm
        ? `v lístku ${input.ticketLabel} ešte nemáš uložené všetky dlhodobé tipy.`
        : `v lístku ${input.ticketLabel} ešte nemáš uložené všetky tipy.`,
      `Uzávierka: ${input.lockAtSk}`,
      consequenceLine,
      "",
      `Natipuj teraz: ${normalizeAppUrl(input.appUrl)}`,
      `Odosielateľ: ${SENDER_IDENTITY}`
    ].join("\n")
  };
}
