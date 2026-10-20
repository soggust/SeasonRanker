// A fighter's link from the Book (book-rows.ts playerCardHref: his name and ESPN id) opens his card on the MMA
// site (the owner, 2026-10-19: Josh Hokit's opened, Amanda Nunes's didn't). Every fighter on the boards is
// found in the site's rows, on a tab the link's settings show (a women's fighter: the women's tabs,
// SPORT.tabShownBy), or has the ESPN id his minimal card is made from (SPORT.stubPlayer, stub-fighter.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { expandRows, loadEngine, readJson, staticDir } from './support/engine.mjs';

const mma = await loadEngine('mma', { entry: path.join(import.meta.dirname, 'support', 'mma-link-entry.ts'), data: {} });
const rows = expandRows(readJson(path.join(staticDir('mma'), 'skill-players.json')));
const board = readJson(path.join(staticDir('mma'), 'model', 'board.json'));
const defaults = Object.fromEntries((mma.SPORT.settings ?? []).map((s) => [s.key, s.default]));
const players = mma.POSITIONS.filter((tab) => !tab.includes('P4P'));
const tabs = { all: mma.POSITIONS, players, pooled: (tab) => tab.includes('P4P'), home: (_row, tab) => tab };

// The card a Book row's link asks for, as the MMA app reads it (position.service.ts linkedCard)
function open(name, id) {
  const href = mma.playerCardHref({ sport: 'mma', betType: 'moneyline', player: name, athleteId: id });
  const ask = mma.readCardAsk(new URL(href, 'https://www.seasonranker.com'));
  return { href, ask, card: mma.findLinkedCard(ask, rows, tabs) };
}

test("the Book's fighter link carries his ESPN id", () => {
  assert.equal(open('Amanda Nunes', '2516131').href, '/mma/?name=Amanda+Nunes&card=2516131');
  assert.equal(mma.playerCardHref({ sport: 'mma', betType: 'moneyline', player: 'Joaquin Buckley' }), '/mma/?name=Joaquin+Buckley');
  assert.deepEqual(mma.playerRefOf({ sport: 'nfl', betType: 'player', player: 'Drake Maye', athleteId: 4431452 }), { sport: 'nfl', name: 'Drake Maye', id: 4431452 });
  assert.equal(mma.playerRefOf({ sport: 'nfl', betType: 'spread', player: null, athleteId: 1 }), null);
});

test("a women's fighter's card: her division, and the settings that show the women's tabs", () => {
  const { card } = open('Amanda Nunes', '2516131');
  assert.equal(card?.grid, 'WBW');
  assert.equal(mma.SPORT.tabVisible('WBW', defaults), false);
  const shown = { ...defaults, ...mma.SPORT.tabShownBy('WBW', defaults) };
  assert.equal(shown.era, 'currentW');
  assert.equal(mma.SPORT.tabVisible('WBW', shown), true);
  assert.equal(mma.SPORT.tabShownBy('HW', { era: 'alltimeW' }).era, 'alltime');
  assert.equal(mma.SPORT.tabShownBy('WSW', { era: 'alltime' }).era, 'alltimeW');
});

test('every fighter on the boards opens a card: his row on a tab the link shows, or a minimal card by his ESPN id', () => {
  const fighters = board.games.flatMap((g) => [g.a, g.h]).filter((f) => f?.[0]);
  assert.ok(fighters.length > 0);
  for (const [name, id] of fighters) {
    const { card, ask } = open(name, id);
    if (card) {
      const shown = mma.SPORT.tabVisible(card.grid, defaults) ? defaults : { ...defaults, ...mma.SPORT.tabShownBy(card.grid, defaults) };
      assert.ok(mma.SPORT.tabVisible(card.grid, shown), `${name}: ${card.grid} shown`);
      assert.ok(rows[card.grid].some((p) => p.gsisId === card.gsisId), `${name}: row on ${card.grid}`);
    } else assert.match(ask.id ?? '', /^\d+$/, `${name}: no row and no ESPN id for a minimal card`);
  }
});

test("a minimal card's row: his record, gym, country and division from ESPN's athlete", () => {
  const espn = {
    athlete: {
      id: '5454811',
      displayName: 'Asaf Chopurov',
      gender: 'MALE',
      weightClass: { text: 'Bantamweight' },
      association: { name: 'Team Chingiz Allazov' },
      citizenship: 'Russia',
      flag: { href: 'https://a.espncdn.com/i/teamlogos/countries/500/rus.png' },
      statsSummary: { statistics: [{ name: 'wins-losses-draws', displayValue: '11-0-0' }] },
    },
  };
  const { position, player } = mma.stubFromEspn(espn, { id: '5454811', name: 'Asaf Chopurov' });
  assert.equal(position, 'BW');
  assert.equal(player.gsisId, '5454811');
  assert.equal(player.pro, '11-0-0');
  assert.deepEqual([player.stats.wins, player.stats.losses, player.stats.ties, player.games], [11, 0, 0, 11]);
  assert.equal(player.teamName, 'Team Chingiz Allazov');
  assert.equal(mma.stubDivision("Women's Strawweight", true), 'WSW');
  assert.equal(mma.stubDivision('Catchweight', false), 'P4P');
  assert.equal(mma.stubDivision(null, true), 'WP4P');
  // (ESPN out of reach: his name alone, no record)
  const bare = mma.stubFromEspn({}, { id: '5454811', name: 'Asaf Chopurov' });
  assert.equal(bare.player.name, 'Asaf Chopurov');
  assert.equal(bare.player.stats.wins, null);
  assert.equal(mma.stubFromEspn({}, { id: '1', name: null }), null);
});
