// Matchups for the props (project.mjs): who a player is on his own team, and what the defense he faces does,
// each worked out from the player logs (playerlogs.mjs) before the game, season to date, last season's at half
// weight:
//
//   role     the NFL: a team's WR1, WR2, WR3 (its wide receivers by their share of its targets), TE1 (its top
//            tight end by targets), RB1 (its top back by carries); the rest WR4+, TE2+, RB2+; and the role he
//            steps into with the ones missing out of the order (roleUp: the next man up's), the snap share of
//            the one missing above him (leadShare), and his return from an absence (back, ret: his team's games
//            he missed, his games since); the same order by his recent healthy work (roleW, roleUpW: a game he
//            left hurt not learned, a missing one's kept through his first games out, so a starter who missed
//            games isn't ranked under his fill-in by the season's totals: project.mjs ro), the target share of
//            the one missing above him (leadTgt: the volume base's next-man-up floor), a regular above him out
//            (aheadOut: CTX aheadOut), his games this season with the same regulars at his position out as
//            tonight (sameGames: project.mjs ab), and his organic trend (trend: his work in the games with no
//            regular at his position out, recent ones counting most, over their average: project.mjs ot). The
//            NBA: a team's
//            five with the most minutes a game among the ones playing are its starters (S), the rest its bench
//            (B): a starter out, the next man up starts (in the history, the ones in the game's box score; at
//            bet time, the ones not out or doubtful on the injury report). And the same read only from what's
//            known before the game (roleKnown: the back-to-backs' by role, props.mjs CTX b2bB): in the history,
//            a player missing counted out only when he missed his team's game before too (a starter resting the
//            second night, unannounced at bet time, still a starter), and no role (null) for a player not
//            ranked himself (under three games for this team: its first games, a player just traded in). His
//            minutes over 48 in the game itself (share: learned after it, the minutes-first base's, project.mjs
//            sn) and whether he started his team's game before (startLast: the box's starter flag; CTX newStart)
//   depth    the NFL: a pass-catcher's air yards a target (nflverse's receiving air yards) over the league's, his
//            own pulled toward his position's by 30 targets, season to date, last season's at half (dep), and the
//            lead quarterback out times how far it runs over the league's, a wide receiver's or tight end's (qbDeep:
//            the backup's deep throws, props.mjs CTX qbDeep)
//   funnel   the NFL: how much more (or less) a defense's opponents pass against it than they do on their own
//            (passFunnel below: their pass rate over expected against it, nflverse's xpass, in neutral
//            situations, less their own so far; the plain pass share where a game has no xpass), pulled
//            toward 0 by 4 games' worth: a pass funnel (over 0) means more passing against it, a run funnel
//            (under 0) more running
//   pace     the NFL: its opponents' plays (runs and passes) against their own usual, pulled toward even by 4
//            games. The NBA (audit #10): each team's possessions a 48 minutes (its box's field goals tried, 0.44 of
//            free throws tried, turnovers, less offensive rebounds, the two sides' averaged, over the minutes
//            played over 240: an overtime game's per 48), this season's pulled toward last season's (held
//            PACE_CARRY, half, of its distance from the league's: the offseason's rosters change) or the league's
//            by PACE_K games, over the league's this season (last season's till it has PACE_LG team-games): the
//            other side's (pace: his own team's is in his own numbers) and the game's expected (paceG: the two
//            teams' product over the league's), each 1 till it's known (paceKnown false; project.mjs po, pg).
//            Unmeasured: a new season's opening weeks (the history's one season opened with no league's pace)
//   targets  the NFL: the share of the targets it allows to wide receivers, tight ends and backs, against the
//            league's, pulled toward the league's by 60 targets
//   vacated  the NFL: the work a player's position group is missing: its regulars who aren't playing (not in the
//            game's logs; at bet time, out or doubtful on the injury report, on the roster's injured reserve,
//            PUP, NFI or suspended, missing two games or more and not on the report, or no longer on the team's
//            roster, and a questionable one by his chance of missing it: playchance.mjs), their recent work (a
//            back's carries and targets, a receiver's or tight end's targets, a game's worth, recent games
//            counting most) over the recent work of those who are. A back stepping in for a hurt starter gets
//            the starter's share to share out; a
//            regular missing (one who's played for the team this season) keeps his work as it was through his
//            first FREEZE games out (it doesn't fade while he's still out: a fill-in's cut isn't shrunk under
//            him), then fades out of it game by game (gone a while: by then the ones taking his place have it in
//            their own numbers; one gone since last season fades from the first game, as before). The cut in the
//            games a player's numbers come from (vacPast: each of his games this season, its regulars missing
//            then, worked out on the work as it is now) is measured on the same work as the cut now, so the same
//            starter still out is the same cut, not a smaller one counted three times (his fading work, the
//            fill-in's own growing, and the games that fed both). And, for the role-change guard (props.mjs
//            roleChangeOf), a team's quarterback first (qb1: the most passes a game, recent games counting
//            most), each player's offensive snaps as a share of his team's (snap: his last game's and his
//            season's), and the regulars who've missed their team's last two games or more this season (absent).
//            Each row also gets its own game's snap share (share: null without the counts) and a quarterback's
//            start (start: 70% of the snaps or more, else the most of his team's quarterbacks; without the counts
//            the most passes), the game's own, for the projections to learn from after it. The NBA's
//            the same over the whole
//            team, two ways (teamWork below): by minutes, and by usage (field goals tried, 0.44 of free throws
//            tried, and assists: a scorer's shots go to the other scorers, more than his minutes say); the NHL's
//            by position (forwards, defensemen), by time on ice and by power-play time (a top unit's man out, the
//            next one up gets his power play). The NFL's and the NBA's each with a split learned from the history
//            after the even ones (absorbTable: who absorbs a missing player's work, by position and place in the
//            order, across positions, some of it lost; project.mjs vl)
//   power    the NHL: a skater's power-play time a game (recent games counting most) and the power plays his
//   play     team can expect: its opponent's penalties a game over the league's (season to date, last season's
//            at half, pulled toward the league's by 10 games); the referees' lean is the context's (props.mjs CTX.pp);
//            and his share of his team's power play (recent games counting most) against the league's prop
//            players' at his position (ppShare: a top unit's man over 0, a second-pair defenseman under it)
//   lineup   MLB batters: whether he started (his place in the game's posted lineup: the history's from StatsAPI's
//            lineups; a game without them, two plate appearances or more), and his place in the order now
//            against his usual (a leadoff man gets the most trips to the plate: PA_BY_SLOT); the platoon edge on
//            the other side's probable starter now (a lefty batter against a righty, a switch hitter always)
//            against how often he's had it (pulled toward his side's usual by 10 games)
//   leash    MLB starters: his pitches in his last two starts against his usual a start (this season's, last
//            season's at half, pulled toward 90 by 5 starts), and his days since he last pitched (a start off a
//            long layoff, his first back from the injured list most likely, is skipped at bet time: props.mjs)
//
// The terms each of these feeds, and their sizes, are fitted in project.mjs and kept only where the held-out
// games are better with them.

const POS = (pos) => (pos === 'WR' ? 'WR' : pos === 'TE' ? 'TE' : pos === 'RB' || pos === 'FB' ? 'RB' : pos === 'QB' ? 'QB' : null);

// (a tally carried into a new season at half)
const decay = (t, season) => {
  if (t.season === season) return t;
  const half = t.season === season - 1 ? 0.5 : 0;
  const out = { season };
  // (a team's players' positions carry over as they are)
  for (const [k, v] of Object.entries(t)) if (k !== 'season') out[k] = k === 'pos' ? v : typeof v === 'number' ? v * half : v instanceof Map ? new Map([...v].map(([a, b]) => [a, b * half])) : v;
  return out;
};

// The NFL defenses' pass funnel, the props' and the game totals' (football.mjs funnelT) alike, learned a game
// at a time in date order. A game's side, from the play-by-play (context.mjs's plays, football.mjs): its runs
// and passes (pass, plays) and, in neutral situations (win chance 20-80%, outside the last two minutes of a
// half) where nflverse has its chance of a pass (xpass, 2006 on), how many (xn) and their passes less xpass
// summed (over). Its pass rate over expected (over / xn) against the offense's own so far (pulled toward the
// league's by 100 such plays: about three games), weighted by its share of 25 such plays (a blowout counts
// for less); without them (no xpass, or no play-by-play: the props' player logs), its pass share against the
// offense's own so far, as before. Season to date, last season's at half weight; of(defense, season): pulled
// toward 0 by 4 games' worth.
export function passFunnel() {
  const off = new Map();
  const def = new Map();
  const lg = { pass: 0.57, plays: 62, proe: 0, n: 0 };
  const decay = (x, season, fresh) => {
    if (!x) return fresh;
    if (x.season === season) return x;
    const half = x.season === season - 1 ? 0.5 : 0;
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'season' ? season : v * half]));
  };
  return {
    of(id, season) {
      const d = decay(def.get(id), season, null);
      return d ? d.funnel / (d.n + 4) : 0;
    },
    learn(team, opp, season, { pass, plays, over = 0, xn = 0 }) {
      if (!(plays > 20)) return;
      const o = decay(off.get(team), season, { season, pass: 0, plays: 0, over: 0, xn: 0 });
      const d = decay(def.get(opp), season, { season, funnel: 0, n: 0 });
      if (xn >= 5) {
        const w = Math.min(1, xn / 25);
        const usual = (o.over + 100 * lg.proe) / (o.xn + 100);
        d.funnel += w * (over / xn - usual);
        d.n += w;
        o.over += over;
        o.xn += xn;
        lg.proe += ((over / xn) - lg.proe) / Math.min(++lg.n, 500);
      } else {
        const usual = (o.pass + 3 * lg.pass * lg.plays) / (o.plays + 3 * lg.plays);
        d.funnel += pass / plays - usual;
        d.n++;
      }
      o.pass += pass;
      o.plays += plays;
      lg.pass += (pass / plays - lg.pass) / 500;
      lg.plays += (plays - lg.plays) / 500;
      off.set(team, o);
      def.set(opp, d);
    },
  };
}

// Who absorbs the work missing (audit #7; project.mjs vl): a split learned from the history in place of the even
// ones (the work shared in proportion, flatter or equally within the position group). Each player is in a class
// (the NFL's: his position and his place in its order by recent work, WR1, WR2, WR3 for the third and on, TE1, TE2
// for the second and on, RB1, RB2 for the second and on; the NBA's: a guard, forward or center (props.mjs nbaPos),
// a starter or off the bench by recent minutes). From each game with a fresh absence (every regular missing played
// the team's game before: the work of the ones playing not yet grown into his), each class's work in a measure
// over its players' recent work (its excess: a call-up's all of his), less its average excess in the games with
// no regular missing (the drift every game has), credited to the missing ones' classes by their share of the
// work missing. A class's share of a missing class's work (share): that sum over the missing class's work, pulled
// toward none by p (about a game of a regular's). The cross-position cells (a wide receiver out, the tight end's
// targets) are learned like any other, and the shares summed fall under 1 where the team's volume drops with him
// out (the work lost). The league's, every season's (one table: an offense's habits aren't learned apart), each
// game learned after the day's rows were given theirs. ready once the history has ABSORB_MIN games of each kind
// (before: the split in proportion in its place)
const ABSORB_MIN = 100;
// (a team's first games of a season, not learned from: its recent work starts over at half last season's)
const ABSORB_EARLY = 4;
function absorbTable({ p }) {
  const num = new Map();
  const den = new Map();
  const base = new Map();
  let events = 0;
  let quiet = 0;
  const key = (...a) => a.join('|');
  return {
    ready: () => events >= ABSORB_MIN && quiet >= ABSORB_MIN,
    share: (m, mc, k) => (num.get(key(m, mc, k)) ?? 0) / ((den.get(key(m, mc)) ?? 0) + p),
    // (a game with no regular missing: each class's excess, the drift)
    none(excess) {
      quiet++;
      for (const [m, ex] of Object.entries(excess)) for (const [k, e] of ex) base.set(key(m, k), (base.get(key(m, k)) ?? 0) + e);
    },
    // (a game with fresh absences: the missing classes' recent work (gone), each class's excess)
    event(gone, excess) {
      events++;
      for (const [m, g] of Object.entries(gone)) {
        const total = [...g.values()].reduce((t, x) => t + x, 0);
        if (!(total > 0)) continue;
        const ks = new Set([...excess[m].keys(), ...[...base.keys()].filter((b) => b.startsWith(`${m}|`)).map((b) => b.slice(m.length + 1))]);
        for (const k of ks) {
          const adj = (excess[m].get(k) ?? 0) - (quiet ? (base.get(key(m, k)) ?? 0) / quiet : 0);
          for (const [mc, x] of g) num.set(key(m, mc, k), (num.get(key(m, mc, k)) ?? 0) + (adj * x) / total);
        }
        for (const [mc, x] of g) den.set(key(m, mc), (den.get(key(m, mc)) ?? 0) + x);
      }
    },
    // (the table as learned: its games, and each measure's missing class's shares by class, for the log)
    dump: () => {
      const out = { events, quiet, ready: events >= ABSORB_MIN && quiet >= ABSORB_MIN };
      for (const k of num.keys()) {
        const [m, mc, c] = k.split('|');
        ((out[m] ??= {})[mc] ??= {})[c] = Math.round(((num.get(k) ?? 0) / ((den.get(key(m, mc)) ?? 0) + p)) * 1000) / 1000;
      }
      return out;
    },
  };
}
// (the NFL's classes: a position's places kept apart (WR1, WR2, WR3 and on); about two games of a regular's
// targets the pull)
const ABSORB_NFL = { cls: { WR: 3, TE: 2, RB: 2 }, p: 10 };
const clsOf = (p, rank) => `${p}${Math.min(rank, ABSORB_NFL.cls[p])}`;

// (a game's side from the context's plays (football.mjs: each game's [.., home passes, home runs, away
// passes, away runs, home over, home xn, away over, away xn]): null where it has none)
export function sideOfPlays(p, home) {
  if (!p || p.length < 9) return null;
  const [pass, run] = home ? [p[5], p[6]] : [p[7], p[8]];
  const [over, xn] = p.length >= 13 ? (home ? [p[9], p[10]] : [p[11], p[12]]) : [0, 0];
  return { pass, plays: pass + run, over, xn };
}

// The NFL's matchups: every row given its role, its defense's funnel, pace and target share for its position
// (row.role, row.funnel, row.pace, row.tgt), each from the games before it; and the same for a coming game
// (live: a player's id, team, opponent, position and the season). plays: the context's play-by-play facts by
// game (football.mjs: facts.plays), for the funnel over expected; without a game's, its player logs' pass share.
// learned: the learned split read into the rows' work missing (vacated's fourth: absorbOf; false, the split in
// proportion in its place, the default: a caller opts in; its table still learned for the log, about no time:
// NFL matchups 7.1s either way; props.mjs passes project.mjs TRY_VL)
export function nflMatchups(rows, pbp = null, { learned = false } = {}) {
  const games = new Map();
  for (const r of rows) {
    if (!r.team || !r.opp || !r.game) continue;
    const key = `${r.game}|${r.team}`;
    const g = games.get(key) ?? { key, game: r.game, home: r.home, date: r.date, season: r.season, team: r.team, opp: r.opp, att: 0, car: 0, tgt: { WR: 0, TE: 0, RB: 0 }, rows: [] };
    g.att += r.s.passAtt ?? 0;
    g.car += r.s.rushAtt ?? 0;
    const p = POS(r.pos);
    if (p && p !== 'QB') g.tgt[p] += r.s.targets ?? 0;
    g.rows.push(r);
    games.set(key, g);
  }
  const list = [...games.values()].sort((a, b) => a.date.localeCompare(b.date));
  const off = new Map();
  const def = new Map();
  const team = new Map();
  const lg = { pass: 0.57, plays: 62, share: { WR: 0.6, TE: 0.2, RB: 0.2 }, n: 0 };
  const offOf = (id, season) => decay(off.get(id) ?? { season, att: 0, car: 0, n: 0 }, season);
  const defOf = (id, season) => decay(def.get(id) ?? { season, pace: 0, n: 0, WR: 0, TE: 0, RB: 0, all: 0 }, season);
  const funnel = passFunnel();
  // (each team's games this season so far: a row's teamGame is the team's game number tonight, 1 for its first)
  const played_ = new Map();
  const gameNo = (id, season) => (played_.get(id)?.season === season ? played_.get(id).n : 0) + 1;
  const teamOf = (id, season) => decay(team.get(id) ?? { season, tgt: new Map(), car: new Map(), min: new Map(), n: 0 }, season);
  // (each team's players' recent work a game, recent games counting most: their position and its level, faded
  // game by game they miss; a new season starts it over at half; and his targets and carries apart (t, c), the
  // same way: the learned split's, absorbed below)
  const work = new Map();
  const workOf = (id, season) => {
    let w = work.get(id);
    if (!w || w.season !== season) {
      const last = w && w.season === season - 1 ? w : null;
      // (his games out counted again from the new season's first: two games rested or hurt at the end of the
      // last aren't an absence in the next one's first week (absent); the fade's the same, one not yet played
      // for the team this season (cur false) fading game by game whatever his count)
      w = { season, p: new Map(last ? [...last.p].map(([k, v]) => [k, { pos: v.pos, v: v.v * 0.5, hv: (v.hv ?? v.v) * 0.5, t: (v.t ?? 0) * 0.5, c: (v.c ?? 0) * 0.5, gone: 0, cur: false }]) : []) };
      work.set(id, w);
    }
    return w;
  };
  const WORK_RATE = 0.35;
  // (a regular's games out before his work starts fading: through a short absence it's his, waiting; only one
  // who's played for the team this season (cur): one gone since last season fades from its first game, as before)
  const FREEZE = 4;
  // (a quarterback's work his passes; a back's carries and targets; a receiver's or tight end's targets)
  const touches = (r, p) => (p === 'QB' ? (r.s.passAtt ?? 0) : p === 'RB' ? (r.s.rushAtt ?? 0) + (r.s.targets ?? 0) : (r.s.targets ?? 0));
  // (each team game's regulars missing, as it was: the ids whose work counts in the cut, recorded with the game
  // so a player's past games can be measured again on the work as it is now (vacPast); and each player's games
  // this season, by the team's game: { season, games: [{ team, missing }] })
  const games_ = new Map();
  // (each player's offensive snaps this season as a share of his team's in the game (its most: its quarterback's,
  // the plays it ran), the games whose snap counts were read)
  const snapsOf = new Map();
  // (the work missing from a player's position group, his cut of it over his own work: the absent regulars'
  // recent work shared among the present players by their recent work to the power g, for g of 1 (in proportion),
  // 0.5 and 0 (equally: the next man up's cut as big as the starter's); missOf(id): how surely a teammate is
  // missing, 0 to 1: in the history, 1 for one not in the game's logs, 0 for one in them; at bet time, 1 for
  // one out, doubtful or on IR, or no longer on the team's roster (traded, released: gone from its games as he
  // is in the history's), and for one questionable his chance of missing it (playchance.mjs: the NFL's, fit
  // on past seasons' reports; else half))
  // (and a fourth, learned (audit #7: project.mjs vl): who absorbs the work, from the history, across positions
  // too, some of it lost (absorbOf below))
  const SPLITS = [1, 0.5, 0];
  const NONE = [...SPLITS.map(() => 0), 0];
  const absorb = absorbTable(ABSORB_NFL);
  const clamp01 = (m) => Math.min(1, Math.max(0, Number(m) || 0));
  const vacated = (teamId, season, pid, pos, missOf) => {
    const p = POS(pos);
    if (!p || p === 'QB') return NONE;
    const w = workOf(teamId, season);
    let gone = 0;
    const here = [];
    for (const [id, x] of w.p) {
      if (x.pos !== p || x.v < 0.5 || String(id) === String(pid)) continue;
      const m = clamp01(missOf(id));
      if (m > 0 && x.v >= 1.5) gone += m * x.v;
      if (m < 1) here.push([x.v, 1 - m]);
    }
    const own = Math.max(w.p.get(pid)?.v ?? 0, 0.5);
    const splits = gone
      ? SPLITS.map((g) => {
          const all = here.reduce((t, [v, k]) => t + k * Math.pow(v, g), Math.pow(own, g));
          return Math.round(Math.min(3, (gone * Math.pow(own, g)) / all / Math.max(own, 1)) * 1000) / 1000;
        })
      : SPLITS.map(() => 0);
    const learned = absorbOf(w, pid, p, missOf);
    return [...splits, learned === null ? splits[0] : learned];
  };
  // (the learned split (absorb, ABSORB_NFL): the regulars at the backs' and pass-catchers' positions missing
  // (their recent work a game 1.5 or more, at their chance of missing it), each by his class (his position and
  // his place in its order by recent work, the missing ones in it: WR1, WR2, WR3 for the third and on, TE1, TE2
  // for the second and on, RB1, RB2), times the share of a missing class's targets (carries: a back's) the
  // history saw his class take (his place among the ones playing: the next man up's class where one's above him
  // out), his part of it where his class holds more than one (by recent work), over his own work (a back's
  // carries and targets, a receiver's or tight end's targets: the cut's measure, 1 at least). null (the split in
  // proportion in its place) till the history holds ABSORB_MIN absences to learn it from)
  const absorbOf = (w, pid, p, missOf) => {
    if (!learned || !absorb.ready()) return null;
    const all = [...w.p];
    const ownV = w.p.get(pid)?.v ?? 0;
    // (his place among the ones playing at his position (a regular surely out not in it), his class's work)
    const here = [ownV, ...all.filter(([id, x]) => x.pos === p && x.v >= 0.5 && String(id) !== String(pid) && clamp01(missOf(id)) < 1).map(([, x]) => x.v)].sort((a, b) => b - a);
    const rank = 1 + here.filter((v) => v > ownV).length;
    const top = ABSORB_NFL.cls[p];
    const part = rank >= top ? Math.max(ownV, 0.5) / here.slice(top - 1).reduce((t, v) => t + Math.max(v, 0.5), 0) : 1;
    const k = clsOf(p, rank);
    let got = 0;
    for (const [id, x] of all) {
      // (one gone since last season (cur false) not read: the table learned fresh absences only)
      if (!ABSORB_NFL.cls[x.pos] || !x.cur || x.v < 1.5 || String(id) === String(pid)) continue;
      const m = clamp01(missOf(id));
      if (!m) continue;
      const mc = clsOf(x.pos, 1 + all.filter(([, y]) => y.pos === x.pos && y.v > x.v).length);
      got += m * (absorb.share('t', mc, k) * (x.t ?? 0) + (p === 'RB' ? absorb.share('c', mc, k) * (x.c ?? 0) : 0));
    }
    return Math.round(Math.min(3, Math.max(-0.5, (got * part) / Math.max(ownV, 1))) * 1000) / 1000;
  };
  // (a game learned into the split's history (absorb), before the work's own: the regulars at the backs' and
  // pass-catchers' positions missing it (not in its logs) who played the team's game before (a fresh absence: the
  // work of the ones playing not yet theirs), each class's targets and carries in it over its players' recent
  // ones (one new, his all), by the missing classes' recent work (carries a back's alone: a receiver's few are
  // noise over his tiny own); a game with none fresh, the drift every game has. One out longer is settled by
  // SETTLED games out (FREEZE's and the fade's: the ones playing have his work in theirs by then), or gone since
  // last season, and left out of both; a game with one out between (his work still moving into theirs) isn't
  // learned from)
  const SETTLED = FREEZE + 2;
  const learnAbsorb = (w, rows, playing) => {
    const all = [...w.p];
    const missing = all.filter(([id, x]) => ABSORB_NFL.cls[x.pos] && x.v >= 1.5 && !playing.has(id));
    if (missing.some(([, x]) => x.cur && (x.gone ?? 0) >= 1 && (x.gone ?? 0) < SETTLED)) return;
    const out = missing.filter(([, x]) => x.cur && !((x.gone ?? 0) >= 1));
    const here = rows.filter((r) => ABSORB_NFL.cls[POS(r.pos)]).map((r) => {
      const x = w.p.get(r.pid);
      return { p: POS(r.pos), v: x?.v ?? 0, t: (r.s.targets ?? 0) - (x?.t ?? 0), c: (r.s.rushAtt ?? 0) - (x?.c ?? 0) };
    });
    const excess = { t: new Map(), c: new Map() };
    for (const h of here) {
      // (his place as the live split reads it: among the ones with recent work 0.5 or more)
      const k = clsOf(h.p, 1 + here.filter((o) => o.p === h.p && o.v >= 0.5 && o.v > h.v).length);
      for (const m of ['t', 'c']) excess[m].set(k, (excess[m].get(k) ?? 0) + h[m]);
    }
    if (!out.length) return absorb.none(excess);
    const gone = { t: new Map(), c: new Map() };
    for (const [, x] of out) {
      const mc = clsOf(x.pos, 1 + all.filter(([, y]) => y.pos === x.pos && y.v > x.v).length);
      for (const m of x.pos === 'RB' ? ['t', 'c'] : ['t']) gone[m].set(mc, (gone[m].get(mc) ?? 0) + (x[m] ?? 0));
    }
    absorb.event(gone, excess);
  };
  // (a player's games this season before now, each one's cut measured again on the work as it is now (the same
  // work the cut now is: a starter still out the same cut, not a smaller one): their count, their cuts' sum,
  // and his last five's count and sum; null for a quarterback or a position without the work)
  const vacPast = (pid, season, pos) => {
    const p = POS(pos);
    if (!p || p === 'QB') return null;
    const h = games_.get(pid);
    const list = h && h.season === season ? h.games : [];
    const sum = NONE.slice();
    const rsum = NONE.slice();
    const last = list.length - Math.min(5, list.length);
    list.forEach((g, i) => {
      if (!g.missing.size) return;
      const v = vacated(g.team, season, pid, pos, (id) => (g.missing.has(String(id)) ? 1 : 0));
      v.forEach((x, k) => {
        sum[k] += x;
        if (i >= last) rsum[k] += x;
      });
    });
    const r3 = (a) => a.map((x) => Math.round(x * 1000) / 1000);
    return { n: list.length, sum: r3(sum), rn: Math.min(5, list.length), rsum: r3(rsum) };
  };
  // (a team's lead back now: its back with the most recent work (carries and targets a game, recent games
  // counting most), LEAD_MIN or more, one who's played for it this season (cur: a back gone since last season
  // isn't its lead, nor one out since before the opener: a bell cow lost in the preseason is never read); null
  // with none. How surely he's missing (missOf, 0 to 1) is the rb1Out term's value for its quarterback and
  // pass-catchers, a back's own 0: the work he leaves is the vacated term's. A questionable one at his chance
  // of missing it (playchance.mjs: the NFL's, fit on past seasons' reports; else half); the history reads 0
  // or 1. Measured and on no stat's ctx: props.mjs)
  const LEAD_MIN = 8;
  const leadBack = (teamId, season) => {
    let lead = null;
    for (const [id, x] of workOf(teamId, season).p) if (x.pos === 'RB' && x.cur && x.v >= LEAD_MIN && (!lead || x.v > lead.v)) lead = { id, v: x.v };
    return lead;
  };
  const rb1Out = (teamId, season, pos, missOf) => {
    if (POS(pos) === 'RB') return 0;
    const lead = leadBack(teamId, season);
    return lead ? Math.min(1, Math.max(0, Number(missOf(lead.id)) || 0)) : 0;
  };
  // (a team's lead quarterback now, the same way: its quarterback with the most passes a game (recent games
  // counting most; a starter's out through FREEZE games kept as they were, then fading, so a backup who's had the
  // job five games or so is the lead by then and his receivers' numbers are his), QB_LEAD or more, one who's
  // played for it this season; null with none. How surely he's missing is the qb1Out term's value for its backs
  // and pass-catchers (the role backtest's qb1-out: receiving 6% to 11% under the projection, 2026-10-12, the
  // context's backupQb reading only an absence's first games, till the backup is the usual starter), a
  // quarterback's own 0 (his passing is the starts' base's: project.mjs qs). Times the share of his own games
  // this season the lead quarterback played in (his season's numbers already the backup's, as far as they go:
  // a flag at full strength on an absence's fourth game would count its first three twice; none yet, in full).
  // Kept only past its floor: project.mjs MIN_GAIN. Its { v, miss }: miss how surely he's missing alone (1 out, a
  // questionable one his chance of missing it: playchance.mjs), the write-up's words (v is under 1 for an out
  // starter once he's missed a game))
  // (the history's missing is any lead quarterback not in the game's logs, a benching or an unlisted inactive
  // too, where live play reads the report and the roster alone: the role backtest's qb1Out table has the
  // history's rows by whether the reports listed him)
  const QB_LEAD = 15;
  const qb1Out = (teamId, season, pid, pos, missOf) => {
    if (!POS(pos) || POS(pos) === 'QB') return { v: 0, miss: 0 };
    let lead = null;
    for (const [id, x] of workOf(teamId, season).p) if (x.pos === 'QB' && x.cur && x.v >= QB_LEAD && (!lead || x.v > lead.v)) lead = { id, v: x.v };
    const m = lead ? Math.min(1, Math.max(0, Number(missOf(lead.id)) || 0)) : 0;
    if (!m) return { v: 0, miss: 0 };
    const h = games_.get(pid);
    const list = h && h.season === season ? h.games : [];
    const with_ = list.length ? list.filter((g) => !g.missing.has(String(lead.id))).length / list.length : 1;
    return { v: Math.round(m * with_ * 1000) / 1000, miss: m };
  };
  // (a pass-catcher's depth before a game (dep): his air yards a target (nflverse's receiving air yards, how far
  // past the line the ball was thrown to him, caught or not) this season, last season's at half, pulled toward
  // his position's league average by DEPTH_K targets, over the league's average a target (every position's):
  // about 1.3 a typical wide receiver's, 1.6 or more a deep threat's, 0.85 a tight end's, 0.1 a back's (held at
  // 0 or more: a screen's is behind the line). null for a quarterback, or with under DEPTH_MIN targets' air yards read in
  // the league (the term then reads 0). The backup quarterback's by depth (CTX qbDeep: qbDeepOf below))
  const DEPTH_K = 30;
  const DEPTH_MIN = 500;
  const air = new Map();
  const lgAir = { WR: { a: 0, t: 0 }, TE: { a: 0, t: 0 }, RB: { a: 0, t: 0 } };
  const depthOf = (pid, season, pos) => {
    const p = POS(pos);
    if (!p || p === 'QB') return null;
    const t = lgAir.WR.t + lgAir.TE.t + lgAir.RB.t;
    if (t < DEPTH_MIN) return null;
    const all = (lgAir.WR.a + lgAir.TE.a + lgAir.RB.a) / t;
    if (!(all > 0)) return null;
    const prior = lgAir[p].t >= 100 ? lgAir[p].a / lgAir[p].t : all;
    const x = decay(air.get(pid) ?? { season, a: 0, t: 0 }, season);
    return Math.round(Math.max(0, (x.a + DEPTH_K * prior) / (x.t + DEPTH_K) / all) * 1000) / 1000;
  };
  const learnAir = (r, season) => {
    const p = POS(r.pos);
    const t = r.s.targets ?? 0;
    if (!p || p === 'QB' || !(t > 0) || !Number.isFinite(r.s.airYds)) return;
    const x = decay(air.get(r.pid) ?? { season, a: 0, t: 0 }, season);
    x.a += r.s.airYds;
    x.t += t;
    air.set(r.pid, x);
    lgAir[p].a += r.s.airYds;
    lgAir[p].t += t;
  };
  // (the backup quarterback's by his depth: qb1Out's value times his depth less the league's (dep - 1: a deep
  // threat's over 0, a short one's under), a wide receiver's and a tight end's; a back's 0 (his catches behind
  // the line, the backup's checkdowns: not a depth's), and 0 without either)
  const qbDeepOf = (q1, dep, pos) => (q1 > 0 && dep !== null && (POS(pos) === 'WR' || POS(pos) === 'TE') ? Math.round(q1 * Math.max(0, dep - 1) * 1000) / 1000 : 0);
  // (a player's snap share: his last game's and his season's average, over the games read; null with none)
  // (team: his games for that team only, null where his latest was for another: a leader traded away isn't the
  // work his old team's next man up steps into at his new team's share)
  const snapOf = (pid, season, team = null) => {
    const s0 = snapsOf.get(pid);
    if (!s0 || s0.season !== season || !s0.list.length) return null;
    if (team !== null && String(s0.teams[s0.teams.length - 1]) !== String(team)) return null;
    const s = team === null ? s0 : { list: s0.list.filter((x, i) => String(s0.teams[i]) === String(team)) };
    const avg = s.list.reduce((t, x) => t + x, 0) / s.list.length;
    return { latest: Math.round(s.list[s.list.length - 1] * 1000) / 1000, avg: Math.round(avg * 1000) / 1000, n: s.list.length };
  };
  // (the defense's numbers before a game)
  const defense = (id, season, pos) => {
    const d = defOf(id, season);
    const share = pos && pos !== 'QB' ? (d[pos] + 60 * lg.share[pos]) / (d.all + 60) / lg.share[pos] : 1;
    return { funnel: funnel.of(id, season), pace: 1 + d.pace / (d.n + 4), tgt: share };
  };
  // (a player's role on his team before a game: his place among its players at his position, by targets (by
  // carries for a back))
  // (out: the ones missing tonight, by id, taken out of the order: the role he steps into, promotion below)
  // (byWork: by his recent healthy work instead (roleWork below), so a starter who missed games isn't ranked
  // under his fill-in by the season's totals: project.mjs ro)
  const roleOf = (pid, teamId, season, pos, out = null, byWork = false) => {
    const p = POS(pos);
    if (!p || p === 'QB') return null;
    const t = teamOf(teamId, season);
    const by = byWork ? roleWork(teamId, season, p) : p === 'RB' ? t.car : t.tgt;
    const mine = [...by.entries()].filter(([id]) => (byWork || t.pos?.get(id) === p) && (!out || String(id) === String(pid) || !out(id))).sort((a, b) => b[1] - a[1]);
    const at = mine.findIndex(([id]) => id === pid);
    if (at < 0) return p === 'WR' ? 'WR4+' : `${p}2+`;
    if (p === 'WR') return at < 3 ? `WR${at + 1}` : 'WR4+';
    return at === 0 ? `${p}1` : `${p}2+`;
  };
  // (the next man up: his role with his group's missing ones out of the order (roleUp: the ones who've played
  // for the team this season (a regular gone since last season is in the order as before); in the history, not
  // in the game's logs; at bet time, out, doubtful, on IR or off the roster, a questionable one not), a TE2
  // whose TE1 is out the TE1, a WR3 whose WR1 is out the WR2; and the snap share of the most-used one missing
  // above him (his season's average, leadShare: null with none read), the work he steps into. project.mjs rp
  // and nu read them, kept only where the held-out games are better)
  // (and the same by his recent healthy work (roleWork: project.mjs ro): roleW, roleUpW, leadShareW; the target
  // share of the most-targeted one missing above him (his team's targets this season, last season's at half:
  // leadTgt, and by work leadTgtW), the volume base's next-man-up floor (project.mjs rp on a receiving stat's
  // target share); and aheadOut (aheadOf below), 1 where a regular above him by his recent healthy work is missing)
  const promotion = (pid, teamId, season, pos, out) => {
    const p = POS(pos);
    if (!p || p === 'QB') return { roleUp: null, leadShare: null };
    const t = teamOf(teamId, season);
    const w = workOf(teamId, season).p;
    const gone = (id) => !!w.get(id)?.cur && out(id);
    const tgtAll = [...t.tgt.values()].reduce((a, b) => a + b, 0);
    const leadOf = (by) => {
      const own = by.get(pid) ?? 0;
      let lead = null;
      let tgt = null;
      for (const [id, v] of by) {
        if (t.pos?.get(id) !== p || String(id) === String(pid) || !(v > own) || !gone(id)) continue;
        const s = snapOf(id, season, teamId)?.avg ?? null;
        if (s !== null && (lead === null || s > lead)) lead = s;
        const ts = tgtAll >= 20 ? (t.tgt.get(id) ?? 0) / tgtAll : null;
        if (ts !== null && (tgt === null || ts > tgt)) tgt = ts;
      }
      return { lead, tgt: tgt === null ? null : Math.round(tgt * 1000) / 1000 };
    };
    const s = leadOf(p === 'RB' ? t.car : t.tgt);
    const h = leadOf(roleWork(teamId, season, p));
    return { roleUp: roleOf(pid, teamId, season, pos, gone), leadShare: s.lead, leadTgt: s.tgt, roleUpW: roleOf(pid, teamId, season, pos, gone, true), leadShareW: h.lead, leadTgtW: h.tgt };
  };
  // (a regular above him by his recent healthy work missing (out: in the history not in the game's logs, its
  // snap counts read (promotion's rule: without them one missing may have played); at bet time out, doubtful, on IR or off the roster): 1, else 0. Once a fill-in's
  // work passes the missing one's (kept as it was), he's no longer below him: the flag's the absence's first
  // games; the same absence's games (sameOf) read the ones out at his position whatever their order)
  const aheadOf = (pid, teamId, season, pos, out) => {
    const p = POS(pos);
    if (!p || p === 'QB') return 0;
    const w = workOf(teamId, season).p;
    const hw = roleWork(teamId, season, p);
    const own = hw.get(pid) ?? 0;
    return [...hw].some(([id, v]) => String(id) !== String(pid) && v >= 1.5 && v > own && !!w.get(id)?.cur && out(id)) ? 1 : 0;
  };
  // (a position group's recent healthy work by id (hv: his work a game, recent games counting most, a game he
  // left hurt or was eased back in (a snap share under half his season's) not learned; kept as it was through
  // his first FREEZE games out, then fading, as the work is), the role order by it (roleOf byWork))
  const roleWork = (teamId, season, p) => new Map([...workOf(teamId, season).p].filter(([, x]) => x.pos === p).map(([id, x]) => [id, x.hv ?? x.v]));
  // (his organic trend before a game: his work a game in his games this season with no regular at his position
  // missing (its snap counts read: who was out known) and no absence of his own just before (the first game
  // back's eased), recent games counting most
  // (WORK_RATE), over their plain average; null under TREND_MIN such games. The work he took filling in for a
  // missing regular is the next man up's, the vacated term's and the same absence's (rp, nu, vacF, ab), not
  // this)
  const TREND_MIN = 4;
  // (the same absence: the regulars at his position missing tonight (out: as aheadOf's), and his games this
  // season for this team with every one of them missing then too (by game id; its snap counts read), the role
  // he's had with them out (project.mjs ab); null with none missing or no such game)
  const sameOf = (pid, teamId, season, pos, out) => {
    const p = POS(pos);
    if (!p || p === 'QB') return null;
    const w = workOf(teamId, season).p;
    const ids = [...w].filter(([id, x]) => String(id) !== String(pid) && x.pos === p && x.v >= 1.5 && x.cur && out(id)).map(([id]) => String(id));
    if (!ids.length) return null;
    const h = games_.get(pid);
    const list = h && h.season === season ? h.games : [];
    const same = list.filter((g) => String(g.team) === String(teamId) && g.read !== false && ids.every((id) => g.missing.has(id))).map((g) => g.game);
    return same.length ? same : null;
  };
  const trendOf = (pid, season) => {
    const h = games_.get(pid);
    const list = h && h.season === season ? h.games.filter((g) => g.organic) : [];
    if (list.length < TREND_MIN) return null;
    const mean = list.reduce((t, g) => t + g.work, 0) / list.length;
    if (!(mean >= 1)) return null;
    let e = list[0].work;
    for (const g of list.slice(1)) e += (g.work - e) * WORK_RATE;
    return Math.round((e / mean) * 1000) / 1000;
  };
  // (a player back from an absence: back, his team's games he missed just before this one while on its books
  // (the work's gone count: his team's games this season he wasn't in the logs of, from its first for one
  // carried over from last season; a bye isn't a game; one new to the team none), and ret, his game since
  // coming back ({ k: 1 the first back, to RAMP; len: the games he'd missed }), null otherwise. Before the game:
  // in the history his not being in the logs of the games before it, at bet time the same. project.mjs ij reads
  // them (the games he was eased back in and the one he left hurt weighed down, his game back eased by the
  // returners' ramp), kept only where the held-out games are better. A game whose snap counts weren't read has
  // only the players with a stat in its logs (playerlogs.mjs), so one missing from it may have played: an
  // absence with such a game in it (unread) is no return, back 0 and ret null, as without the term)
  const RAMP = 3;
  const rets = new Map();
  const returnOf = (pid, teamId, season) => {
    const x = workOf(teamId, season).p.get(pid);
    if (x?.unread) return { back: 0, ret: null };
    const back = x ? (x.gone ?? 0) : 0;
    if (back >= 1) return { back, ret: { k: 1, len: back } };
    const s = rets.get(pid);
    return { back: 0, ret: s && s.season === season && s.team === teamId && s.k < RAMP ? { k: s.k + 1, len: s.len } : null };
  };
  let i = 0;
  while (i < list.length) {
    const day = list[i].date.slice(0, 10);
    let j = i;
    while (j < list.length && list[j].date.slice(0, 10) === day) j++;
    const batch = list.slice(i, j);
    // (the day's rows, from what was known before it)
    for (const g of batch) {
      const playing = new Set(g.rows.map((r) => r.pid));
      // (the game's snap counts read: without them one missing from its logs may have played with no stat, so
      // none is promoted over him; the same rows' logs that say who's playing, not their numbers)
      const read = g.rows.some((r) => (r.s.snaps ?? 0) > 0);
      for (const r of g.rows) {
        const d = defense(g.opp, g.season, POS(r.pos));
        r.role = roleOf(r.pid, g.team, g.season, r.pos);
        r.funnel = d.funnel;
        r.pace = d.pace;
        r.tgt = d.tgt;
        r.vacs = vacated(g.team, g.season, r.pid, r.pos, (id) => (playing.has(id) ? 0 : 1));
        r.vac = Math.max(...r.vacs);
        r.rb1Out = rb1Out(g.team, g.season, r.pos, (id) => (playing.has(id) ? 0 : 1));
        const q1 = qb1Out(g.team, g.season, r.pid, r.pos, (id) => (playing.has(id) ? 0 : 1));
        r.qb1Out = q1.v;
        r.qb1Miss = q1.miss;
        r.dep = depthOf(r.pid, g.season, r.pos);
        r.qbDeep = qbDeepOf(q1.v, r.dep, r.pos);
        r.teamGame = gameNo(g.team, g.season);
        Object.assign(r, promotion(r.pid, g.team, g.season, r.pos, (id) => read && !playing.has(id)), returnOf(r.pid, g.team, g.season));
        r.roleW = roleOf(r.pid, g.team, g.season, r.pos, null, true);
        r.aheadOut = aheadOf(r.pid, g.team, g.season, r.pos, (id) => read && !playing.has(id));
        r.trend = POS(r.pos) && POS(r.pos) !== 'QB' ? trendOf(r.pid, g.season) : null;
        r.sameGames = sameOf(r.pid, g.team, g.season, r.pos, (id) => read && !playing.has(id));
        const past = vacPast(r.pid, g.season, r.pos);
        if (past) r.vacPast = past;
      }
    }
    // (then learned from)
    for (const g of batch) {
      const o = offOf(g.team, g.season);
      const plays = g.att + g.car;
      if (plays > 20) {
        const normPlays = (o.att + o.car + 3 * lg.plays) / (o.n + 3);
        const d = defOf(g.opp, g.season);
        // (the funnel: from the game's play-by-play where the context has it, else its logs' pass share)
        funnel.learn(g.team, g.opp, g.season, sideOfPlays(pbp?.[g.game], g.home) ?? { pass: g.att, plays });
        d.pace += plays / normPlays - 1;
        d.n++;
        for (const p of ['WR', 'TE', 'RB']) d[p] += g.tgt[p];
        d.all += g.tgt.WR + g.tgt.TE + g.tgt.RB;
        def.set(g.opp, d);
        o.att += g.att;
        o.car += g.car;
        o.n++;
        off.set(g.team, o);
        lg.n++;
        const w = 1 / Math.min(lg.n, 2000);
        lg.pass += (g.att / plays - lg.pass) * w;
        lg.plays += (plays - lg.plays) * w;
        const all = g.tgt.WR + g.tgt.TE + g.tgt.RB;
        if (all) for (const p of ['WR', 'TE', 'RB']) lg.share[p] += (g.tgt[p] / all - lg.share[p]) * w;
      }
      const t = teamOf(g.team, g.season);
      t.pos ??= new Map();
      for (const r of g.rows) {
        const p = POS(r.pos);
        if (!p) continue;
        t.pos.set(r.pid, p);
        t.tgt.set(r.pid, (t.tgt.get(r.pid) ?? 0) + (r.s.targets ?? 0));
        t.car.set(r.pid, (t.car.get(r.pid) ?? 0) + (r.s.rushAtt ?? 0));
        learnAir(r, g.season);
      }
      t.n++;
      played_.set(g.team, { season: g.season, n: gameNo(g.team, g.season) });
      team.set(g.team, t);
      // (the recent work: the ones who played, their game's; the ones who didn't, as it was through their first
      // FREEZE games out, then fading; and the game's regulars missing, as they were, for its players' vacPast)
      const w = workOf(g.team, g.season);
      const playing = new Set(g.rows.map((r) => r.pid));
      const missing = new Set([...w.p].filter(([id, x]) => x.v >= 1.5 && !playing.has(id)).map(([id]) => String(id)));
      // (the snap counts read for the game: without them one missing from its logs may have played with no stat,
      // so the game's neither the same absence's (sameOf) nor organic (trendOf): who was out isn't known, as live)
      const snapsRead = g.rows.some((r) => (r.s.snaps ?? 0) > 0);
      // (a team's first ABSORB_EARLY games of a season left out: its recent work starts over at half last
      // season's, every regular's game over it, a drift the absences' games don't share)
      if (snapsRead && (g.rows[0]?.teamGame ?? 0) > ABSORB_EARLY) learnAbsorb(w, g.rows, playing);
      const played = new Set();
      const most0 = Math.max(0, ...g.rows.map((r) => r.s.snaps ?? 0));
      for (const r of g.rows) {
        const p = POS(r.pos);
        if (!p) continue;
        // (his games since coming back, for the next one's ret)
        if (r.ret) rets.set(r.pid, { season: g.season, team: g.team, ...r.ret });
        else rets.delete(r.pid);
        played.add(r.pid);
        const x = w.p.get(r.pid) ?? { pos: p, v: touches(r, p), hv: touches(r, p), t: r.s.targets ?? 0, c: r.s.rushAtt ?? 0, gone: 0, cur: true };
        x.pos = p;
        x.v += (touches(r, p) - x.v) * WORK_RATE;
        x.t = (x.t ?? 0) + ((r.s.targets ?? 0) - (x.t ?? 0)) * WORK_RATE;
        x.c = (x.c ?? 0) + ((r.s.rushAtt ?? 0) - (x.c ?? 0)) * WORK_RATE;
        // (his healthy work (roleWork): a game under half his season's snap share (he left it hurt, was eased
        // back) not learned, his work as it was)
        const sn = snapOf(r.pid, g.season);
        const short = most0 > 0 && sn !== null && sn.n >= 3 && (r.s.snaps ?? 0) / most0 < 0.5 * sn.avg;
        if (!short) x.hv = (x.hv ?? x.v) + (touches(r, p) - (x.hv ?? x.v)) * WORK_RATE;
        x.gone = 0;
        x.unread = false;
        x.cur = true;
        w.p.set(r.pid, x);
        const h = games_.get(r.pid);
        const mine = h && h.season === g.season ? h : { season: g.season, games: [] };
        // (and the game, its work and whether it's organic, for the trend: no regular at his position missing,
        // not his first game back from an absence)
        mine.games.push({ team: g.team, game: g.game, missing, read: snapsRead, work: touches(r, p), organic: snapsRead && ![...missing].some((id) => w.p.get(id)?.pos === p) && !(r.back >= 1) });
        games_.set(r.pid, mine);
      }
      // (and a game missed without the snap counts makes his absence unread, returnOf)
      for (const [id, x] of w.p) {
        if (played.has(id)) continue;
        x.gone = (x.gone ?? 0) + 1;
        if (!snapsRead) x.unread = true;
        if (x.gone > FREEZE || !x.cur) (x.v *= 1 - WORK_RATE), (x.hv = (x.hv ?? x.v) * (1 - WORK_RATE)), (x.t = (x.t ?? 0) * (1 - WORK_RATE)), (x.c = (x.c ?? 0) * (1 - WORK_RATE));
      }
      // (the snap shares: each player's offensive snaps over the team's most, where the counts were read)
      const most = Math.max(0, ...g.rows.map((r) => r.s.snaps ?? 0));
      // (each row's own share of the game's snaps (null where the counts weren't read, or he has none in them),
      // and a quarterback's start: 70% of the snaps or more, or, where none of the team's quarterbacks reached it,
      // the most snaps of them; without the counts, the most passes. The game's own, for the projections to
      // learn from after it (project.mjs), never to project it)
      const qbs = g.rows.filter((r) => POS(r.pos) === 'QB');
      const qbMost = Math.max(0, ...qbs.map((r) => (most > 0 ? (r.s.snaps ?? 0) : (r.s.passAtt ?? 0))));
      const anyFull = most > 0 && qbs.some((r) => (r.s.snaps ?? 0) / most >= 0.7);
      for (const r of g.rows) {
        r.share = most > 0 && r.s.snaps > 0 ? Math.min(1, r.s.snaps / most) : null;
        if (POS(r.pos) === 'QB') r.start = most > 0 ? (anyFull ? r.share >= 0.7 : qbMost > 0 && (r.s.snaps ?? 0) === qbMost) : qbMost > 0 && (r.s.passAtt ?? 0) === qbMost;
      }
      if (most > 0) {
        for (const r of g.rows) {
          if (!POS(r.pos) || !(r.s.snaps > 0)) continue;
          const s = snapsOf.get(r.pid);
          const mine = s && s.season === g.season ? s : { season: g.season, list: [], teams: [] };
          mine.list.push(Math.min(1, r.s.snaps / most));
          mine.teams.push(g.team);
          snapsOf.set(r.pid, mine);
        }
      }
    }
    i = j;
  }
  return {
    // (missing: how surely each of the team's players is missing the coming game, by id (a function, 0 to 1),
    // or a set of the ones out: the work they leave)
    live: (pid, teamId, oppId, pos, season, missing = null) => {
      const missOf = typeof missing === 'function' ? missing : missing instanceof Set ? (id) => (missing.has(String(id)) ? 1 : 0) : () => 0;
      const vacs = vacated(teamId, season, pid, pos, missOf);
      const past = vacPast(pid, season, pos);
      const snap = snapOf(pid, season);
      const q1 = qb1Out(teamId, season, pid, pos, missOf);
      const dep = depthOf(pid, season, pos);
      const p = POS(pos);
      return { role: roleOf(pid, teamId, season, pos), roleW: roleOf(pid, teamId, season, pos, null, true), aheadOut: aheadOf(pid, teamId, season, pos, (id) => missOf(id) >= 1), trend: p && p !== 'QB' ? trendOf(pid, season) : null, sameGames: sameOf(pid, teamId, season, pos, (id) => missOf(id) >= 1), ...promotion(pid, teamId, season, pos, (id) => missOf(id) >= 1), ...returnOf(pid, teamId, season), ...defense(oppId, season, POS(pos)), vacs, vac: Math.max(...vacs), rb1Out: rb1Out(teamId, season, pos, missOf), qb1Out: q1.v, qb1Miss: q1.miss, dep, qbDeep: qbDeepOf(q1.v, dep, pos), teamGame: gameNo(teamId, season), ...(past ? { vacPast: past } : {}), ...(snap ? { snap } : {}) };
    },
    // (the learned split's table as it stands (absorbTable dump): the log's)
    absorbed: () => ({ ...absorb.dump(), read: learned }),
    // (a team's quarterback now: the one with the most passes a game, recent games counting most ({ id, v });
    // null with none)
    qb1: (teamId, season) => {
      const qbs = [...workOf(teamId, season).p].filter(([, x]) => x.pos === 'QB' && x.v >= 1).sort((a, b) => b[1].v - a[1].v);
      return qbs.length ? { id: String(qbs[0][0]), v: Math.round(qbs[0][1].v * 10) / 10 } : null;
    },
    // (a team's regulars who've missed its last two games or more (by id: how many, his position): missing at
    // bet time unless the injury report lists him or he has a prop on the game's board (props.mjs priceProps),
    // as the history counts a player not in a game's logs; his games out counted from this season's first)
    absent: (teamId, season) => new Map([...workOf(teamId, season).p].filter(([, x]) => x.v >= 1.5 && (x.gone ?? 0) >= 2).map(([id, x]) => [String(id), { gone: x.gone, pos: x.pos }])),
    // (a player's team games missed in a row now, 0 for one in its last game's logs; null for one who's not
    // played for it this season (or not at all): a questionable one's play chance reads it, playchance.mjs gone)
    goneOf: (teamId, season, id) => {
      const p = workOf(teamId, season).p;
      const x = p.get(id) ?? p.get(String(id)) ?? p.get(Number(id));
      return x?.cur ? (x.gone ?? 0) : null;
    },
    // (a team's regulars at a position group now: the ones whose recent work counts in the work missing when
    // they're out (matchups' vacated), by id)
    regulars: (teamId, season, pos) => {
      const p = POS(pos);
      if (!p || p === 'QB') return [];
      return [...workOf(teamId, season).p].filter(([, x]) => x.pos === p && x.v >= 1.5).map(([id, x]) => ({ id: String(id), v: Math.round(x.v * 10) / 10 }));
    },
  };
}

// (a day's rows at a time, in date order: each day's projected from what was known before it, then learned)
function byDay(rows, fn) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  let i = 0;
  while (i < sorted.length) {
    const day = sorted[i].date.slice(0, 10);
    let j = i;
    while (j < sorted.length && sorted[j].date.slice(0, 10) === day) j++;
    fn(sorted.slice(i, j));
    i = j;
  }
}

// A team's players' recent work, the NFL's vacated (above) for other sports: each player's work a game in one
// or more measures (recent games counting most: rate a game; faded game by game he misses; a new season starts
// it over at half), within his group (groupOf his position: null, none). vacated: his cut of the work his
// group's regulars (regular[m] a game or more) who are missing leave, over his own (floor[m] at least: a
// fringe player's cut isn't blown up by his tiny own), shared among the ones playing by their work to the power
// 1, 0.5 and 0 (SPLITS), each measure's three in turn: [m0 in proportion, m0 flatter, m0 equally, m1 ...].
// A measure a row doesn't have (undefined: a line kept before it was) leaves his number in it as it was. And,
// with absorb ({ cls, top, p, learned }: the NBA's), each measure's learned split after them (absorbTable: who
// absorbs it, by class, his position's (cls) and whether he's among the team's top (top) by the first measure, a
// starter, or off the bench; project.mjs vl; learned false, its table learned but not read, the split in
// proportion in its place): [..., m0 learned, m1 learned]
export function teamWork({ groupOf, measures, regular, floor, rate = 0.35, absorb = null }) {
  const SPLITS = [1, 0.5, 0];
  const NONE = [...measures.flatMap(() => SPLITS.map(() => 0)), ...(absorb ? measures.map(() => 0) : [])];
  const table = absorb ? absorbTable(absorb) : null;
  const clamp01 = (m) => Math.min(1, Math.max(0, Number(m) || 0));
  // (a class: his position's and S among the top (absorb.top) of a list of first measures, else B)
  const classOf = (pos, v0, list) => `${absorb.cls(pos)}${1 + list.filter((v) => v > v0).length <= absorb.top ? 'S' : 'B'}`;
  // (his cut of a measure's work missing by the learned split: the missing regulars (regular[m] a game or more,
  // at their chance of missing it), each by his class (his place among the team's), times the share of that
  // class's work the history saw his class take (his place among the ones playing), his part of it by his work
  // in the measure where his class holds more than one, over his own (floor[m] at least); null (the split in
  // proportion in its place) till the table's ready)
  const learnedOf = (w, grp, pid, pos, missOf, m) => {
    if (!table?.ready() || absorb.learned === false) return null;
    const all = [...w.p].filter(([, x]) => x.g === grp);
    const ownX = w.p.get(pid);
    const own0 = ownX?.v[0] ?? 0;
    const here = all.filter(([id, x]) => String(id) !== String(pid) && (x.v[0] ?? 0) >= floor[0] / 2 && clamp01(missOf(id)) < 1);
    const k = classOf(pos, own0, here.map(([, x]) => x.v[0] ?? 0));
    const ownM = Math.max(ownX?.v[m] ?? 0, floor[m] / 2);
    const firstsHere = [own0, ...here.map(([, x]) => x.v[0] ?? 0)];
    const mates = here.filter(([, x]) => classOf(x.pos, x.v[0] ?? 0, firstsHere) === k);
    const part = ownM / mates.reduce((t, [, x]) => t + Math.max(x.v[m] ?? 0, floor[m] / 2), ownM);
    const firsts = all.map(([, x]) => x.v[0] ?? 0);
    let got = 0;
    for (const [id, x] of all) {
      const v = x.v[m] ?? 0;
      if (String(id) === String(pid) || v < regular[m]) continue;
      const miss = clamp01(missOf(id));
      if (miss) got += miss * table.share(String(m), classOf(x.pos, x.v[0] ?? 0, firsts), k) * v;
    }
    return Math.round(Math.min(3, Math.max(-0.5, (got * part) / Math.max(ownM, floor[m]))) * 1000) / 1000;
  };
  const work = new Map();
  const workOf = (team, season) => {
    let w = work.get(team);
    if (!w || w.season !== season) {
      const last = w && w.season === season - 1 ? w : null;
      w = { season, p: new Map(last ? [...last.p].map(([k, x]) => [k, { g: x.g, pos: x.pos, v: x.v.map((v) => (v === null ? null : v * 0.5)) }]) : []) };
      work.set(team, w);
    }
    return w;
  };
  const vacated = (team, season, pid, pos, missOf) => {
    const grp = groupOf(pos);
    if (grp === null || grp === undefined) return NONE;
    const w = workOf(team, season);
    const out = [];
    measures.forEach((_, m) => {
      let gone = 0;
      const here = [];
      for (const [id, x] of w.p) {
        const v = x.v[m] ?? 0;
        if (x.g !== grp || v < floor[m] / 2 || String(id) === String(pid)) continue;
        const miss = Math.min(1, Math.max(0, Number(missOf(id)) || 0));
        if (miss > 0 && v >= regular[m]) gone += miss * v;
        if (miss < 1) here.push([v, 1 - miss]);
      }
      if (!gone) return out.push(...SPLITS.map(() => 0));
      const own = Math.max(w.p.get(pid)?.v[m] ?? 0, floor[m] / 2);
      for (const g of SPLITS) {
        const all = here.reduce((t, [v, k]) => t + k * Math.pow(v, g), Math.pow(own, g));
        out.push(Math.round(Math.min(3, (gone * Math.pow(own, g)) / all / Math.max(own, floor[m])) * 1000) / 1000);
      }
    });
    if (absorb) measures.forEach((_, m) => out.push(learnedOf(w, grp, pid, pos, missOf, m) ?? out[m * SPLITS.length]));
    return out;
  };
  // (a game learned into the learned split's history (absorbTable), before the work's own: the regulars missing
  // it (regular[0] a game or more, not in its box) who played the team's game before (a fresh absence: the work
  // of the ones playing not yet theirs), each class's work in each measure over its players' recent work (one new,
  // his all), by the missing classes' recent work; a game with none fresh, the drift every game has. One out
  // SETTLED games or more is settled (the fade: the ones playing have his work in theirs by then) and left out of
  // both; a game with one out between isn't learned from)
  const SETTLED = 5;
  const learnAbsorb = (w, rows) => {
    const playing = new Set(rows.map((r) => r.pid));
    for (const grp of new Set(rows.map((r) => groupOf(r.pos)).filter((g) => g !== null && g !== undefined))) {
      const all = [...w.p].filter(([, x]) => x.g === grp);
      const missing = all.filter(([id, x]) => (x.v[0] ?? 0) >= regular[0] && !playing.has(id));
      if (missing.some(([, x]) => (x.out ?? 0) >= 1 && (x.out ?? 0) < SETTLED)) continue;
      const out = missing.filter(([, x]) => !((x.out ?? 0) >= 1));
      const here = rows.filter((r) => groupOf(r.pos) === grp).map((r) => ({ r, x: w.p.get(r.pid), now: measures.map((fn) => fn(r)) }));
      // (his place as the live split reads it: among the ones with floor[0] / 2 or more)
      const firsts = here.map((h) => h.x?.v[0] ?? 0).filter((v) => v >= floor[0] / 2);
      const excess = Object.fromEntries(measures.map((_, m) => [String(m), new Map()]));
      for (const h of here) {
        const k = classOf(h.r.pos, h.x?.v[0] ?? 0, firsts);
        measures.forEach((_, m) => {
          if (!Number.isFinite(h.now[m])) return;
          const e = excess[String(m)];
          e.set(k, (e.get(k) ?? 0) + h.now[m] - (h.x?.v[m] ?? 0));
        });
      }
      if (!out.length) {
        table.none(excess);
        continue;
      }
      const firstsAll = all.map(([, x]) => x.v[0] ?? 0);
      const gone = Object.fromEntries(measures.map((_, m) => [String(m), new Map()]));
      for (const [, x] of out) {
        const mc = classOf(x.pos, x.v[0] ?? 0, firstsAll);
        measures.forEach((_, m) => gone[String(m)].set(mc, (gone[String(m)].get(mc) ?? 0) + (x.v[m] ?? 0)));
      }
      table.event(gone, excess);
    }
  };
  // (a game's rows for one team learned: the ones who played, their game's; the ones who didn't, fading)
  const learn = (team, season, rows) => {
    const w = workOf(team, season);
    // (its first ABSORB_EARLY games of a season left out, as the NFL's: the work starts over at half)
    w.n = (w.n ?? 0) + 1;
    if (table && w.n > ABSORB_EARLY) learnAbsorb(w, rows);
    const played = new Set();
    for (const r of rows) {
      const grp = groupOf(r.pos);
      if (grp === null || grp === undefined) continue;
      played.add(r.pid);
      const now = measures.map((f) => f(r));
      const x = w.p.get(r.pid) ?? { g: grp, v: now.map((v) => (Number.isFinite(v) ? v : null)) };
      x.g = grp;
      x.pos = r.pos;
      x.v = x.v.map((v, m) => (!Number.isFinite(now[m]) ? v : v === null ? now[m] : v + (now[m] - v) * rate));
      w.p.set(r.pid, x);
    }
    for (const [id, x] of w.p) {
      if (played.has(id)) x.out = 0;
      else (x.v = x.v.map((v) => (v === null ? null : v * (1 - rate)))), (x.out = (x.out ?? 0) + 1);
    }
  };
  // (who counts as missing, by what was known before the game: one missing (missOf, 0 to 1) who's a core
  // player (his first measure core(group) a game or more), or who missed the team's game before too. A fringe
  // regular's one game out is most often a healthy scratch or a coach's decision, which no injury report
  // carries: counted in the history, it would hold work missing that a live price never can, the term leaning
  // every projection down. The same rule for the history (missOf: not in the box score) and a coming game
  // (missOf: out by the injury report, off the roster), so the two read alike)
  const gate = (team, season, missOf, core) => {
    const w = workOf(team, season);
    return (id) => {
      const m = Number(missOf(id)) || 0;
      if (m <= 0) return 0;
      const x = w.p.get(id);
      return !x || (x.v[0] ?? 0) >= core(x.g) || (x.out ?? 0) >= 1 ? m : 0;
    };
  };
  const histMiss = (team, season, playing, core) => gate(team, season, (id) => (playing.has(id) ? 0 : 1), core);
  return { vacated, learn, gate, histMiss, none: NONE, absorbed: () => (table ? { ...table.dump(), read: absorb.learned !== false } : null) };
}

// (the core players whose one game out counts at once (teamWork gate, the history's and a coming game's alike):
// the NBA's 24 minutes a game or more, the NHL's forwards' 14 minutes on ice, defensemen's 18; a regular under
// it, from his second game out in a row)
export const NBA_CORE = 24;
export const NHL_CORE = { F: 14, D: 18 };
// (an NHL skater's power-play lean (nhlMatchups ppLean): the games of his this season it waits for, the minutes
// added to each side of the ratio (a second unit's 0.2 against 0.6 isn't a threefold swing), its cap on the log)
const PP_LEAN_N = 4;
const PP_LEAN_PAD = 0.5;
const PP_LEAN_CAP = 1;

// (a coming game's teammates missing, as a function of id (0 to 1) from a function, a set or nothing)
const missFn = (missing) => (typeof missing === 'function' ? missing : missing instanceof Set ? (id) => (missing.has(String(id)) ? 1 : 0) : () => 0);

// (the NBA's learned split's classes (teamWork absorb): a guard, forward or center (props.mjs nbaPos's: a PG or SG
// a guard, an SF or PF a forward, one unknown a forward), among the team's five by recent minutes or not; about
// two thirds of a starter's game the pull)
const ABSORB_NBA = { cls: (pos) => (/^(PG|SG|G)$/.test(pos ?? '') ? 'G' : pos === 'C' ? 'C' : 'F'), top: 5, p: 20 };

// (an NBA player's usage a game: field goals tried, 0.44 of free throws tried, and assists; a line kept before
// the shots were, its points' worth of them (0.87 tries a point, about the league's))
export const nbaUsage = (r) => (Number.isFinite(r.s.fga) ? r.s.fga + 0.44 * (r.s.fta ?? 0) : 0.87 * (r.s.pts ?? 0)) + (r.s.ast ?? 0);

// (the NBA's pace (nbaMatchups): a team's possessions a game pulled toward its prior by PACE_K games, and the
// league's this season taken from PACE_LG team-games on, last season's before)
const PACE_K = 10;
const PACE_LG = 30;
// (a team's last season carried into this one's prior at this much of its distance from the league's: the
// offseason's rosters change, and a new season's opening weeks were never held out)
const PACE_CARRY = 0.5;
// (a team's possessions in a game, a 48 minutes: its field goals tried, 0.44 of its free throws tried and its
// turnovers, less its offensive rebounds, over its players' minutes over 240; null where a line misses one of
// them (a line kept before they were) or the minutes are short)
export function nbaPossessions(list) {
  let poss = 0;
  let min = 0;
  for (const r of list) {
    const { fga, fta, oreb, tov } = r.s;
    if (![fga, fta, oreb, tov].every(Number.isFinite)) return null;
    poss += fga + 0.44 * fta + tov - oreb;
    min += r.s.min ?? 0;
  }
  return min >= 200 && poss > 0 ? (poss * 240) / min : null;
}

// The NBA's roles: each team's five with the most minutes a game so far (three games or more) among the ones
// playing its starters (S), the rest its bench (B); and the work missing (teamWork: by minutes, by usage, the
// whole team one group; a core player out counts at once, a regular from his second game out in a row:
// teamWork gate); each game's minutes over 48 (share) and his start in his team's game before (startLast); the
// other side's pace (pace) and the game's expected possessions (paceG), each over the league's. The same for a
// coming game (live: missing, the teammates out by the injury report, none of them a starter). learned: the learned
// split read (teamWork's; false, the default, the split in proportion in its place)
export function nbaMatchups(rows, { learned = false } = {}) {
  const team = new Map();
  const work = teamWork({ groupOf: () => 'all', measures: [(r) => r.s.min, nbaUsage], regular: [15, 8], floor: [10, 6], absorb: { ...ABSORB_NBA, learned } });
  // (known: only a role he's ranked in (roleKnown), null for a player under three games or with fewer than
  // five ranked; else B for one not ranked, as roleK has always read it)
  const roleOf = (pid, teamId, season, out = () => false, known = false) => {
    const t = team.get(teamId);
    if (!t || t.season !== season) return null;
    const avg = [...t.p.entries()].filter(([id, x]) => x.n >= 3 && (String(id) === String(pid) || !out(id))).map(([id, x]) => [id, x.min / x.n]).sort((a, b) => b[1] - a[1]);
    const at = avg.findIndex(([id]) => id === pid);
    if (known && (at < 0 || avg.length < 5)) return null;
    return at < 0 ? 'B' : at < 5 ? 'S' : 'B';
  };
  // (whether he started his team's game before this season (the box's starter flag: 1 or 0; 0 where he's played
  // for the team but missed that game, a start weeks ago not his last game's; null unknown or none yet), known
  // before the game: tonight's starters aren't posted till near the tip, so the game before's the read
  // (props.mjs CTX newStart))
  const startLastOf = (pid, teamId, season) => {
    const t = team.get(teamId);
    if (!t || t.season !== season || !t.p.has(pid)) return null;
    const b = before.get(teamId);
    if (b && b.season === season && !b.ids.has(pid)) return 0;
    return t.p.get(pid).start ?? null;
  };
  // (each team's players in its game before: the history's roleKnown counts out only the ones missing that
  // one too)
  const before = new Map();
  // (the pace: each team's possessions a game by season (n, sum), the league's by season)
  const paces = new Map();
  const lgPace = new Map();
  const lgOf = (season) => {
    const cur = lgPace.get(season);
    if (cur?.n >= PACE_LG) return cur.sum / cur.n;
    const last = lgPace.get(season - 1);
    return last?.n >= PACE_LG ? last.sum / last.n : null;
  };
  // (a team's possessions a game: this season's pulled toward last season's (PACE_LG games of it or more, held
  // PACE_CARRY of the way from the league's), else the league's, by PACE_K games; null with the league's unknown)
  const paceTeam = (teamId, season, lg) => {
    const t = paces.get(String(teamId));
    const cur = t?.get(season) ?? { n: 0, sum: 0 };
    const last = t?.get(season - 1);
    const prior = last?.n >= PACE_LG ? lg + PACE_CARRY * (last.sum / last.n - lg) : lg;
    return (cur.sum + PACE_K * prior) / (cur.n + PACE_K);
  };
  const paceOf = (teamId, oppId, season) => {
    const lg = lgOf(season);
    if (!(lg > 0)) return { pace: 1, paceG: 1, paceKnown: false };
    const o = paceTeam(oppId, season, lg) / lg;
    return { pace: o, paceG: (paceTeam(teamId, season, lg) / lg) * o, paceKnown: true };
  };
  byDay(rows, (batch) => {
    const games = new Map();
    for (const r of batch) {
      const key = `${r.game}|${r.team}`;
      games.set(key, [...(games.get(key) ?? []), r]);
    }
    for (const list of games.values()) {
      const playing = new Set(list.map((r) => r.pid));
      const out = (id) => !playing.has(id);
      const last = before.get(list[0].team);
      const outKnown = (id) => !playing.has(id) && !!last && last.season === list[0].season && !last.ids.has(id);
      const miss = work.histMiss(list[0].team, list[0].season, playing, () => NBA_CORE);
      for (const r of list) {
        r.role = roleOf(r.pid, r.team, r.season, out);
        r.roleKnown = roleOf(r.pid, r.team, r.season, outKnown, true);
        r.vacs = work.vacated(r.team, r.season, r.pid, r.pos, miss);
        r.vac = Math.max(...r.vacs);
        // (his minutes over a full game's 48: the game's own share, learned after it, never projected from
        // (project.mjs's minutes-first base, the NFL snap share's place); an overtime game's over 1, its minutes
        // all in the per-minute rate, held to 1 in the minutes expected tonight (project.mjs))
        r.share = r.s.min > 0 ? r.s.min / 48 : null;
        r.startLast = startLastOf(r.pid, r.team, r.season);
        Object.assign(r, paceOf(r.team, r.opp, r.season));
      }
    }
    // (the day's games' possessions, the two sides' averaged (one side's where only it reads), learned after
    // the day's rows were all given theirs)
    const byGame = new Map();
    for (const list of games.values()) {
      const p = nbaPossessions(list);
      if (p === null) continue;
      const g = byGame.get(list[0].game) ?? [];
      g.push([list[0].team, list[0].season, p]);
      byGame.set(list[0].game, g);
    }
    for (const sides of byGame.values()) {
      const p = sides.reduce((t, x) => t + x[2], 0) / sides.length;
      for (const [teamId, season] of sides) {
        const t = paces.get(String(teamId)) ?? new Map();
        const x = t.get(season) ?? { n: 0, sum: 0 };
        x.n++;
        x.sum += p;
        t.set(season, x);
        paces.set(String(teamId), t);
        const l = lgPace.get(season) ?? { n: 0, sum: 0 };
        l.n++;
        l.sum += p;
        lgPace.set(season, l);
      }
    }
    for (const list of games.values()) {
      const r0 = list[0];
      work.learn(r0.team, r0.season, list);
      before.set(r0.team, { season: r0.season, ids: new Set(list.map((r) => r.pid)) });
      for (const r of list) {
        let t = team.get(r.team);
        if (!t || t.season !== r.season) t = { season: r.season, p: new Map() };
        const x = t.p.get(r.pid) ?? { n: 0, min: 0, start: null };
        x.n++;
        x.min += r.s.min ?? 0;
        x.start = r.s.start === 1 || r.s.start === 0 ? r.s.start : null;
        t.p.set(r.pid, x);
        team.set(r.team, t);
      }
    }
  });
  return {
    live: (pid, teamId, oppId, pos, season, missing = null) => {
      const missOf = missFn(missing);
      const vacs = work.vacated(teamId, season, pid, pos, work.gate(teamId, season, missOf, () => NBA_CORE));
      return { role: roleOf(pid, teamId, season, (id) => missOf(id) >= 1), roleKnown: roleOf(pid, teamId, season, (id) => missOf(id) >= 1, true), startLast: startLastOf(pid, teamId, season), funnel: 0, ...paceOf(teamId, oppId, season), tgt: 1, vacs, vac: Math.max(...vacs) };
    },
    // (the learned split's table as it stands (absorbTable dump): the log's)
    absorbed: () => work.absorbed(),
  };
}

// The NHL's: the work missing (teamWork: by time on ice and by power-play time, forwards and defensemen apart;
// a core skater out counts at once, a regular from his second game out in a row: teamWork gate) and the power
// play (a skater's power-play minutes a game, recent games counting most; his opponent's penalties a game over
// the league's per team, from the context's box facts: facts.games[id].w, each side's power plays first), and
// his share of his team's power play against his position's prop players' (ppShare). The same for a coming game.
// And his ice time first (audit #13): a skater's time on ice over a full game's 60 (share: the game's own, learned
// after it, never projected from; project.mjs's minutes-first base, the NBA's minutes' place), and his power-play
// time's lean (ppLean: his power-play minutes a game, recent games counting most (ppTime), against his season's
// average, as a log; 0 till he has PP_LEAN_N games this season): a top unit's job won or lost since the games
// his numbers come from (props.mjs CTX ppLean)
export function nhlMatchups(rows, facts = null) {
  const grp = (pos) => (pos === 'F' || pos === 'D' ? pos : null);
  const work = teamWork({ groupOf: grp, measures: [(r) => r.s.toi, (r) => r.s.pptoi], regular: [10, 1], floor: [8, 0.5] });
  const pp = new Map();
  const pens = new Map();
  const lg = { pp: 3, n: 0 };
  const RATE = 0.35;
  // (a team's penalties a game (its opponents' power plays) over the league's per team, pulled by 10 games)
  const pensOf = (id, season) => {
    const t = pens.get(id);
    const w = !t ? 0 : t.season === season ? 1 : t.season === season - 1 ? 0.5 : 0;
    return w ? (w * t.sum + 10 * lg.pp) / (w * t.n + 10) - lg.pp : 0;
  };
  const ppOf = (pid) => pp.get(pid) ?? null;
  // (his power-play minutes this season ([season, total, games]) and his lean: the recent ones (ppOf) over their
  // average, each with PP_LEAN_PAD added, as a log held to PP_LEAN_CAP either way; 0 before PP_LEAN_N games)
  const ppSeason = new Map();
  const ppLeanOf = (pid, season) => {
    const t = ppSeason.get(pid);
    const now = ppOf(pid);
    if (!t || t[0] !== season || t[2] < PP_LEAN_N || !Number.isFinite(now)) return 0;
    const v = Math.log((now + PP_LEAN_PAD) / (t[1] / t[2] + PP_LEAN_PAD));
    return Math.round(Math.max(-PP_LEAN_CAP, Math.min(PP_LEAN_CAP, v)) * 1000) / 1000;
  };
  // (his share of his team's power play: his power-play minutes over the team's (its skaters' summed over 5, a
  // game with under half a minute of it not read), recent games counting most (RATE), carried across seasons as
  // his minutes are (his first game for a new team counting half: a top unit's man traded to a second unit isn't
  // read as the first for long); against the league's for his position's prop players (each team-game's top six
  // forwards and top two defensemen by that game's own time on ice, learned after it and read from the next day
  // on: the 0 the share is centred on), a running average: ppShare, a top unit's man over 0, a second-pair
  // defenseman under it. The prior (project.mjs: the position's eligible players) is a top unit's and a third
  // line's alike; this reads which he is. null with no share read yet (no effect))
  const share = new Map();
  const shareTeam = new Map();
  const lgShare = { F: { v: 0.3, n: 0 }, D: { v: 0.3, n: 0 } };
  const shareOf = (pid, pos) => {
    const v = share.get(pid);
    const lg = lgShare[pos];
    return v === undefined || !lg ? null : Math.round((v - lg.v) * 1000) / 1000;
  };
  const stamp = (r) => {
    r.ppShare = shareOf(r.pid, r.pos);
    r.ppTime = ppOf(r.pid);
    r.ppLean = ppLeanOf(r.pid, r.season);
    r.ppOpp = pensOf(r.opp, r.season);
    r.ppAvg = lg.pp;
  };
  byDay(rows, (batch) => {
    const games = new Map();
    for (const r of batch) {
      const key = `${r.game}|${r.team}`;
      games.set(key, [...(games.get(key) ?? []), r]);
    }
    for (const list of games.values()) {
      const playing = new Set(list.map((r) => r.pid));
      const miss = work.histMiss(list[0].team, list[0].season, playing, (g) => NHL_CORE[g] ?? 0);
      for (const r of list) {
        stamp(r);
        r.vacs = work.vacated(r.team, r.season, r.pid, r.pos, miss);
        r.vac = Math.max(...r.vacs);
        // (a skater's time on ice over a full game's 60: the game's own (an overtime game's a little over 1, its
        // minutes all in the per-minute rate, held to 1 in what's expected tonight: project.mjs))
        r.share = r.pos !== 'G' && r.s.toi > 0 ? r.s.toi / 60 : null;
      }
    }
    // (then learned: each side's work and power-play time, each team's penalties once a game)
    const seen = new Set();
    for (const list of games.values()) {
      const r0 = list[0];
      work.learn(r0.team, r0.season, list);
      for (const r of list) {
        if (r.pos === 'G' || !Number.isFinite(r.s.pptoi)) continue;
        const was = pp.get(r.pid);
        pp.set(r.pid, was === undefined || was === null ? r.s.pptoi : was + (r.s.pptoi - was) * RATE);
        const t = ppSeason.get(r.pid);
        ppSeason.set(r.pid, t && t[0] === r.season ? [r.season, t[1] + r.s.pptoi, t[2] + 1] : [r.season, r.s.pptoi, 1]);
      }
      const skaters = list.filter((r) => r.pos !== 'G' && Number.isFinite(r.s.pptoi));
      const teamPp = skaters.reduce((t, r) => t + r.s.pptoi, 0) / 5;
      if (teamPp >= 0.5) {
        for (const r of skaters) {
          const x = Math.min(1, r.s.pptoi / teamPp);
          const was = share.get(r.pid);
          const moved = shareTeam.has(r.pid) && shareTeam.get(r.pid) !== r.team;
          share.set(r.pid, was === undefined ? x : was + (x - was) * (moved ? Math.max(RATE, 0.5) : RATE));
          shareTeam.set(r.pid, r.team);
        }
        // (the league's, on the game's own prop players: learned after the game, read from the next day on)
        for (const [pos, n] of [['F', 6], ['D', 2]]) {
          const top = skaters.filter((r) => r.pos === pos).sort((a, b) => (b.s.toi ?? 0) - (a.s.toi ?? 0)).slice(0, n);
          for (const r of top) {
            const lg = lgShare[pos];
            lg.n++;
            lg.v += (Math.min(1, r.s.pptoi / teamPp) - lg.v) / Math.min(lg.n, 2000);
          }
        }
      }
      const w = facts?.games?.[r0.game]?.w;
      if (seen.has(r0.game) || !Array.isArray(w) || w.length < 2) continue;
      seen.add(r0.game);
      const home = r0.home ? r0.team : r0.opp;
      const away = r0.home ? r0.opp : r0.team;
      // (w: [home's power plays, away's, ...]: the away side's penalties are the home side's power plays)
      for (const [id, n] of [
        [away, w[0]],
        [home, w[1]],
      ]) {
        const t = pens.get(id);
        const keep = !t ? null : t.season === r0.season ? t : t.season === r0.season - 1 ? { season: r0.season, sum: t.sum * 0.5, n: t.n * 0.5 } : null;
        pens.set(id, { season: r0.season, sum: (keep?.sum ?? 0) + n, n: (keep?.n ?? 0) + 1 });
        lg.n++;
        lg.pp += (n - lg.pp) / Math.min(lg.n, 1000);
      }
    }
  });
  return {
    live: (pid, teamId, oppId, pos, season, missing = null) => {
      const vacs = work.vacated(teamId, season, pid, pos, work.gate(teamId, season, missFn(missing), (g) => NHL_CORE[g] ?? 0));
      return { role: null, funnel: 0, pace: 1, tgt: 1, vacs, vac: Math.max(...vacs), ppTime: ppOf(pid), ppLean: ppLeanOf(pid, season), ppShare: shareOf(pid, pos), ppOpp: pensOf(oppId, season), ppAvg: lg.pp };
    },
  };
}

// (MLB's plate appearances a start by batting-order slot, 1 to 9, about the league's (2025-26's starts, early
// exits and all))
export const PA_BY_SLOT = [4.49, 4.4, 4.3, 4.2, 4.06, 3.91, 3.77, 3.61, 3.44];
// (at a fractional slot: his usual)
export const paAt = (slot) => {
  const s = Math.min(9, Math.max(1, slot));
  const lo = Math.floor(s);
  return lo >= 9 ? PA_BY_SLOT[8] : PA_BY_SLOT[lo - 1] + (PA_BY_SLOT[lo] - PA_BY_SLOT[lo - 1]) * (s - lo);
};
// (how often a batter of each side has the platoon edge on the starter he faces, about: most starters throw right)
const EDGE_PRIOR = { L: 0.72, R: 0.28, S: 1 };
// (a date as StatsAPI's logs keep it: the US Eastern day as yyyymmdd)
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const d8Of = (date) => Number(ET.format(new Date(date)).replace(/-/g, ''));
const daysBetween = (a, b) => Math.round((Date.UTC(Math.floor(b / 1e4), (Math.floor(b / 100) % 100) - 1, b % 100) - Date.UTC(Math.floor(a / 1e4), (Math.floor(a / 100) % 100) - 1, a % 100)) / 864e5);

// A starting pitcher's leash and rest before a game (day: yyyymmdd, US Eastern), from his StatsAPI game logs
// (facts.pitchers[id].logs: [date, outs, ..., pitches, batters faced, games started]): his pitches in his last
// two starts this season over his usual a start (this season's and half of last season's, pulled toward 90 by
// 5 starts), as a log (0 without two starts' counts); his days since he last pitched this season (null: none
// yet), and as a term, (days - 5) / 5, from -0.6 to 1
export function pitcherBefore(logs, season, day) {
  const cur = (logs?.[season] ?? []).filter((r) => r[0] < day);
  const prev = logs?.[season - 1] ?? [];
  const starts = (list) => list.filter((r) => Number.isFinite(r[8]) && r[8] > 0 && (r[10] === null || r[10] === undefined || r[10] >= 1));
  const sc = starts(cur);
  const sp = starts(prev);
  const sum = (list) => list.reduce((t, r) => t + r[8], 0);
  const usual = (sum(sc) + 0.5 * sum(sp) + 5 * 90) / (sc.length + 0.5 * sp.length + 5);
  const last2 = sc.slice(-2);
  const leash = last2.length === 2 ? Math.log(sum(last2) / 2 / usual) : 0;
  const lastDay = cur.length ? cur[cur.length - 1][0] : null;
  const restDays = lastDay === null ? null : daysBetween(lastDay, day);
  return { leash: Math.round(leash * 1000) / 1000, restDays, rest: restDays === null ? 0 : (Math.min(restDays, 10) - 5) / 5, debut: !cur.length, pitches: last2.map((r) => r[8]) };
}

// MLB's: each batter's start, slot and platoon edge, and each starter's leash and rest, from the context's facts
// (facts.games[id].lo: the lineups in order; hp, ap: the probable starters; facts.hands: how each bats and
// throws; facts.pitchers: the starters' logs), each from before the game. The same for a coming game (live's
// extra: the game's live facts (its posted lineups, its probables), whether he's home)
export function mlbMatchups(rows, facts = null) {
  const hist = new Map();
  const handOf = (id) => facts?.hands?.[id] ?? null;
  const edgeOf = (bats, throws) => (!bats || !throws ? null : bats === 'S' || bats !== throws ? 1 : 0);
  const shifts = (pid, slot, edge) => {
    const h = hist.get(pid) ?? { slotSum: 0, slotN: 0, edgeSum: 0, edgeN: 0 };
    const bats = handOf(String(pid).replace(/^mlb:/, ''))?.[0] ?? null;
    const prior = EDGE_PRIOR[bats] ?? 0.5;
    const usualEdge = (h.edgeSum + 10 * prior) / (h.edgeN + 10);
    return {
      slotShift: slot && h.slotN >= 3 ? Math.round(Math.log(paAt(slot) / paAt(h.slotSum / h.slotN)) * 1000) / 1000 : 0,
      platoonShift: edge === null ? 0 : Math.round((edge - usualEdge) * 1000) / 1000,
    };
  };
  const batter = (pid, home, lineups, sp) => {
    const id = String(pid).replace(/^mlb:/, '');
    const order = lineups?.[home ? 0 : 1];
    const known = Array.isArray(order) && order.length > 0;
    const slot = known ? order.map(String).indexOf(id) + 1 : 0;
    const edge = edgeOf(handOf(id)?.[0] ?? null, sp ? (handOf(sp)?.[1] ?? null) : null);
    return { start: known ? slot > 0 : null, slot: slot || null, edge };
  };
  byDay(rows, (batch) => {
    for (const r of batch) {
      const f = r.game ? facts?.games?.[r.game] : null;
      if (r.pos === 'B') {
        const b = batter(r.pid, r.home, f?.lo, f ? f[r.home ? 'ap' : 'hp'] : null);
        Object.assign(r, { start: b.start, slot: b.slot, edgeNow: b.edge }, shifts(r.pid, b.slot, b.edge));
      } else if (r.pos === 'SP') {
        const p = pitcherBefore(facts?.pitchers?.[String(r.pid).replace(/^mlb:/, '')]?.logs, r.season, d8Of(r.date));
        Object.assign(r, { leash: p.leash, rest: p.rest, restDays: p.restDays });
      }
    }
    for (const r of batch) {
      if (r.pos !== 'B' || r.start === false) continue;
      const h = hist.get(r.pid) ?? { slotSum: 0, slotN: 0, edgeSum: 0, edgeN: 0 };
      if (r.slot) (h.slotSum += r.slot), h.slotN++;
      if (r.edgeNow !== null && r.edgeNow !== undefined) (h.edgeSum += r.edgeNow), h.edgeN++;
      hist.set(r.pid, h);
    }
  });
  return {
    // (extra: { live: the game's live facts, game, home, pitcher: whether the prop is a pitcher's (a two-way
    // player's position can't tell) })
    live: (pid, teamId, oppId, pos, season, missing = null, extra = {}) => {
      const l = extra.live ?? {};
      if (extra.pitcher ?? pos === 'SP') {
        const p = pitcherBefore(facts?.pitchers?.[String(pid).replace(/^mlb:/, '')]?.logs, season, d8Of(extra.game?.date ?? Date.now()));
        return { role: null, leash: p.leash, rest: p.rest, restDays: p.restDays, debut: p.debut, pitches: p.pitches };
      }
      const b = batter(pid, extra.home, l.lineups, l[extra.home ? 'ap' : 'hp'] ?? null);
      return { role: null, start: b.start, slot: b.slot, edgeNow: b.edge, ...shifts(pid, b.slot, b.edge) };
    },
  };
}
