import {
  baseEmailShell,
  type BuiltEmail,
  escapeHtml,
  normalizeAppUrl,
  type Score,
  scoreLabel,
  scoresEqual,
  SENDER_IDENTITY
} from "./helpers.js";

export type OverviewEmailMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAtSk?: string;
};

export type EmailBadgeChip = {
  badgeKey: string;
  title: string;
  emoji: string;
};

export type OverviewEmailPlayer = {
  id: string;
  displayName: string;
  registrationOrder?: number;
  badges?: EmailBadgeChip[];
};

export type OverviewEmailBet = {
  playerId: string;
  matchId: string;
  score: Score | null;
};

export type OverviewEmailInput = {
  appUrl: string;
  currentPlayerId: string;
  ticketLabel: string;
  lockedAtSk: string;
  matches: OverviewEmailMatch[];
  players: OverviewEmailPlayer[];
  bets: OverviewEmailBet[];
  recapText?: string;
};

const SUBJECT = "Prehľad tipov - TipParta MS 26";

function simpleSkTime(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isFinite(date.getTime())) {
    return new Intl.DateTimeFormat("sk-SK", {
      timeZone: "Europe/Bratislava",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date);
  }

  const match = /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(value);
  return match ? `${match[1]}:${match[2]}` : value;
}

function registrationOrder(player: OverviewEmailPlayer): number {
  return typeof player.registrationOrder === "number" && Number.isFinite(player.registrationOrder)
    ? player.registrationOrder
    : 9999;
}

function betMap(bets: OverviewEmailBet[]): Map<string, Score | null> {
  const map = new Map<string, Score | null>();

  for (const bet of bets) {
    map.set(`${bet.playerId}\n${bet.matchId}`, bet.score);
  }

  return map;
}

function playerLabel(player: OverviewEmailPlayer, currentPlayerId: string): string {
  return player.id === currentPlayerId ? `${player.displayName} (ty)` : player.displayName;
}

function badgeEmojiText(player: OverviewEmailPlayer): string {
  return (player.badges ?? [])
    .map((badge) => badge.emoji)
    .filter((emoji) => emoji.trim().length > 0)
    .join(" ");
}

function playerTextLabel(player: OverviewEmailPlayer, currentPlayerId: string): string {
  const badges = badgeEmojiText(player);
  return badges ? `${playerLabel(player, currentPlayerId)} ${badges}` : playerLabel(player, currentPlayerId);
}

function badgeEmojiHtml(player: OverviewEmailPlayer): string {
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

function playerHtmlLabel(player: OverviewEmailPlayer, currentPlayerId: string): string {
  return `${escapeHtml(playerLabel(player, currentPlayerId))}${badgeEmojiHtml(player)}`;
}

function buildHeader(matches: OverviewEmailMatch[]): string {
  return `<tr>
    <th align="left" style="padding:10px 8px;border:2px solid #f8f0d0;background:#101820;color:#ffdd45;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:16px;text-transform:uppercase;">Hráč</th>
    ${matches
      .map(
        (match) =>
          `<th align="center" style="padding:10px 8px;border:2px solid #f8f0d0;background:#101820;color:#ffdd45;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:16px;text-transform:uppercase;">${escapeHtml(match.homeTeam)} - ${escapeHtml(match.awayTeam)}${match.kickoffAtSk ? `<br><span style="color:#55d8ff;">${escapeHtml(simpleSkTime(match.kickoffAtSk))}</span>` : ""}</th>`
      )
      .join("")}
  </tr>`;
}

function buildRows(input: OverviewEmailInput): string {
  const map = betMap(input.bets);
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

      return `<tr data-current-player="${isCurrentPlayer ? "true" : "false"}" style="${rowStyle}">
        <td style="padding:10px 8px;border:2px solid #f8f0d0;font-weight:900;font-size:14px;line-height:18px;">${playerHtmlLabel(player, input.currentPlayerId)}</td>
        ${input.matches
          .map((match) => {
            const score = map.get(`${player.id}\n${match.id}`) ?? null;
            const currentScore = map.get(`${input.currentPlayerId}\n${match.id}`) ?? null;
            const sameBet = scoresEqual(score, currentScore);
            const cellStyle = sameBet
              ? "padding:10px 8px;border:2px solid #f8f0d0;background:#ffdd45;color:#101820;font-weight:900;text-align:center;font-family:'Courier New',Courier,monospace;"
              : "padding:10px 8px;border:2px solid #f8f0d0;color:#f8f0d0;font-weight:900;text-align:center;font-family:'Courier New',Courier,monospace;";

            return `<td data-same-bet="${sameBet ? "true" : "false"}" style="${cellStyle}">${escapeHtml(scoreLabel(score))}</td>`;
          })
          .join("")}
      </tr>`;
    })
    .join("");
}

function buildText(input: OverviewEmailInput): string {
  const map = betMap(input.bets);
  const players = [...input.players].sort((left, right) => {
    const order = registrationOrder(left) - registrationOrder(right);
    return order === 0 ? left.displayName.localeCompare(right.displayName, "sk") : order;
  });
  const lines = [
    "Prehľad tipov",
    `Lístok: ${input.ticketLabel}`,
    `Zamknuté: ${input.lockedAtSk}`,
    input.recapText ? `Komentár: ${input.recapText}` : "",
    "",
    ...players.map((player) => {
      const bets = input.matches
        .map((match) => `${match.homeTeam}-${match.awayTeam} ${scoreLabel(map.get(`${player.id}\n${match.id}`) ?? null)}`)
        .join(" | ");
      return `${playerTextLabel(player, input.currentPlayerId)}: ${bets}`;
    }),
    "",
    `Otvoriť TipPartu: ${normalizeAppUrl(input.appUrl)}`,
    `Odosielateľ: ${SENDER_IDENTITY}`
  ];

  return lines.join("\n");
}

function removeGeneratedFiller(body: string): string {
  return body.replace(/\s*<p style="margin:12px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#f8f0d0;">[\s\S]*?<\/p>/, "");
}

export function buildOverviewEmail(input: OverviewEmailInput): BuiltEmail {
  const recap = input.recapText
    ? `<p style="margin:0 0 16px;padding:12px;border:2px solid #55d8ff;background:#0c1420;font-size:15px;line-height:22px;color:#f8f0d0;">${escapeHtml(input.recapText)}</p>`
    : "";
  const body = `
    <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#f8f0d0;">Lístok <strong>${escapeHtml(input.ticketLabel)}</strong> je zamknutý. Teletextová tabuľa ukazuje, kto išiel do čoho. Žlté políčka znamenajú rovnaký presný tip ako máš ty.</p>
    <p style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#55d8ff;text-transform:uppercase;">Uzávierka: ${escapeHtml(input.lockedAtSk)}</p>
    ${recap}
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:auto;background:#172331;">
      <thead>${buildHeader(input.matches)}</thead>
      <tbody>${buildRows(input)}</tbody>
    </table>
    <p style="margin:12px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#f8f0d0;">Signál bez PDF príloh. Len čistá partia, čisté tipy a trochu štúdiového podpichu.</p>`;

  return {
    subject: SUBJECT,
    html: baseEmailShell({
      title: "Prehľad tipov",
      eyebrow: "TipParta MS 26 / zamknutý lístok",
      intro: "Tipy sú vonku, kamarátske podpichovanie môže začať.",
      appUrl: input.appUrl,
      body: removeGeneratedFiller(body)
    }),
    text: buildText(input)
  };
}
