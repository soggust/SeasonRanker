// Preview props: the book's player prop LINES for a game the bot hasn't priced yet, from ESPN's free core API
// (sports.core.api.espn.com .../events/{id}/competitions/{id}/odds/100/propBets: each item a player's stat,
// its line now (current.target.value) and its opening one (open.target.value), no prices). The Book shows
// them on a game's board until the bot's own board has the game's props (the bettor prices props only inside its
// window: PROPS_WINDOW_HOURS), and a user may bet either side at an assumed -110 (PREVIEW_ODDS): the bet carries
// preview: true, its line locked as the user saw it; the settler (settle-lib.mjs previewProblem, previewLineCheck)
// grades it as a straight prop is, its price never checked against a board, its line against the lines ESPN
// showed. The bot never reads these.
//
// Only the stats the settler can grade from ESPN's box score (live-props.ts liveStat, props.mjs statInFinal):
// MLB's total bases are left out (the settler can only grade them off the bettor's own pick). settle-lib.mjs
// PREVIEW_STATS has the same table (tests/preview-props.test.mjs holds the two together).

// (the assumed price on either side: no price posted)
export const PREVIEW_ODDS = -110;

// (the bettor's props window, in hours before the start: leagues.mjs TIMING's props, kept in step by
// tests/preview-props.test.mjs)
export const PROPS_WINDOW_HOURS: Record<string, number> = { nfl: 26, nba: 6, nhl: 10, mlb: 6 };

export interface PreviewStat {
  key: string;
  label: string;
  match: RegExp;
}

// (each sport's gradable stats: the bettor's keys and labels (props.mjs STATS), ESPN's type names; never a
// milestone ("Passing Yards Milestones": a ladder of alt lines), a half's or a quarter's)
export const PREVIEW_STATS: Record<string, PreviewStat[]> = {
  nfl: [
    { key: 'passYds', label: 'Pass Yds', match: /^Total Passing Yards \(/ },
    { key: 'passAtt', label: 'Pass Att', match: /^Total Passing Attempts/ },
    { key: 'passCmp', label: 'Completions', match: /^Total Pass Completions/ },
    { key: 'passTd', label: 'Pass TDs', match: /^Total Passing Touchdowns/ },
    { key: 'passInt', label: 'INTs', match: /^Total Passing Interceptions/ },
    { key: 'rushYds', label: 'Rush Yds', match: /^Total Rushing Yards \(/ },
    { key: 'rushAtt', label: 'Carries', match: /^Total Carries/ },
    { key: 'recYds', label: 'Rec Yds', match: /^Total Receiving Yards \(/ },
    { key: 'rec', label: 'Receptions', match: /^Total Receptions/ },
    { key: 'rushRecYds', label: 'Rush+Rec Yds', match: /^Total Rushing Plus Receiving Yards/ },
  ],
  nba: [
    { key: 'pts', label: 'Points', match: /^Total Points( \(|$)/ },
    { key: 'reb', label: 'Rebounds', match: /^Total Rebounds( \(|$)/ },
    { key: 'ast', label: 'Assists', match: /^Total Assists( \(|$)/ },
    { key: 'fg3', label: 'Threes', match: /^Total (3-Point|Three|Made 3)/i },
    { key: 'pra', label: 'Pts+Reb+Ast', match: /Points.*(Rebounds.*Assists|Assists.*Rebounds)/i },
  ],
  nhl: [
    { key: 'sog', label: 'Shots', match: /^Total Shots on Goal/ },
    { key: 'pts', label: 'Points', match: /^Total Points$/ },
    { key: 'saves', label: 'Saves', match: /^Total Saves/ },
  ],
  mlb: [
    { key: 'k', label: 'Strikeouts', match: /^Total Strikeouts$/ },
    { key: 'outs', label: 'Outs', match: /^Total Outs Recorded/ },
    { key: 'hits', label: 'Hits', match: /^Total Hits$/ },
  ],
};

// (an ESPN prop type's stat, if it's one the site can grade)
export function previewStatOf(sport: string, typeName: string | null | undefined): PreviewStat | null {
  const name = String(typeName ?? '');
  if (/milestone/i.test(name) || /^(1st|2nd|3rd|4th|first|last|team)\b/i.test(name)) return null;
  return PREVIEW_STATS[sport]?.find((s) => s.match.test(name)) ?? null;
}

// (ESPN's athlete id out of its ref: ".../athletes/3912547?lang=en")
export function athleteIdOf(ref: string | null | undefined): string | null {
  const m = /\/athletes\/([0-9]{1,20})(?:[/?]|$)/.exec(String(ref ?? ''));
  return m ? m[1] : null;
}

// One item of ESPN's propBets, as far as it's read
export interface PropBetItem {
  athlete?: { $ref?: string };
  type?: { id?: string; name?: string };
  current?: { target?: { value?: number } };
  open?: { target?: { value?: number } };
}

// A preview prop: a player's stat at the book's main line, with where it opened
export interface PreviewProp {
  athlete: string;
  propType: string;
  label: string;
  line: number;
  // (the opening line, where ESPN has it: the movement is line - open)
  open: number | null;
}

// A game's propBets items as preview props: one a player's stat, at its main line (the line the board lists most
// for him, the middle one at a tie: props.mjs board's rule), only the stats the site grades, a line that's a
// number and not negative
export function previewPropsOf(sport: string, items: PropBetItem[]): PreviewProp[] {
  const groups = new Map<string, { stat: PreviewStat; athlete: string; list: PropBetItem[] }>();
  for (const it of items ?? []) {
    const stat = previewStatOf(sport, it?.type?.name);
    const athlete = athleteIdOf(it?.athlete?.$ref);
    const line = it?.current?.target?.value;
    if (!stat || !athlete || typeof line !== 'number' || !Number.isFinite(line) || line < 0 || line >= 1000) continue;
    const key = `${athlete}|${stat.key}`;
    const g = groups.get(key) ?? { stat, athlete, list: [] };
    g.list.push(it);
    groups.set(key, g);
  }
  const out: PreviewProp[] = [];
  for (const { stat, athlete, list } of groups.values()) {
    const line = mainLineOf(list.map((x) => x.current!.target!.value as number));
    const at = list.find((x) => x.current?.target?.value === line);
    const open = at?.open?.target?.value;
    out.push({ athlete, propType: stat.key, label: stat.label, line, open: typeof open === 'number' && Number.isFinite(open) ? open : null });
  }
  return out;
}

// (the main line among a player's stat's lines: the one listed most, the middle one at a tie)
export function mainLineOf(lines: number[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const top = ranked.filter((l) => l[1] === ranked[0][1]).map((l) => l[0]);
  return top[Math.floor((top.length - 1) / 2)];
}

// (ESPN's team roster, either shape: the NFL's grouped by unit (athletes[].items[]), the others' flat)
export interface RosterBody {
  team?: { abbreviation?: string };
  athletes?: ({ id?: string | number; displayName?: string; items?: { id?: string | number; displayName?: string }[] })[];
}
export function rosterNames(body: RosterBody | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of body?.athletes ?? []) {
    for (const x of a.items ?? [a]) if (x?.id != null && x.displayName) out.set(String(x.id), x.displayName);
  }
  return out;
}

// (a line's movement from its open, as words: "opened 225.5", or null where it hasn't moved or isn't known)
export function movementText(p: Pick<PreviewProp, 'line' | 'open'>): string | null {
  if (p.open === null || p.open === p.line) return null;
  const d = Math.round((p.line - p.open) * 10) / 10;
  return `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} from ${p.open}`;
}
