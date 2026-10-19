// The ranking grid on a phone (phone-grid.ts; the owner's notes, 2026-10-19): its groups start collapsed there and
// open wider, a group set by hand keeping its state; its pinned name column reads short names; its Score column
// drops the bar (and scrolled sideways the whole cell); the sport bar drops the brand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const entry = path.join(import.meta.dirname, 'support/group-ranks-entry.ts');

// A group no one has touched starts open on a desktop or tablet and collapsed on a phone (the grid's phone width,
// 575px: the owner's note, 2026-10-19); one opened or collapsed by hand stays so at every width, and a link carries
// both (x opened, c collapsed)
test('groups start open wide and collapsed on a phone; a group set by hand keeps its state at every width', async () => {
  globalThis.location ??= new URL('https://ranker.test/nfl/');
  globalThis.history ??= { replaceState: () => {} };
  const { PositionService, skillGroups, resetPhoneGrid, groupsStartCollapsed } = await loadEngine('nfl', { entry });
  const before = globalThis.matchMedia;
  let phone = false;
  globalThis.matchMedia = (q) => ({ get matches() { return q === '(max-width: 575px)' && phone; } });
  resetPhoneGrid();
  try {
    const service = new PositionService();
    const ids = skillGroups('QB').filter((g) => service.isGroupCollapsible('QB', g.id)).map((g) => g.id);
    assert.ok(ids.length >= 3);
    assert.equal(groupsStartCollapsed(), false);
    assert.ok(ids.every((id) => !service.isGroupCollapsed('QB', id)), 'a group started collapsed on a desktop');
    phone = true;
    assert.ok(ids.every((id) => service.isGroupCollapsed('QB', id)), 'a group started open on a phone');
    // (opened by hand on a phone: open; collapsed by hand on a desktop: collapsed; both at either width)
    service.toggleGroupCollapsed('QB', ids[0]);
    phone = false;
    service.toggleGroupCollapsed('QB', ids[1]);
    for (const width of [false, true]) {
      phone = width;
      assert.equal(service.isGroupCollapsed('QB', ids[0]), false, `opened, phone ${width}`);
      assert.equal(service.isGroupCollapsed('QB', ids[1]), true, `collapsed, phone ${width}`);
      assert.equal(service.isGroupCollapsed('QB', ids[2]), width, `untouched, phone ${width}`);
    }
    assert.deepEqual(service.layout.expanded, { QB: [ids[0]] });
    assert.deepEqual(service.layout.collapsed, { QB: [ids[1]] });
    // (closed again: collapsed by hand)
    service.toggleGroupCollapsed('QB', ids[0]);
    assert.deepEqual(service.layout.collapsed.QB.toSorted(), [ids[0], ids[1]].toSorted());
    // (a link's lists put in place: its collapsed collapsed, its opened open, the rest by the width)
    const other = new PositionService();
    other.applyLayout({ collapsed: { QB: [ids[1]] }, expanded: { QB: [ids[2]] } });
    phone = false;
    assert.equal(other.isGroupCollapsed('QB', ids[1]), true);
    assert.equal(other.isGroupCollapsed('QB', ids[0]), false);
    phone = true;
    assert.equal(other.isGroupCollapsed('QB', ids[2]), false);
    assert.equal(other.isGroupCollapsed('QB', ids[0]), true);
  } finally {
    globalThis.matchMedia = before;
    resetPhoneGrid();
  }
});

// A phone's name column (the owner's note, 2026-10-19): a team's nickname, a player's first initial and last name,
// suffixes kept, particles and hyphenated last names whole, initials as they are; nothing shorter: the whole name
test('short names: "Chiefs", "T. Brady", suffixes, particles and initials', async () => {
  const { shortPlayerName, shortTeamName } = await loadEngine('nfl', { entry });
  const teams = {
    'Kansas City Chiefs': 'Chiefs',
    'Boston Red Sox': 'Red Sox',
    'Portland Trail Blazers': 'Trail Blazers',
    'Columbus Blue Jackets': 'Blue Jackets',
    'Washington Football Team': 'Washington',
    'Utah Hockey Club': 'Utah',
    'Commanders': 'Commanders',
  };
  for (const [name, short] of Object.entries(teams)) assert.equal(shortTeamName(name), short, name);
  const players = {
    'Tom Brady': 'T. Brady',
    'Patrick Mahomes II': 'P. Mahomes II',
    'Odell Beckham Jr.': 'O. Beckham Jr.',
    'Ken Griffey Jr': 'K. Griffey Jr',
    'Amon-Ra St. Brown': 'A. St. Brown',
    'Kyle Van Noy': 'K. Van Noy',
    'Jose De La Cruz': 'J. De La Cruz',
    'Shai Gilgeous-Alexander': 'S. Gilgeous-Alexander',
    'A.J. Brown': 'A.J. Brown',
    'T.J. Watt': 'T.J. Watt',
    'Ja\'Marr Chase': 'J. Chase',
    'Van Jefferson': 'V. Jefferson',
    'Robert Griffin III': 'R. Griffin III',
    'Juan Carlos Ortiz': 'J. Ortiz',
    'Pelé': 'Pelé',
    'Bo Nix': 'Bo Nix',
  };
  for (const [name, short] of Object.entries(players)) assert.equal(shortPlayerName(name), short, name);
});

// The grid's template and styles: the name column reads rowName (short at the phone width, phone-grid.ts's
// isPhoneGrid), and the phone's styles hide the Score bar, the Score cell scrolled sideways (the rank tile opening
// why in its place: rankTileWhy), and the sport bar's brand
test('the phone grid: short names in the pinned column, no Score bar, no brand in the sport bar', () => {
  const dir = path.join(import.meta.dirname, '../libs/ranker/src');
  const html = fs.readFileSync(path.join(dir, 'engine/skill-rankings/skill-rankings.component.html'), 'utf8');
  assert.match(html, /<strong class="card-link card-target"[^>]*>\{\{ rowName\(player\) \}\}<\/strong>/);
  const ts = fs.readFileSync(path.join(dir, 'engine/skill-rankings/skill-rankings.component.ts'), 'utf8');
  assert.match(ts, /rowName\(row: SkillPlayer\): string \{\s*if \(!isPhoneGrid\(\)\) return row\.name;/);
  const css = fs.readFileSync(path.join(dir, 'styles/components/rankings.component.scss'), 'utf8');
  const phone = css.slice(css.indexOf('// (the name column on a phone'));
  assert.ok(phone.length > 0 && css.indexOf('// (the name column on a phone') > 0);
  assert.match(phone, /#rankings \.score-track,\s*#rankings\.scrolled-x \.score-cell,\s*#rankings\.scrolled-x \.score-head \{\s*display: none;/);
  const bar = fs.readFileSync(path.join(dir, 'styles/components/app.component.scss'), 'utf8');
  assert.match(bar, /@include v\.down\(phone\) \{[\s\S]*?a\.brand \{\s*display: none;/);
});
