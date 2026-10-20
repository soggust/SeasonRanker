// A fighter the site has no row for (a debut on the Book's card: the update keeps fighters with a fight in
// the promotions it covers): a minimal card's row from ESPN's athlete page, his pro record, gym, country and
// division, the rest of his stats empty (SPORT.stubPlayer; the card shows him UR). Tested under Node
// (tests/player-link.test.mjs: stubFromEspn).
import type { Position, SkillPlayer, SkillStatKey } from './positions';

// ESPN's athlete (site.web.api.espn.com/apis/common/v3/sports/mma/athletes/{id}), the parts read here
export interface EspnFighter {
  athlete?: {
    id?: string;
    displayName?: string;
    gender?: string;
    weightClass?: { text?: string } | null;
    association?: { name?: string } | null;
    citizenship?: string | null;
    flag?: { href?: string } | null;
    statsSummary?: { statistics?: { name?: string; displayValue?: string }[] } | null;
  };
}

const DIVISIONS: Record<string, Position> = {
  heavyweight: 'HW',
  'light heavyweight': 'LHW',
  middleweight: 'MW',
  welterweight: 'WW',
  lightweight: 'LW',
  featherweight: 'FW',
  bantamweight: 'BW',
  flyweight: 'FLW',
  "women's bantamweight": 'WBW',
  "women's featherweight": 'WBW',
  "women's flyweight": 'WFLW',
  "women's strawweight": 'WSW',
};

// His tab: his weight class's division (a woman's: the women's), else the pound-for-pound list
export function stubDivision(weightClass: string | null | undefined, female: boolean): Position {
  const text = (weightClass ?? '').toLowerCase().replace(/^w(omen'?s)? /, '').trim();
  const division = DIVISIONS[female ? `women's ${text}` : text];
  return division ?? (female ? 'WP4P' : 'P4P');
}

export function stubFromEspn(body: EspnFighter, ref: { id: string; name: string | null }): { position: Position; player: SkillPlayer } | null {
  const a = body.athlete;
  const name = a?.displayName || ref.name;
  if (!name) return null;
  const record = a?.statsSummary?.statistics?.find((s) => s.name === 'wins-losses-draws')?.displayValue ?? null;
  const [wins, losses, ties] = (record?.match(/^(\d+)-(\d+)-(\d+)$/)?.slice(1) ?? []).map(Number);
  const fights = record ? wins + losses + ties : 0;
  const female = /^f/i.test(a?.gender ?? '') || /^w(omen'?s)? /i.test(a?.weightClass?.text ?? '');
  const position = stubDivision(a?.weightClass?.text, female);
  const stats = { wins: record ? wins : null, losses: record ? losses : null, ties: record ? ties : null, winPct: fights ? (wins + ties / 2) / fights : null } as Record<SkillStatKey, number | null>;
  const id = Number(a?.id ?? ref.id);
  return {
    position,
    player: {
      id: Number.isFinite(id) ? id : null,
      gsisId: String(a?.id ?? ref.id),
      name,
      teamLogo: a?.flag?.href ?? '',
      teamName: a?.association?.name ?? null,
      country: a?.citizenship ?? null,
      games: fights,
      statFights: 0,
      division: position.includes('P4P') ? undefined : position,
      stats,
      pro: record,
      fights: [],
      lastFive: [],
      awards: [],
    },
  };
}

export async function stubFighter(ref: { id: string; name: string | null }): Promise<{ position: Position; player: SkillPlayer } | null> {
  if (!/^\d+$/.test(ref.id)) return null;
  try {
    const response = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/mma/athletes/${ref.id}`);
    return stubFromEspn(response.ok ? ((await response.json()) as EspnFighter) : {}, ref);
  } catch {
    return stubFromEspn({}, ref);
  }
}
