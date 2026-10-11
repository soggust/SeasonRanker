// Other seasons' data, for the player card (and Rookies Only): fetched when first asked for, then kept
// for the visit. A failed fetch is forgotten, so the next ask tries again.
import { Injectable } from '@angular/core';
import { SkillPlayer, SkillPosition } from '@sport/positions';
import { CURRENT_SEASON, SeasonPart, dataPart, dataSeason, fetchSeason, fetchSeasonFile } from '@ranker/engine/data';
import { unitsForSeason } from '@ranker/engine/unit-scoring';
import { CareersFile, CompsFile } from '@ranker/engine/player-card/card.model';
import { SPORT } from '@sport/sport';

// A season's unranked rows (SPORT.unrankedSeasons), a file per part like its ranked ones (skill-players.ur.post.json)
const urFile = (part: SeasonPart) => (part === 'regular' ? 'skill-players.ur.json' : `skill-players.ur.${part}.json`);

// A file checked with the server each visit: {} when it isn't there (a tab without any; the host's page
// fallback answers a missing file with the app's page, not JSON), a failure thrown (asked
// again next time)
function fetchOrEmpty<T>(url: string): Promise<T> {
  return fetch(url, { cache: 'no-cache' }).then((res) => (res.ok ? res.json().catch(() => ({}) as T) : res.status === 404 ? ({} as T) : Promise.reject(new Error(String(res.status)))));
}

@Injectable({ providedIn: 'root' })
export class SeasonDataService {
  private cache = new Map<string, Promise<unknown>>();

  private once<T>(key: string, load: () => Promise<T>, retry = true): Promise<T> {
    let data = this.cache.get(key) as Promise<T> | undefined;
    if (!data) {
      data = load();
      if (retry) data.catch(() => this.cache.delete(key));
      this.cache.set(key, data);
    }
    return data;
  }

  // A season's rows, every tab
  rows(season: number): Promise<Record<SkillPosition, SkillPlayer[]>> {
    return this.once(`rows.${season}`, () => fetchSeason(season).then((data) => unitsForSeason(data, season)));
  }

  // One tab's rows for a finished season (a small file per tab)
  tabRows(season: number, position: SkillPosition): Promise<SkillPlayer[]> {
    return this.once(`tab.${season}.${position}`, () => fetchSeasonFile<SkillPlayer[]>(season, `units/${position}.json`));
  }

  // A season's unranked rows by tab (SPORT.unrankedSeasons: skill-players.ur.json, everyone who played
  // outside the ranked lists), each marked ur; none for a sport without them, or a season without the file.
  // The part is the one its ranked rows are read in: the table's for the table's season (the playoffs, or
  // both, when Length is on one), the regular season for any other, as the card and the compare view read
  // those; a part with no file (no playoffs played, or none built) has none
  unranked(season: number, part: SeasonPart = season === dataSeason ? dataPart : 'regular'): Promise<Partial<Record<SkillPosition, SkillPlayer[]>>> {
    if (!SPORT.unrankedSeasons) return Promise.resolve({});
    return this.once(`ur.${season}.${part}`, () =>
      fetchSeasonFile<Partial<Record<SkillPosition, SkillPlayer[]>>>(season, urFile(part))
        .then((tabs) => {
          for (const rows of Object.values(tabs ?? {})) for (const row of rows ?? []) (row as SkillPlayer & { ur?: boolean }).ur = true;
          return tabs ?? {};
        })
        .catch(() => ({})),
    );
  }

  // One unranked row: someone's season outside a tab's ranked list (none: he's ranked, or didn't play), in
  // the part unranked reads
  async unrankedRow(season: number, position: SkillPosition, gsisId: string, part?: SeasonPart): Promise<SkillPlayer | undefined> {
    return (await this.unranked(season, part))[position]?.find((p) => p.gsisId === gsisId);
  }

  // A tab's finished seasons, each one's (checked with the server each visit: it changes once a year, at
  // the season rollover; none for a tab without any)
  careers(position: SkillPosition): Promise<CareersFile> {
    return this.once(`careers.${position}`, () => fetchOrEmpty<CareersFile>(`data/careers/${position}.json`));
  }

  // Everyone's first season in the data (Rookies Only)
  firstSeasons(): Promise<Record<string, number>> {
    return this.once('first-seasons', () => fetchOrEmpty<Record<string, number>>('data/careers/first-seasons.json'));
  }

  // Everyone's name in the finished seasons, by tab (the compare view's search: { id: [name, headshot id,
  // last season] })
  careerNames(): Promise<Partial<Record<SkillPosition, Record<string, [string, number | null, number]>>>> {
    return this.once('career-names', () => fetchOrEmpty('data/careers/names.json'));
  }

  // A finished season's similar seasons
  comps(season: number): Promise<CompsFile> {
    return this.once(`comps.${season}`, () => fetchSeasonFile<CompsFile>(season, 'comps.json'), false);
  }

  // A season's extra file (the sport's card extras); missing reads as empty: not every season has one
  extraFile<T>(season: number, file: string): Promise<T> {
    return this.once(
      `extra.${season}/${file}`,
      () => (season === CURRENT_SEASON ? Promise.resolve({}) : fetchSeasonFile(season, file).catch(() => ({}))) as Promise<T>,
    );
  }
}
