// A player's name or face outside the grid and the card links his card (libs/ranker/src/engine/player-link.ts,
// the <a playerLink> directive): in place in his own sport's app with a card host on the page, else his sport's
// app in a new tab by his name (his tab, his ESPN id where the page has them); a fight's fighter the same. And
// every template that shows a bet's player carries the link on his name and his face.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const links = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

test('playerCardPath: his sport, his name, his tab and his ESPN id where known', () => {
  assert.equal(links.playerCardPath({ sport: 'nfl', name: 'Drake Maye' }), '/nfl/?name=Drake+Maye');
  assert.equal(links.playerCardPath({ sport: 'nfl', name: 'Drake Maye', pos: 'qb' }), '/nfl/?name=Drake+Maye&pos=QB');
  assert.equal(links.playerCardPath({ sport: 'mma', name: 'Joaquin Buckley', pos: 'WW' }), '/mma/?name=Joaquin+Buckley&pos=WW');
  assert.equal(links.playerCardPath({ sport: 'nhl', name: 'Sebastian Aho', id: 3904173 }), '/nhl/?name=Sebastian+Aho&card=3904173');
  assert.equal(links.playerCardPath({ sport: 'nfl', name: '' }), null);
  assert.equal(links.playerCardPath({ sport: '', name: 'Drake Maye' }), null);
});

test('playerLinkOf: in place for this sport with a card host; another sport, or no host, a new tab', () => {
  const ref = { sport: 'nfl', name: 'Drake Maye' };
  assert.deepEqual(links.playerLinkOf(ref, { sport: 'nfl', host: true }), { href: '/nfl/?name=Drake+Maye', inApp: true });
  assert.deepEqual(links.playerLinkOf(ref, { sport: 'nfl', host: false }), { href: '/nfl/?name=Drake+Maye', inApp: false });
  assert.deepEqual(links.playerLinkOf({ sport: 'nba', name: 'Jalen Brunson' }, { sport: 'nfl', host: true }), { href: '/nba/?name=Jalen+Brunson', inApp: false });
  assert.equal(links.playerLinkOf({ sport: 'nfl', name: null }, { sport: 'nfl', host: true }), null);
});

test('the card host: opens in place while set, gone once taken away', () => {
  const asked = [];
  const off = links.setCardOpener((ref) => (asked.push(ref), true));
  assert.equal(links.hasCardOpener(), true);
  assert.equal(links.openCardInApp({ sport: 'nfl', name: 'Drake Maye', pos: 'qb' }), true);
  assert.deepEqual(asked, [{ name: 'Drake Maye', pos: 'QB', id: null }]);
  off();
  assert.equal(links.hasCardOpener(), false);
  assert.equal(links.openCardInApp({ sport: 'nfl', name: 'Drake Maye' }), false);
});

test("betPlayer and pickName: a prop's player, a fight's fighter; his name split off the pick's words", () => {
  assert.deepEqual(links.betPlayer({ sport: 'nfl', market: 'prop', player: 'Drake Maye', pick: 'Drake Maye Over 224.5' }), { sport: 'nfl', name: 'Drake Maye' });
  assert.deepEqual(links.betPlayer({ sport: 'mma', market: 'moneyline', player: null, pick: 'Joaquin Buckley' }), { sport: 'mma', name: 'Joaquin Buckley' });
  assert.equal(links.betPlayer({ sport: 'nfl', market: 'spread', player: null, pick: 'NE -3.5' }), null);
  assert.equal(links.betPlayer({ sport: 'nfl', market: 'total', pick: 'Over 44.5' }), null);
  assert.deepEqual(links.pickName('Drake Maye Over 224.5 Passing Yards', 'Drake Maye'), { name: 'Drake Maye', rest: ' Over 224.5 Passing Yards' });
  assert.deepEqual(links.pickName('Joaquin Buckley', 'Joaquin Buckley'), { name: 'Joaquin Buckley', rest: '' });
  assert.equal(links.pickName('Drake Mayeson Over 1.5', 'Drake Maye'), null);
  assert.equal(links.pickName('Over 44.5', 'Drake Maye'), null);
  assert.equal(links.playerCardHref({ sport: 'mma', betType: 'moneyline', player: 'Joaquin Buckley' }), '/mma/?name=Joaquin+Buckley');
});

// Every template that shows a bet's player: his name and his face carry the link (the directive, or pick-text's)
const ENGINE = path.join(import.meta.dirname, '..', 'libs', 'ranker', 'src', 'engine');
const TEMPLATES = {
  'account/wallet/game-lines.component.html': { faces: 3, names: 3 },
  'account/wallet/wallet-page.component.html': { picks: 2 },
  'account/wallet/bet-slip.component.html': { picks: 1 },
  'account/profile/user-profile.component.html': { picks: 1 },
  'game-view/game-view.component.html': { faces: 1, names: 1 },
  'book/model-desk.component.html': { faces: 2, names: 2 },
  'book/book-page.component.html': { faces: 2, names: 2, picks: 1 },
};

test('every listed template links its players: faces, names and picks', () => {
  for (const [file, want] of Object.entries(TEMPLATES)) {
    const html = fs.readFileSync(path.join(ENGINE, file), 'utf8');
    const faces = (html.match(/\[playerLink\]="[^"]+" playerLinkFace/g) ?? []).length;
    const names = (html.match(/\[playerLink\]="[^"]+">/g) ?? []).length;
    const picks = (html.match(/<pick-text [^>]*\[player\]=/g) ?? []).length;
    if (want.faces) assert.ok(faces >= want.faces, `${file}: ${faces} linked faces, want ${want.faces}`);
    if (want.names) assert.ok(names >= want.names, `${file}: ${names} linked names, want ${want.names}`);
    if (want.picks) assert.ok(picks >= want.picks, `${file}: ${picks} linked picks, want ${want.picks}`);
    // (no player's card by hand: the old links went through the helper)
    assert.doesNotMatch(html, /\?card=\$\{|playerLink\(b\)/, file);
  }
});
