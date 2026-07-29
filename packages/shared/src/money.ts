export type Cents5 = number;

export type OrderedParticipant = {
  id: string;
  registrationOrder: number;
};

const UNITS_PER_EURO = 20;
const EURO_PER_UNIT = 0.05;
const MONEY_EPSILON = 1e-9;

export function euroToCents5(value: number): Cents5 {
  if (!Number.isFinite(value)) {
    throw new Error("Euro value must be finite.");
  }

  const units = Math.round(value * UNITS_PER_EURO);
  if (Math.abs(value * UNITS_PER_EURO - units) > MONEY_EPSILON) {
    throw new Error("Euro value must resolve to 5-cent units.");
  }

  return units;
}

export function cents5ToEuroString(units: Cents5): string {
  assertIntegerUnits(units);

  const sign = units < 0 ? "-" : "";
  const absoluteCents = Math.abs(units) * 5;
  const euros = Math.trunc(absoluteCents / 100);
  const cents = absoluteCents % 100;

  return `${sign}${euros},${cents.toString().padStart(2, "0")} €`;
}

export function splitUnitsLargestRemainder(
  totalUnits: number,
  participants: OrderedParticipant[]
): Array<{ id: string; units: Cents5 }> {
  assertIntegerUnits(totalUnits);

  if (participants.length === 0) {
    throw new Error("At least one participant is required.");
  }

  validateParticipants(participants);

  const orderedParticipants = [...participants].sort(
    (left, right) => left.registrationOrder - right.registrationOrder
  );
  const sign = totalUnits < 0 ? -1 : 1;
  const absoluteTotal = Math.abs(totalUnits);
  const base = Math.trunc(absoluteTotal / orderedParticipants.length);
  const remainder = absoluteTotal - base * orderedParticipants.length;

  return orderedParticipants.map((participant, index) => ({
    id: participant.id,
    units: sign * (base + (index < remainder ? 1 : 0))
  }));
}

function validateParticipants(participants: OrderedParticipant[]): void {
  const ids = new Set<string>();
  const registrationOrders = new Set<number>();

  for (const participant of participants) {
    if (ids.has(participant.id)) {
      throw new Error("Participant ids must be unique.");
    }

    if (registrationOrders.has(participant.registrationOrder)) {
      throw new Error("Participant registrationOrder values must be unique.");
    }

    ids.add(participant.id);
    registrationOrders.add(participant.registrationOrder);
  }
}

function assertIntegerUnits(units: number): asserts units is Cents5 {
  if (!Number.isInteger(units)) {
    throw new Error("Money units must be integers.");
  }
}
