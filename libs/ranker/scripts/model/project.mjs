// A player's projection for one stat in one game, and the spread around it, fit on his history (props.mjs
// bets on it). Replayed in date order like the ratings: each game is projected from the games before it only
// (a whole day's games projected before any of them is learned from), then learned from.
//
//   rate     his average this season, pulled by K games toward his own longer run: last season's average with
//            the seasons before at half weight (10 games or more of it), else the average of the players at his
//            position a book posts props for (each team's top few by usage: eligible), not of everyone: a prop
//            player pulled toward a backup's numbers would sit under his line
//   recent   his last five this season, weighted w against the rate
//   role     the NFL's role-aware base (props.mjs STATS: starts, snaps, early), each fit and kept only if the
//            held-out games are better with it: a quarterback starting tonight (his team's passer) by his starts
//            alone (a start his team's passer as known before the game; his relief games left out; a starter's
//            prior made up to 10 starts with the average of the starters with few: qs, a blend); a back's or
//            pass-catcher's rate a full game's snaps (his total over his snap shares', a 1-snap game counting
//            for its snap), his prior the same, times the share he's expected tonight (his season's, his last
//            game's weighed sr: a role grown or cut since the games his numbers come from), the per-game rate
//            where the snap counts are missing or miss his recent games (sn, a blend); and the prior's weight K
//            shrinking as his season's games come in (K / (1 + kd x his games)). A missing regular's share is
//            the vacated term's to hand on (vacF), not added to the share expected: it isn't fit apart (next-up
//            receivers ran 16% low held out on 2026-10-11; the role guard CHECKs most of them: group-out, part-time)
//   opponent how far the other side's allowed this stat to his position over the players' own rates, to the
//            power a (1: in full); and where the stat has roles (a player's place on his own team before the
//            game: an NFL team's WR1, WR2, WR3, TE1, RB1; an NBA team's starters and bench), how far it's
//            allowed his role, pulled toward its position number by roleK games' worth (fitted; Infinity: the
//            role left out, kept only if the held-out games are better with it)
//   script   his team's expected score from the game model (the ratings and context) over the average, to the
//            power b: a game the model sees as high scoring or a blowout moves volume (the opponent's for a
//            goalie's saves or a pitcher's outs)
//   matchup  the NFL defense's funnel (its opponents' pass rate over expected against it over their own, matchups.mjs): a
//            volume term, exp(fun x funnel) for a passing or receiving stat, exp(-fun x funnel) for a rushing one;
//            its pace (its opponents' plays over their usual) to the power pc; the share of targets it allows to
//            his position over the league's, to the power tg (a receiving stat)
//   vacated  the NFL backs' and pass-catchers', every NBA player's (his team's minutes or usage), the NHL
//            skaters' (their position's time on ice or power-play time): his cut of the work his group is
//            missing (its regulars not playing, matchups.mjs vacs) over his own, against the cut he had in the games his
//            numbers come from (weighed as they are: his season's against the K-game prior, last season's cut
//            in it where the prior is his own; his last five by w; the NFL's season and last five measured
//            again on the work as it is now, matchups.mjs vacPast: the same starter still out, the same cut),
//            to the power vc: ((1 + cut now) / (1 + cut then))^vc. Signed: a starter's work shared out lifts
//            him, and a starter back from injury takes it back (a fill-in whose last games were the starter's
//            comes down). How it's shared (vs: in proportion to each one's work, or flatter, to equally, the
//            next man up's cut as big as anyone's; and where the stat has two measures of work (vacSplits 6:
//            the NBA's minutes or usage, the NHL's time on ice or power-play time), which) fit with it (vc 0:
//            left out, kept only if the held-out games are better with it)
//   context  the stat's context terms (props.mjs STATS ctx, one or several), each exp(c x its value) with its
//            own size c (c_<term>; the old single size c is the first term's): the NFL's wind, cold and rain
//            or snow (passing; receiving and rushing take wind and rain too), a backup quarterback throwing
//            to its receivers and handing off to its backs; the NBA's teammates out (production missing), a
//            back-to-back and the expected blowout (the game model's margin either way: a starter sits the
//            fourth quarter); the NHL's power play (his power-play time by the power plays his team can expect)
//            and the other side's goalie; MLB batters' place in the order against their usual and platoon
//            edge against their usual, and the other side's starter; MLB starters' leash (their recent pitch
//            counts against their usual), rest, and the plate umpire's zone. Each is fit like a matchup term
//            and kept only if the held-out games are better with it (0: left out)
//   scale    the eligible players' total over their total projection on the fit window: what's left of a lean
//            once the rest is fit, taken out
//
// The count's spread: a negative binomial around the projection, its dispersion r fit too (lower: wider), and
// how it grows with the projection (rk: r x (mu / the average)^rk, a starter's yards tighter around his
// projection than the plain shape gives; kept only if the held-out games are better with it: rAt). Every
// setting is scored on the eligible players' games (the ones a book posts props for: props.mjs markEligible,
// from before each game), not the backups' that are never bet. A whole-number line's push is its own chance,
// out of both sides (lineChances).
// Each setting is fit one at a time (twice round) on the middle of the history (30% to 70% of it by date: the
// first 30% only teaches); the last 30% is never used to fit and is where the projections are checked. Then
// the chance of going over a line is recalibrated (logistic: cal = [shift, stretch] on its log-odds), fit on
// the same middle window at lines at each player's median so far: a spread's shape that runs too skewed or
// too tight (yards are) is straightened out.

// (the log of the gamma function, Lanczos)
function lgamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// A negative binomial's log chance of k at mean mu and dispersion r
export function nbLog(k, mu, r) {
  return lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(r / (r + mu)) + k * Math.log(mu / (r + mu));
}

// The chance of more than line (a half-point line: over it) at mean mu and dispersion r
export function nbOver(line, mu, r) {
  const top = Math.floor(line);
  if (top < 0) return 1;
  let p = Math.pow(r / (r + mu), r);
  let cdf = p;
  for (let k = 0; k < top; k++) {
    p *= ((k + r) / (k + 1)) * (mu / (r + mu));
    cdf += p;
  }
  return Math.min(1, Math.max(0, 1 - cdf));
}

// A stat's dispersion at a projection: r, or where the fit found the spread grows other than as the plain
// negative binomial's (rk), r x (mu / rm)^rk (rm: the eligible players' average on the fit window): a big
// projection's count runs tighter around it, as a starter's yards do against a backup's
export function rAt(params, mu) {
  if (!params.rk) return params.r;
  return Math.min(500, Math.max(0.25, params.r * Math.pow(Math.max(mu, 0.05) / (params.rm || 1), params.rk)));
}

// A line's chances at a projection: over and under with a push left out (each the chance given no push, so
// they sum to 1), and the push's own chance (a whole-number line: the count landing on it; a half-point line
// has none). The recalibration (cal) on the over's
export function lineChances(line, mu, params) {
  const r = rAt(params, mu);
  const raw = nbOver(line, mu, r);
  const push = Number.isInteger(line) && line >= 0 ? Math.min(0.99, Math.exp(nbLog(line, mu, r))) : 0;
  const over = recal(Math.min(1, raw / (1 - push)), params.cal);
  return { over, under: 1 - over, push };
}

// The projection a line's price implies: the mean at which the stat's spread (its dispersion as at any
// projection, no recalibration) goes over the line as often as the book's fair chance says (fairOver; an assumed
// -110's 0.5: the line its median). By halves on the log of the mean; null where it can't be had
export function impliedMean(line, fairOver, params) {
  if (!Number.isFinite(line) || !(fairOver > 0 && fairOver < 1) || !params) return null;
  const plain = { ...params, cal: null };
  let lo = Math.log(0.01);
  let hi = Math.log(Math.max(10, line * 20 + 10));
  if (lineChances(line, Math.exp(hi), plain).over < fairOver) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (lineChances(line, Math.exp(mid), plain).over < fairOver) lo = mid;
    else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

// A stat's context terms' names (props.mjs STATS ctx: one name or a list), and their factor on a projection at
// their values (vals, in that order): exp(sum of c x value), each term's size c_<name> (an old state's single
// c is the first term's)
export const ctxKeys = (stat) => (Array.isArray(stat?.ctx) ? stat.ctx : stat?.ctx ? [stat.ctx] : []);
export function ctxFactor(stat, params, vals) {
  let s = 0;
  ctxKeys(stat).forEach((k, i) => {
    const c = params[`c_${k}`] ?? (i === 0 ? params.c : 0) ?? 0;
    const v = vals?.[i];
    if (c && Number.isFinite(v)) s += c * v;
  });
  return Math.exp(s);
}

// (a player's season tallies: games and total (n, sum); the games whose snap counts were read, their snap
// shares' total and the stat's total in them (shn, sh, ss); a quarterback's starts and their total (qn, qsum).
// This season's also keeps his recent games: his last five, the work missing in each, his snap shares, his
// last five with a share (each [value, share]), his last five starts)
const ACC = ['n', 'sum', 'shn', 'sh', 'ss', 'qn', 'qsum'];
const zero = () => Object.fromEntries(ACC.map((k) => [k, 0]));
const fresh = () => ({ ...zero(), recent: [], vac: [0, 0, 0], recentVac: [], shares: [], srecent: [], qrecent: [], lastSh: false });
const addAcc = (a, b) => Object.fromEntries(ACC.map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)]));

// A stat's model under one set of settings: project a row from what's been learned, learn a day's rows
export function makeModel(stat, params, env) {
  const players = new Map();
  const opps = new Map();
  const roles = new Map();
  const pos = new Map();
  const val = (row) => Math.max(0, Math.round(row.s[stat.key]));
  const posKey = (row) => stat.posGroup?.(row.pos) ?? row.pos;
  const half = (x, season) => (x.season === season ? 1 : x.season === season - 1 ? 0.5 : 0);
  // (the eligible players' average at his position: the prior for a player with no longer run of his own)
  const pool = (row) => {
    const p = pos.get(posKey(row));
    return p && p.n >= 20 ? p.sum / p.n : (env.mean ?? 1);
  };
  // (the eligible players' per-snap rate at his position (their total over their snap shares' total), and the
  // starting quarterbacks' average a start: null till there are 20 games' worth)
  const poolSnap = (row) => {
    const p = pos.get(posKey(row));
    return p && p.sh >= 20 ? p.ss / p.sh : null;
  };
  // (the starters' average is the one of quarterbacks with few starts (under 10 before the game: a rookie's,
  // a backup's, a new starter's), the ones it's a prior for: every start's would be a veteran starter's, and
  // ran the few-start ones 7% high held out; every start's till there are 20, then the plain pool)
  const poolStart = (row) => {
    const p = pos.get(posKey(row));
    return p && p.fqn >= 20 ? p.fqsum / p.fqn : p && p.qn >= 20 ? p.qsum / p.qn : pool(row);
  };
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const parts = (row) => {
    const pl = players.get(row.pid);
    if (!pl) return null;
    const cur = pl.season === row.season ? pl.cur : fresh();
    const prev = pl.season === row.season ? pl.prev : pl.season === row.season - 1 ? pl.cur : zero();
    // (the seasons before last, as seen from this one)
    const older =
      pl.season === row.season ? pl.career
      : pl.season === row.season - 1 ? addAcc(pl.career, pl.prev)
      : addAcc(addAcc(pl.career, pl.prev), pl.cur);
    if (cur.n + prev.n < 2) return null;
    // (the prior's weight K, shrinking as this season's games come in where the fit found it should (kd): K /
    // (1 + kd x his games this season), so by midseason his own season counts for more than the plain K gives)
    const K = params.kd ? params.K / (1 + params.kd * cur.n) : params.K;
    const longN = prev.n + 0.5 * older.n;
    const prior = longN >= 10 ? (prev.sum + 0.5 * older.sum) / longN : pool(row);
    let rate = (cur.sum + K * prior) / (cur.n + K);
    // (the prior's weight in the rate as it's made: the per-game blend's, with the starts' or the snaps' own
    // (K against his starts, or his snap shares' total) blended in as the rate is; check-learn.mjs reads it)
    let priorW = cur.n + K > 0 ? K / (cur.n + K) : null;
    let recent = cur.recent.length >= 3 ? avg(cur.recent) : rate;
    // (the role-aware base, the NFL's (each kept only where the held-out games are better with it):
    //   starts  a quarterback starting tonight (row.qbStart: his team's passer) by his starts alone (a start:
    //           his team's passer as known before the game, a start he left hurt early counted as the bet
    //           counts it; matchups.mjs's by the game's snaps where the rows weren't marked), not his relief
    //           appearances; his starts before this season his prior, made up to 10 with the few-start
    //           starters' average where he has fewer (a backup's, a rookie's); blended in by qs
    //   snaps   a back's or pass-catcher's rate a full game's snaps (his total over his snap shares' total, so a
    //           1-snap game counts for its one snap, not a game), the prior his longer run's the same way (the
    //           position's eligible players' where his own is short), times the share of the snaps he's
    //           expected tonight (his season's, his last game's weighed sr; last season's before he's played
    //           this one); blended in by sn. Where the snap counts are missing, or miss his last game or more
    //           than one of his season's, his per-game rate as before. A missing regular's share isn't added
    //           to the share expected: the work he leaves is the vacated term's (vacF, below), which then lifts
    //           a fill-in whose last game's share (sr) already holds some of it (the joint fit sizes the two
    //           together, on average; the role guard CHECKs these, so mind it before loosening the guard))
    let mode = null;
    let share = null;
    if (params.qs && stat.starts && row.pos === 'QB' && row.qbStart) {
      const longQ = prev.qn + 0.5 * older.qn;
      const longQsum = prev.qsum + 0.5 * older.qsum;
      const priorQ = longQ >= 10 ? longQsum / longQ : (longQsum + (10 - longQ) * poolStart(row)) / 10;
      const rateQ = (cur.qsum + K * priorQ) / (cur.qn + K);
      const recentQ = cur.qrecent.length >= 3 ? avg(cur.qrecent) : rateQ;
      rate = (1 - params.qs) * rate + params.qs * rateQ;
      if (priorW !== null && cur.qn + K > 0) priorW = (1 - params.qs) * priorW + (params.qs * K) / (cur.qn + K);
      recent = (1 - params.qs) * recent + params.qs * recentQ;
      mode = 'starts';
    } else if (params.sn && stat.snaps && row.pos !== 'QB') {
      const sr = params.sr ?? 0;
      // (only where the counts cover his season: his last game's read and all but one of the rest (or no games
      // yet). A game without its counts is in neither the snaps' rate nor the share, so a week the counts lag
      // would drop his latest game, the role grown in it unseen, and last season's share would stand in for a
      // season unread: the per-game rate then, as with no counts at all)
      const covered = cur.n === 0 || (cur.lastSh && cur.shn >= cur.n - 1);
      const exp = !covered ? null : cur.shares.length ? (1 - sr) * avg(cur.shares) + sr * cur.shares[cur.shares.length - 1] : prev.shn >= 4 ? prev.sh / prev.shn : null;
      // (his own per-snap prior on 5 full games' worth of counted snaps or more, else made up to 5 with the
      // position's (a long run whose few counted games would be a noisy prior))
      const longSh = prev.sh + 0.5 * older.sh;
      const ownSs = prev.ss + 0.5 * older.ss;
      const pS = poolSnap(row);
      const priorS = longSh >= 5 ? ownSs / longSh : pS !== null ? (ownSs + (5 - longSh) * pS) / 5 : longSh >= 2 ? ownSs / longSh : null;
      if (exp !== null && priorS !== null) {
        share = exp;
        const rateS = (cur.ss + K * priorS) / (cur.sh + K);
        const rs = cur.srecent.reduce((t, x) => t + x[1], 0);
        const recentS = cur.srecent.length >= 3 && rs >= 0.5 ? cur.srecent.reduce((t, x) => t + x[0], 0) / rs : rateS;
        rate = (1 - params.sn) * rate + params.sn * rateS * share;
        if (priorW !== null && cur.sh + K > 0) priorW = (1 - params.sn) * priorW + (params.sn * K) / (cur.sh + K);
        recent = (1 - params.sn) * recent + params.sn * recentS * share;
        mode = 'snaps';
      }
    }
    const base = (1 - params.w) * rate + params.w * recent;
    // (what the opponent's allowed his position against what those players usually do: a ratio of sums, this
    // season's and half of last, pulled toward even by 8 games' worth)
    // (a table's sums for this season, last season's at half weight)
    const sums = (o) => {
      const ow = half(o, row.season);
      const pw = o.season === row.season ? 0.5 : 0;
      return { got: ow * o.got + pw * o.prevGot, usual: ow * o.usual + pw * o.prevUsual, n: ow * o.n + pw * o.prevN };
    };
    const o = opps.get(`${row.opp}|${posKey(row)}`);
    let opp = 1;
    if (o) {
      const { got, usual, n } = sums(o);
      const per = n ? usual / n : base;
      opp = (got + 8 * per) / (usual + 8 * per);
    }
    // (his role's: the same against players in his role, pulled toward the position's by roleK games of it)
    const posOpp = opp;
    let roleOpp = null;
    if (row.role && Number.isFinite(params.roleK)) {
      const x = roles.get(`${row.opp}|${row.role}`);
      if (x) {
        const { got, usual, n } = sums(x);
        const per = n ? usual / n : base;
        roleOpp = (got + params.roleK * per * posOpp) / (usual + params.roleK * per);
        opp = roleOpp;
      }
    }
    const script = env.script?.(row) ?? 1;
    const ctx = env.ctx?.(row) ?? null;
    const ctxF = ctxFactor(stat, params, ctx);
    // (the defense's funnel, pace and target split: 1 where the stat or the row has none)
    const dir = stat.volume === 'rush' ? -1 : stat.volume ? 1 : 0;
    const funnelF = dir && params.fun ? Math.exp(params.fun * dir * (row.funnel ?? 0)) : 1;
    const paceF = stat.volume && params.pc ? Math.pow(row.pace ?? 1, params.pc) : 1;
    const tgtF = stat.targets && params.tg ? Math.pow(row.tgt ?? 1, params.tg) : 1;
    // (the work his position group is missing now against what it was missing in the games his numbers come
    // from, weighed as they are (his season's games against the K-game prior, which had last season's: its
    // average cut where the prior is his own run, the seasons before last counted as none missing; none where
    // it's the position's; his last five by w): a back whose last games were the injured starter's, this
    // season or the end of last, has them taken back down when the starter returns)
    const vs = params.vs ?? 0;
    const vacNow = row.vacs?.[vs] ?? 0;
    const priorVac = longN >= 10 ? (prev.vac?.[vs] ?? 0) / longN : 0;
    // (his games this season measured again on the work as it is now, where the matchups give them (the NFL's:
    // matchups.mjs vacPast), so a starter still out is the same cut then as now; else each game's cut as it was)
    const past = row.vacPast;
    const seasonVac = past?.n ? (past.sum[vs] ?? 0) / past.n : null;
    const rateVac = seasonVac !== null ? (cur.n * seasonVac + K * priorVac) / (cur.n + K) : ((cur.vac?.[vs] ?? 0) + K * priorVac) / (cur.n + K);
    const recentVac =
      seasonVac !== null ? (past.rn >= 3 ? (past.rsum[vs] ?? 0) / past.rn : rateVac)
      : cur.recentVac?.length >= 3 ? cur.recentVac.reduce((t, x) => t + (x[vs] ?? 0), 0) / cur.recentVac.length
      : rateVac;
    const vacHist = (1 - params.w) * rateVac + params.w * recentVac;
    const vacF = stat.vacated && params.vc ? Math.pow((1 + vacNow) / (1 + vacHist), params.vc) : 1;
    const mu = Math.max(0.05, (params.scale ?? 1) * base * Math.pow(opp, params.a) * Math.pow(script, params.b) * ctxF * funnelF * paceF * tgtF * vacF);
    return { mu, rate, recent, base, opp, posOpp, roleOpp, role: row.role ?? null, funnel: row.funnel ?? null, funnelF, paceF, tgtF, vac: vacNow, vacHist, vacF, script, ctx, ctxF, prior, games: cur.n, prevGames: prev.n, mode, share, starts: cur.qn, careerStarts: cur.qn + prev.qn + older.qn, K, priorW };
  };
  return {
    project: parts,
    // (every defense's number against a role this season, the league's order: for the reasoning's "#2")
    roleTable(role, season) {
      const out = [];
      for (const [key, x] of roles) {
        const [opp, r] = key.split('|');
        if (r !== role || x.season !== season || x.n < 3) continue;
        out.push({ opp, factor: x.got / Math.max(1e-9, x.usual), n: x.n });
      }
      return out.sort((a, b) => a.factor - b.factor);
    },
    // (a day's rows learned together, after all of them were projected)
    learn(rows) {
      for (const row of rows) {
        const v = val(row);
        const pl = players.get(row.pid);
        const before = parts(row);
        if (before) {
          // (the opponent's tables: by position, and by role where the row has one)
          const tally = (table, key) => {
            let o = table.get(key);
            if (!o || o.season !== row.season) {
              const last = o && o.season === row.season - 1 ? o : null;
              o = { season: row.season, n: 0, got: 0, usual: 0, prevN: last?.n ?? 0, prevGot: last?.got ?? 0, prevUsual: last?.usual ?? 0 };
            }
            o.n++;
            o.got += v;
            o.usual += before.base;
            table.set(key, o);
          };
          tally(opps, `${row.opp}|${posKey(row)}`);
          if (row.role) tally(roles, `${row.opp}|${row.role}`);
        }
        // (his seasons: this one, last, and the ones before it (career))
        let p = pl;
        if (!p) p = { season: row.season, cur: fresh(), prev: zero(), career: zero() };
        else if (p.season !== row.season) {
          const consecutive = p.season === row.season - 1;
          const before = addAcc(p.career, p.prev);
          p = {
            season: row.season,
            cur: fresh(),
            prev: consecutive ? { ...addAcc(zero(), p.cur), vac: p.cur.vac } : zero(),
            career: consecutive ? before : addAcc(before, p.cur),
          };
        }
        p.cur.n++;
        p.cur.sum += v;
        p.cur.recent = [...p.cur.recent, v].slice(-5);
        // (his snap share in the game where the counts were read (matchups.mjs row.share: the game's own, learned
        // after it, never projected from), and a quarterback's start (row.start))
        const sh = Number.isFinite(row.share) && row.share > 0 ? row.share : null;
        if (sh !== null) {
          p.cur.sh += sh;
          p.cur.ss += v;
          p.cur.shn++;
          p.cur.shares = [...p.cur.shares, sh].slice(-20);
          p.cur.srecent = [...p.cur.srecent, [v, sh]].slice(-5);
        }
        p.cur.lastSh = sh !== null;
        // (a start: his team's passer as known before the game (markEligible's qbStart, the props' starter, so a
        // start he left hurt in the first quarter counts, as it does for the bet), else the game's own (row.start,
        // matchups.mjs) where the rows weren't marked; and his starts before it, for the few-start starters' pool)
        const started = row.pos === 'QB' && !!(row.qbStart ?? row.start);
        const startsBefore = p.career.qn + p.prev.qn + p.cur.qn;
        if (started) {
          p.cur.qn++;
          p.cur.qsum += v;
          p.cur.qrecent = [...p.cur.qrecent, v].slice(-5);
        }
        // (the work his group was missing in each of his games: what his numbers were made with)
        // (as long as the stat's splits: three a measure of work, matchups.mjs)
        const vacs = row.vacs ?? [0, 0, 0];
        p.cur.vac = Array.from({ length: Math.max(p.cur.vac.length, vacs.length) }, (_, k) => (p.cur.vac[k] ?? 0) + (vacs[k] ?? 0));
        p.cur.recentVac = [...p.cur.recentVac, vacs].slice(-5);
        players.set(row.pid, p);
        const k = posKey(row);
        const q = pos.get(k) ?? { n: 0, sum: 0, sh: 0, ss: 0, qn: 0, qsum: 0, fqn: 0, fqsum: 0 };
        if (row.eligible !== false) {
          q.n++;
          q.sum += v;
          if (sh !== null) (q.sh += sh), (q.ss += v);
        }
        // (the starters' pool: every quarterback's start, eligible or not (a backup's start is a start), and the
        // starts of the ones with fewer than 10 before it apart)
        if (started) {
          q.qn++;
          q.qsum += v;
          if (startsBefore < 10) (q.fqn++), (q.fqsum += v);
        }
        pos.set(k, q);
      }
    },
  };
}

// Replay a stat's rows in date order under one set of settings: each row's projection (where the player had
// two games or more before it) and its value, by window (0: teaching only, 1: fit, 2: check)
export function replayStat(stat, rows, params, env, cuts) {
  const m = makeModel(stat, params, env);
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const day = rows[i].date.slice(0, 10);
    let j = i;
    while (j < rows.length && rows[j].date.slice(0, 10) === day) j++;
    const batch = rows.slice(i, j);
    const win = day < cuts[0] ? 0 : day < cuts[1] ? 1 : 2;
    if (win) for (const row of batch) {
      const p = m.project(row);
      if (p) out.push({ row, p, v: Math.max(0, Math.round(row.s[stat.key])), win });
    }
    m.learn(batch);
    i = j;
  }
  return { model: m, out };
}

const R = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 6, 8, 10, 16, 30, 60, 150];
// (the dispersion's growth with the projection tried: rAt)
const RK = [0.5, 1];
// (a window's rows the fit scores: the eligible players', the ones a book posts props for and the desk bets,
// where there are enough; else all)
const scored = (out, win) => {
  const all = out.filter((x) => x.win === win);
  const mine = all.filter((x) => x.row.eligible !== false);
  return mine.length >= 200 ? mine : all;
};
// (a window's log-likelihood at its best dispersion, at a growth rk about rm)
function scoreOf(out, win, shape = { rk: 0, rm: 1 }) {
  const list = scored(out, win);
  let best = null;
  for (const r of R) {
    let ll = 0;
    for (const x of list) ll += nbLog(x.v, x.p.mu, rAt({ r, ...shape }, x.p.mu));
    if (!best || ll > best.ll) best = { ll, r };
  }
  return { ...best, n: list.length };
}

// (a context term's sizes tried: GRID.c, or its own where it's a power (c_oppShots, c_slot, c_leash: a
// ratio's log) or runs over a wide range (c_precip: 0 to 5, per 0.1 inch: GRID.c's smallest step would be 30%
// at half an inch; c_oppGoalie: per goal a game the other side's goalie saves over average, a big effect a
// goal))
const POWER = [-0.5, 0, 0.25, 0.5, 0.75, 1, 1.25];
const GRID = { kd: [0, 0.1, 0.25, 0.5], qs: [0, 0.5, 1], K: [2, 4, 8, 16, 32], w: [0, 0.2, 0.4, 0.6], a: [0, 0.5, 1], b: [-0.5, 0, 0.5, 1, 1.5], c: [-0.3, -0.15, -0.07, 0, 0.07, 0.15, 0.3], roleK: [Infinity, 32, 16, 8, 4, 2], fun: [0, 1, 2, 4, 8], pc: [0, 0.5, 1, 1.5], tg: [0, 0.5, 1], vc: [0, 0.25, 0.5, 0.75, 1, 1.25], c_oppShots: POWER, c_slot: POWER, c_leash: POWER, c_precip: [-0.04, -0.02, -0.01, 0, 0.01, 0.02], c_oppGoalie: [-0.6, -0.4, -0.2, -0.1, 0, 0.1, 0.2] };
// (the vacated work's split, by index into matchups.mjs's: in proportion, flatter, equally, for each measure
// of work the stat has (vacSplits: 3 a measure); searched with vc)
const splitsOf = (stat) => Array.from({ length: stat.vacSplits ?? 3 }, (_, i) => i);
// (the snaps-based rate's blend and the expected share's weight on his last game (sr), searched together: the
// weight means nothing without the blend)
const SN = [0.5, 1];
const SR = [0, 0.25, 0.5, 0.75, 1];
// (each matchup term's off setting, and which stats have it; each context term's size (c_<name>) is off at 0;
// the role-aware base's the same (the NFL's: sn the snaps-based rate, qs a starting quarterback's starts, kd
// the prior's weight shrinking through the season), off at 0 and kept only if the held-out games are better)
const OPTIONAL = { roleK: Infinity, fun: 0, pc: 0, tg: 0, vc: 0, sn: 0, qs: 0, kd: 0 };
const offOf = (key) => (key.startsWith('c_') ? 0 : OPTIONAL[key]);
const has = (stat, key) =>
  key === 'roleK' ? !!stat.roles
  : key === 'tg' ? !!stat.targets
  : key === 'vc' ? !!stat.vacated
  : key === 'sn' ? !!stat.snaps
  : key === 'qs' ? !!stat.starts
  : key === 'kd' ? !!stat.early
  : !!stat.volume;

// (a window's chances of going over a line at each player's median so far, and what happened)
function linePairs(list, params) {
  const hist = new Map();
  const out = [];
  for (const x of [...list].sort((a, b) => a.row.date.localeCompare(b.row.date))) {
    const past = (hist.get(x.row.pid) ?? []).filter((h) => h.season === x.row.season).map((h) => h.v);
    if (past.length >= 3) {
      const vals = past.sort((a, b) => a - b);
      const line = Math.floor(vals[Math.floor(vals.length / 2)]) + 0.5;
      out.push({ x, vals, line, p: nbOver(line, x.p.mu, rAt(params, x.p.mu)), over: x.v > line ? 1 : 0 });
    }
    hist.set(x.row.pid, [...(hist.get(x.row.pid) ?? []), { season: x.row.season, v: x.v }]);
  }
  return out;
}

// A chance recalibrated: [shift, stretch] on its log-odds
export function recal(p, cal) {
  if (!cal) return p;
  const q = Math.min(0.995, Math.max(0.005, p));
  const z = cal[0] + cal[1] * Math.log(q / (1 - q));
  return 1 / (1 + Math.exp(-z));
}

// (the recalibration that best fits a window's chances to what happened)
function fitRecal(pairs) {
  let best = { ll: Infinity, cal: [0, 1] };
  for (let a = -0.6; a <= 0.6001; a += 0.05) {
    for (let b = 0.5; b <= 1.6001; b += 0.05) {
      let ll = 0;
      for (const x of pairs) {
        const p = recal(x.p, [a, b]);
        ll -= Math.log(x.over ? p : 1 - p);
      }
      if (ll < best.ll) best = { ll, cal: [Math.round(a * 100) / 100, Math.round(b * 100) / 100] };
    }
  }
  return best.cal;
}

// A stat's settings fit (one at a time, twice round) on the fit window, then checked on the last 30%
export function fitStat(stat, rows, env) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 300) return null;
  const at = (q) => sorted[Math.floor(sorted.length * q)].date.slice(0, 10);
  const cuts = [at(0.3), at(0.7)];
  const ctxs = env.ctx ? ctxKeys(stat).map((k) => `c_${k}`) : [];
  let params = { K: 4, w: 0.2, a: 0.5, b: 0.5, ...OPTIONAL, ...Object.fromEntries(ctxs.map((k) => [k, 0])), ...(stat.vacated ? { vs: 0 } : {}), ...(stat.snaps ? { sr: 0 } : {}) };
  const optional = [...Object.keys(OPTIONAL).filter((k) => has(stat, k)), ...ctxs];
  const keys = ['K', 'w', 'a', 'b', ...optional];
  const allOff = Object.fromEntries(optional.map((k) => [k, offOf(k)]));
  let best = scoreOf(replayStat(stat, sorted, params, env, cuts).out, 1);
  for (let pass = 0; pass < 2; pass++) {
    for (const key of keys) {
      // (the vacated work's strength and its split together: the split means nothing without the strength)
      // (and the snaps-based rate's blend with its expected share's weight on his last game: sn with sr)
      const tries =
        key === 'vc' ? GRID.vc.flatMap((v) => splitsOf(stat).map((vs) => ({ vc: v, vs })))
        : key === 'sn' ? [{ sn: 0 }, ...SN.flatMap((v) => SR.map((sr) => ({ sn: v, sr })))]
        : (GRID[key] ?? GRID.c).map((v) => ({ [key]: v }));
      for (const t of tries) {
        if (Object.keys(t).every((k) => t[k] === params[k])) continue;
        const tryP = { ...params, ...t };
        const s = scoreOf(replayStat(stat, sorted, tryP, env, cuts).out, 1);
        if (s.ll > best.ll) (best = s), (params = tryP);
      }
    }
  }
  params.r = best.r;
  // (the dispersion's shape: its growth with the projection (rk), each tried at its own best r on the fit
  // window's eligible players; kept below only if the held-out games are better with it)
  const firstOut = replayStat(stat, sorted, params, env, cuts).out;
  const fitVals = scored(firstOut, 1);
  const rm = fitVals.length ? Math.round((fitVals.reduce((t, x) => t + x.v, 0) / fitVals.length) * 1000) / 1000 : 1;
  const plain = { r: best.r, rk: 0 };
  let shape = plain;
  let shapeLl = best.ll;
  for (const rk of RK) {
    const s = scoreOf(firstOut, 1, { rk, rm });
    if (s.ll > shapeLl) (shapeLl = s.ll), (shape = { r: s.r, rk });
  }
  params = { ...params, ...shape, rm };
  // (what's left of a lean on the eligible players once the rest is fit: their total over their projection)
  const fitOut = replayStat(stat, sorted, params, env, cuts).out.filter((x) => x.win === 1 && x.row.eligible !== false);
  const sumMu = fitOut.reduce((t, x) => t + x.p.mu, 0);
  params.scale = sumMu ? Math.round((fitOut.reduce((t, x) => t + x.v, 0) / sumMu) * 1000) / 1000 : 1;
  // (the recalibration and the check: on the eligible players only, the ones a book posts props for)
  // (each matchup term the fit took up, tested on the held-out games: left out unless its log loss on them is
  // lower with it; its gain recorded either way: the held-out log loss without it less with it)
  const heldOut = (p) => {
    const o = replayStat(stat, sorted, p, env, cuts).out;
    const cal = fitRecal(linePairs(o.filter((x) => x.win === 1 && x.row.eligible !== false), p));
    return { cal, check: check(o.filter((x) => x.win === 2 && x.row.eligible !== false), { ...p, cal }) };
  };
  let current = heldOut(params);
  const gains = {};
  for (const key of optional) {
    if (params[key] === offOf(key)) {
      gains[key] = null;
      continue;
    }
    const without = heldOut({ ...params, [key]: offOf(key) });
    gains[key] = Math.round(((without.check?.logLoss ?? 0) - (current.check?.logLoss ?? 0)) * 10000) / 10000;
    if (gains[key] <= 0) {
      params = { ...params, [key]: offOf(key), cal: without.cal };
      current = without;
    }
  }
  // (the dispersion's growth, the same way: the plain negative binomial unless the held-out games say so)
  if (params.rk) {
    const without = heldOut({ ...params, ...plain });
    gains.rk = Math.round(((without.check?.logLoss ?? 0) - (current.check?.logLoss ?? 0)) * 10000) / 10000;
    if (gains.rk <= 0) (params = { ...params, ...plain }), (current = without);
  } else gains.rk = null;
  params.cal = current.cal;
  const final = replayStat(stat, sorted, params, env, cuts).out;
  // (the held-out numbers with no matchup or context terms at all, for the before and after)
  const base = optional.length ? heldOut({ ...params, ...allOff }).check : current.check;
  // (and every player's held-out games, eligible or not, a sanity check on the history's selection: an NFL
  // game he took under 10 offensive snaps in (a kneel-down, a gadget play: a backup's line no projection is
  // for) left out of it, as the board never posts his prop)
  const all = final.filter((x) => x.win === 2 && !(x.row.s.snaps > 0 && x.row.s.snaps < 10));
  return { params, gains, base, check: current.check, checkAll: check(all, params), fitN: best.n };
}

// The check on the held-out games: the projection's error against a plain season average's, and its chance of
// going over a line at the player's median so far this season against what happened (log loss and Brier),
// against the plain answer (how often he'd gone over that line this season, pulled a game's worth toward
// even), with how often it picked the right side and a calibration table
function check(list, params) {
  if (!list.length) return null;
  const hist = new Map();
  let mae = 0;
  let sumMu = 0;
  let sumV = 0;
  let maeBase = 0;
  let nBase = 0;
  let ll = 0;
  let brier = 0;
  let llBase = 0;
  let brierBase = 0;
  let nLine = 0;
  let sides = 0;
  let sideHits = 0;
  const bands = new Map();
  for (const x of list.sort((a, b) => a.row.date.localeCompare(b.row.date))) {
    mae += Math.abs(x.p.mu - x.v);
    sumMu += x.p.mu;
    sumV += x.v;
    const past = (hist.get(x.row.pid) ?? []).filter((h) => h.season === x.row.season);
    if (past.length >= 3) {
      const vals = past.map((h) => h.v).sort((a, b) => a - b);
      maeBase += Math.abs(vals.reduce((s, v) => s + v, 0) / vals.length - x.v);
      nBase++;
      const median = vals[Math.floor(vals.length / 2)];
      const line = Math.floor(median) + 0.5;
      const p = Math.min(0.995, Math.max(0.005, recal(nbOver(line, x.p.mu, rAt(params, x.p.mu)), params.cal)));
      const over = x.v > line ? 1 : 0;
      ll -= Math.log(over ? p : 1 - p);
      brier += (p - over) ** 2;
      const q = (vals.filter((v) => v > line).length + 1) / (vals.length + 2);
      llBase -= Math.log(over ? q : 1 - q);
      brierBase += (q - over) ** 2;
      nLine++;
      if (Math.abs(p - 0.5) >= 0.05) {
        sides++;
        if ((p > 0.5) === !!over) sideHits++;
      }
      const band = Math.min(0.8, Math.max(0.2, Math.floor(p * 10) / 10));
      const b = bands.get(band) ?? { n: 0, said: 0, was: 0 };
      b.n++;
      b.said += p;
      b.was += over;
      bands.set(band, b);
    }
    hist.set(x.row.pid, [...(hist.get(x.row.pid) ?? []), { season: x.row.season, v: x.v }]);
  }
  const r4 = (v) => Math.round(v * 10000) / 10000;
  return {
    n: list.length,
    mae: r4(mae / list.length),
    bias: r4((sumMu - sumV) / list.length),
    maeBase: nBase ? r4(maeBase / nBase) : null,
    lines: nLine,
    logLoss: nLine ? r4(ll / nLine) : null,
    logLossBase: nLine ? r4(llBase / nLine) : null,
    brier: nLine ? r4(brier / nLine) : null,
    brierBase: nLine ? r4(brierBase / nLine) : null,
    sides,
    sideHit: sides ? r4(sideHits / sides) : null,
    calibration: [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([band, b]) => ({ band, n: b.n, said: r4(b.said / b.n), was: r4(b.was / b.n) })),
  };
}

