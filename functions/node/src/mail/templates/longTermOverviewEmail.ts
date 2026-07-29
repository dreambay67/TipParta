import type { LongTermPredictionSlot } from "../../longTerm.js";
import {
  baseEmailShell,
  type BuiltEmail,
  escapeHtml,
  normalizeAppUrl,
  SENDER_IDENTITY
} from "./helpers.js";
import type { EmailBadgeChip, OverviewEmailPlayer } from "./overviewEmail.js";

export type LongTermOverviewEmailPlayer = OverviewEmailPlayer & {
  email: string;
  badges?: EmailBadgeChip[];
};

export type LongTermOverviewPick = {
  playerId: string;
  picks: Partial<Record<LongTermPredictionSlot["key"], string>>;
};

export type LongTermOverviewEmailInput = {
  appUrl: string;
  currentPlayerId: string;
  ticketLabel: string;
  lockedAtSk: string;
  slots: LongTermPredictionSlot[];
  players: LongTermOverviewEmailPlayer[];
  picks: LongTermOverviewPick[];
};

const SUBJECT = "Prehľad dlhodobých tipov - TipParta MS 26";

function registrationOrder(player: LongTermOverviewEmailPlayer): number {
  return typeof player.registrationOrder === "number" && Number.isFinite(player.registrationOrder)
    ? player.registrationOrder
    : 9999;
}

function pickMap(picks: LongTermOverviewPick[]): Map<string, LongTermOverviewPick["picks"]> {
  return new Map(picks.map((pick) => [pick.playerId, pick.picks]));
}

function playerLabel(player: LongTermOverviewEmailPlayer, currentPlayerId: string): string {
  return player.id === currentPlayerId ? `${player.displayName} (ty)` : player.displayName;
}

function badgeEmojiHtml(player: LongTermOverviewEmailPlayer): string {
  const badges = player.badges ?? [];
  if (badges.length === 0) {
    return "";
  }

  return ` <span style="white-space:nowrap;">${badges
    .map(
      (badge) =>
        `<span title="${escapeHtml(badge.title)}" style="display:inline-block;margin-left:3px;font-size:14px;line-height:14px;">${escapeHtml(
          badge.emoji
        )}</span>`
    )
    .join("")}</span>`;
}

function buildHeader(slots: LongTermPredictionSlot[]): string {
  return `<tr>
    <th align="left" style="padding:10px 8px;border:2px solid #f8f0d0;background:#101820;color:#ffdd45;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:16px;text-transform:uppercase;">Tipér</th>
    ${slots
      .map(
        (slot) =>
          `<th align="center" style="padding:10px 8px;border:2px solid #f8f0d0;background:#101820;color:#ffdd45;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:16px;text-transform:uppercase;">${escapeHtml(slot.label)}</th>`
      )
      .join("")}
  </tr>`;
}

function buildRows(input: LongTermOverviewEmailInput): string {
  const map = pickMap(input.picks);
  const players = [...input.players].sort((left, right) => {
    const order = registrationOrder(left) - registrationOrder(right);
    return order === 0 ? left.displayName.localeCompare(right.displayName, "sk") : order;
  });

  return players
    .map((player) => {
      const isCurrentPlayer = player.id === input.currentPlayerId;
      const rowStyle = isCurrentPlayer
        ? "background:#263f31;color:#f8f0d0;"
        : "background:#172331;color:#f8f0d0;";
      const picks = map.get(player.id) ?? {};

      return `<tr data-current-player="${isCurrentPlayer ? "true" : "false"}" style="${rowStyle}">
        <td style="padding:10px 8px;border:2px solid #f8f0d0;font-weight:900;font-size:14px;line-height:18px;">${escapeHtml(
          playerLabel(player, input.currentPlayerId)
        )}${badgeEmojiHtml(player)}</td>
        ${input.slots
          .map((slot) => {
            const team = picks[slot.key] ?? "Bez tipu";
            return `<td style="padding:10px 8px;border:2px solid #f8f0d0;color:#f8f0d0;font-weight:900;text-align:center;font-family:'Courier New',Courier,monospace;">${escapeHtml(team)}</td>`;
          })
          .join("")}
      </tr>`;
    })
    .join("");
}

function buildText(input: LongTermOverviewEmailInput): string {
  const map = pickMap(input.picks);
  const players = [...input.players].sort((left, right) => {
    const order = registrationOrder(left) - registrationOrder(right);
    return order === 0 ? left.displayName.localeCompare(right.displayName, "sk") : order;
  });
  const lines = [
    "Prehľad dlhodobých tipov",
    `Lístok: ${input.ticketLabel}`,
    `Zamknuté: ${input.lockedAtSk}`,
    "",
    ...players.map((player) => {
      const playerPicks = map.get(player.id) ?? {};
      const picks = input.slots
        .map((slot) => `${slot.label}: ${playerPicks[slot.key] ?? "Bez tipu"}`)
        .join(" | ");
      return `${playerLabel(player, input.currentPlayerId)}: ${picks}`;
    }),
    "",
    `Otvoriť TipPartu: ${normalizeAppUrl(input.appUrl)}`,
    `Odosielateľ: ${SENDER_IDENTITY}`
  ];

  return lines.join("\n");
}

export function buildLongTermOverviewEmail(input: LongTermOverviewEmailInput): BuiltEmail {
  const body = `
    <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#f8f0d0;">Dlhodobé tipy sú uzamknuté. Štúdio odkladá tabuľu s veľkými proroctvami až do záverečného účtovania.</p>
    <p style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#55d8ff;text-transform:uppercase;">Uzávierka: ${escapeHtml(input.lockedAtSk)}</p>
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:auto;background:#172331;">
      <thead>${buildHeader(input.slots)}</thead>
      <tbody>${buildRows(input)}</tbody>
    </table>`;

  return {
    subject: SUBJECT,
    html: baseEmailShell({
      title: "Prehľad dlhodobých tipov",
      eyebrow: "TipParta MS 26 / dlhodobý lístok",
      intro: "Veľké tipy sú zamknuté a čakajú na turnajové rozuzlenie.",
      appUrl: input.appUrl,
      body
    }),
    text: buildText(input)
  };
}
