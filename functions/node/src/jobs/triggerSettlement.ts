import { secretValue, settlementWorkerTokenSecret, settlementWorkerUrlSecret } from "../secrets.js";

export type TriggerSettlementResult = {
  ok: boolean;
  status: number;
  responseText?: string;
};

export type TriggerSettlementOptions = {
  workerUrl?: string;
  workerToken?: string;
  fetchImpl?: typeof fetch;
};

function settlementWorkerUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("SETTLEMENT_WORKER_URL is required to trigger settlement.");
  }

  return value;
}

function settlementWorkerToken(value: string | undefined): string {
  if (!value) {
    throw new Error("SETTLEMENT_WORKER_TOKEN is required to trigger settlement.");
  }

  return value;
}

export async function triggerSettlementWorker(
  matchId: string,
  {
    workerUrl = secretValue(settlementWorkerUrlSecret, "SETTLEMENT_WORKER_URL"),
    workerToken = secretValue(settlementWorkerTokenSecret, "SETTLEMENT_WORKER_TOKEN"),
    fetchImpl = fetch
  }: TriggerSettlementOptions = {}
): Promise<TriggerSettlementResult> {
  const url = settlementWorkerUrl(workerUrl);
  const token = settlementWorkerToken(workerToken);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ matchId })
  });
  const responseText = await response.text();
  const result = {
    ok: response.ok,
    status: response.status,
    responseText: responseText.slice(0, 500)
  };

  if (!response.ok) {
    throw new Error(`Settlement worker failed with HTTP ${response.status}: ${result.responseText}`);
  }

  return result;
}
