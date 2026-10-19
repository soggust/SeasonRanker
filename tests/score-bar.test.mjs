// The grid's Score column (score-bar.ts, the owner's spec 2026-10-19): the score to one place, its bar the score
// over the best in the list (the list's scores are weighted standard scores, not 0-100), held to the track;
// and the cell's meter as the template writes it (role, min 0, max 100, its value the bar's share, its label the
// score), with the fill's width bound to the bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const entry = path.join(import.meta.dirname, 'support/score-bar-entry.ts');
const html = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/src/engine/skill-rankings/skill-rankings.component.html'), 'utf8');

test('scoreBar: width is score / maxScore as a percentage, held to 0-100; one place in the text', async () => {
  const { scoreBar, scoreBarPct, maxScoreOf, scoreOneDecimal } = await loadEngine('nfl', { entry });
  assert.equal(scoreBarPct(10, 20), 50);
  assert.equal(scoreBarPct(20, 20), 100);
  assert.equal(scoreBarPct(5, 20), 25);
  // (a score at or under 0: an empty track; the best not above 0: every track empty; never past full)
  assert.equal(scoreBarPct(-3, 20), 0);
  assert.equal(scoreBarPct(0, 20), 0);
  assert.equal(scoreBarPct(4, 0), 0);
  assert.equal(scoreBarPct(4, -2), 0);
  assert.equal(scoreBarPct(25, 20), 100);
  assert.equal(scoreBarPct(NaN, 20), 0);
  assert.equal(maxScoreOf([3.2, 21.04, -4, NaN, 8]), 21.04);
  assert.equal(scoreOneDecimal(21.04), '21.0');
  assert.equal(scoreOneDecimal(-0.04), '0.0');
  assert.equal(scoreOneDecimal(-3.26), '−3.3');
  const bar = scoreBar(8.12, 21.04);
  assert.equal(bar.text, '8.1');
  assert.ok(Math.abs(bar.pct - (8.12 / 21.04) * 100) < 1e-9);
  assert.equal(bar.now, 38.6);
  assert.equal(bar.label, 'Score 8.1');
});

test('the Score cell: a meter 0-100 with its value and label, the fill as wide as the bar, in the name column', () => {
  const track = html.match(/<span class="score-track"[^>]*>/)?.[0];
  assert.ok(track, 'the score track is in the template');
  assert.match(track, /role="meter"/);
  assert.match(track, /aria-valuemin="0"/);
  assert.match(track, /aria-valuemax="100"/);
  assert.match(track, /\[attr\.aria-valuenow\]="sc\.now"/);
  assert.match(track, /\[attr\.aria-label\]="sc\.label"/);
  assert.match(html, /<i class="score-fill" \[style\.width\.%\]="sc\.pct">/);
  // (between the rank tile and the team card, inside the row's player-info)
  const info = html.indexOf('class="player-info"', html.indexOf('@for (player of gridRows'));
  const rank = html.indexOf('class="rank-tile"', info);
  const cell = html.indexOf('class="score-cell"', info);
  const badge = html.indexOf('class="badge-slot', info);
  assert.ok(info < rank && rank < cell && cell < badge);
  assert.match(html, /class="stat-label score-head"[^>]*>Score</);
});
