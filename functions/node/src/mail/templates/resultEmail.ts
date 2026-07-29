import type { DailyResultCell, DailyResultRow, DailyResultTable } from "../../results/dailyResultTable.js";
import {
  baseEmailShell,
  type BuiltEmail,
  escapeHtml,
  normalizeAppUrl,
  SENDER_IDENTITY
} from "./helpers.js";

export type ResultEmailInput = {
  appUrl: string;
  currentPlayerId: string;
  ticketLabel: string;
  settledAtSk: string;
  table: DailyResultTable;
  recapText?: string;
};

const SUBJECT = "Vyhodnotenie dňa - TipParta MS 26";

function playerLabel(row: DailyResultRow, currentPlayerId: string): string {
  return row.playerId === currentPlayerId ? `${row.playerName} (ty)` : row.playerName;
}

function badgeEmojiText(row: DailyResultRow): string {
  return (row.badges ?? [])
    .map((badge) => badge.emoji)
    .filter((emoji) => emoji.trim().length > 0)
    .join(" ");
}

function playerTextLabel(row: DailyResultRow, currentPlayerId: string): string {
  const badges = badgeEmojiText(row);
  return badges ? `${playerLabel(row, currentPlayerId)} ${badges}` : playerLabel(row, currentPlayerId);
}

function badgeEmojiHtml(row: DailyResultRow): string {
  const badges = row.badges ?? [];
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

function playerHtmlLabel(row: DailyResultRow, currentPlayerId: string): string {
  return `${escapeHtml(playerLabel(row, currentPlayerId))}${badgeEmojiHtml(row)}`;
}

function tableHeader(table: DailyResultTable): string {
  return `<tr>
    <th align="left" style="padding:10px 8px;border:2px solid #f8f0d0;background:#101820;color:#ffdd45;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:16px;text-transform:uppercase;">Tipér</th>
    ${table.matches
      .map(
        (match) =>
          `<th align="center" style="padding:10px 8px;border:2px solid #f8f0d0;background:#101820;color:#ffdd45;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:16px;text-transform:uppercase;">${escapeHtml(match.label)}</th>`
      )
      .join("")}
    ${table.summaryColumns
      .map(
        (column) =>
          `<th align="center" style="padding:10px 8px;border:2px solid #f8f0d0;background:#101820;color:#ffdd45;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:16px;text-transform:uppercase;">${escapeHtml(column)}</th>`
      )
      .join("")}
  </tr>`;
}

function resultRow(table: DailyResultTable): string {
  return `<tr style="background:#111820;color:#f8f0d0;">
    <th align="left" style="padding:10px 8px;border:2px solid #f8f0d0;font-weight:900;color:#ffdd45;">${escapeHtml(table.resultRow.label)}</th>
    ${table.resultRow.cells
      .map(
        (cell) =>
          `<td align="center" style="padding:10px 8px;border:2px solid #f8f0d0;font-family:'Courier New',Courier,monospace;font-weight:900;color:#ffdd45;">${escapeHtml(cell)}</td>`
      )
      .join("")}
    <td style="padding:10px 8px;border:2px solid #f8f0d0;"></td>
    <td style="padding:10px 8px;border:2px solid #f8f0d0;"></td>
    <td style="padding:10px 8px;border:2px solid #f8f0d0;"></td>
  </tr>`;
}

function cellText(cell: DailyResultCell): string {
  return `${cell.betLabel} ${cell.moneyLabel}`;
}

function amountColor(units: number): string {
  if (units > 0) {
    return "#76ff9f";
  }

  if (units < 0) {
    return "#ff6f7d";
  }

  return "#f8f0d0";
}

function resultCell(cell: DailyResultCell): string {
  const cellStyle = cell.exactHit
    ? "padding:10px 8px;border:2px solid #f8f0d0;background:#ffdd45;color:#101820;font-family:'Courier New',Courier,monospace;font-weight:900;text-align:center;"
    : "padding:10px 8px;border:2px solid #f8f0d0;color:#f8f0d0;font-family:'Courier New',Courier,monospace;font-weight:900;text-align:center;";
  const amountStyle = `font-size:11px;line-height:14px;color:${cell.exactHit ? "#0f6b2a" : amountColor(cell.units)};white-space:nowrap;`;

  return `<td align="center" data-exact-hit="${cell.exactHit ? "true" : "false"}" style="${cellStyle}"><span>${escapeHtml(
    cell.betLabel
  )}</span> <span style="${amountStyle}">${escapeHtml(cell.moneyLabel)}</span></td>`;
}

function summaryCell(label: string, units: number | null = null): string {
  const color = units === null ? "#f8f0d0" : amountColor(units);
  return `<td align="center" style="padding:10px 8px;border:2px solid #f8f0d0;font-family:'Courier New',Courier,monospace;font-weight:900;color:${color};">${escapeHtml(
    label
  )}</td>`;
}

function recapHtml(text: string): string {
  return text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 10px;font-size:15px;line-height:22px;color:#f8f0d0;">${escapeHtml(paragraph).replace(/\n/gu, "<br>")}</p>`
    )
    .join("");
}

function tableRows(table: DailyResultTable, currentPlayerId: string): string {
  return table.rows
    .map((row) => {
      const isCurrentPlayer = row.playerId === currentPlayerId;
      const rowStyle = isCurrentPlayer
        ? "background:#263f31;color:#f8f0d0;"
        : "background:#172331;color:#f8f0d0;";

      return `<tr data-current-player="${isCurrentPlayer ? "true" : "false"}" style="${rowStyle}">
        <th align="left" style="padding:10px 8px;border:2px solid #f8f0d0;font-weight:900;font-size:14px;line-height:18px;">${playerHtmlLabel(row, currentPlayerId)}</th>
        ${row.cells
          .map((cell) => resultCell(cell))
          .join("")}
        ${summaryCell(row.dailyTotalLabel, row.dailyUnits)}
        ${summaryCell(row.totalLabel, row.totalUnits)}
        ${summaryCell(row.bonusLabel)}
      </tr>`;
    })
    .join("");
}

function buildText(input: ResultEmailInput): string {
  const lines = [
    "Vyhodnotenie dňa",
    `Lístok: ${input.ticketLabel}`,
    `Vyhodnotené: ${input.settledAtSk}`,
    input.recapText ? `Komentár: ${input.recapText}` : "",
    "",
    [
      "Tipér",
      ...input.table.matches.map((match) => match.label),
      ...input.table.summaryColumns
    ].join(" | "),
    [
      input.table.resultRow.label,
      ...input.table.resultRow.cells,
      "",
      "",
      ""
    ].join(" | "),
    ...input.table.rows.map((row) =>
      [
        playerTextLabel(row, input.currentPlayerId),
        ...row.cells.map(cellText),
        row.dailyTotalLabel,
        row.totalLabel,
        row.bonusLabel
      ].join(" | ")
    ),
    "",
    `Otvoriť TipPartu: ${normalizeAppUrl(input.appUrl)}`,
    `Odosielateľ: ${SENDER_IDENTITY}`
  ];

  return lines.join("\n");
}

function removeGeneratedFiller(body: string): string {
  return body.replace(/\s*<p style="margin:12px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#f8f0d0;">[\s\S]*?<\/p>/, "");
}

export function buildResultEmail(input: ResultEmailInput): BuiltEmail {
  const recap = input.recapText
    ? `<div style="margin:0 0 16px;padding:12px;border:2px solid #55d8ff;background:#0c1420;">${recapHtml(input.recapText)}</div>`
    : "";
  const body = `
    <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#f8f0d0;">Denná tabuľa je spočítaná pre <strong>${escapeHtml(input.ticketLabel)}</strong>. Zápasy sú v stĺpcoch, partia v riadkoch a účtovníctvo rovno napravo.</p>
    <p style="margin:0 0 14px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#55d8ff;text-transform:uppercase;">Vyhodnotené: ${escapeHtml(input.settledAtSk)}</p>
    ${recap}
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:auto;background:#172331;">
      <thead>${tableHeader(input.table)}</thead>
      <tbody>${resultRow(input.table)}${tableRows(input.table, input.currentPlayerId)}</tbody>
    </table>
    <p style="margin:12px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#f8f0d0;">Kamarátske štúdio zatvára vysielanie. Zajtra sa tabuľa tvári, že nič nebolo.</p>`;

  return {
    subject: SUBJECT,
    html: baseEmailShell({
      title: "Vyhodnotenie dňa",
      eyebrow: "TipParta MS 26 / výsledkový signál",
      intro: "Denný účet je na tabuli. Niekto svieti, niekto vysvetľuje taktiku.",
      appUrl: input.appUrl,
      body: removeGeneratedFiller(body)
    }),
    text: buildText(input)
  };
}
