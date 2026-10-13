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
//            the vacated term's to hand on (vacF); with rp and nu kept (next up, below) the next man up's expected
//            share also has a floor of nu times the missing one's above him, vacF still on top of it, the two fit
//            together (next-up receivers ran 16% low held out on 2026-10-11; the role guard CHECKs most of them:
//            group-out, part-time). His target share in the volume base (receiving yards') has a floor of
//            its own (nt, a late term on rp's rows, fit apart from rp and nu): nt of the missing one's share of
//            the team's targets (matchups.mjs leadTgt)
//   next up  the NFL's (rp, a late term as the flags below): the next man up projected in the role he steps
//            into (matchups.mjs roleUp: his group's missing ones who've played for the team this season out of
//            the order, a TE2 whose TE1 is out the TE1), the role's opponent table and its tables learned by
//            it; with nu, his expected snap share at least nu of the missing one's above him (leadShare). Its
//            own held-out rows (every player's, 2021 on) ran 13% to 16% over their projections without it
//   return   the NFL's injury return (ij, with ia and ir, a late term the same way): a game back from an absence
//            of ia of his team's games or more (matchups.mjs back, ret: before the game, his not being in the
//            logs of the ones before it), the last game before it (the one he most likely left hurt) and his 1st
//            to RAMP-th games back each weigh 1 - ij in his per-game rate, his last five, his expected snap share
//            and his target share where its snap share was under UNDER of his healthy share (his season's typical
//            share before the absence, else last season's); and the game tonight eased by the returners' ramp to
//            the power ir (what returners did in that game back over their projections, learned as the replay
//            goes). The role backtest's returners (2 games out or
//            more) ran 7% to 12% under their projections without it (2026-10-12), their first game back 14% to
//            18%: the ramp's way, not the weights'
//   share    the NFL's role and work share (audit #2, the owner's steer: playing time moves far more with an
//            absence, his own or the one ahead of him, than organically; each a late term the same way): ab,
//            the same absence: with regulars at his position out tonight and 2 games of his this season or more
//            with every one of them out then too (matchups.mjs sameGames), his base (times the work missing's
//            factor) blended toward his average in those games by ab, the work missing's factor 1 then (the cut
//            already in them); on its own rows' gate (SUBGROUP: the rows it moves, sameOn, whether it's on or
//            not; a game without its snap counts none of its). Measured first (2026-10-12, eligible players
//            2021 on, held out): his last three's work over 1.2x his season's ran receiving yards +17.7% over the
//            projection where an absence ahead fed it (n 513) against +2.5% where none did (n 802), and +24%
//            with that absence still on tonight (n 236; carries +29%, n 134): the jump is the injury's, not
//            organic. Fit: carries +0.0011 and rushing yards +0.0007 held out (ab 0.25), each left out on its own
//            rows' every-player bias (carries' 7.1% to 7.4% under, rushing yards' 6.1% to 6.6%; their eligible
//            rows' smaller); the receiving stats took none on the fit window. ro, the role order by his recent
//            healthy work (matchups.mjs roleW, roleUpW: a starter who missed games not ranked under his fill-in
//            by the season's totals; read by the role's opponent table and rp): receiving yards held out
//            -0.0002, receptions not taken. ot, his organic trend (matchups.mjs trend: his work in the games
//            with no regular at his position out, recent ones counting most, over their average, to the power
//            ot, held to TREND_CAP): -0.0001 to -0.0007 or not taken on every stat (its held-out buckets small:
//            receiving yards' trend up +7.8% against +2.2% even, rushing yards' 0% against +6%). ro and ot off
//            the search since (SHARE), forced by role-backtest.mjs --set; ab too after its second fit
//            (2026-10-12, its gate on the rows it moves, the games without snap counts out of sameGames: the
//            same 930 rows and numbers, carries +0.0011 and rushing yards +0.0007, each left out on its own
//            rows' bias again). nt, the next man up's target floor (above), fit on its own after rp: receiving
//            yards kept 0.75, held out 0.6501 to 0.6498, its own 872 rows 13.1% to 5.8% over their projections
//            (the eligible's 595 13.1% to 9.1%), the eligible players' bias -0.647 to -0.627, every player's
//            -0.485 to -0.426 (tried before only with rp's snap floor, both on nu: nu 0 won, so neither)
//   carry    the seasons' carryover (late terms too, on every row, each kept on the whole stat's gate below: a
//            held-out gain of DRAFT_GAIN or more, the eligible players' and every player's bias no larger; left
//            out, the stat exactly as without it): sk, the snaps-based rate's prior weighed as K games at his
//            share tonight (K x ((1 - sk) + sk x share): a part-timer's season counts as his games, not his snap
//            units, so it isn't pulled to the prior 1/share harder than a starter's); rx, his last five spanning
//            the season boundary while this season has under 3 games (last season's latest at weight rx; with
//            none this season the rate in as one game at weight 1; his per-snap last five the same); pl, his own prior leaning to last season's last 8 games (pl of their
//            average, where last season had 12 or more; the per-snap prior by their snaps the same, and the work his
//            group was missing in them in vacHist's prior, so a late role a hurt starter left isn't counted twice): a role he
//            grew into late last season (Ty Johnson's 2025, 0.33 catches a game in weeks 1-8, 2.2 from 9) not
//            averaged away. The volume base's target share as before. Measured 2026-10-12: pl kept on rushing
//            yards (0.5, +0.0007, bias -0.545 to -0.478); left out on receptions (0.25, +0.0002), carries (0.5,
//            +0.0002), receiving yards (0.25, +0.0003, every player's bias -0.485 to -0.491) and rush+rec yards
//            (0.25, +0.001, every player's -0.651 to -0.668); sk left out (rushing yards 1, +0.0006, bias larger;
//            not taken on the receiving stats), rx nowhere (-0.0001 to +0.0001); the NHL's sog and points took
//            neither on the fit window. Since, only pl searched (sk and rx forced by role-backtest.mjs --set) and
//            the NHL's stats off the carryover: the search cost the NFL props' fit 17% every hourly run. Ty Johnson's receptions (1.48 against the book's 2.20) as before: forced, rx 0.5
//            1.80, pl 0.25 1.65, both 1.91
//   flags    a context flag with a floor of its own (MIN_GAIN: c_newCoach, his team in its first 3 games under a
//            new head coach; c_qb1Out, his team's lead quarterback out, and c_qbDeep, that by how far a
//            pass-catcher's air yards a target run over the league's (the backup's deep throws);
//            the NHL's c_ppShare, a skater's
//            power-play share, on a floor of 0.0001, on no stat's ctx now; the back-to-backs, c_b2b his side's
//            (an NHL goalie's saves), c_b2bB an NBA bench player's, c_b2bS a starter's and c_oppB2b the other
//            side's, each on its own rows' gate) tried after the rest the same way as
//            the draft's prior (below): on top of them as fit, against none at the dispersion the same search
//            found, kept only
//            with a held-out gain of its floor or more (0.0003 the flags'), and the bias: a flag on a few rows
//            (SUBGROUP: the head coach's, the quarterback's, the next man up's promoted rows, the returners'
//            games back) its own rows' smaller, its own rows' eligible players' (SUBGROUP_ELIG_N or more) and the
//            rest's no larger (half a percent of their mean actual), ppShare the eligible players' and every player's no larger (not
//            measured: left out); left out, the stat exactly as without it
//   draft    the NFL's (props.mjs STATS draft; dp, tried last on top of the rest as fit, against none at the
//            dispersion the same search found, kept only on the RB1-out standard: a held-out gain of 0.0003 or
//            more, the eligible players' and every player's bias no larger, and its own no worse: the rookies'
//            and the first two seasons' log loss and bias, their early games' (under 3 of his own) bias and error,
//            100 lines or games each or it's left out): a player in his first two seasons whose prior is the
//            position's (a run of his own too short) has it times his draft slot's ratio (picks 1-10, 11-32,
//            33-64, 65-100, 101-150, later, undrafted: what the rookies taken there did in their first season
//            against the position's prior before each game, by the game, the snap, the start and the target,
//            pulled toward even by 20 games' worth) to the power dp; it fades as his own games come in, by K as
//            the prior does. His draft is nflverse's players file (playerlogs.mjs), known before his first game;
//            none known, or a veteran, as before. A debut and a rookie's second game aren't projected, here or
//            live (2 games of his own or more), so the history's rows carrying a draft the coming row doesn't
//            (it reads his from his games) measure nothing live never sees. College production isn't read
//            (CollegeFootballData needs a key, CFBD_API_KEY, not set up)
//   volume   a receiving stat's (props.mjs STATS perTarget: the NFL's receiving yards; not receptions: props.mjs) volume-
//            based base, blended in by vol (fitted with its yk; 0: left out, kept only if the held-out games are
//            better with it): his share of his team's targets (his season's pulled toward his longer run's by
//            K games of the team's; his last five's for the recent part) times his team's targets expected a
//            game (its season's pulled toward last season's or the league's by 4 games) times what he makes of
//            a target (yards, or catches: his season's pulled toward his longer run's by yk targets, the
//            position's making up a short run), so a high-volume receiver whose efficiency dipped keeps the
//            usage's credit (and the prior's weight, priorW, blended in by vol: the two halves' own). nflverse's
//            targets, from the player rows; missing ones (or a row with none but a catch: a blank read as 0)
//            leave the team-game unread, and a player whose recent games are unread gets the rate as before
//   opponent how far the other side's allowed this stat to his position over the players' own rates, to the
//            power a (1: in full; where the stat fits it by position group (STATS oppPos: the NFL's wide
//            receivers, tight ends and backs on a receiving stat, backs and quarterbacks on a rushing one), the
//            group's own a_<group> (null: the stat's a), each kept only if the held-out games are better with
//            it: a tight end against a defense tight ends feast on weighed apart from a receiver); and where the
//            stat has roles (a player's place on his own team before the game: an NFL team's WR1, WR2, WR3, TE1, RB1; an NBA team's starters and bench), how far it's
//            allowed his role, pulled toward its position number by roleK games' worth (fitted; Infinity: the
//            role left out, kept only if the held-out games are better with it)
//   script   his team's expected score from the game model (the ratings and context) over the average, to the
//            power b: a game the model sees as high scoring or a blowout moves volume (the opponent's for a
//            goalie's saves or a pitcher's outs). Or the market's (mk, a late term on the whole stat's gate,
//            b searched with it; TRY_MK): the betting lines' implied team points (props.mjs marketPts: the NFL
//            history's nflverse's closing lines, a mild look-ahead; live the book's now) over their average,
//            blended in by mk on the log; a game without lines the game model's alone. Measured 2026-10-12
//            (audit #4; the game model's trust about 0 against the book): kept on no stat. Passing yards
//            (mk 1/b 0.5) +0.0013 and passing TDs +0.0016 held out, each one's bias larger (0.33 to -0.81
//            yards; -0.045 to -0.053); completions -0.0044, receiving yards -0.0004 at mk 0.5; the rest not
//            taken on the fit window. Off the search since (TRY_MK). The lines' spread as a flag (props.mjs
//            mSpread) is a context term: kept on interceptions, its favorites' and its underdogs' held-out
//            bias each no larger too (SIGNED). The team's volume from the market (the vol base's team
//            targets, the passing attempts, by the lines' implied points) not measured: skipped, a next step
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
//            bench player's back-to-back (b2bB, a late flag, by his role known before the game; pts+reb+ast
//            one size for every player, b2bAll, in the search) and the expected blowout (the game model's margin
//            either way: a starter sits the fourth quarter); the NHL's power play (his power-play time by the
//            power plays his team can expect; his share of his team's power play against his position's prop
//            players': his unit) and the other side's goalie, and a goalie's saves on his team's back-to-back
//            (b2b, a late flag); MLB batters' place in the order against their usual and platoon edge against
//            their usual, and the other side's starter; MLB starters' leash (their recent pitch
//            counts against their usual), rest, and the plate umpire's zone. Each is fit like a matchup term
//            and kept only if the held-out games are better with it (0: left out)
//   scale    the eligible players' total over their total projection on the fit window: what's left of a lean
//            once the rest is fit, taken out (fit again once the held-out games leave a term out)
//   middle   every stat's (sl, a late term on the whole stat's gate, tried after the rest as fit): the projection
//            pulled toward the stat's typical one (rm: the eligible players' average on the fit window) by sl on
//            its log, x (x / rm)^-sl (held to SL_CAP either way), the lean fit again with it. The factors
//            multiply together and run too far from the middle, which one scale can't take out: on the held-out
//            games (2026-10-12 audit) the lowest fifth of the projections ran 12% to 20% under what happened
//            (NFL receptions, receiving yards, rush+rec yards, passing TDs; MLB hits), the highest a few percent
//            over. Kept only with a held-out gain of DRAFT_GAIN or more, the eligible players' and every
//            player's bias no larger, and the held-out fifths' misses (each fifth by projection: its actual over
//            projected, off 0, summed) smaller; left out, the stat exactly as without it. Measured 2026-10-12:
//            kept on NFL passing TDs (0.15, +0.0039; fifths +14.7%/+13.2%/+6.3%/-5.2%/-3.4% to
//            +5.8%/+8.5%/+4.4%/-4.7%/-0.3%) and MLB hits (0.3, +0.0005; +9.2%..-4.1% to -0.1%..+2.4%); left out on
//            the bias (passing yards 0.1, interceptions 0.4, MLB outs 0.2, NBA points 0.05, threes 0.05, NFL
//            receptions 0.05: each one's fifths smaller, the lean held out larger) or the gain (MLB total bases
//            0.3: +0). The NFL's receiving stats' low fifth (receiving yards +12.8%, rush+rec yards +11.7%) isn't
//            on the fit window (the search took none, or -0.05): a lean of the seasons since, not the shape's.
//            Searched only on a stat marked middle (props.mjs MIDDLE: the two kept), its search and gate a
//            replay to three a stat each hourly run. It acts on the whole product, so every earlier term's effect
//            on the log shrinks by 1 - sl with it on (the opponent's power, the script, a context flag sized at
//            -10% acts at about -8.5% at 0.15, the work missing), their sizes not searched or gated again with
//            it: the whole stat's gate is what guards them. The fifths' gate sums their misses, so a miss moved
//            from one end to the other can pass: MLB hits' highest fifths went from over-projected (-0.1%, -4.1%)
//            to under (+3.2%, +2.4%), the pull overshooting there (0.2 the next try). The draft's prior (dp) is
//            tried after it and refits the lean, so a stat with both keeps the fifths run.mjs logs as final
//            (the check as fit) beside the gate's
// A term's held-out gain is the log loss without it less with it, the others as they stand: an a_<group>'s
// against the stat's a as the search left it (with every group's set, a's first pass value: nothing read it
// after); a group left out, a is searched again (fitStat).
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
// too tight (yards are) is straightened out. And by side (cs, tried last): a line under his projection and
// one at it or over, each recalibrated on its own (calSide [under, over]; a side with under CS_MIN of the fit
// window's lines keeps cal): the negative binomial's skew puts a chance under half on an over whose mean is
// above the line, which one curve for both can't straighten. Kept only with a held-out gain of DRAFT_GAIN or
// more and each side's held-out log loss no worse; left out, cal alone as before (props.mjs's skew guard skips
// a side against its own projection either way: measured, check's skew). Measured 2026-10-12: kept on no stat
// (NFL receiving yards +0.0013 and rush+rec yards +0.0017 with the lines over the projection worse, passing
// TDs +0.0012 with too few under it; the rest 0 or less), so it's off (TRY_CS), its full held-out replay a stat
// no longer run each hour; the check's numbers by side and the skew rows still logged from the fit as it stands.

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

// The factors' product, a projection before the pull toward the middle and the lean: the history's (makeModel)
// and the live one's (props.mjs, with tonight's script and context) the same, so the pull sits on the same x
// it was fit on (oppA: the opponent's power for his group, else the stat's a)
export const factorProduct = (params, f) => f.base * Math.pow(f.opp, f.oppA ?? params.a) * Math.pow(f.script, params.b) * f.ctxF * f.funnelF * f.paceF * f.tgtF * (f.vacF ?? 1);
// The pull toward the middle (sl) on a projection before the lean (x: the factors' product): (x / rm)^-sl,
// held to SL_CAP either way (a backup's tiny projection isn't tripled); 1 where sl is off, or rm or x unknown
export const SL_CAP = 1.5;
export function middleF(params, x) {
  const sl = params?.sl;
  const rm = params?.rm;
  if (!sl || !(rm > 0) || !(x > 0)) return 1;
  return Math.min(SL_CAP, Math.max(1 / SL_CAP, Math.pow(x / rm, -sl)));
}

// A line's chances at a projection: over and under with a push left out (each the chance given no push, so
// they sum to 1), and the push's own chance (a whole-number line: the count landing on it; a half-point line
// has none). The recalibration (cal, or its side's: calAt) on the over's
export function lineChances(line, mu, params) {
  const r = rAt(params, mu);
  const raw = nbOver(line, mu, r);
  const push = Number.isInteger(line) && line >= 0 ? Math.min(0.99, Math.exp(nbLog(line, mu, r))) : 0;
  const over = recal(Math.min(1, raw / (1 - push)), calAt(params, mu, line));
  return { over, under: 1 - over, push };
}

// The projection a line's price implies: the mean at which the stat's spread (its dispersion as at any
// projection, no recalibration) goes over the line as often as the book's fair chance says (fairOver; an assumed
// -110's 0.5: the line its median). By halves on the log of the mean; null where it can't be had
export function impliedMean(line, fairOver, params) {
  if (!Number.isFinite(line) || !(fairOver > 0 && fairOver < 1) || !params) return null;
  const plain = { ...params, cal: null, calSide: null };
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
// shares' total and the stat's total in them (shn, sh, ss); a quarterback's starts and their total (qn, qsum);
// a receiving stat's games with their targets read, his targets, his team's in those games and the stat's
// total in them (tgn, tg, tt, ts). This season's also keeps his recent games: his last five, the work missing
// in each, his snap shares, his last five with a share (each [value, share]), his last five starts, his last
// five with their targets (each [his, his team's]))
// (the position group an opponent's power is fit for: a fullback's a back's)
const oppGroup = (pos) => (pos === 'FB' ? 'RB' : pos);

// (the draft's prior (dp): the slots a pick falls in (overall; 0 undrafted, its own slot, at the bottom), the
// seasons it's read for (his first and second: DRAFT_YEARS after his first), and the games' worth its ratio is
// pulled toward even by)
const DRAFT_SLOTS = [10, 32, 64, 100, 150];
export const draftBucket = (pick) => (!(pick > 0) ? 'undrafted' : `${DRAFT_SLOTS.find((x) => pick <= x) ?? 'late'}`);
const DRAFT_YEARS = 1;
const DRAFT_M = 20;
// (what keeping it takes (fitStat): the held-out gain (the RB1-out standard, 94ac4063: under it, the rounding's
// floor and noise), and the lines in each of its own buckets and the early games, fewer and nothing's measured)
const DRAFT_GAIN = 0.0003;
// (a context flag's own floor, the same standard: a new head coach's first games (props.mjs CTX newCoach), his
// team's lead quarterback out (CTX qb1Out), and that by the receiver's depth (CTX qbDeep))
// (and an NHL skater's power-play share (CTX ppShare) the same way, on its own floor: a continuous term on every
// skater, not a flag on a few hundred games, so over the rounding's 0 (0.0001); searched with the rest it moved
// the vacated and goalie terms on points (2026-10-12), kept at +0.0002 with the stat's held out worse; left out
// late too, and off the NHL's ctx since: props.mjs)
// (and the NFL's next man up (rp, with nu) and injury return (ij, with ia and ir) the same way, on the same
// floor: each changes a few rows (a promoted role's, a returner's), tried after the rest as fit)
// (and the seasons' carryover (sk, rx, pl) the same way, on the same floor: tried after the rest as fit, on the
// whole stat's gate (on every row, not a few))
// (and the pull toward the middle (sl) the same way, on the same floor: tried last of them (the draft's prior
// after it), on the whole stat's gate and the held-out fifths' (fitStat))
// (and the back-to-backs (c_b2b, c_oppB2b, the NBA's by role c_b2bS and c_b2bB: props.mjs CTX) the same way,
// each on its own rows' gate (SUBGROUP): a flag on the second night's rows, a fifth of them or fewer)
// (and the role order by recent healthy work (ro), a regular above him out (c_aheadOut) and the organic trend
// (ot), the role and work share's (audit #2), the same way: ro and ot on the whole stat's gate, the flag on its
// own rows')
const MIN_GAIN = { c_newCoach: DRAFT_GAIN, c_qb1Out: DRAFT_GAIN, c_qbDeep: DRAFT_GAIN, c_ppShare: 0.0001, rp: DRAFT_GAIN, nt: DRAFT_GAIN, ij: DRAFT_GAIN, ro: DRAFT_GAIN, ab: DRAFT_GAIN, c_aheadOut: DRAFT_GAIN, ot: DRAFT_GAIN, sk: DRAFT_GAIN, rx: DRAFT_GAIN, pl: DRAFT_GAIN, sl: DRAFT_GAIN, mk: DRAFT_GAIN, c_mSpread: DRAFT_GAIN, c_b2b: DRAFT_GAIN, c_oppB2b: DRAFT_GAIN, c_b2bS: DRAFT_GAIN, c_b2bB: DRAFT_GAIN };
// (the organic trend's ratio held to this either way)
const TREND_CAP = 2;
// (the recalibration by side (cs): the fewest of the fit window's lines a side takes to have its own; and the
// smallest line props.mjs's skew guard reads (below it a count's own skew is real), the held-out check's skew
// rows read from it too)
const CS_MIN = 300;
export const SKEW_MIN_LINE = 5;
// (the recalibration by side tried at all: kept on no stat on 2026-10-12, and its gate a full held-out replay
// on every stat each hourly run, so off: its check numbers (each side's log loss, the skew rows) still logged
// from the fit as it stands (floors.cs); true to try it again)
const TRY_CS = false;
// (the carryover's: the late terms tried after the next man up and the injury return, in this order. sk and rx
// were left out on every stat they were tried on (2026-10-12), and the carryover's search cost the NFL props'
// fit about 17% (1005s to 1175s locally, every hourly run): only pl is searched now, sk and rx kept in the code
// for role-backtest.mjs --set to force (back in this list to try them again))
const CARRY = ['pl'];
// (the role and work share's searched (audit #2, 2026-10-12): none. ro, ab and ot were left out on every stat
// they were tried on and searched for nothing every hourly run (the five stats' fit 837s to 994s locally; ab
// alone 721s to 786s on the dry run): kept in the code for role-backtest.mjs --set to force (back in this list
// to try them again); the flag c_aheadOut off every stat's ctx (props.mjs CARRYING))
const SHARE = [];
// (the carryover's last season games read (pl: his last PL_N, where last season had PL_MIN or more), and his
// last five's games (rx: this season's under RX_MIN))
const PL_N = 8;
const PL_MIN = 12;
const RX_MIN = 3;
// (the flags on a few of the rows, each judged on its own rows' bias (fitStat): the held-out rows it's on, this
// many or more, and the rest's no larger by more than this share of their mean actual (the lean refit with it
// moves them a little); ppShare, on every skater, judged on the whole stat's as before. The next man up's rows
// are the ones whose role moves up with the missing out of the order, the injury return's his 1st to RAMP-th
// games back from an absence of ia games or more)
const SUBGROUP = new Set(['c_newCoach', 'c_qb1Out', 'c_qbDeep', 'c_midSeason', 'c_aheadOut', 'rp', 'nt', 'ij', 'ab', 'c_b2b', 'c_oppB2b', 'c_b2bS', 'c_b2bB']);
// (a signed context term, about 0 over the whole stat (the lines' spread, c_mSpread: each game a favorite and
// an underdog, their errors cancelling in the whole stat's bias): judged on the whole stat's gate and on each
// sign's rows too (its value over SIGNED_AT, and under -SIGNED_AT: the favorites' rows and the underdogs',
// every player's, SUBGROUP_N or more each), each one's held-out bias no larger: a size that over-corrects one
// side and under-corrects the other passes the whole stat's gate alone)
const SIGNED = new Set(['c_mSpread']);
const SIGNED_AT = 0.3;
// (the late terms' settings tried: a flag's sizes (GRID); the next man up's role with nu of the missing
// one's snap share (0: the role alone); the injury return's weight on a game he was eased back in or left
// hurt (1 - ij), the absence it takes (ia team games), and the returners' ramp on his game back to the power ir
// (0 none; yards needn't fall as far as the snaps))
const NU = [0, 0.5, 0.75, 1];
// (the market's game flow (mk): the script read that far from the betting lines' implied team points (1: from
// them alone, 0.5: half the way, on the log), its power b searched with it: b was fit on the game model's
// script. Searched only with TRY_MK: kept on no stat (2026-10-12, header), its search ten replays a stat and
// the NFL props' fit 693s to 781s locally; true to try it again. The lines' average it's read over (props.mjs
// envFor avgMkt) spans the whole history, the held-out games' too, as the game model's own avg does: searched
// again, take it from the fit window's rows alone first, or its held-out check sees a little of the test window)
const MK = [0.5, 1];
const TRY_MK = false;
const IJ_TRIES = [0, 0.5, 1].flatMap((ij) => [1, 2].flatMap((ia) => [0, 0.5, 1].filter((ir) => ij || ir).map((ir) => ({ ij, ia, ir }))));
const lateTries = (key) => (key === 'mk' ? MK.flatMap((mk) => GRID.b.map((b) => ({ mk, b }))) : key === 'rp' ? NU.map((nu) => ({ rp: 1, nu })) : key === 'ij' ? IJ_TRIES : key === 'ro' ? [{ ro: 1 }] : (GRID[key] ?? GRID.c).filter((x) => x).map((x) => ({ [key]: x })));
// (a late term's setting as the log says it: a flag's size, a compound's each part)
const sizeOf = (key, t) => (Object.keys(t).length === 1 ? t[key] : Object.entries(t).map(([k, v]) => `${k} ${v}`).join('/'));
const SUBGROUP_N = 100;
const SUBGROUP_TOL = 0.005;
// (and the eligible players' among the rows it's on, judged too where this many or more)
const SUBGROUP_ELIG_N = 50;
// (a list's bias a game, projected less actual, its count and its mean actual; null with none)
const biasOf = (list) => {
  if (!list.length) return null;
  const mu = list.reduce((t, x) => t + x.p.mu, 0);
  const v = list.reduce((t, x) => t + x.v, 0);
  return { n: list.length, bias: Math.round(((mu - v) / list.length) * 10000) / 10000, mean: Math.round((v / list.length) * 1000) / 1000, ratio: mu ? Math.round((v / mu - 1) * 10000) / 10000 : null };
};
// (the same absence (ab): his games with the same regulars out it takes)
const AB_MIN = 2;
const DRAFT_LINES = 100;
const DRAFT_EARLY = 100;
const tz = () => ({ n: 0, got: 0, usual: 0 });

const ACC = ['n', 'sum', 'shn', 'sh', 'ss', 'qn', 'qsum', 'tgn', 'tg', 'tt', 'ts'];
const zero = () => Object.fromEntries(ACC.map((k) => [k, 0]));
// (this season's also weighs each game (ij, below): wn and wsum the per-game rate's count and total, rw his
// last five's weights, shw his snap shares', last his latest game's parts (to weigh it again once he's missed
// games after it); his targets' tallies (tg, tt, ts, trecent) weighed as they're added. Every game 1: as before.
// And his last PL_N games (tail, each [value, snap share or null, the work his group was missing]), read next
// season by the carryover (rx, pl))
const fresh = () => ({ ...zero(), byGame: new Map(), wn: 0, wsum: 0, recent: [], rw: [], vac: [0, 0, 0], recentVac: [], shares: [], shw: [], srecent: [], qrecent: [], trecent: [], tail: [], lastSh: false, last: null });
// (the injury return (ij): an absence's games tried (his team's he missed, ia: 1 or 2), the games back read as
// his return (RAMP: the 1st to 3rd), a game under this share of his healthy one weighed down, and the games'
// worth the ramp's ratio is pulled toward even by)
export const RAMP = 3;
const UNDER = 0.9;
const RAMP_M = 10;
// (a row his game back from an absence of ia team games or more, the 1st to RAMP-th: matchups.mjs ret)
export const isBack = (row, ia = 2) => !!row?.ret && row.ret.k >= 1 && row.ret.k <= RAMP && row.ret.len >= ia;
// (a weighted average; null where the weights sum to none)
const wavg = (xs, ws) => {
  let t = 0;
  let w = 0;
  xs.forEach((x, i) => ((t += (ws[i] ?? 1) * x), (w += ws[i] ?? 1)));
  return w > 0 ? t / w : null;
};
const addAcc = (a, b) => Object.fromEntries(ACC.map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)]));

// A stat's model under one set of settings: project a row from what's been learned, learn a day's rows
export function makeModel(stat, params, env) {
  const players = new Map();
  const opps = new Map();
  const roles = new Map();
  const pos = new Map();
  // (a receiving stat's teams' targets a game, this season's and last's, and the league's a team-game)
  const teams = new Map();
  const lgT = { n: 0, sum: 0 };
  const val = (row) => Math.max(0, Math.round(row.s[stat.key]));
  const posKey = (row) => stat.posGroup?.(row.pos) ?? row.pos;
  // (the opponent's power for his position group where the fit gave it one of its own (a_<group>), else the
  // stat's a)
  const oppAOf = (row) => params[`a_${oppGroup(row.pos)}`] ?? params.a;
  // (his team's targets expected tonight: its own a game this season, pulled toward last season's (8 games of
  // it or more), else the league's, by 4 games; null till the league has 20 team-games)
  const teamTargets = (row) => {
    if (lgT.n < 20) return null;
    const t = teams.get(row.team);
    const cur = t?.season === row.season ? t : null;
    const last = cur ? { n: t.prevN, sum: t.prevSum } : t?.season === row.season - 1 ? t : null;
    const prior = last?.n >= 8 ? last.sum / last.n : lgT.sum / lgT.n;
    return ((cur?.sum ?? 0) + 4 * prior) / ((cur?.n ?? 0) + 4);
  };
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
  // (the draft's prior (the NFL's, dp): what the rookies taken in each slot at a position did in their first
  // season against the position's prior as it stood before each game (by the game: the eligible players'
  // average; by the snap: their per-snap rate times his share; a quarterback's start: the few-start starters';
  // by the target: their yards a target times his targets), learned as the replay goes; a player in his first
  // two seasons has the position's prior times his slot's ratio (pulled toward even by DRAFT_M games' worth) to
  // the power dp. Only where the position's prior is used: a short run of his own (it fades as his games come
  // in, by K as before); a row without a draft known, or a veteran, as before)
  const drafts = new Map();
  const draftOf = (row) => row.draft ?? players.get(row.pid)?.draft ?? null;
  const draftKey = (row, d) => `${posKey(row)}|${draftBucket(d.pick)}`;
  const draftF = (row, d, kind) => {
    if (!params.dp || !d) return 1;
    const y = row.season - d.year;
    if (!(y >= 0 && y <= DRAFT_YEARS)) return 1;
    const t = drafts.get(draftKey(row, d))?.[kind];
    if (!t?.n || !(t.usual > 0)) return 1;
    const per = t.usual / t.n;
    return Math.pow((t.got + DRAFT_M * per) / (t.usual + DRAFT_M * per), params.dp);
  };
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  // (the role he's projected in: with the next man up's promotion (rp, kept only where the held-out games are
  // better) the one he steps into with his group's missing ones out of the order (matchups.mjs roleUp), else
  // his place by the season's work as before; the defenses' tables learned by the same)
  // (with the role order by his recent healthy work (ro, kept only where the held-out games are better), the
  // same read by it: matchups.mjs roleW, roleUpW and the missing one's shares above him by it)
  const upOf = (row) => (params.ro ? { role: row.roleW ?? row.role, roleUp: row.roleUpW ?? row.roleUp, leadShare: row.leadShareW ?? null, leadTgt: row.leadTgtW ?? null } : { role: row.role, roleUp: row.roleUp, leadShare: row.leadShare ?? null, leadTgt: row.leadTgt ?? null });
  const roleAt = (row) => {
    const u = upOf(row);
    return params.rp && u.roleUp ? u.roleUp : u.role;
  };
  // (the injury return (ij, the NFL's backs and pass-catchers: stat.snaps; 0 off, kept only where the held-out
  // games are better): a game he left hurt or was eased back in weighs 1 - ij in his per-game rate, his last
  // five, his expected snap share and his target share (his per-snap rate as it is: a short game's per snap
  // is his), and the game tonight eased by the returners' ramp (ir; ij 0 with ir: the ramp alone))
  const IJ = !!((params.ij || params.ir) && stat.snaps);
  const ia = params.ia ?? 2;
  // (the returners' ramp: what they did in their 1st to RAMP-th game back over their projections without it,
  // learned as the replay goes (every returner's of ia games or more, before tonight; their own projections,
  // before each game), pulled toward even by RAMP_M games' worth. The eligible players' alone (learned from and
  // eased) tried too (2026-10-12): receptions' held-out gain +0.0004 to -0.0002. Their snap share over their
  // healthy share was tried first: receiving yards' returners went from 4% under their projections to 7% over,
  // the share's dip not the output's)
  const ramps = Array.from({ length: RAMP }, () => ({ n: 0, got: 0, usual: 0 }));
  const rampOf = (k) => {
    const x = ramps[k - 1];
    if (!x?.n) return 1;
    const per = x.usual / x.n;
    return (x.got + RAMP_M * per) / (x.usual + RAMP_M * per);
  };
  // (his healthy share: this season's typical share (typicalShares, each game by its weight) leaving out his
  // latest skip games, else last season's (4 games' counts or more); null with neither)
  const healthyOf = (cur, prev, skip) => {
    const s = cur.shares.slice(0, Math.max(0, cur.shares.length - skip));
    const w = cur.shw.slice(0, s.length);
    const kept = typicalIdx(s);
    const h = kept.length ? wavg(kept.map((i) => s[i]), kept.map((i) => w[i])) : null;
    return h !== null ? h : prev.shn >= 4 ? prev.sh / prev.shn : null;
  };
  // (his latest game weighed again (w): its parts in his per-game rate, his last five, his shares and targets)
  const reweight = (cur, rec, w) => {
    const d = w - rec.w;
    if (!d) return;
    cur.wn += d;
    cur.wsum += d * rec.v;
    if (cur.rw.length) cur.rw[cur.rw.length - 1] = w;
    if (rec.sh !== null && cur.shw.length) cur.shw[cur.shw.length - 1] = w;
    if (rec.tgOk) {
      cur.tg += d * rec.tg;
      cur.tt += d * rec.tt;
      cur.ts += d * rec.v;
      if (cur.trecent.length) cur.trecent[cur.trecent.length - 1] = [w * rec.tg, w * rec.tt];
    }
    rec.w = w;
  };
  // (a game back from an absence of ia team games or more (matchups.mjs back: known before it, his not being in
  // the logs of the ones before): the last game before it, the one he most likely left hurt, weighs 1 - ij where
  // its snap share was under UNDER of his healthy share (the rest of his season's, else last season's); and
  // the healthy share kept for the games he's eased back in (learn). Once a game)
  const settle = (pl, row) => {
    if (!IJ || pl.settled === row.game) return;
    pl.settled = row.game;
    if (!((row.back ?? 0) >= ia)) return;
    const same = pl.season === row.season;
    const cur = same ? pl.cur : fresh();
    const prev = same ? pl.prev : pl.season === row.season - 1 ? pl.cur : zero();
    const last = same ? cur.last : null;
    const healthy = healthyOf(cur, prev, last && last.sh !== null ? 1 : 0);
    pl.healthy = { season: row.season, v: healthy };
    if (last && last.sh !== null && healthy !== null && last.sh < UNDER * healthy) reweight(cur, last, 1 - params.ij);
  };
  const parts = (row) => {
    const pl = players.get(row.pid);
    if (!pl) return null;
    settle(pl, row);
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
    const dr = draftOf(row);
    const draftG = draftF(row, dr, 'g');
    let prior = longN >= 10 ? (prev.sum + 0.5 * older.sum) / longN : pool(row) * draftG;
    // (the draft's factor in the base used (the per-game prior's, a start's or a snap's where that base is the
    // one taken, and a target's apart), each only where its own prior is the position's: what the board shows)
    let draftUsed = longN < 10 ? draftG : 1;
    let draftY = 1;
    // (the carryover (pl): his own prior leaning to last season's last PL_N games, where last season had PL_MIN
    // or more (prev's tail: last season's latest games, none for a season skipped))
    const tail = prev.tail ?? [];
    const late8 = params.pl && prev.n >= PL_MIN && longN >= 10 && tail.length >= PL_N ? avg(tail.map((x) => x[0])) : null;
    if (late8 !== null) prior = (1 - params.pl) * prior + params.pl * late8;
    // (this season's games each by its weight: every one 1 but a game he left hurt or was eased back in, ij)
    let rate = (cur.wsum + K * prior) / (cur.wn + K);
    // (the prior's weight in the rate as it's made: the per-game blend's, with the starts' or the snaps' own
    // (K against his starts, or his snap shares' total) blended in as the rate is; check-learn.mjs reads it)
    let priorW = cur.wn + K > 0 ? K / (cur.wn + K) : null;
    let recent = cur.recent.length >= 3 ? (wavg(cur.recent, cur.rw) ?? rate) : rate;
    // (the carryover (rx): under RX_MIN games this season, his last five made up with last season's latest,
    // each at weight rx, where that makes RX_MIN or more; with no game this season the rate stays in as one
    // game at weight 1, else rx would weigh nothing against nothing (last season's last five outright))
    const carried = params.rx && cur.recent.length < RX_MIN ? tail.slice(Math.max(0, tail.length - (5 - cur.recent.length))) : [];
    const anchor = cur.recent.length ? [] : [rate];
    if (carried.length && carried.length + cur.recent.length >= RX_MIN) recent = wavg([...carried.map((x) => x[0]), ...cur.recent, ...anchor], [...carried.map(() => params.rx), ...cur.rw, ...anchor.map(() => 1)]) ?? recent;
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
      const draftQ = draftF(row, dr, 'q');
      const priorQ = longQ >= 10 ? longQsum / longQ : (longQsum + (10 - longQ) * poolStart(row) * draftQ) / 10;
      draftUsed = longQ < 10 ? draftQ : 1;
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
      // (a game far under his usual share (under half his median: he left it hurt, say) left out of what's
      // expected tonight, unless his last two were both: a role cut, not a game cut short)
      // (each game by its weight (ij: a game he left hurt or was eased back in weighs less, his last game's sr
      // with it); every weight none, as they are)
      const kept = typicalIdx(cur.shares);
      let exp = null;
      if (covered && kept.length) {
        const ks = kept.map((i) => cur.shares[i]);
        const kw0 = kept.map((i) => cur.shw[i] ?? 1);
        const kw = kw0.some((x) => x > 0) ? kw0 : kw0.map(() => 1);
        const lw = kw[kw.length - 1];
        exp = (1 - sr * lw) * wavg(ks, kw) + sr * lw * ks[ks.length - 1];
      } else if (covered) exp = prev.shn >= 4 ? prev.sh / prev.shn : null;
      // (the next man up (rp with nu): the role he steps into's share, nu of the snap share of the one missing
      // above him (matchups.mjs leadShare), where it's more than his own)
      const up = upOf(row);
      if (exp !== null && params.rp && params.nu && up.roleUp && up.roleUp !== up.role && up.leadShare > 0) exp = Math.max(exp, params.nu * up.leadShare);
      // (his own per-snap prior on 5 full games' worth of counted snaps or more, else made up to 5 with the
      // position's (a long run whose few counted games would be a noisy prior))
      const longSh = prev.sh + 0.5 * older.sh;
      const ownSs = prev.ss + 0.5 * older.ss;
      const pS0 = poolSnap(row);
      const draftS = draftF(row, dr, 's');
      const pS = pS0 === null ? null : pS0 * draftS;
      let priorS = longSh >= 5 ? ownSs / longSh : pS !== null ? (ownSs + (5 - longSh) * pS) / 5 : longSh >= 2 ? ownSs / longSh : null;
      // (the carryover (pl): his own per-snap prior leaning to last season's last PL_N games' (their total over
      // their snap shares', 2 full games' worth or more), as the per-game prior)
      const tailS = tail.filter((x) => x[1] !== null);
      const tailSh = tailS.reduce((t, x) => t + x[1], 0);
      if (late8 !== null && priorS !== null && longSh >= 5 && tailSh >= 2) priorS = (1 - params.pl) * priorS + (params.pl * tailS.reduce((t, x) => t + x[0], 0)) / tailSh;
      if (exp !== null && priorS !== null) {
        share = exp;
        // (the carryover (sk): the prior's K games at his share tonight, against his season's snap units (a
        // part-timer's 4 games at 30% are 1.2 of them): K x ((1 - sk) + sk x share); 0, K as before)
        const kS = params.sk ? K * (1 - params.sk + params.sk * share) : K;
        const rateS = (cur.ss + kS * priorS) / (cur.sh + kS);
        // (his per-snap last five, under RX_MIN games this season made up with last season's latest at weight rx
        // (rx, as the per-game one; with no game this season the per-snap rate in as one full game's snaps))
        const sCarried = params.rx && cur.srecent.length < RX_MIN ? tailS.slice(Math.max(0, tailS.length - (5 - cur.srecent.length))) : [];
        const sAnchor = sCarried.length && !cur.srecent.length ? 1 : 0;
        const sv = cur.srecent.reduce((t, x) => t + x[0], 0) + sCarried.reduce((t, x) => t + params.rx * x[0], 0) + sAnchor * rateS;
        const rs = cur.srecent.reduce((t, x) => t + x[1], 0) + sCarried.reduce((t, x) => t + params.rx * x[1], 0) + sAnchor;
        const recentS = cur.srecent.length + sCarried.length >= 3 && rs >= 0.5 ? sv / rs : rateS;
        rate = (1 - params.sn) * rate + params.sn * rateS * share;
        if (priorW !== null && cur.sh + kS > 0) priorW = (1 - params.sn) * priorW + (params.sn * kS) / (cur.sh + kS);
        recent = (1 - params.sn) * recent + params.sn * recentS * share;
        mode = 'snaps';
        draftUsed = longSh < 5 && pS !== null ? draftS : 1;
      }
    }
    // (the volume-based base, a receiving stat's (stat.perTarget; kept only where the held-out games are better
    // with it): the targets he's expected tonight (his share of his team's targets, his season's pulled toward
    // his longer run's by K games of his team's, his last five's for the recent part, times his team's expected
    // a game) times what he makes of a target (his season's, pulled toward his longer run's by yk targets: the
    // position's eligible players' making up a run shorter than that), blended in by vol. A high-volume
    // receiver whose yards a target dipped gets the usage's credit, his efficiency pulled back toward his
    // usual. Where the target counts miss his recent games, or he has neither a longer run nor 3 games of his
    // own, as before)
    let volume = null;
    if (params.vol && stat.perTarget) {
      const T = teamTargets(row);
      const covered = cur.n === 0 || cur.tgn >= cur.n - 1;
      const longTt = prev.tt + 0.5 * older.tt;
      const longTg = prev.tg + 0.5 * older.tg;
      const priorShare = prev.tgn + 0.5 * older.tgn >= 6 && longTt > 0 ? longTg / longTt : null;
      if (T !== null && covered && (priorShare !== null || (cur.tgn >= 3 && cur.tt > 0))) {
        const Kt = K * T;
        // (the next man up's target floor (nt, a late term of its own on rp's rows, fit apart from rp and nu):
        // his target share at least nt of the missing one's above him (his team's targets this season,
        // matchups.mjs leadTgt): a TE2 whose TE1 is out gets the TE1's targets to share, not his own few
        // (promoted tight ends' receiving yards ran 32% over their projections, 49% held out, 2026-10-12, the
        // volume base's share untouched by rp))
        const upT = upOf(row);
        const floorT = params.nt && upT.roleUp && upT.roleUp !== upT.role && upT.leadTgt > 0 ? params.nt * upT.leadTgt : 0;
        const shareS = Math.max(floorT, priorShare === null ? cur.tg / cur.tt : (cur.tg + Kt * priorShare) / (cur.tt + Kt));
        const rt = cur.trecent.reduce((t, x) => [t[0] + x[0], t[1] + x[1]], [0, 0]);
        const shareR = Math.max(floorT, cur.trecent.length >= 3 && rt[1] > 0 ? rt[0] / rt[1] : shareS);
        const yk = params.yk ?? 40;
        const ownTs = prev.ts + 0.5 * older.ts;
        const pq = pos.get(posKey(row));
        const draftT = draftF(row, dr, 'y');
        const poolY = pq?.tg >= 200 ? (pq.ts / pq.tg) * draftT : null;
        const priorY = longTg >= yk ? ownTs / longTg : poolY !== null ? (ownTs + (yk - longTg) * poolY) / yk : longTg > 0 ? ownTs / longTg : null;
        if (priorY !== null) {
          const perT = (cur.ts + yk * priorY) / (cur.tg + yk);
          rate = (1 - params.vol) * rate + params.vol * shareS * T * perT;
          // (the prior's weight blended in the same way: what he makes of a target's (yk against his targets)
          // and his share's (K games of his team's targets against the ones in his season) averaged, the two
          // the volume base's halves)
          if (priorW !== null) {
            const wY = yk / (cur.tg + yk);
            const wS = priorShare === null ? 0 : Kt / (cur.tt + Kt);
            priorW = (1 - params.vol) * priorW + params.vol * ((wY + wS) / 2);
          }
          recent = (1 - params.vol) * recent + params.vol * shareR * T * perT;
          if (longTg < yk && poolY !== null) draftY = draftT;
          volume = { targets: ((1 - params.w) * shareS + params.w * shareR) * T, share: shareS, team: T, perTarget: perT };
        }
      }
    }
    // (his game back from an absence (ir): eased by the returners' ramp at his game since coming back, to the
    // power ir: his healthy level (the games weighed down) times what returners have done in that game against
    // their projections)
    const rampF = IJ && params.ir && isBack(row, ia) ? Math.pow(rampOf(row.ret.k), params.ir) : 1;
    // (his organic trend (ot, the NFL's backs and pass-catchers: stat.snaps; 0 off, kept only where the held-out
    // games are better): his work a game in the games with no regular above him missing, recent ones counting
    // most, over their average (matchups.mjs trend, held to TREND_CAP either way), to the power ot; none where
    // he has under 4 such games this season. The work he took filling in is the next man up's and the vacated
    // term's, not counted here twice)
    const trendF = params.ot && stat.snaps && Number.isFinite(row.trend) && row.trend > 0 ? Math.pow(Math.min(TREND_CAP, Math.max(1 / TREND_CAP, row.trend)), params.ot) : 1;
    const base = trendF * rampF * ((1 - params.w) * rate + params.w * recent);
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
    const myRole = roleAt(row);
    if (myRole && Number.isFinite(params.roleK)) {
      const x = roles.get(`${row.opp}|${myRole}`);
      if (x) {
        const { got, usual, n } = sums(x);
        const per = n ? usual / n : base;
        roleOpp = (got + params.roleK * per * posOpp) / (usual + params.roleK * per);
        opp = roleOpp;
      }
    }
    const script = env.script?.(row, params) ?? 1;
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
    let priorVac = longN >= 10 ? (prev.vac?.[vs] ?? 0) / longN : 0;
    // (the carryover (pl): where his prior leans to last season's last PL_N games, the work his group was
    // missing in them leans in the same, so a role he grew into late with a starter hurt is taken back down
    // once the starter's back (vacF), not carried in the prior as his own)
    if (late8 !== null) priorVac = (1 - params.pl) * priorVac + params.pl * avg(tail.map((x) => x[2]?.[vs] ?? 0));
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
    const vacF0 = stat.vacated && params.vc ? Math.pow((1 + vacNow) / (1 + vacHist), params.vc) : 1;
    // (the same absence (ab, the NFL's backs and pass-catchers: stat.snaps; 0 off, kept only where the held-out
    // games are better): with regulars at his position out tonight and AB_MIN of his games this season or more
    // with every one of them out then too (matchups.mjs sameGames), his base, the work missing's factor on it,
    // blended toward his average in those games by ab, the work missing's factor 1 in the product (those games
    // are the role he's had with them out, the cut already in them: vacF on it would count it twice). A fill-in
    // still filling in ran 16% to 29% over the projection held out (2026-10-12: his last three's work 1.2x his
    // season's from an absence ahead, the absence still on), the base leaning on his season before it)
    // (sameOn: the rows ab moves where it's on, read whether it's on or not: its gate's rows, the same both sides)
    let sameAvg = null;
    let sameOn = false;
    if (stat.snaps && Array.isArray(row.sameGames)) {
      const vals = row.sameGames.map((g) => cur.byGame?.get(g)).filter(Number.isFinite);
      sameOn = vals.length >= AB_MIN;
      if (params.ab && sameOn) sameAvg = avg(vals);
    }
    const baseUsed = sameAvg === null ? base : (1 - params.ab) * base * vacF0 + params.ab * sameAvg;
    const vacF = sameAvg === null ? vacF0 : 1;
    const oppA = oppAOf(row);
    const raw = factorProduct(params, { base: baseUsed, opp, oppA, script, ctxF, funnelF, paceF, tgtF, vacF });
    // (the pull toward the stat's typical projection (sl, middle): none where it's off or rm unknown)
    const slF = middleF(params, raw);
    const mu = Math.max(0.05, (params.scale ?? 1) * raw * slF);
    return { mu, raw, slF, rate, recent, base: baseUsed, same: sameAvg === null ? null : { avg: sameAvg, n: row.sameGames.length, base, vacF: vacF0 }, sameOn, opp, oppA, volume, posOpp, roleOpp, role: myRole ?? null, roleUp: upOf(row).roleUp ?? null, ramp: rampF, trendF, back: IJ && isBack(row, ia) ? row.ret : null, funnel: row.funnel ?? null, funnelF, paceF, tgtF, vac: vacNow, vacHist, vacF, script, ctx, ctxF, prior, own: cur.n ? cur.sum / cur.n : null, games: cur.n, prevGames: prev.n, mode, share, starts: cur.qn, careerStarts: cur.qn + prev.qn + older.qn, K, priorW, draft: draftUsed !== 1 || draftY !== 1 ? { pick: dr.pick, factor: draftUsed, ...(draftY !== 1 ? { perTarget: draftY } : {}) } : null };
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
      // (a receiving stat's team-games: their targets, the day's rows' total, unread where a row's are)
      const games = new Map();
      if (stat.perTarget) {
        for (const row of rows) {
          const k = `${row.game}|${row.team}`;
          const g = games.get(k) ?? { team: row.team, season: row.season, sum: 0, ok: true };
          // (a row with no targets but a catch or receiving yards had its targets left blank, not none
          // (playerlogs.mjs reads a blank as 0): the team-game unread, as with a count missing outright, so
          // his share and his yards a target aren't made from it)
          const blank = row.s.targets === 0 && ((row.s.rec ?? 0) > 0 || (row.s.recYds ?? 0) !== 0);
          if (Number.isFinite(row.s.targets) && !blank) g.sum += row.s.targets;
          else g.ok = false;
          games.set(k, g);
        }
      }
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
          const myRole = roleAt(row);
          if (myRole) tally(roles, `${row.opp}|${myRole}`);
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
            prev: consecutive ? { ...addAcc(zero(), p.cur), vac: p.cur.vac, tail: p.cur.tail } : zero(),
            career: consecutive ? before : addAcc(before, p.cur),
            healthy: p.healthy,
            settled: p.settled,
          };
        }
        // (his snap share in the game where the counts were read (matchups.mjs row.share: the game's own, learned
        // after it, never projected from), and a quarterback's start (row.start))
        const sh = Number.isFinite(row.share) && row.share > 0 ? row.share : null;
        // (the game's weight (ij): his 1st to RAMP-th game back from an absence, its snap share under UNDER of his
        // healthy share (kept when he came back: settle), 1 - ij; and the returners' ramp learned from it: what he
        // did over his projection before the ramp)
        let wt = 1;
        if (IJ && isBack(row, ia)) {
          const h = p.healthy?.season === row.season ? p.healthy.v : null;
          if (sh !== null && h !== null && h > 0 && sh < UNDER * h) wt = 1 - params.ij;
          if (before?.ramp > 0) {
            const x = ramps[row.ret.k - 1];
            x.n++;
            x.got += v;
            x.usual += before.mu / before.ramp;
          }
        }
        p.cur.n++;
        p.cur.sum += v;
        p.cur.wn += wt;
        p.cur.wsum += wt * v;
        p.cur.recent = [...p.cur.recent, v].slice(-5);
        // (each game's value by its id, for the same absence's games (ab))
        if (row.game !== undefined && row.game !== null) p.cur.byGame.set(row.game, v);
        p.cur.rw = [...p.cur.rw, wt].slice(-5);
        p.cur.tail = [...p.cur.tail, [v, sh, row.vacs ?? [0, 0, 0]]].slice(-PL_N);
        if (sh !== null) {
          p.cur.sh += sh;
          p.cur.ss += v;
          p.cur.shn++;
          p.cur.shares = [...p.cur.shares, sh].slice(-20);
          p.cur.shw = [...p.cur.shw, wt].slice(-20);
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
        // (his targets and his team's in the game, where both were read)
        const tg = games.get(`${row.game}|${row.team}`);
        // (each by the game's weight: 1 but a game he was eased back in, ij)
        const tgOk = !!(tg?.ok && tg.sum > 0);
        if (tgOk) {
          p.cur.tgn++;
          p.cur.tg += wt * row.s.targets;
          p.cur.tt += wt * tg.sum;
          p.cur.ts += wt * v;
          p.cur.trecent = [...p.cur.trecent, [wt * row.s.targets, wt * tg.sum]].slice(-5);
        }
        // (his latest game's parts, to weigh it again should he miss games after it: settle)
        if (IJ) p.cur.last = { v, w: wt, sh, tgOk, tg: tgOk ? row.s.targets : 0, tt: tgOk ? tg.sum : 0 };
        p.draft = row.draft ?? pl?.draft ?? null;
        players.set(row.pid, p);
        const k = posKey(row);
        // (a rookie's game in his draft slot's tables, against the position's priors as they stood before it
        // (each kept as the pools below are: the eligible players', a start any quarterback's))
        const d = row.draft;
        if (d && row.season === d.year) {
          const dk = draftKey(row, d);
          const t = drafts.get(dk) ?? { g: tz(), s: tz(), q: tz(), y: tz() };
          const add = (kind, usual) => {
            if (Number.isFinite(usual) && usual > 0) (t[kind].n++), (t[kind].got += v), (t[kind].usual += usual);
          };
          const pp = pos.get(k);
          if (row.eligible !== false) {
            if (pp?.n >= 20) add('g', pp.sum / pp.n);
            const ps = poolSnap(row);
            if (sh !== null && ps !== null) add('s', sh * ps);
            if (tg?.ok && tg.sum > 0 && pp?.tg >= 200) add('y', row.s.targets * (pp.ts / pp.tg));
          }
          if (started) add('q', poolStart(row));
          drafts.set(dk, t);
        }
        const q = pos.get(k) ?? { n: 0, sum: 0, sh: 0, ss: 0, qn: 0, qsum: 0, fqn: 0, fqsum: 0, tg: 0, ts: 0 };
        if (row.eligible !== false) {
          q.n++;
          q.sum += v;
          if (sh !== null) (q.sh += sh), (q.ss += v);
          if (tg?.ok && tg.sum > 0) (q.tg += row.s.targets), (q.ts += v);
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
      // (the teams' targets a game, after the day's rows were all projected and learned)
      for (const g of games.values()) {
        if (!g.ok || g.sum <= 0) continue;
        let t = teams.get(g.team);
        if (!t || t.season !== g.season) {
          const last = t && t.season === g.season - 1 ? t : null;
          t = { season: g.season, n: 0, sum: 0, prevN: last?.n ?? 0, prevSum: last?.sum ?? 0 };
        }
        t.n++;
        t.sum += g.sum;
        teams.set(g.team, t);
        lgT.n++;
        lgT.sum += g.sum;
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
// (c_rb1Out: the lead back out, 0 or 1 (live, a questionable one his chance of missing it: playchance.mjs), a
// few percent either way: GRID.c's smallest step 7%. Team-games with him out against their season's own (2012
// on, before the fit): pass attempts even, -1% to -3% where he's a bell cow (18 touches a game or more), the
// volume moving to the backup, not the pass. On no stat's ctx now (props.mjs: receptions' +0.025 held out at
// the rounding's floor); the grid to 0.05 either way, what was measured, so a refit can't take 10% on a few
// hundred-thousandths)
const RB1_OUT = [-0.05, -0.025, 0, 0.025, 0.05];
// (c_newCoach: a new head coach's first games (props.mjs CTX newCoach), 0 or 1, finer than GRID.c to 10%
// either way)
const COACH = [-0.1, -0.05, -0.025, 0, 0.025, 0.05, 0.1];
// (c_qb1Out: the lead quarterback out, 0 or 1 (live, a questionable one his chance of missing it): the role
// backtest had his receivers 6% to 11% under, 2026-10-12; to 20% either way, a step 2.5%)
const QB1_OUT = [-0.2, -0.15, -0.1, -0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.1];
// (c_qbDeep: the lead quarterback out times how far his depth runs over the league's (props.mjs CTX qbDeep: about
// 0.6 a deep threat's, 0.3 a typical wide receiver's, 0 most tight ends' and a back's), per unit of it: at -0.3 a
// deep threat's 16% and a typical wide receiver's 9%. The measure (2026-10-12, the state's settings) had the deep
// ones' catches 12% to 16% under the projection, the short ones' 5% to 9%)
const QB_DEEP = [-0.4, -0.3, -0.2, -0.15, -0.1, -0.05, 0.05, 0.1];
// (c_ppShare: an NHL skater's power-play share over his position's prop players', -0.5 to 0.6 (a second-pair
// defenseman about -0.3, a top unit's forward +0.3): a 0.3 share's 7% to 35% at 0.25 to 1)
const PP_SHARE = [-0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
// (the carryover's tried (late, 0 its off): sk the prior's K at his share, rx last season's weight in his last
// five, pl his prior's lean to last season's last games)
const CARRY_GRID = { sk: [0.5, 1], rx: [0.25, 0.5, 1], pl: [0.25, 0.5, 0.75] };
// (the pull toward the middle tried: sl on the projection's log, under 0 pushing out; searched on one replay,
// the lean fit again at each (fitStat); only on a stat marked middle (props.mjs STATS: where it was kept on
// 2026-10-12, its search and gate a replay to three on every stat each hourly run; the mark back on a stat to
// try it there again))
const SL = [-0.1, -0.05, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4];
// (a regular above him out (c_aheadOut, 0 or 1): the next man up's lift on top of rp and the vacated work, to
// 30%; the organic trend's power (ot))
const AHEAD_OUT = [-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.3];
// (his side's margin by the betting lines (c_mSpread, per 10 points, signed: a favorite's over 0): a late
// flag, either way to 15% a 10 points)
const M_SPREAD = [-0.15, -0.1, -0.05, -0.025, 0.025, 0.05, 0.1, 0.15];
// (the back-to-backs (c_b2b, c_oppB2b; the NBA's own by role, c_b2bS, c_b2bB: props.mjs CTX), 0 or 1 flags, a
// few percent to 15% either way, finer than GRID.c's 7% step)
const B2B = [-0.15, -0.1, -0.07, -0.05, -0.03, 0.03, 0.05, 0.07, 0.1, 0.15];
const GRID = { ...CARRY_GRID, sl: SL, ot: [0.25, 0.5, 0.75, 1], ab: [0.25, 0.5, 0.75, 1], nt: [0.5, 0.75, 1], c_aheadOut: AHEAD_OUT, aPos: [0, 0.25, 0.5, 0.75, 1], kd: [0, 0.1, 0.25, 0.5], dp: [0, 0.5, 1], qs: [0, 0.5, 1], K: [2, 4, 8, 16, 32], w: [0, 0.2, 0.4, 0.6], a: [0, 0.5, 1], b: [-0.5, 0, 0.5, 1, 1.5], c: [-0.3, -0.15, -0.07, 0, 0.07, 0.15, 0.3], roleK: [Infinity, 32, 16, 8, 4, 2], fun: [0, 1, 2, 4, 8], pc: [0, 0.5, 1, 1.5], tg: [0, 0.5, 1], vc: [0, 0.25, 0.5, 0.75, 1, 1.25], c_oppShots: POWER, c_slot: POWER, c_leash: POWER, c_precip: [-0.04, -0.02, -0.01, 0, 0.01, 0.02], c_oppGoalie: [-0.6, -0.4, -0.2, -0.1, 0, 0.1, 0.2], c_rb1Out: RB1_OUT, c_newCoach: COACH, c_qb1Out: QB1_OUT, c_qbDeep: QB_DEEP, c_ppShare: PP_SHARE, c_mSpread: M_SPREAD, c_b2b: B2B, c_oppB2b: B2B, c_b2bS: B2B, c_b2bB: B2B };
// (the vacated work's split, by index into matchups.mjs's: in proportion, flatter, equally, for each measure
// of work the stat has (vacSplits: 3 a measure); searched with vc)
const splitsOf = (stat) => Array.from({ length: stat.vacSplits ?? 3 }, (_, i) => i);
// (the snaps-based rate's blend and the expected share's weight on his last game (sr), searched together: the
// weight means nothing without the blend)
const SN = [0.5, 1];
const SR = [0, 0.25, 0.5, 0.75, 1];
// (the volume-based base's blend and its efficiency prior's weight in targets, searched together the same way.
// yk to 400: receiving yards took the largest of [15, 40, 100] (100), and of these 400 (held out 0.6504 at 100,
// 0.6501 at 400); 1000 tried too (2026-10-12), taken again on the fit window, held out worse (0.6508, the
// eligible players' bias -1.17 yards a game against -0.65): his efficiency nearly all his longer run's, an
// aging receiver's past yards a target read as his now)
const VOL = [0.25, 0.5, 0.75, 1];
const YK = [15, 40, 100, 200, 400];
// (the position groups whose opponent's power is fit on its own (a_<group>: off at null, the stat's a))
const aKeys = (stat) => (stat.oppPos ?? []).map((g) => `a_${g}`);
// (each matchup term's off setting, and which stats have it; each context term's size (c_<name>) is off at 0;
// the role-aware base's the same (the NFL's: sn the snaps-based rate, qs a starting quarterback's starts, kd
// the prior's weight shrinking through the season, dp the draft's prior for a player in his first two seasons),
// off at 0 and kept only if the held-out games are better)
const OPTIONAL = { roleK: Infinity, fun: 0, pc: 0, tg: 0, vc: 0, sn: 0, qs: 0, kd: 0, vol: 0, dp: 0 };
const offOf = (key) => (key.startsWith('c_') ? 0 : key.startsWith('a_') ? null : OPTIONAL[key]);
const has = (stat, key) =>
  key === 'roleK' ? !!stat.roles
  : key === 'tg' ? !!stat.targets
  : key === 'vc' ? !!stat.vacated
  : key === 'sn' ? !!stat.snaps
  : key === 'qs' ? !!stat.starts
  : key === 'kd' ? !!stat.early
  : key === 'vol' ? !!stat.perTarget
  : key === 'dp' ? !!stat.draft
  : key === 'rp' ? !!(stat.snaps && stat.roles)
  : key === 'nt' ? !!(stat.perTarget && stat.roles)
  : key === 'ij' || key === 'ot' || key === 'ab' ? !!stat.snaps
  : key === 'ro' ? !!(stat.snaps && stat.roles)
  : key === 'sk' ? !!(stat.snaps && stat.carry)
  : key === 'rx' || key === 'pl' ? !!stat.carry
  : key === 'sl' ? !!stat.middle
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

// The recalibration a line's chance takes at a projection: its side's (calSide, kept by cs: [a line under the
// projection, one at it or over]) where the fit kept them and that side has one, else the stat's cal
export const calAt = (params, mu, line) => (params?.calSide ? (params.calSide[mu > line ? 0 : 1] ?? params.cal) : params?.cal) ?? null;

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

// A stat's context terms to fit (c_<key>): its ctx's, the betting lines' spread (c_mSpread) only where the
// history has the lines (env.mktN: the rows with them; without, it reads 0 on every row and isn't fit)
export const fitCtxs = (stat, env) => ctxKeys(stat).map((k) => `c_${k}`).filter((k) => k !== 'c_mSpread' || env?.mktN > 0);

// A stat's settings fit (one at a time, twice round) on the fit window, then checked on the last 30%
export function fitStat(stat, rows, env) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 300) return null;
  const at = (q) => sorted[Math.floor(sorted.length * q)].date.slice(0, 10);
  const cuts = [at(0.3), at(0.7)];
  // (the betting lines' terms (mk, c_mSpread) only where the history has the lines (fitCtxs, env.mktN: the rows
  // with them); without, nothing to fit, the stat as before)
  const ctxs = env.ctx ? fitCtxs(stat, env) : [];
  const aPos = aKeys(stat);
  let params = { K: 4, w: 0.2, a: 0.5, b: 0.5, ...OPTIONAL, ...Object.fromEntries(aPos.map((k) => [k, null])), ...Object.fromEntries(ctxs.map((k) => [k, 0])), ...(stat.vacated ? { vs: 0 } : {}), ...(stat.snaps ? { sr: 0 } : {}), ...(stat.perTarget ? { yk: 40 } : {}), mk: 0 };
  // (the draft's prior (dp) apart: tried last, on top of the rest as fit (below))
  // (and the context flags with a floor of their own (MIN_GAIN: a new head coach's first games) the same way,
  // tried after the rest: searched with them, a flag left out still moved the others' sizes)
  // (the role and work share's (SHARE: ro, ab; c_aheadOut where a stat's ctx has it; ot) after the next man up
  // and the injury return: the injury-driven terms first, the organic trend on what they leave)
  const AFTER_RP = ['c_aheadOut'];
  const share = (list) => list.filter((k) => SHARE.includes(k) && has(stat, k));
  const late = [...(TRY_MK && env.mktN > 0 ? ['mk'] : []), ...ctxs.filter((k) => MIN_GAIN[k] !== undefined && !AFTER_RP.includes(k)), ...['rp', 'nt', 'ij'].filter((k) => has(stat, k)), ...share(['ro', 'ab']), ...ctxs.filter((k) => AFTER_RP.includes(k)), ...share(['ot']), ...[...CARRY, 'sl'].filter((k) => has(stat, k))];
  const optional = [...Object.keys(OPTIONAL).filter((k) => k !== 'dp' && has(stat, k)), ...aPos, ...ctxs.filter((k) => !late.includes(k))];
  const keys = ['K', 'w', 'a', 'b', ...optional];
  const allOff = Object.fromEntries(optional.map((k) => [k, offOf(k)]));
  let best = scoreOf(replayStat(stat, sorted, params, env, cuts).out, 1);
  // (the stat's own a idle where every position group its rows hold has an a_<group> set: nothing reads it,
  // so it isn't searched then)
  const groups = [...new Set(sorted.map((r) => oppGroup(r.pos)))];
  const aIdle = (p) => aPos.length > 0 && groups.every((g) => p[`a_${g}`] !== null && p[`a_${g}`] !== undefined);
  for (let pass = 0; pass < 2; pass++) {
    for (const key of keys) {
      if (key === 'a' && aIdle(params)) continue;
      // (the vacated work's strength and its split together: the split means nothing without the strength)
      // (and the snaps-based rate's blend with its expected share's weight on his last game: sn with sr)
      const tries =
        key === 'vc' ? GRID.vc.flatMap((v) => splitsOf(stat).map((vs) => ({ vc: v, vs })))
        : key === 'sn' ? [{ sn: 0 }, ...SN.flatMap((v) => SR.map((sr) => ({ sn: v, sr })))]
        : key === 'vol' ? [{ vol: 0 }, ...VOL.flatMap((v) => YK.map((yk) => ({ vol: v, yk })))]
        : key.startsWith('a_') ? [null, ...GRID.aPos].map((v) => ({ [key]: v }))
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
  // (what's left of a lean on the eligible players once the rest is fit: their total over their projection;
  // fit again below once the held-out games have left terms out, as the lean was measured with them in)
  const scaleOf = (p) => {
    const fitOut = replayStat(stat, sorted, { ...p, scale: 1 }, env, cuts).out.filter((x) => x.win === 1 && x.row.eligible !== false);
    const sumMu = fitOut.reduce((t, x) => t + x.p.mu, 0);
    return sumMu ? Math.round((fitOut.reduce((t, x) => t + x.v, 0) / sumMu) * 1000) / 1000 : 1;
  };
  params.scale = scaleOf(params);
  const taken = { ...params };
  // (the recalibration and the check: on the eligible players only, the ones a book posts props for)
  // (each matchup term the fit took up, tested on the held-out games: left out unless its log loss on them is
  // lower with it; its gain recorded either way: the held-out log loss without it less with it)
  // (and where the stat has the draft's prior, the same on the players in their first season and their first
  // two (young: [rookies, first two, first two's early games]), the games it's for, and every player's: the
  // early games (under 3 of his own this season, where the draft's factor carries most of the prior's weight)
  // have no line at his median, so they're judged on their bias and error alone; a debut and a rookie's second
  // game aren't projected at all (parts: 2 games of his own or more), live or here, so none is in them)
  const youngOf = (o, yrs) => o.filter((x) => x.win === 2 && x.row.eligible !== false && x.row.draft && x.row.season - x.row.draft.year >= 0 && x.row.season - x.row.draft.year <= yrs);
  const allOf = (o) => o.filter((x) => x.win === 2 && !(x.row.s.snaps > 0 && x.row.s.snaps < 10));
  // (split: the rows a late term is on (SUBGROUP, onOf): the held-out games' bias a game, projected less actual,
  // on the rows it's on (every player's) and the rest (every player's and the eligible's), and the rest's mean
  // actual, for its gate below)
  // (a flag's rows its value over 0; the next man up's a role moved up with the missing out of the order
  // (whether or not the term's on: the same rows both sides); the injury return's his games back as tried (ia))
  const onOf = (key, t) => {
    if (key === 'rp') return (x) => !!x.row.roleUp && x.row.roleUp !== x.row.role;
    if (key === 'c_aheadOut') return (x) => (x.row.aheadOut ?? 0) > 0;
    if (key === 'nt') return onOf('rp', t);
    if (key === 'ab') return (x) => !!x.p.sameOn;
    if (key === 'ij') return (x) => isBack(x.row, t.ia);
    const i = ctxKeys(stat).indexOf(key.slice(2));
    return (x) => (x.p.ctx?.[i] ?? 0) > 0;
  };
  // (a signed term's sides (SIGNED): its favorites' rows and its underdogs', by its value on the row)
  const sidesOf = (key) => {
    const i = ctxKeys(stat).indexOf(key.slice(2));
    return [(x) => (x.p.ctx?.[i] ?? 0) > SIGNED_AT, (x) => (x.p.ctx?.[i] ?? 0) < -SIGNED_AT];
  };
  const heldOut = (p, split = null, sides = null) => {
    const o = replayStat(stat, sorted, p, env, cuts).out;
    const pairs = linePairs(o.filter((x) => x.win === 1 && x.row.eligible !== false), p);
    const cal = fitRecal(pairs);
    // (and by side where it's tried (cs): each side's own, a side with too few lines none (cal))
    const calSide = p.cs ? sideCals(pairs) : null;
    const pc = { ...p, cal, calSide };
    const young = has(stat, 'dp') ? [...[0, 1].map((y) => check(youngOf(o, y), pc)), check(youngOf(o, 1).filter((x) => x.p.games < 3), pc)] : null;
    const all = has(stat, 'dp') || late.length ? check(allOf(o), pc) : null;
    let parts = null;
    if (split) {
      const on = split;
      const a = allOf(o);
      parts = { on: biasOf(a.filter(on)), onElig: biasOf(a.filter((x) => on(x) && x.row.eligible !== false)), rest: biasOf(a.filter((x) => !on(x))), restElig: biasOf(a.filter((x) => !on(x) && x.row.eligible !== false)) };
    }
    if (sides) {
      const a = allOf(o);
      parts = { ...(parts ?? {}), sides: sides.map((f) => biasOf(a.filter(f))) };
    }
    return { cal, calSide, check: check(o.filter((x) => x.win === 2 && x.row.eligible !== false), pc), young, all, parts };
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
  // (a position group's a left out: its rows read the stat's a again, which the search fit only on the groups
  // without one of their own (or, every group's set, didn't search at all), so it's searched again on the fit
  // window with the terms that stayed, kept only if the held-out games are no worse with it; and with any term
  // left out, the lean fit again without it)
  const dropped = optional.filter((k) => taken[k] !== offOf(k) && params[k] === offOf(k));
  if (dropped.length) {
    let next = { ...params, scale: scaleOf(params) };
    let nextCheck = heldOut(next);
    if (dropped.some((k) => k.startsWith('a_'))) {
      let aBest = null;
      for (const v of GRID.a) {
        const s = scoreOf(replayStat(stat, sorted, { ...params, a: v, scale: 1 }, env, cuts).out, 1, { rk: params.rk ?? 0, rm });
        if (!aBest || s.ll > aBest.ll) aBest = { ll: s.ll, a: v };
      }
      if (aBest.a !== params.a) {
        const tryP = { ...params, a: aBest.a };
        tryP.scale = scaleOf(tryP);
        const tried = heldOut(tryP);
        if ((tried.check?.logLoss ?? Infinity) <= (nextCheck.check?.logLoss ?? Infinity)) (next = tryP), (nextCheck = tried);
      }
    }
    params = { ...next, cal: nextCheck.cal };
    current = nextCheck;
  }
  // (the dispersion's growth, the same way: the plain negative binomial unless the held-out games say so)
  if (params.rk) {
    const without = heldOut({ ...params, ...plain });
    gains.rk = Math.round(((without.check?.logLoss ?? 0) - (current.check?.logLoss ?? 0)) * 10000) / 10000;
    if (gains.rk <= 0) (params = { ...params, ...plain }), (current = without);
  } else gains.rk = null;
  // (the context flags with a floor (MIN_GAIN: a new head coach's first games, a 0-or-1 flag on a few hundred
  // team-games), tried on top of the rest as fit and left as they are, as the draft's prior below: each size
  // searched on the fit window at its own best r, judged against none at the r the same search found for it,
  // the lean fit again on both sides; kept only with a held-out gain of its floor or more, the eligible
  // players' and every player's bias no larger (either not measured: left out, so said). Left out, the stat is
  // exactly as it was without it. Why it's left out, and the bias without and with it: floors)
  // (a flag on a few of the rows (SUBGROUP) is judged on its bias where it is, not the whole stat's: a flag that
  // lowers the projections it's on makes a stat already projected low overall (held-out receiving yards -0.65 a
  // game, projected less actual) lower still on the whole even where those rows ran over their projections
  // (the qb1-out's, 11% over in the role backtest), and the lean refit on the fit window doesn't offset the
  // held-out games. So: the rows it's on (every player's, SUBGROUP_N or more) with their bias smaller, and the
  // eligible players' among them (SUBGROUP_ELIG_N or more) and the rest (every player's and the eligible's) no
  // larger by more than SUBGROUP_TOL of their mean actual)
  const floors = {};
  // (the pull toward the middle's search (sl): one replay without it, each size's projections made from its
  // projections before the lean (the pull reads nothing the replay learns from while the returners' ramp is
  // off (ij, ir: off on every stat as of 2026-10-12); kept on, the replay reads the projections, so each size
  // is replayed in full instead (exact, floors.sl)), the lean fit again at each on the fit window's eligible
  // players, scored at the stat's best dispersion. Its gate below replays both sides in full)
  const middleSearch = (shape) => {
    const exact = !!(params.ij || params.ir);
    const o = replayStat(stat, sorted, { ...params, sl: 0, scale: 1 }, env, cuts).out;
    const fitOf = (list) => list.filter((x) => x.win === 1 && x.row.eligible !== false);
    const at = (sl) => {
      const list = exact && sl ? replayStat(stat, sorted, { ...params, sl, scale: 1 }, env, cuts).out : o;
      const f = exact ? (x) => x.p.mu : (x) => x.p.mu * middleF({ sl, rm }, x.p.mu);
      const fitE = fitOf(list);
      const sum = fitE.reduce((t, x) => t + f(x), 0);
      const k = sum > 0 ? fitE.reduce((t, x) => t + x.v, 0) / sum : 1;
      return list.map((x) => ({ ...x, p: { mu: Math.max(0.05, k * f(x)) } }));
    };
    const s0 = scoreOf(at(0), 1, shape);
    let sBest = s0;
    let v = null;
    for (const sl of GRID.sl) {
      const sc = scoreOf(at(sl), 1, shape);
      if (sc.ll > sBest.ll) (sBest = sc), (v = { sl });
    }
    return { s0, sBest, v, exact };
  };
  let slExact = false;
  for (const key of late) {
    // (the role order reads nowhere without the role's opponent table (roleK) or the next man up (rp): nothing
    // to try)
    if (key === 'ro' && !(Number.isFinite(params.roleK) || params.rp)) {
      gains.ro = null;
      continue;
    }
    // (nor the next man up's target floor without the volume base (vol))
    if (key === 'nt' && !params.vol) {
      gains.nt = null;
      continue;
    }
    const shape = { rk: params.rk ?? 0, rm };
    let s0;
    let sBest;
    let v = null;
    if (key === 'sl') ({ s0, sBest, v, exact: slExact } = middleSearch(shape));
    else {
      s0 = scoreOf(replayStat(stat, sorted, params, env, cuts).out, 1, shape);
      sBest = s0;
      for (const x of lateTries(key)) {
        const sc = scoreOf(replayStat(stat, sorted, { ...params, ...x }, env, cuts).out, 1, shape);
        if (sc.ll > sBest.ll) (sBest = sc), (v = x);
      }
    }
    gains[key] = null;
    if (!v) continue;
    const offP = { ...params, r: s0.r };
    offP.scale = scaleOf(offP);
    const sub = SUBGROUP.has(key) ? onOf(key, v) : null;
    const sides = SIGNED.has(key) ? sidesOf(key) : null;
    const off = heldOut(offP, sub, sides);
    const tryP = { ...params, ...v, r: sBest.r };
    tryP.scale = scaleOf(tryP);
    const tried = heldOut(tryP, sub, sides);
    gains[key] = Math.round(((off.check?.logLoss ?? 0) - (tried.check?.logLoss ?? 0)) * 10000) / 10000;
    const fine = (a, b, tol = 0) => (!Number.isFinite(a) || !Number.isFinite(b) ? 'not measured' : Math.abs(a) <= Math.abs(b) + tol ? null : 'larger');
    const fails = [];
    if (!(gains[key] >= MIN_GAIN[key])) fails.push('gain');
    if (sub) {
      const [o, t] = [off.parts, tried.parts];
      const on = (o?.on?.n ?? 0) < SUBGROUP_N ? 'not measured' : t.on.bias === 0 && o.on.bias === 0 ? null : Math.abs(t.on.bias) < Math.abs(o.on.bias) ? null : 'larger';
      if (on) fails.push(on === 'larger' ? 'its own bias' : 'its own bias not measured');
      // (and its own rows' eligible players', the ones a book posts props for, no larger the same way: a term
      // learned on every player's rows, most of them low-usage, can right those and push the bettable ones the
      // other way (ij on receptions, 2026-10-12: its rows -6.9% to +4.1% actual over projected, the eligible's
      // -1.5% to +10.1%); fewer than SUBGROUP_ELIG_N of them: not measured, left out)
      const oe = (o?.onElig?.n ?? 0) < SUBGROUP_ELIG_N ? 'not measured' : fine(t?.onElig?.bias, o?.onElig?.bias, SUBGROUP_TOL * (o?.onElig?.mean ?? 0));
      if (oe) fails.push(oe === 'larger' ? "its own eligible rows' bias" : "its own eligible rows' bias not measured");
      const rb = fine(t?.rest?.bias, o?.rest?.bias, SUBGROUP_TOL * (o?.rest?.mean ?? 0));
      if (rb) fails.push(rb === 'larger' ? "the rest's bias" : "the rest's bias not measured");
      const re = fine(t?.restElig?.bias, o?.restElig?.bias, SUBGROUP_TOL * (o?.restElig?.mean ?? 0));
      if (re) fails.push(re === 'larger' ? "the eligible rest's bias" : "the eligible rest's bias not measured");
    } else {
      const eb = fine(tried.check?.bias, off.check?.bias);
      if (eb) fails.push(eb === 'larger' ? 'bias' : 'bias not measured');
      const ab = fine(tried.all?.bias, off.all?.bias);
      if (ab) fails.push(ab === 'larger' ? "all players' bias" : "all players' bias not measured");
      // (the pull toward the middle's own point: the held-out fifths by projection missing less (each one's
      // actual over projected, off 0, summed), the eligible players')
      if (key === 'sl') {
        const [a, b] = [fifthsMiss(tried.check), fifthsMiss(off.check)];
        if (!(Number.isFinite(a) && Number.isFinite(b))) fails.push('fifths not measured');
        else if (!(a < b)) fails.push('fifths');
      }
      // (a signed term's each side no larger too (SIGNED): the favorites' rows, then the underdogs')
      if (sides) {
        ['the favorites', 'the underdogs'].forEach((name, j) => {
          const [o, t] = [off.parts?.sides?.[j], tried.parts?.sides?.[j]];
          const r = (o?.n ?? 0) < SUBGROUP_N ? 'not measured' : fine(t?.bias, o?.bias);
          if (r) fails.push(r === 'larger' ? `${name}' bias` : `${name}' bias not measured`);
        });
      }
    }
    floors[key] = { size: sizeOf(key, v), fails, bias: [off.check?.bias ?? null, tried.check?.bias ?? null], allBias: [off.all?.bias ?? null, tried.all?.bias ?? null], ...(sub ? { on: [off.parts?.on ?? null, tried.parts?.on ?? null], onElig: [off.parts?.onElig ?? null, tried.parts?.onElig ?? null], rest: [off.parts?.rest?.bias ?? null, tried.parts?.rest?.bias ?? null] } : {}), ...(sides ? { sides: [0, 1].map((j) => [off.parts?.sides?.[j] ?? null, tried.parts?.sides?.[j] ?? null]) } : {}), ...(key === 'sl' ? { fifths: [off.check?.fifths ?? null, tried.check?.fifths ?? null], exact: slExact } : {}) };
    if (!fails.length) (params = { ...tryP, cal: tried.cal }), (current = tried);
  }
  // (the draft's prior, tried last on top of the rest as fit and left as they are (searched with them it
  // steered the veterans' terms: on 2026-10-12 passing yards' precipitation and passing attempts' kd moved with
  // it, and stayed moved where it was left out), so left out the stat is as it was without it: its size
  // searched on the fit window, each size at its own best dispersion r, and judged against no prior at the r
  // the same search found for it (the r as fit before a term was left out would mix its own refit into the
  // gain), the lean fit again on both sides. Kept only on the RB1-out standard (94ac4063): a held-out gain of
  // DRAFT_GAIN or more, the eligible players' and every player's bias no larger, and its own games no worse:
  // the rookies' and the first two seasons' log loss and bias (DRAFT_LINES lines each or more: fewer, or
  // none, and it's left out, nothing measured), and their early games' bias and error (DRAFT_EARLY or more))
  let draftTaken = 0;
  let rookie = null;
  if (has(stat, 'dp')) {
    const shape = { rk: params.rk ?? 0, rm };
    const d0 = scoreOf(replayStat(stat, sorted, { ...params, dp: 0 }, env, cuts).out, 1, shape);
    let dBest = d0;
    for (const v of GRID.dp) {
      if (!v) continue;
      const sc = scoreOf(replayStat(stat, sorted, { ...params, dp: v }, env, cuts).out, 1, shape);
      if (sc.ll > dBest.ll) (dBest = sc), (draftTaken = v);
    }
    gains.dp = null;
    rookie = { dp: draftTaken, kept: 0, fails: [], r: [d0.r, dBest.r] };
    if (draftTaken) {
      const offP = { ...params, dp: 0, r: d0.r };
      offP.scale = scaleOf(offP);
      const off = heldOut(offP);
      const tryP = { ...params, dp: draftTaken, r: dBest.r };
      tryP.scale = scaleOf(tryP);
      const tried = heldOut(tryP);
      gains.dp = Math.round(((off.check?.logLoss ?? 0) - (tried.check?.logLoss ?? 0)) * 10000) / 10000;
      const no = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= Math.abs(b);
      const fails = [];
      if (!(gains.dp >= DRAFT_GAIN)) fails.push('gain');
      if (!no(tried.check?.bias, off.check?.bias)) fails.push('bias');
      if (!no(tried.all?.bias, off.all?.bias)) fails.push("all players' bias");
      ['rookies', 'first two'].forEach((name, y) => {
        const a = tried.young?.[y];
        const b = off.young?.[y];
        if (!(a?.lines >= DRAFT_LINES && b?.lines >= DRAFT_LINES)) fails.push(`${name} too few`);
        else {
          if (a.logLoss > b.logLoss) fails.push(`${name}' log loss`);
          if (!no(a.bias, b.bias)) fails.push(`${name}' bias`);
        }
      });
      const ea = tried.young?.[2];
      const eb = off.young?.[2];
      if (!(ea?.n >= DRAFT_EARLY && eb?.n >= DRAFT_EARLY)) fails.push('early games too few');
      else {
        if (!no(ea.bias, eb.bias)) fails.push('early bias');
        if (ea.mae > eb.mae) fails.push('early error');
      }
      if (!fails.length) (params = { ...tryP, cal: tried.cal }), (current = tried);
      // (its own check, the gate's own numbers: without it and at the size the search took, each at its own
      // dispersion, lean and recalibration)
      const brief = (c) => (c ? { n: c.n, lines: c.lines, logLoss: c.logLoss, bias: c.bias, mae: c.mae } : null);
      rookie = { ...rookie, kept: params.dp, fails, check: [brief(off.check), brief(tried.check)], all: [brief(off.all), brief(tried.all)], rookie: [brief(off.young?.[0]), brief(tried.young?.[0])], young: [brief(off.young?.[1]), brief(tried.young?.[1])], early: [brief(off.young?.[2]), brief(tried.young?.[2])] };
    }
  }
  params.cal = current.cal;
  // (the recalibration by side (cs), tried last: each side of the projection (a line under it, one at it or
  // over) recalibrated on its own on the fit window's lines, against the one curve for both as fit; kept only
  // with a held-out gain of DRAFT_GAIN or more and each side's held-out log loss no worse (fewer than CS_MIN
  // held-out lines on a side: not measured, left out). Left out, cal alone, exactly as before. Its numbers, the
  // check's skew rows' among them (a side the model takes against its own projection, lines from
  // SKEW_MIN_LINE: what props.mjs's skew guard skips), either way: floors.cs. Tried only with TRY_CS; off, the
  // fit's own check numbers alone, no replay)
  if (!TRY_CS) floors.cs = { size: null, fails: ['not tried'], bias: [current.check?.bias ?? null, null], allBias: [current.all?.bias ?? null, null], bySide: [current.check?.bySide ?? null, null], skew: [current.check?.skew ?? null, null] };
  else {
    const sided = heldOut({ ...params, cs: 1 });
    gains.cs = sided.calSide ? Math.round(((current.check?.logLoss ?? 0) - (sided.check?.logLoss ?? 0)) * 10000) / 10000 : null;
    const fails = [];
    if (!sided.calSide) fails.push('too few lines');
    else {
      if (!(gains.cs >= DRAFT_GAIN)) fails.push('gain');
      [0, 1].forEach((i) => {
        const [a, b] = [sided.check?.bySide?.[i], current.check?.bySide?.[i]];
        const name = i ? 'over the line' : 'under the line';
        if (!(a?.lines >= CS_MIN && b?.lines >= CS_MIN)) fails.push(name + ' not measured');
        else if (a.logLoss > b.logLoss) fails.push(name + "'s log loss");
      });
    }
    floors.cs = { size: sided.calSide ? JSON.stringify(sided.calSide) : null, fails, bias: [current.check?.bias ?? null, sided.check?.bias ?? null], allBias: [current.all?.bias ?? null, sided.all?.bias ?? null], bySide: [current.check?.bySide ?? null, sided.check?.bySide ?? null], skew: [current.check?.skew ?? null, sided.check?.skew ?? null] };
    if (!fails.length) (params = { ...params, cs: 1, calSide: sided.calSide, cal: sided.cal }), (current = sided);
  }
  const final = replayStat(stat, sorted, params, env, cuts).out;
  // (the held-out numbers with no matchup or context terms at all, for the before and after)
  const base = optional.length ? heldOut({ ...params, ...allOff }).check : current.check;
  // (and every player's held-out games, eligible or not, a sanity check on the history's selection: an NFL
  // game he took under 10 offensive snaps in (a kneel-down, a gadget play: a backup's line no projection is
  // for) left out of it, as the board never posts his prop)
  const all = allOf(final);
  return { params, gains, floors, base, check: current.check, checkAll: check(all, params), fitN: best.n, rookie };
}

// (a list's fifths by projection, lowest first: each one's projection range, count and actual over projected
// less 1 (over 0: the model ran low there))
export function fifthsOf(list) {
  if (list.length < 50) return null;
  const s = [...list].sort((a, b) => a.p.mu - b.p.mu);
  return [0, 1, 2, 3, 4].map((i) => {
    const part = s.slice(Math.floor((s.length * i) / 5), Math.floor((s.length * (i + 1)) / 5));
    const mu = part.reduce((t, x) => t + x.p.mu, 0);
    const v = part.reduce((t, x) => t + x.v, 0);
    return { lo: Math.round(part[0].p.mu * 100) / 100, hi: Math.round(part[part.length - 1].p.mu * 100) / 100, n: part.length, ratio: mu ? Math.round((v / mu - 1) * 10000) / 10000 : null };
  });
}
// (the fifths' misses summed: each one's actual over projected, off 0; null unmeasured)
const fifthsMiss = (c) => (c?.fifths ? c.fifths.reduce((t, f) => t + Math.abs(f.ratio ?? 0), 0) : null);

// (each side's recalibration (cs): the lines under the projection, then at it or over, each its own fit with
// CS_MIN or more of them, else none (cal); none on either side: null)
function sideCals(pairs) {
  const out = [0, 1].map((i) => {
    const mine = pairs.filter((x) => (x.x.p.mu > x.line ? 0 : 1) === i);
    return mine.length >= CS_MIN ? fitRecal(mine) : null;
  });
  return out.some(Boolean) ? out : null;
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
  const side = [0, 1].map(() => ({ lines: 0, ll: 0, said: 0, was: 0 }));
  const skew = { n: 0, said: 0, was: 0 };
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
      const p = Math.min(0.995, Math.max(0.005, recal(nbOver(line, x.p.mu, rAt(params, x.p.mu)), calAt(params, x.p.mu, line))));
      const over = x.v > line ? 1 : 0;
      // (by side: a line under his projection (0), at it or over (1))
      const sd = side[x.p.mu > line ? 0 : 1];
      sd.lines++;
      sd.ll -= Math.log(over ? p : 1 - p);
      sd.said += p;
      sd.was += over;
      // (the skew's rows: the side the model takes against its own projection, an under with the mean above
      // the line or an over with it below, from SKEW_MIN_LINE (props.mjs skewOnly))
      if (line >= SKEW_MIN_LINE && ((p < 0.5 && x.p.mu > line) || (p > 0.5 && x.p.mu < line))) {
        skew.n++;
        skew.said += Math.max(p, 1 - p);
        skew.was += (p > 0.5) === !!over ? 1 : 0;
      }
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
    // (by side of the projection: a line under it, at it or over; the chance over said and what happened)
    bySide: side.map((s) => ({ lines: s.lines, logLoss: s.lines ? r4(s.ll / s.lines) : null, said: s.lines ? r4(s.said / s.lines) : null, was: s.lines ? r4(s.was / s.lines) : null })),
    // (the sides taken against their own projection: the model's chance of its side and how often it won)
    skew: { n: skew.n, said: skew.n ? r4(skew.said / skew.n) : null, was: skew.n ? r4(skew.was / skew.n) : null },
    fifths: fifthsOf(list),
  };
}

// A season's snap shares with a game cut short left out: one under half the median of the others (he left it
// hurt, or was eased back), unless his last two games were both that low (a role cut). Fewer than 3 games: as
// they are
export function typicalShares(shares) {
  return typicalIdx(shares).map((i) => shares[i]);
}
// (the same as the games' places in the list, so each one's weight goes with it)
export function typicalIdx(shares) {
  if (!Array.isArray(shares)) return [];
  const all = shares.map((_, i) => i);
  if (shares.length < 3) return all;
  const sorted = [...shares].sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  const low = (x) => x < 0.5 * med;
  const n = shares.length;
  if (low(shares[n - 1]) && low(shares[n - 2])) return all;
  const kept = all.filter((i) => !low(shares[i]));
  return kept.length ? kept : all;
}
