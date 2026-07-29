export type Score = {
  home: number;
  away: number;
};

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
};

export const SENDER_IDENTITY = "TipParta MS 26 <tipy@tipparta.fun>";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function scoreLabel(score: Score | null | undefined): string {
  return score ? `${score.home}:${score.away}` : "Bez tipu";
}

export function scoresEqual(left: Score | null | undefined, right: Score | null | undefined): boolean {
  return Boolean(left && right && left.home === right.home && left.away === right.away);
}

export function normalizeAppUrl(appUrl: string): string {
  return appUrl.trim().replace(/\/+$/, "");
}

export function baseEmailShell({
  title,
  eyebrow,
  intro,
  appUrl,
  body
}: {
  title: string;
  eyebrow: string;
  intro: string;
  appUrl: string;
  body: string;
}): string {
  const safeAppUrl = escapeHtml(normalizeAppUrl(appUrl));

  return `<!doctype html>
<html lang="sk">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#101820;color:#f8f0d0;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;color:#101820;">${escapeHtml(intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#101820;">
      <tr>
        <td style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;border-collapse:collapse;border:4px solid #ffdd45;background:#172331;">
            <tr>
              <td style="padding:22px 20px 14px;border-bottom:4px solid #ffdd45;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#55d8ff;">${escapeHtml(eyebrow)}</div>
                <h1 style="margin:8px 0 0;font-size:30px;line-height:34px;font-weight:900;text-transform:uppercase;color:#f8f0d0;">${escapeHtml(title)}</h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:22px;color:#f8f0d0;">${escapeHtml(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px 22px;border-top:4px solid #ffdd45;background:#111820;">
                <a href="${safeAppUrl}" style="display:inline-block;background:#ffdd45;color:#101820;text-decoration:none;font-weight:900;text-transform:uppercase;font-size:15px;line-height:20px;padding:12px 16px;border:3px solid #f8f0d0;">Otvoriť TipPartu</a>
                <p style="margin:14px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#f8f0d0;">Odchádza z komentátorskej kabíny: ${escapeHtml(SENDER_IDENTITY)}. Odpovedaj na tento e-mail a admin chytí signál.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.replace(
    /<p style="margin:14px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#f8f0d0;">[\s\S]*?<\/p>/,
    `<p style="margin:14px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;color:#f8f0d0;">Automatická správa TipParta MS 26. Odosielateľ: ${escapeHtml(SENDER_IDENTITY)}.</p>`
  );
}
