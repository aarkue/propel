import { MultiDot } from "../oc-declare/MultiDot";

/** How many objects of a type an event has, as OC-DECLARE's involvement classes. */
export type InvolvementCard = "0..1" | "0..*" | "1..1" | "1..*";

/** The class of fewest `min` and most `max` objects per event. */
export function involvementCard(min: number, max: number): InvolvementCard {
  return `${min >= 1 ? "1" : "0"}..${max > 1 ? "*" : "1"}` as InvolvementCard;
}

/**
 * An object type drawn on an activity, as rust4pm's `TypeBadge` (`visualization::badges`): after
 * its source type's disc and an arrow when it follows from that type, among the plain discs when it
 * is only involved. Three discs for several objects per event, a dashed border when an event may
 * have none.
 */
export interface TypeBadge {
  object_type: string;
  from?: string | null;
  card?: InvolvementCard | null;
  from_card?: InvolvementCard | null;
}

// rust4pm's `visualization::badges` geometry, so on-screen badges match the layout and exports.
export const BADGE_RADIUS = 4.33;
export const BADGE_STEP = 3.1;
export const BADGE_OUTLINE_WIDTH = 1;
export const BADGE_GAP = 2;
export const BADGE_GROUP_GAP = 10;
export const BADGE_ARROW_WIDTH = 9;
export const BADGE_ARROW_HEIGHT = 8;
/** Height a row of badges adds to a node. */
export const BADGE_ROW_HEIGHT = 16;
/** Distance from a node's bottom edge to the center of its discs. */
export const BADGE_ROW_BOTTOM = 10;
/** Least room left and right of the row in its node. */
export const BADGE_PADDING = 8;

const SINGLE = 2 * BADGE_RADIUS + 2 * BADGE_OUTLINE_WIDTH;

export const badgeDiscWidth = (card?: InvolvementCard | null) =>
  SINGLE + (card?.endsWith("*") ? 2 * BADGE_STEP : 0);

interface Group {
  from?: string;
  fromCard?: InvolvementCard | null;
  types: TypeBadge[];
}

/** Badges grouped by the type they follow (in first-seen order), then the involved ones. */
function groupsOf(badges: TypeBadge[]): Group[] {
  const groups: Group[] = [];
  const bySource = new Map<string, Group>();
  for (const b of badges) {
    if (!b.from) continue;
    let g = bySource.get(b.from);
    if (!g) {
      g = { from: b.from, fromCard: b.from_card, types: [] };
      bySource.set(b.from, g);
      groups.push(g);
    }
    g.types.push(b);
  }
  const involved = badges.filter((b) => !b.from);
  if (involved.length) groups.push({ types: involved });
  return groups;
}

const groupWidth = (g: Group) =>
  (g.from ? badgeDiscWidth(g.fromCard) + BADGE_GAP + BADGE_ARROW_WIDTH + BADGE_GAP : 0) +
  g.types.reduce((w, t) => w + badgeDiscWidth(t.card), 0) +
  BADGE_GAP * Math.max(0, g.types.length - 1);

/** Width in px of a row of badges (rust4pm's `badge_row_width`). */
export function typeBadgesWidth(badges: TypeBadge[]): number {
  const groups = groupsOf(badges);
  return groups.reduce((w, g) => w + groupWidth(g), 0) + BADGE_GROUP_GAP * Math.max(0, groups.length - 1);
}

const perEvent = (card?: InvolvementCard | null) => (card ? ` (${card} per event)` : "");

/** graphlay's `gl-mapsto` symbol. */
function Arrow() {
  return (
    <svg
      width={BADGE_ARROW_WIDTH}
      height={BADGE_ARROW_HEIGHT}
      viewBox={`0 0 ${BADGE_ARROW_WIDTH} ${BADGE_ARROW_HEIGHT}`}
      style={{ display: "block", flexShrink: 0, color: "var(--gray-10)" }}
      aria-hidden="true"
    >
      <line x1={0.65} y1={1} x2={0.65} y2={7} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <line x1={0.65} y1={4} x2={5.5} y2={4} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <polygon points="5.5,1.8 5.5,6.2 9,4" fill="currentColor" />
    </svg>
  );
}

export interface TypeBadgesProps {
  badges: TypeBadge[];
  color: (objectType: string) => string;
  maxWidth?: number;
}

/** A row of type badges, scaled down to `maxWidth` when it would not fit. */
export function TypeBadges({ badges, color, maxWidth }: TypeBadgesProps) {
  const groups = groupsOf(badges);
  const width = typeBadgesWidth(badges);
  const scale = maxWidth && width > maxWidth ? maxWidth / width : 1;
  const dot = (type: string, card: InvolvementCard | null | undefined, title: string) => (
    <MultiDot key={type} dot={{ objectType: type, color: color(type), card: card ?? "1..1", title }} />
  );
  return (
    <div style={{ width: width * scale, height: SINGLE * scale, flexShrink: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: BADGE_GROUP_GAP,
          width,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "left top",
        }}
      >
        {groups.map((g) => (
          <span
            key={g.from ?? "involved"}
            style={{ display: "inline-flex", alignItems: "center", gap: BADGE_GAP, flexShrink: 0 }}
          >
            {g.from && (
              <>
                {dot(g.from, g.fromCard, `${g.from}${perEvent(g.fromCard)}`)}
                <Arrow />
              </>
            )}
            {g.types.map((t) =>
              dot(
                t.object_type,
                t.card,
                g.from
                  ? `${t.object_type}${perEvent(t.card)}: follows from ${g.from}`
                  : `${t.object_type}${perEvent(t.card)}: involved, does not follow from a flowing type`,
              ),
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A node's row of badges where rust4pm puts it: centered, its discs `BADGE_ROW_BOTTOM` above the
 * node's bottom edge. The node is `position: relative`, `width` wide with a `border` px border, and
 * keeps `BADGE_ROW_HEIGHT` free at its bottom.
 */
export function BadgeRow({
  badges,
  color,
  width,
  border = 0,
}: {
  badges: TypeBadge[];
  color: (objectType: string) => string;
  width?: number;
  border?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: BADGE_ROW_BOTTOM - SINGLE / 2 - border,
        transform: "translateX(-50%)",
        display: "flex",
      }}
    >
      <TypeBadges badges={badges} color={color} maxWidth={width ? width - 2 * border - 4 : undefined} />
    </div>
  );
}
