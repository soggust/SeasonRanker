// The CHECKs' seeded labels (check-seeds.mjs; 2026-10-18, the owner's): past graded CHECKs, every sport's, researched
// after their games with the live research's own prompt, system and web search (research.mjs researchPrompt, SYSTEM),
// the search scoped to the news before each game's start, through the Message Batches API (half the tokens' price),
// so the CHECKs' patterns (check-patterns.mjs) start with hundreds of examples. Run by hand on this machine, never on
// the desk's path; its spend kept apart from the desk's research caps, in its own log (.cache/model/seed-usage.json),
// with a hard stop (--cap, $50) on everything the seeding ever spent.
//
//   node libs/ranker/scripts/model/seed-checks.mjs --list                 the candidates by sport, nothing spent
//   node libs/ranker/scripts/model/seed-checks.mjs --sample 20            a batch of 20, waited for, saved, its cost
//   node libs/ranker/scripts/model/seed-checks.mjs --rest [--cap 50]      the rest, as many as the cap holds at the
//                                                                          sample's highest cost a call
//   --env <file>   the .env to read the key from (the repo's own by default); the key is never printed
//
// Candidates: CHECKs graded (not void) with no live research of their own (research.mjs: a finding by Claude, not
// hollow) and no seed yet, the newest first. Each result: its finding as the live research makes it (findingOf, the
// cited URLs, the search errors and the hollow answer marked a problem), saved as a seed (check-seeds.mjs seedOf:
// seeded true, at its game's start) where it's a finding; a problem's cost counted all the same, its CHECK not seeded.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { costOf, loadSdk } from './ai-budget.mjs';
import { MAX_SEARCHES, MAX_TOKENS, RESEARCH_MODEL, SYSTEM, citedUrls, findingOf, hollow, researchPrompt, searchErrors, searchFailed } from './research.mjs';
import { readSeeds, seedOf, seedsFile } from './check-seeds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SPORTS = ['nfl', 'nhl', 'mlb', 'nba'];
const USAGE = path.join(ROOT, '.cache/model/seed-usage.json');
// (the batch's discount on the tokens; the searches billed in full)
export const BATCH_RATE = 0.5;
export const SCOPE = (start) => `\n\nThis is a look back at a game already played: it started ${start}. Use only news published before that start (the injury reports, depth charts, practice and beat reports of that week). Ignore anything published after it: the result, the box score, recaps, later injury news. Answer as of the start, as if the game were still to come; don't let how it went shape the answer.`;

// (a batch result's cost: the tokens at the batch's rate, the searches in full)
export function batchCost(usage) {
  const searches = costOf({ server_tool_use: usage?.server_tool_use ?? {} });
  return (costOf(usage) - searches) * BATCH_RATE + searches;
}

// (a message's finding, as research.mjs researchOne makes it from a call's last turn)
export function findingOfMessage(msg) {
  const text = msg?.stop_reason === 'end_turn' ? (msg.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('') : null;
  let f = text ? findingOf(text) : { player: null, status: 'unknown', reason: 'none', summary: '', sources: [], problem: `stopped: ${msg?.stop_reason ?? 'no answer'}` };
  if (text && !f.problem) {
    const cited = citedUrls(msg.content).filter((u) => !f.sources.includes(u));
    if (cited.length) f = { ...f, sources: [...f.sources, ...cited].slice(0, 5) };
  }
  const errs = [...new Set(searchErrors(msg?.content ?? []))];
  if (!f.problem && f.explains !== true && (errs.length || searchFailed(f))) f = { ...f, problem: 'stopped: search failed' };
  else if (!f.problem && hollow(f)) f = { ...f, problem: 'stopped: nothing found (no sources)' };
  return f;
}

// (the candidates of a sport: graded, not void, no live research, no seed, newest first)
export function candidatesOf(checks, seeded = new Set()) {
  const live = (c) => c.research && c.research.by !== 'rule' && !hollow(c.research) && !c.research.problem;
  return (checks ?? []).filter((c) => c?.id && c.checkResult && !c.checkResult.void && !live(c) && !seeded.has(c.id) && Date.parse(c.start ?? '') < Date.now()).sort((a, b) => String(b.start).localeCompare(String(a.start)));
}

function readChecksOf(sport) {
  const dir = path.join(ROOT, 'apps', sport, 'src/StaticData/model');
  for (const f of ['checks.json', 'ledger.json']) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (Array.isArray(j?.checks) && j.checks.length) return j.checks;
    } catch {
      // (none there)
    }
  }
  return [];
}
const readUsage = () => {
  try {
    return JSON.parse(fs.readFileSync(USAGE, 'utf8'));
  } catch {
    return { batches: [], spent: 0 };
  }
};
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
};

async function main() {
  const args = process.argv.slice(2);
  const arg = (k, d = null) => (args.includes(k) ? (args[args.indexOf(k) + 1] ?? d) : d);
  const envFile = arg('--env', path.join(ROOT, '.env'));
  if (!process.env.ANTHROPIC_API_KEY && fs.existsSync(envFile)) {
    const key = parseEnv(fs.readFileSync(envFile, 'utf8')).ANTHROPIC_API_KEY;
    if (key) process.env.ANTHROPIC_API_KEY = key;
  }
  const cap = Number(arg('--cap', '50'));
  const all = [];
  for (const sport of SPORTS) {
    const seeded = new Set(readSeeds(sport).map((s) => s.id));
    for (const c of candidatesOf(readChecksOf(sport), seeded)) all.push({ sport, c });
  }
  const by = Object.fromEntries(SPORTS.map((s) => [s, all.filter((x) => x.sport === s).length]));
  const usage = readUsage();
  console.log(`seed candidates: ${all.length} (${Object.entries(by).map(([s, k]) => `${s} ${k}`).join(', ')}); spent so far $${usage.spent.toFixed(2)} of the $${cap} cap`);
  if (args.includes('--list')) return;
  let take;
  if (args.includes('--sample')) take = all.slice(0, Number(arg('--sample', '20')));
  else if (args.includes('--rest')) {
    const sampled = usage.batches.flatMap((b) => b.costs ?? []);
    if (!sampled.length) throw new Error('no sample measured yet: run --sample first');
    const worst = Math.max(...sampled);
    const mean = sampled.reduce((a, b) => a + b, 0) / sampled.length;
    const room = cap - usage.spent;
    const fit = Math.max(0, Math.floor(room / worst));
    console.log(`the sample: ${sampled.length} calls, mean $${mean.toFixed(4)}, highest $${worst.toFixed(4)}; all ${all.length} project at $${(mean * all.length).toFixed(2)} (at the highest $${(worst * all.length).toFixed(2)}); $${room.toFixed(2)} left holds ${fit} at the highest`);
    if (mean * all.length + usage.spent > cap) console.log(`the rest projects over the $${cap} cap: only ${fit} sent`);
    take = all.slice(0, fit);
  } else throw new Error('--list, --sample N or --rest');
  if (!take.length) return console.log('nothing to send');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('no ANTHROPIC_API_KEY');
  const mod = await loadSdk();
  const Anthropic = mod.default ?? mod.Anthropic;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const ids = new Map(take.map((x, i) => [`s${i}`, x]));
  const batch = await client.messages.batches.create({
    requests: take.map((x, i) => ({
      custom_id: `s${i}`,
      params: {
        model: RESEARCH_MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: 'medium' },
        system: SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES }],
        messages: [{ role: 'user', content: `${researchPrompt(x.c, x.sport)}${SCOPE(x.c.start)}` }],
      },
    })),
  });
  console.log(`batch ${batch.id}: ${take.length} sent`);
  usage.batches.push({ id: batch.id, at: new Date().toISOString(), n: take.length, costs: [] });
  writeJson(USAGE, usage);
  let b = batch;
  while (b.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, 30_000));
    b = await client.messages.batches.retrieve(batch.id);
    console.log(`batch ${b.processing_status}: ${JSON.stringify(b.request_counts)}`);
  }
  const rec = usage.batches.at(-1);
  const seedsBy = new Map();
  let found = 0;
  const problems = {};
  for await (const r of await client.messages.batches.results(batch.id)) {
    const x = ids.get(r.custom_id);
    if (!x || r.result.type !== 'succeeded') {
      problems[r.result?.type ?? 'missing'] = (problems[r.result?.type ?? 'missing'] ?? 0) + 1;
      continue;
    }
    const msg = r.result.message;
    const cost = batchCost(msg.usage);
    rec.costs.push(Math.round(cost * 1e5) / 1e5);
    usage.spent += cost;
    const f = findingOfMessage(msg);
    if (f.problem) {
      problems[f.problem] = (problems[f.problem] ?? 0) + 1;
      continue;
    }
    const { problem: _p, ...kept } = f;
    if (!seedsBy.has(x.sport)) seedsBy.set(x.sport, []);
    seedsBy.get(x.sport).push(seedOf(x.c, { at: x.c.start, by: 'claude-batch', model: RESEARCH_MODEL, labeledAt: new Date().toISOString(), ...kept, cost: Math.round(cost * 1e4) / 1e4, seeded: true }));
    found++;
  }
  writeJson(USAGE, usage);
  for (const [sport, list] of seedsBy) {
    const file = seedsFile(sport);
    let j = { sport, seeds: [] };
    try {
      j = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      // (a fresh file)
    }
    const have = new Set(j.seeds.map((s) => s.id));
    j.seeds.push(...list.filter((s) => !have.has(s.id)));
    writeJson(file, j);
  }
  const costs = rec.costs;
  console.log(`batch ${batch.id}: ${found} seeded of ${take.length}; problems ${JSON.stringify(problems)}; cost $${costs.reduce((a, c) => a + c, 0).toFixed(4)} (mean $${(costs.reduce((a, c) => a + c, 0) / Math.max(1, costs.length)).toFixed(4)} a call, highest $${Math.max(0, ...costs).toFixed(4)}); the seeding's total $${usage.spent.toFixed(2)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`seed-checks: ${String(err?.message ?? err).slice(0, 300)}`);
    process.exit(1);
  });
}
