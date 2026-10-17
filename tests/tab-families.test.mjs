// The position bar's families (libs/ranker/src/engine/tab-families.ts, SportConfig.tabFamilies): the NFL's
// TM · OFF · DEF · ST · HC, each family a top-row tab whose members open from it (Team O · QB · RB · WR · TE · OL
// under OFF, Team D and the five defensive tabs under DEF, Team ST · K · P under ST). Every member is in
// exactly one family, its family's tab is the one lit for it, a shut family opens to its first member or the
// one this session last showed, the page lands on QB with the Offense family open, and old links keep
// their tab (?pos=def the team defenses). The phone's dropdown names every tab once in its groups and has
// no sub-row under it; the sub-row shows only on the tablet widths that can't hold the open family in the
// row. A sport without families gets exactly the bar it had: a plain tab for each of its tabs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SPORTS, loadEngine } from './support/engine.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'families-entry.ts');
const engines = {};
const engineFor = async (sport) => (engines[sport] ??= await loadEngine(sport, { entry: ENTRY }));
const styles = fs.readFileSync(path.join(ROOT, 'libs/ranker/src/styles/components/app.component.scss'), 'utf8');
const template = fs.readFileSync(path.join(ROOT, 'libs/ranker/src/engine/app.component.html'), 'utf8');
const variables = fs.readFileSync(path.join(ROOT, 'libs/ranker/src/styles/_variables.scss'), 'utf8');

test('nfl: the bar is TM · OFF · DEF · ST · HC, every member in one family, its family lit for it', async () => {
  const { SPORT, POSITIONS, mainTabs, litTab, familyOf, barCells, subTabs } = await engineFor('nfl');
  assert.deepEqual(mainTabs(SPORT.tabFamilies, POSITIONS), ['TM', 'OFF', 'DEF', 'ST', 'HC']);
  assert.deepEqual(
    SPORT.tabFamilies.map((f) => [f.parent, Object.keys(f.names)]),
    [
      ['OFF', ['OFF', 'QB', 'RB', 'WR', 'TE', 'OL']],
      ['DEF', ['DEF', 'EDGE', 'DL', 'LB', 'CB', 'S']],
      ['ST', ['ST', 'K', 'P']],
    ],
  );
  // (the team tab leads each family, under its short name)
  assert.equal(SPORT.tabFamilies[0].names.OFF, 'Team O');
  assert.equal(SPORT.tabFamilies[1].names.DEF, 'Team D');
  assert.equal(SPORT.tabFamilies[2].names.ST, 'Team ST');
  for (const family of SPORT.tabFamilies) {
    assert.ok(family.label && /position$/.test(family.label), `${family.parent}: a label for the tab list`);
    for (const member of Object.keys(family.names)) {
      assert.ok(POSITIONS.includes(member), `${member}: a tab`);
      assert.equal(SPORT.tabFamilies.filter((f) => member in f.names).length, 1, `${member}: in one family`);
      assert.equal(litTab(SPORT.tabFamilies, member), family.parent, `${member}: ${family.parent} lit`);
      assert.equal(familyOf(SPORT.tabFamilies, member), family);
    }
  }
  for (const tab of ['TM', 'HC']) {
    assert.equal(familyOf(SPORT.tabFamilies, tab), null);
    assert.equal(litTab(SPORT.tabFamilies, tab), tab);
    assert.equal(subTabs(SPORT.tabFamilies, POSITIONS, tab), null, `${tab}: no sub-row`);
  }
  // The row with the quarterbacks showing: the Offense family open in place, the others shut
  const cells = barCells(SPORT.tabFamilies, POSITIONS, 'QB');
  assert.deepEqual(
    cells.map((c) => [c.kind, c.tab]),
    [['tab', 'TM'], ['open', 'OFF'], ['family', 'DEF'], ['family', 'ST'], ['tab', 'HC']],
  );
  assert.deepEqual(cells[1].members.map((m) => m.name), ['Team O', 'QB', 'RB', 'WR', 'TE', 'OL']);
  assert.equal(cells[1].label, 'Offense position');
  // ...and with a corner's list, the Defense family; the team defenses themselves open it too (?pos=def)
  for (const pos of ['CB', 'DEF']) assert.equal(barCells(SPORT.tabFamilies, POSITIONS, pos).find((c) => c.kind === 'open').tab, 'DEF', pos);
  assert.equal(barCells(SPORT.tabFamilies, POSITIONS, 'K').find((c) => c.kind === 'open').tab, 'ST');
  // (the sub-row, where it shows, is the same members)
  assert.deepEqual(subTabs(SPORT.tabFamilies, POSITIONS, 'RB').map((m) => m.tab), ['OFF', 'QB', 'RB', 'WR', 'TE', 'OL']);
});

test('nfl: a shut family opens to its first member, or the one last shown; the page lands on QB', async () => {
  const { SPORT, POSITIONS, familyOpensTo } = await engineFor('nfl');
  const [off, def, st] = SPORT.tabFamilies;
  assert.equal(familyOpensTo(off, POSITIONS, null), 'OFF');
  assert.equal(familyOpensTo(def, POSITIONS, null), 'DEF');
  assert.equal(familyOpensTo(st, POSITIONS, null), 'ST');
  assert.equal(familyOpensTo(off, POSITIONS, 'TE'), 'TE');
  // (a memory that isn't one of its members, or a tab the settings hide: the first)
  assert.equal(familyOpensTo(off, POSITIONS, 'CB'), 'OFF');
  assert.equal(familyOpensTo(st, ['ST', 'K'], 'P'), 'ST');
  assert.equal(SPORT.landingTab, 'QB');
  assert.ok('QB' in off.names, 'the landing tab is in the Offense family');
});

test('nfl: the phone dropdown names every tab once in its groups, the team tabs in full', async () => {
  const { SPORT, POSITIONS, selectGroups } = await engineFor('nfl');
  const groups = selectGroups(SPORT.tabGroups, POSITIONS, (tab) => SPORT.tabNames[tab]);
  assert.deepEqual(groups.map((g) => g.label), ['Offense', 'Defense', 'Special Teams', 'Teams']);
  const listed = groups.flatMap((g) => g.tabs.map((t) => t.tab));
  assert.deepEqual([...listed].sort(), [...POSITIONS].sort(), 'every tab once');
  const name = (tab) => groups.flatMap((g) => g.tabs).find((t) => t.tab === tab).name;
  assert.equal(name('OFF'), 'Team Offense');
  assert.equal(name('DEF'), 'Team Defense');
  assert.equal(name('ST'), 'Team Special Teams');
  assert.equal(name('QB'), 'Quarterbacks');
  assert.deepEqual(groups[0].tabs.map((t) => t.tab), ['OFF', 'QB', 'RB', 'WR', 'TE', 'OL']);
});

test('the bar: no sub-row on phones, the sub-row only on the tablet widths, the accordion from 900px', () => {
  // The sub-row's rule block: hidden on phones (down(phone)) and from medium (900px) up, where the row
  // holds the open family itself
  const subRow = styles.slice(styles.indexOf('.position-sub-row {'), styles.indexOf('@keyframes family-open'));
  assert.match(subRow, /@include v\.down\(phone\) \{\s*display: none;\s*\}/, 'phones: no sub-row');
  assert.match(subRow, /@include v\.up\(medium\) \{\s*display: none;\s*\}/, 'from 900px: the accordion, no sub-row');
  // (the room it takes is only given on those widths)
  assert.match(styles, /@media \(min-width: v\.bp\(phone-up\)\) and \(max-width: #\{v\.bp\(medium\) - 1px\}\) \{\s*main \.content\.with-sub-row \{\s*--position-bar-space: 86px;/);
  assert.doesNotMatch(styles, /--position-bar-space: 100px/, 'no desktop room for a sub-row');
  // The accordion: the open family's members show from medium, unfolding only for those who haven't asked for
  // less motion (the one motion in the bar). The animation is set outside any @media (Angular doesn't rename a
  // scoped keyframe under one: tests/scoped-animations.test.mjs) and stopped under reduce
  assert.match(styles, /@keyframes family-open/);
  assert.match(styles, /\.member \{[\s\S]*?animation: family-open 0\.2s[\s\S]*?@media \(prefers-reduced-motion: reduce\) \{\s*animation: none;/);
  // No chevrons anywhere in the bar, and nothing styles a shut family apart from a plain tab: the only rules on
  // button.family are the lit one for the open family's tab on the sub-row widths, and the one that hides that
  // tab inside the open group on the accordion widths (the owner: the members alone are the group)
  assert.doesNotMatch(template, /chevron/i, 'no chevron element');
  assert.doesNotMatch(styles, /chevron/i, 'no chevron style');
  assert.doesNotMatch(template, /family-caption/, 'no caption: the members themselves say what the open group is');
  const familyRules = [...styles.matchAll(/button\.family\b[^{]*\{/g)].map((m) => m[0]);
  assert.deepEqual(familyRules, ["button.family[aria-expanded='true'] {", 'button.family {'], 'a shut family styled as a plain tab');
  assert.match(styles, /\.family-group \{[\s\S]*?> button\.family \{\s*display: none;/, "the open family's own tab hidden inside the group");
  assert.match(styles, /@media \(min-width: v\.bp\(phone-up\)\) and \(max-width: #\{v\.bp\(medium\) - 1px\}\) \{\s*button\.family\[aria-expanded='true'\] \{\s*@include v\.lit-tab;/);
  // The open family is one group: a wrapper holding the family's tab (the label) and then its members, one lit
  // rule (the lit tab's dots) under the whole group, a hairline at each end, the showing member's own rule out
  // of the way so the dots run as one row
  assert.match(
    template,
    /<span class="family-group" role="presentation">\s*<button[^>]*class="family open"\s+aria-expanded="true"[\s\S]*?<\/button>\s*@for \(member of cell\.members[\s\S]*?class="member"[\s\S]*?<\/button>\s*\}\s*<\/span>/,
  );
  assert.match(styles, /@include v\.up\(medium\) \{[\s\S]*?\.family-group \{\s*@include v\.lit-rule;\s*border-inline: 1px solid v\.\$panel-edge;[\s\S]*?button\.active::after \{\s*display: none;/);
  assert.match(variables, /@mixin lit-dots \{[\s\S]*?@include lit-rule;\s*\}/, 'the lit tab draws its rule with the same mixin');
  assert.match(styles, /\.family-group \{[\s\S]*?&::after \{\s*animation: none;/, 'the unfold is the one motion: the group rule does not ignite');
  // (the members are ordinary tabs: no smaller type, no dimming)
  const member = styles.slice(styles.indexOf('.member {', styles.indexOf('.family-group {')), styles.indexOf('@include v.up(desktop)'));
  assert.doesNotMatch(member, /font-size|opacity/, 'members at the tabs\' size');
  // The template: one tab list, the shut families aria-expanded="false", the members tabs
  assert.match(template, /<nav class="position-bar"[^>]*role="tablist"/);
  assert.match(template, /class="family"\s+aria-expanded="false"/);
  assert.match(template, /class="member"[\s\S]*?role="tab"|role="tab"\s+class="member"/);
  // (phones: the native select only; the sub-row, where it renders, is its own tab list named for its family)
  assert.match(template, /<select\s+class="position-select"/);
  assert.match(template, /<nav class="position-sub-row" role="tablist" \[attr\.aria-label\]="subRowLabel\(position\)">/);
});

for (const sport of SPORTS.filter((s) => s !== 'nfl')) {
  test(`${sport}: no families, so the bar is exactly its tabs`, async () => {
    const { SPORT, POSITIONS, mainTabs, barCells, subTabs, selectGroups, litTab } = await engineFor(sport);
    assert.equal(SPORT.tabFamilies, undefined);
    assert.deepEqual(mainTabs(SPORT.tabFamilies, POSITIONS), POSITIONS);
    for (const tab of POSITIONS) {
      assert.deepEqual(barCells(SPORT.tabFamilies, POSITIONS, tab), POSITIONS.map((t) => ({ kind: 'tab', tab: t })));
      assert.equal(subTabs(SPORT.tabFamilies, POSITIONS, tab), null);
      assert.equal(litTab(SPORT.tabFamilies, tab), tab);
    }
    // (the dropdown: one ungrouped list, named as the bar names them)
    const groups = selectGroups(SPORT.tabGroups, POSITIONS, (tab) => SPORT.tabNames[tab]);
    if (!SPORT.tabGroups) {
      assert.deepEqual(groups, [{ label: null, tabs: POSITIONS.map((tab) => ({ tab, name: SPORT.tabNames[tab] })) }]);
    }
    assert.deepEqual([...groups.flatMap((g) => g.tabs.map((t) => t.tab))].sort(), [...POSITIONS].sort());
  });
}
