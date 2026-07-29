export type AvatarSlotProps = {
  playerId: string;
  size: "large" | "medium" | "small";
  mood?: "happy" | "sad" | "neutral" | "fire";
  label?: string;
  name?: string;
};

function initialsFromLabel(label: string | undefined, playerId: string): string {
  const source = label?.trim() || playerId;
  if (!source.includes(" ") && source.length <= 4) {
    return source.toUpperCase();
  }

  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "TP";
}

export function AvatarSlot({
  playerId,
  size,
  mood = "neutral",
  label,
  name
}: AvatarSlotProps) {
  const initials = initialsFromLabel(label, playerId);
  const accessibleName = name?.trim() || label?.trim() || playerId;

  return (
    <div
      aria-label={`Avatar hráča ${accessibleName}`}
      className={`avatar-slot avatar-slot--${size} avatar-slot--${mood}`}
      data-player-id={playerId}
      role="img"
    >
      <span className="avatar-slot__label">{initials}</span>
    </div>
  );
}
