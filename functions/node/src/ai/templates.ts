import type { ChangedBadgeFact, FactsPacket } from "./factsPacket.js";

export type RecapPromptEventType = "ticket_lock" | "match_result" | "daily_result";

export type RecapPrompt = {
  system: string;
  user: string;
};

function pluralizeMatches(count: number): string {
  if (count === 1) {
    return "1 zápas";
  }

  if (count >= 2 && count <= 4) {
    return `${count} zápasy`;
  }

  return `${count} zápasov`;
}

function firstConcreteMatch(packet: FactsPacket): string | undefined {
  const exactBet = packet.exactBets[0];
  if (exactBet) {
    return `${exactBet.matchLabel} ${exactBet.tip} presne pre ${exactBet.playerName}`;
  }

  const match = packet.matchResults[0];
  if (match) {
    return `${match.matchLabel} skončilo ${match.finalScore}`;
  }

  return undefined;
}

function badgeSentence(badge: ChangedBadgeFact | undefined): string | undefined {
  if (!badge) {
    return undefined;
  }

  const previous = badge.previousHolderName ? ` od ${badge.previousHolderName}` : "";
  const reason = badge.reasonMatchLabel ? ` po zápase ${badge.reasonMatchLabel}` : "";

  return `Odznak ${badge.badgeName} berie ${badge.newHolderName}${previous}${reason}`;
}

function leaderChangeSentence(packet: FactsPacket): string | undefined {
  const leaderChange = packet.leaderboardImpact.find(
    (impact) => impact.newRank === 1 && impact.previousRank !== undefined && impact.previousRank !== 1
  );

  if (!leaderChange) {
    return undefined;
  }

  const reason = leaderChange.reasonMatchLabel ? ` po ${leaderChange.reasonMatchLabel}` : "";

  return `Tabuľka: ${leaderChange.playerName} skočil z ${leaderChange.previousRank}. na 1. miesto${reason} (${leaderChange.balanceDeltaLabel})`;
}

export function buildDeterministicRecap(packet: FactsPacket): string {
  const lines: string[] = [];
  const matchLabel = pluralizeMatches(packet.matchCount);

  if (packet.dailyWinner) {
    lines.push(
      `Štúdio TipParta hlási: ${packet.dailyWinner.playerName} vyhral deň o ${packet.dailyWinner.balanceDeltaLabel} pri porcii ${matchLabel}.`
    );
  } else {
    lines.push(`Štúdio TipParta hlási: ${packet.ticket.label} je spočítaný po porcii ${matchLabel}.`);
  }

  const matchFact = firstConcreteMatch(packet);
  if (matchFact) {
    lines.push(`Kľúčový záznam: ${matchFact}.`);
  }

  const leaderFact = leaderChangeSentence(packet);
  if (leaderFact) {
    lines.push(`${leaderFact}.`);
  }

  const badgeFact = badgeSentence(packet.changedBadges[0]);
  if (badgeFact) {
    lines.push(`${badgeFact}.`);
  }

  if (packet.dailyLoser) {
    lines.push(
      `${packet.dailyLoser.playerName} dnes schytal ${packet.dailyLoser.balanceDeltaLabel}, tabuľa však zajtra znovu bliká od nuly.`
    );
  }

  return lines.join(" ");
}

function eventGoal(eventType: RecapPromptEventType): string {
  if (eventType === "ticket_lock") {
    return [
      "Moment: denný tiket sa práve uzamkol.",
      "Napíš krátky verejný štúdiový signál o tom, že tipy sú vonku.",
      "Môžeš spomenúť počet zápasov, počet hráčov, výrazné tipérske odznaky alebo napätie pred výsledkami.",
      "Nespomínaj výsledky zápasov, lebo ešte nie sú vyhodnotené."
    ].join("\n");
  }

  if (eventType === "match_result") {
    return [
      "Moment: práve prišiel jeden finálny výsledok.",
      "Napíš jednu sústredenú tickerovú aktualizáciu.",
      "Jadro musí byť: finálne skóre -> kto v TipParte získal, stratil, trafil presne alebo minul.",
      "Ak nie je zaujímavý presný zásah, nájdi iný konkrétny herný dôsledok."
    ].join("\n");
  }

  return [
    "Moment: celý denný tiket je vyhodnotený.",
    "Napíš hlavný denný recap pre web a e-mail.",
    "Jadro musí byť: kto vyhral deň, kto stratil, ktoré zápasy alebo presné zásahy s tým pohli, čo sa stalo s odznakmi alebo rebríčkami.",
    "Použi pokojne viac viet, ale stále hutne a konkrétne."
  ].join("\n");
}

function responseShape(eventType: RecapPromptEventType): string {
  if (eventType === "daily_result") {
    return [
      "{",
      '  "headline": "krátky slovenský titulok bez emoji",',
      '  "paragraphs": ["2 až 3 krátke odseky s konkrétnymi TipParta dôsledkami"],',
      '  "tvHighlights": ["3 krátke body, každý jeden konkrétny fakt"],',
      '  "tickerLines": ["1 až 2 kratšie vety vhodné do bežiaceho textu"],',
      '  "playersMentioned": ["presné mená hráčov z knownPlayers, ktorých text skutočne menuje"],',
      '  "usedStoryFacts": ["story fakty použité v texte, ak nejaké boli"]',
      "}"
    ].join("\n");
  }

  return [
    "{",
    '  "tickerLine": "1 až 3 vety pre bežiaci text alebo krátky e-mailový komentár",',
    '  "playersMentioned": ["presné mená hráčov z knownPlayers, ktorých text skutočne menuje"],',
    '  "usedStoryFacts": ["story fakty použité v texte, ak nejaké boli"]',
    "}"
  ].join("\n");
}

function playerGrammarNotes(packet: FactsPacket): string[] {
  const knownNames = new Set([...packet.knownPlayers, ...packet.knownPlayerAliases]);
  const notes: string[] = [];

  if (knownNames.has("Hugo a Theo Karasovci")) {
    notes.push(
      "Hugo a Theo Karasovci je jedna hráčska položka, ale je to dvojica. Keď ich spomínaš vo vete, používaj množné číslo a prirodzené slovenské tvary: trafili, získali, stratili, držia, sú. Nerozdeľuj ich na dvoch samostatných hráčov; v playersMentioned uvádzaj presne celé meno \"Hugo a Theo Karasovci\"."
    );
  }

  return notes;
}

export function buildRecapPrompt(
  packet: FactsPacket,
  eventType: RecapPromptEventType = "daily_result"
): RecapPrompt {
  const grammarNotes = playerGrammarNotes(packet);

  return {
    system: [
      "Si AI komentátor TipParta MS 26.",
      "Persona: retro slovenský športový štúdiový moderátor s jemným kamaratským podpichom od stola.",
      "Píš výhradne štandardnou slovenčinou. Žiadny zahraničný slang, žiadne vulgarity, žiadne korporátne frázy.",
      "Si prísny faktograf: používaj iba dodaný balík faktov a prípadné dôveryhodné webové story fakty nájdené cez nástroj.",
      "Hlavná os komentára je vždy: čo sa stalo v reálnom zápase -> čo to zmenilo v TipParte.",
      "Ak web nedá užitočný príbeh, neospravedlňuj sa a rozprávaj príbeh z našich dát: tipy, peniaze, presné zásahy, odznaky, rebríčky.",
      "Nevymýšľaj mená futbalistov, minúty gólov, karty, penalty ani zákulisie. Spomeň ich iba vtedy, ak sú výslovne podporené story faktom.",
      "Odznaky smieš komentovať len podľa badgeContext alebo changedBadges. Nevymýšľaj ich pravidlá a nevysvetľuj vzorce.",
      "Sumy peňazí spomínaj, keď sú dôležité. Nikdy nevysvetľuj koeficienty, alokáciu výhier ani zaokrúhľovanie.",
      "Vyhýbaj sa opakovaniu predchádzajúcich viet z continuity. Neopakuj rovnaký vtip a neber si stále na mušku rovnakého hráča.",
      "Vráť iba platný JSON. Bez Markdownu, HTML, odkazov a citácií."
    ].join("\n"),
    user: [
      eventGoal(eventType),
      "",
      "Požadovaný JSON tvar:",
      responseShape(eventType),
      "",
      "Fakty pre komentár:",
      JSON.stringify(packet, null, 2),
      "",
      "Dôležité pravidlá výberu obsahu:",
      "- herne relevantné fakty majú prednosť pred atmosférou",
      "- ak je v balíku konkrétna suma, presný zásah, odznak, líder alebo posun, použi aspoň jeden z týchto konkrétnych hákov",
      "- badgeContext obsahuje aktuálnych držiteľov odznakov, ich popisy, indikátory a prenasledovateľov; používaj ho ako slovník pravidiel odznakov",
      "- bet odznaky sú o štýle tipovania, výsledkové odznaky o spočítaných výsledkoch",
      "- nepíš internú metodiku, ID dokumentov, technické názvy kolekcií ani raw JSON",
      "- playersMentioned musí obsahovať iba reálne mená z knownPlayers alebo knownPlayerAliases",
      "- ak text povie „nikto“, nie je to hráč a nepatrí do playersMentioned",
      "- usedStoryFacts nechaj prázdne, ak si nepoužil konkrétny webový alebo uložený story fakt",
      ...(grammarNotes.length
        ? ["", "Hráčske jazykové výnimky:", ...grammarNotes.map((note) => `- ${note}`)]
        : [])
    ].join("\n")
  };
}
