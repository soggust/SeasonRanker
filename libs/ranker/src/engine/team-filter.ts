// The settings menu's Teams Included: the grid shows one team's rows, or everyone's (All). Display
// only: the list is ranked league-wide first (the same pool, averages and scores), then filtered, so
// each row keeps its league rank; the UR rows below the line follow it too. Kept in memory for the
// sport being looked at, never saved: another sport, or a reload, starts on All.
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { SPORT } from '@sport/sport';
import { extras, logoFile } from '@ranker/engine/row-fields';

interface TeamRow {
  name: string;
  teamLogo: string;
}

export interface TeamOption {
  // (the team, as teamKey has it: what the pick and the filter match on)
  key: string;
  // (a logo of its from the list, for drawing)
  logo: string;
  name: string;
}

// A team that stays the same team from season to season: its logo's file without an era (the NHL's
// BOS_20232024 and BOS_20082009-20222023 are both BOS, and WSH_secondary is WSH)
export function teamKey(logo: string | undefined): string | null {
  const file = logoFile(logo) ?? logo;
  return file ? file.replace(/_(\d{8}(-\d{8})?|secondary)$/, '') : null;
}

// The teams in a list's rows (a traded player under the team on his row), A to Z by name. nameOf: a
// team's name from one of its rows, or null (then another of its rows, then the logo's file)
export function teamOptions<T extends TeamRow>(rows: T[], nameOf: (row: T) => string | null | undefined): TeamOption[] {
  const teams = new Map<string, { logo: string; name: string | null }>();
  for (const row of rows) {
    const key = teamKey(row.teamLogo);
    if (!key || teams.get(key)?.name) continue;
    teams.set(key, { logo: teams.get(key)?.logo ?? row.teamLogo, name: nameOf(row) ?? null });
  }
  return [...teams]
    .map(([key, { logo, name }]) => ({ key, logo, name: name ?? key }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The grid's rows with a team picked (its teamKey): its ranked rows, then its UR ones, each ranked row's place in the
// whole list (0 the first) and in the team's. No team: everyone, as ranked.
export interface TeamRows<T> {
  rows: T[];
  // (how many of rows are ranked: the UR rows start there)
  ranked: number;
  leagueIndex: Map<T, number>;
}

export function teamRows<T extends TeamRow>(ranked: T[], unranked: T[], team: string | null): TeamRows<T> {
  const leagueIndex = new Map(ranked.map((row, i) => [row, i]));
  if (!team) return { rows: unranked.length ? [...ranked, ...unranked] : ranked, ranked: ranked.length, leagueIndex };
  const own = ranked.filter((row) => teamKey(row.teamLogo) === team);
  return { rows: [...own, ...unranked.filter((row) => teamKey(row.teamLogo) === team)], ranked: own.length, leagueIndex };
}

// "1st", "2nd", "13th"
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

// The rank tile's hover with a team picked: "2nd on the Buffalo Bills · #14 in the league" (places from 1)
export function teamPlaceText(place: number, league: number, team: string): string {
  return `${ordinal(place)} on the ${team} · #${league} in the league`;
}

// The pick (a teamKey), for one sport at a time: asked for by another sport, it's All again
export class TeamPick {
  private sport: string | null = null;
  private key: string | null = null;

  team(sport: string): string | null {
    return sport === this.sport ? this.key : null;
  }

  pick(sport: string, key: string | null): void {
    this.sport = sport;
    this.key = key;
  }

  // (another season or tab: kept while the team is in its list, else All)
  keep(sport: string, options: TeamOption[]): boolean {
    const key = this.team(sport);
    if (!key || options.some((option) => option.key === key)) return false;
    this.key = null;
    return true;
  }
}

// A team's name from a row: its own teamName, else the sport's (the NFL's from its Defenses rows)
export function rowTeamName(row: TeamRow, rows: Record<string, TeamRow[]>): string | null {
  return extras(row).teamName ?? SPORT.teamName?.(row as never, '', rows as never) ?? null;
}

// The pick and the teams it can be, shared by the settings menu (the dropdown) and the grid (its rows)
@Injectable({ providedIn: 'root' })
export class TeamFilterService {
  // (a sport without teams has no dropdown: MMA)
  readonly available = !SPORT.noTeams;
  options: TeamOption[] = [];
  readonly changed$ = new Subject<void>();
  private readonly pickState = new TeamPick();

  get team(): string | null {
    return this.pickState.team(SPORT.id);
  }

  // (the picked team's option: its name, and its logo in the season shown)
  get picked(): TeamOption | null {
    const team = this.team;
    return team ? (this.options.find((option) => option.key === team) ?? null) : null;
  }

  get teamName(): string | null {
    return this.picked?.name ?? null;
  }

  pick(key: string | null): void {
    if (key === this.team) return;
    this.pickState.pick(SPORT.id, key);
    this.changed$.next();
  }

  // The grid's teams (its season and tab): a pick not among them goes back to All
  offer(options: TeamOption[]): void {
    this.options = options;
    this.pickState.keep(SPORT.id, options);
  }
}
