export type TeamTier = "favourite" | "neutral" | "outsider";

export type TeamSeed = {
  code: string;
  nameSk: string;
  nameEn: string;
  tier: TeamTier;
  codeAliases?: string[];
  nameAliases?: string[];
};

export type TeamDisplay = {
  code: string;
  nameSk: string;
  flagCode?: string;
};

/**
 * A future tournament supplies its own team registry. Keeping this empty is
 * deliberate: no prior tournament teams or rankings remain in the codebase.
 */
export const TEAM_SEEDS: TeamSeed[] = [];
export const EXPECTED_TEAM_CODES: readonly string[] = [];

export function getTeamSeedByCode(code: string): TeamSeed | undefined {
  const normalizedCode = normalizeCode(code);
  return TEAM_SEEDS.find(
    (team) =>
      normalizeCode(team.code) === normalizedCode ||
      team.codeAliases?.some((alias) => normalizeCode(alias) === normalizedCode)
  );
}

export function getTeamSeedByNameAlias(name: string): TeamSeed | undefined {
  const normalizedName = normalizeName(name);
  return TEAM_SEEDS.find(
    (team) =>
      normalizeName(team.nameSk) === normalizedName ||
      normalizeName(team.nameEn) === normalizedName ||
      team.nameAliases?.some((alias) => normalizeName(alias) === normalizedName)
  );
}

export function resolveTeamSeed(value: string): TeamSeed | undefined {
  return getTeamSeedByCode(value) ?? getTeamSeedByNameAlias(value);
}

export function resolveTournamentTeamSeed(_tournamentKey: string, value: string): TeamSeed | undefined {
  return resolveTeamSeed(value);
}

export function getTournamentTeamSeedByCode(tournamentKey: string, code: string): TeamSeed | undefined {
  return resolveTournamentTeamSeed(tournamentKey, code);
}

export function getTeamFlagCode(_code: string): string | undefined {
  return undefined;
}

export function getTeamFlagEmojiByCode(_code: string): string | undefined {
  return undefined;
}

export function resolveTournamentTeamDisplay(tournamentKey: string, value: string): TeamDisplay {
  const team = resolveTournamentTeamSeed(tournamentKey, value);
  const code = team?.code ?? normalizeCode(value);
  const display: TeamDisplay = {
    code,
    nameSk: team?.nameSk ?? (value.trim() || "Tím")
  };
  const flagCode = getTeamFlagCode(code);
  return flagCode ? { ...display, flagCode } : display;
}

export function teamDisplayLabel(
  tournamentKey: string | null,
  code: unknown,
  fallback: unknown,
  options: { flag?: boolean } = {}
): string {
  const value = typeof code === "string" && code.trim() ? code : typeof fallback === "string" ? fallback : "Tím";
  const team = tournamentKey ? resolveTournamentTeamSeed(tournamentKey, value) : resolveTeamSeed(value);
  const label = team?.nameSk ?? value.trim();
  const emoji = options.flag ? getTeamFlagEmojiByCode(team?.code ?? value) : undefined;
  return emoji ? `${emoji} ${label}` : label;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeName(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("sk");
}
