// Card and game links (libs/ranker/src/engine/card-link.ts, the Share buttons in the card's and the game
// view's headers): a link names the grid's tab, the season, the row by the id its tab keys it by and the
// card tab showing, on the live site's address; opened, the service hands the grid that card (or game) once
// and takes the params out of the address. Every kind of row: a player tab's, a team tab's (the NFL's TM, DEF,
// OL), a coach's, a fighter's, a pooled tab's (the Top 50: his own tab's card, the grid on the Top 50). The
// Algorithm's older links (?card=<ESPN id>&name=, no tab) still open. Run against the real PositionService of
// each sport, under a stand-in page address (location / history).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS, loadEngine } from './support/engine.mjs';

function setAddress(href) {
  globalThis.location = new URL(href);
}
globalThis.history = { replaceState: (_state, _title, url) => setAddress(String(url)) };
globalThis.fetch = async () => {
  throw new Error('no network in tests');
};

const LINK_PARAMS = ['card', 'name', 'cardTab', 'game', 'gameTab'];
const LIVE = 'https://www.seasonranker.com';

for (const sport of SPORTS) {
  test(`${sport}: a card's link opens that row on its tab, on the card tab it was shared on`, async () => {
    const page = `https://ranker.test/${sport}/`;
    setAddress(page);
    const engine = await loadEngine(sport);
    const { PositionService, POSITIONS, SKILL_UNITS, CURRENT_SEASON, SPORT, isPooled, homeTab } = engine;

    // (each tab's first and last rows: players, teams, coaches, fighters)
    const tabs = POSITIONS.filter((p) => SKILL_UNITS[p]?.length);
    assert.ok(tabs.length > 1);
    for (const tab of tabs) {
      for (const row of [SKILL_UNITS[tab][0], SKILL_UNITS[tab].at(-1)]) {
        setAddress(`${page}?pos=${tabs[0]}`);
        const link = new URL(new PositionService().cardLink({ position: tab, season: CURRENT_SEASON, id: row.gsisId, name: row.name, tab: 'games' }));
        assert.equal(link.origin, LIVE, 'the live site');
        assert.equal(link.pathname, `/${sport}/`);
        assert.equal(link.searchParams.get('pos'), tab);
        assert.equal(link.searchParams.get('card'), row.gsisId);
        assert.equal(link.searchParams.get('name'), row.name);
        assert.equal(link.searchParams.get('cardTab'), 'gamelog');
        assert.equal(link.searchParams.has('season'), false, 'the current season left out');

        setAddress(link.href.replace(LIVE, 'https://ranker.test'));
        const opened = new PositionService();
        const position = isPooled(tab) ? homeTab(row, tab) : tab;
        assert.deepEqual(opened.takePendingCard(tab), { grid: tab, position, gsisId: row.gsisId, tab: 'games' }, `${tab} ${row.name}`);
        assert.equal(opened.takePendingCard(tab), null, 'once');
        assert.equal(opened.takeCardMissing(), false);
        const now = new URL(location.href);
        for (const param of LINK_PARAMS) assert.equal(now.searchParams.has(param), false, `?${param}= left in the address`);
        assert.equal(now.searchParams.get('pos'), tab, 'the tab kept');
      }
    }
    // (a team tab's rows among them, when the sport has one)
    if (SPORT.teamTabs) assert.ok(tabs.some((t) => SPORT.teamTabs.includes(t)));

    // Every card tab by its word in the link and by its own id; the Overview leaves it out
    const [tab] = tabs;
    const row = SKILL_UNITS[tab][0];
    const words = { overview: null, analysis: 'analysis', depth: 'team', stats: 'stats', games: 'gamelog', seasons: 'career', history: 'history' };
    for (const [cardTab, word] of Object.entries(words)) {
      setAddress(page);
      const link = new URL(new PositionService().cardLink({ position: tab, season: CURRENT_SEASON, id: row.gsisId, name: row.name, tab: cardTab }));
      assert.equal(link.searchParams.get('cardTab'), word);
      for (const asked of [word, cardTab, word?.toUpperCase()]) {
        const url = new URL(link);
        if (asked) url.searchParams.set('cardTab', asked);
        setAddress(url.href);
        const want = cardTab === 'overview' && !asked ? null : cardTab;
        assert.equal(new PositionService().takePendingCard(tab)?.tab, want, `${cardTab} as ${asked}`);
      }
    }

    // Another season goes in the link (data.ts loads it before the grid reads the card)
    setAddress(page);
    const other = new URL(new PositionService().cardLink({ position: tab, season: CURRENT_SEASON - 3, id: row.gsisId, name: row.name, tab: 'stats' }));
    assert.equal(other.searchParams.get('season'), String(CURRENT_SEASON - 3));
    // ...and a season this page didn't load (one the site doesn't have) finds nobody: the grid's note
    setAddress(other.href);
    const elsewhere = new PositionService();
    assert.equal(elsewhere.takePendingCard(tab), null);
    assert.equal(elsewhere.takeCardMissing(), true);
    assert.equal(elsewhere.takeCardMissing(), false, 'once');

    // Nobody by that id or name, and no tab: missing (the note), the params still taken out
    setAddress(`${page}?card=nobody-here&name=No%20Such%20Player`);
    assert.equal(new PositionService().takeCardMissing(), true);
    assert.equal(new URL(location.href).searchParams.has('card'), false);
    // (an ESPN id the site has no row for, where the sport makes minimal cards, MMA's debut fighters: his
    // minimal card, not the note)
    setAddress(`${page}?card=99999999&name=No%20Such%20Fighter`);
    const debut = new PositionService();
    assert.equal(debut.takeCardMissing(), !SPORT.stubPlayer);
    assert.deepEqual(debut.takePendingStub(), SPORT.stubPlayer ? { id: '99999999', name: 'No Such Fighter' } : null);
    // (a row on a tab the default settings hide, MMA's women's divisions: the settings that show it, its tab open)
    const hidden = tabs.find((t) => SPORT.tabVisible && !SPORT.tabVisible(t, new PositionService().settings.sport) && !isPooled(t));
    if (hidden) {
      const row = SKILL_UNITS[hidden][0];
      setAddress(`${page}?name=${encodeURIComponent(row.name)}&card=${row.id}`);
      const shown = new PositionService();
      assert.equal(SPORT.tabVisible(hidden, shown.settings.sport), true, `${hidden} shown for ${row.name}`);
      assert.equal(shown.position, hidden);
      assert.equal(shown.takePendingCard(hidden)?.gsisId, row.gsisId);
    }
    // (an id on its tab not in the ranked rows: his tab and id, for the card to look in the unranked rows)
    setAddress(`${page}?pos=${tab}&card=nobody-here`);
    assert.deepEqual(new PositionService().takePendingCard(tab), { grid: tab, position: tab, gsisId: 'nobody-here', tab: null });

    // The Algorithm's older links: ?card=<ESPN id>&name=, no tab, by ESPN id; by name when the id isn't found
    const players = tabs.filter((t) => !SPORT.teamTabs?.includes(t) && !isPooled(t));
    const espn = players.map((t) => [t, SKILL_UNITS[t].find((p) => p.id != null && p.gsisId !== String(p.id))]).find(([, p]) => p);
    if (espn) {
      const [t, p] = espn;
      setAddress(`${page}?card=${p.id}&name=${encodeURIComponent(p.name)}`);
      assert.equal(new PositionService().takePendingCard(t)?.gsisId, p.gsisId, 'by ESPN id');
    }
    const named = SKILL_UNITS[players[0]][0];
    setAddress(`${page}?card=0&name=${encodeURIComponent(named.name.toUpperCase())}`);
    assert.equal(new PositionService().takePendingCard(players[0])?.gsisId, named.gsisId, 'by name');
  });
}

test('a game link opens that game on its tab, once, and leaves the address clean', async () => {
  setAddress('https://ranker.test/nfl/?pos=QB');
  const { PositionService, gameTabOf } = await loadEngine('nfl');
  const link = new URL(new PositionService().gameLink('401671789', 'box'));
  assert.equal(link.origin, LIVE);
  assert.equal(link.pathname, '/nfl/');
  assert.equal(link.searchParams.get('pos'), 'QB');
  assert.equal(link.searchParams.get('game'), '401671789');
  assert.equal(link.searchParams.get('gameTab'), 'box');
  assert.equal(new URL(new PositionService().gameLink('401671789', null)).searchParams.has('gameTab'), false);

  setAddress(link.href);
  const opened = new PositionService();
  assert.deepEqual(opened.takePendingGame(), { event: '401671789', tab: 'box' });
  assert.equal(opened.takePendingGame(), null, 'once');
  for (const param of LINK_PARAMS) assert.equal(new URL(location.href).searchParams.has(param), false, `?${param}= left`);
  assert.equal(new URL(location.href).searchParams.get('pos'), 'QB');
  // (an unknown tab: the game on its own first tab; junk for an id: nothing, the param still taken out)
  setAddress('https://ranker.test/nfl/?game=401671789&gameTab=nope');
  assert.deepEqual(new PositionService().takePendingGame(), { event: '401671789', tab: null });
  setAddress('https://ranker.test/nfl/?game=%3Cscript%3E');
  assert.equal(new PositionService().takePendingGame(), null);
  assert.equal(new URL(location.href).searchParams.has('game'), false);
  for (const tab of ['summary', 'box', 'plays', 'chart', 'pitches', 'fantasy', 'highlights', 'info', 'preview', 'injuries']) assert.equal(gameTabOf(tab), tab);
  assert.equal(gameTabOf('Box Score'), null);
});

test('a card link made on a local server still points at the live site, with the card\'s season', async () => {
  setAddress('http://localhost:4519/nba/?pos=PG&season=2024');
  const { PositionService, CURRENT_SEASON, SKILL_UNITS } = await loadEngine('nba');
  const row = SKILL_UNITS.PG[0];
  const link = new URL(new PositionService().cardLink({ position: 'PG', season: CURRENT_SEASON, id: row.gsisId, name: row.name, tab: 'overview' }));
  assert.ok(link.href.startsWith(`${LIVE}/nba/?`), link.href);
  assert.equal(link.searchParams.has('season'), false);
  assert.equal(link.searchParams.has('cardTab'), false);
});
