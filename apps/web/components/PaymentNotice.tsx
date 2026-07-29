import { ExternalLink, QrCode } from "lucide-react";

type PaymentNoticeProps = {
  paymentStatus?: "paid" | "unpaid";
  qrUrl?: string | null;
  paymentLinkUrl?: string | null;
};

function safeUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

export function PaymentNotice({
  paymentStatus = "unpaid",
  qrUrl,
  paymentLinkUrl
}: PaymentNoticeProps) {
  if (paymentStatus === "paid") {
    return null;
  }

  const safeQrUrl = safeUrl(qrUrl);
  const safePaymentUrl = safeUrl(paymentLinkUrl) ?? safeQrUrl;

  return (
    <section className="border-4 border-red-300 bg-red-700 p-4 text-white shadow-[6px_6px_0_#111820]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center border-4 border-white bg-white text-red-700">
          {safeQrUrl ? (
            <span
              aria-label="QR platba"
              className="block h-full w-full bg-contain bg-center bg-no-repeat"
              role="img"
              style={{ backgroundImage: `url(${JSON.stringify(safeQrUrl)})` }}
            />
          ) : (
            <QrCode aria-hidden className="h-16 w-16" strokeWidth={2.5} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-black uppercase tracking-wider text-red-100">
            Červené hlásenie
          </p>
          <h2 className="mt-1 text-2xl font-black uppercase leading-none">
            Poplatok čaká na potvrdenie
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-red-50">
            Môžeš normálne tipovať. Pošli vstupný poplatok a admin ho potom ručne
            označí ako zaplatený.
          </p>

          {safePaymentUrl ? (
            <a
              className="mt-3 inline-flex items-center gap-2 border-2 border-white bg-white px-3 py-2 text-sm font-black uppercase text-red-700 shadow-[3px_3px_0_#111820] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-yellow-300"
              href={safePaymentUrl}
              rel="noreferrer"
              target="_blank"
            >
              Otvoriť platbu
              <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          ) : (
            <p className="mt-3 font-mono text-xs font-bold uppercase text-red-100">
              QR alebo platobný odkaz doplní admin.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
