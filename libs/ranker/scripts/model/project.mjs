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
//   minutes  the NBA's minutes first (audit #3; props.mjs STATS minutes): the snaps-based base with his minutes
//            for the snaps (matchups.mjs share: his minutes over a full game's 48), his per-minute rate (his
//            season's total over its minutes, the eligible players' per-minute rate his prior where his own run
//            is short, K full games of it) times the minutes he's expected tonight (his season's typical, a game
//            under half his median left out, leaning to his last MIN_RECENT games' average by sr), blended in by
//            sn. A late term (tried first of them, so the flags fit on top of it) on the whole stat's gate, its
//            bias no larger by more than SUBGROUP_TOL of the mean actual (WHOLE_TOL: a base on every row, the lean
//            refit with it). The factors (the work missing, a back-to-back, the blowout) multiply the product, so
//            each acts on his minutes as much as on his rate. Measured 2026-10-13 on 2025-26, the one NBA season
//            the history holds (1316 finals, 28462 player games; the fit window December to March, the last 30%,
//            March to the Finals, held out): kept on every stat, points sn 0.5/sr 0.5 (held out 0.6521 to 0.6475,
//            +0.0049), rebounds 0.5/0.75 (0.6338 to 0.6265, +0.0073), assists 0.5/0.75 (0.6176 to 0.6112,
//            +0.0064), threes 0.5/0.75 (0.5647 to 0.5612, +0.0035), pts+reb+ast 0.5/0.5 (0.6489 to 0.6444,
//            +0.0045); every player's bias smaller on each (points 0.118 to 0.057, pts+reb+ast 0.521 to 0.358),
//            the eligible players' within the tolerance (points -0.2562 to -0.2575, rebounds 0.0184 to 0.0235,
//            pts+reb+ast -0.2572 to -0.2839; held to no larger at all, those three were left out). The held-out
//            eligible rows after a minutes jump (his last three over 1.2 times his season's, n 1410), actual over
//            projected: points +17.3% to +9.4%, rebounds +18.8% to +5.0%, assists +19.4% to +5.8%, threes +21.1%
//            to +7.1%, pts+reb+ast +14.0% to +6.6%; after a drop (under 0.8, n 618) -4.5% to -2.1%, -7.3% to -0.1%,
//            -15.6% to -9.1%, -8.6% to -1.0%, -4.9% to -2.5%; the bench (roleKnown B, n 2728) +9.1% to +5.6% on
//            points. His last game alone in the last three's place (MIN_RECENT 1) held out within 0.0003 either way
//            (0.6475, 0.6265, 0.6109, 0.5615, 0.6446): the last three kept, the form the audit's evidence took. One
//            season: the hourly refit judges it again as the next one comes in. Tried on top of it and left out:
//            the betting lines' blowout by role (props.mjs CTX blowS, blowB: the spread, from the finals'
//            summaries, playerlogs.mjs boxMarket; points' starters -0.03 +0.0004 with its own rows' bias larger,
//            rebounds' bench 0.03 +0.0002, assists' bench -0.03 +0.0001, pts+reb+ast both worse held out: one
//            season's lines don't show starters losing and the bench gaining past the plain blowout term) and a
//            bench player who started his last game (CTX newStart: rebounds 0.03 +0.0002, the rest not taken on
//            the fit window, though its held-out 706 rows still ran under, points +11%, assists +8%); both off the
//            ctx, CTX keeping them for a measure on demand.
//            The review's fixes (2026-10-13): (1) teammates back: the minutes lean read a fill-in's jump made with
//            a starter out, and vacHist weighed those games only by the per-game blend's w, so with the starter
//            back the lean's minutes stayed. Now the minutes part of vacHist reads the work missing in the games
//            the lean reads (minLean: the last three's at sr, the season's for the rest), blended in by sn. The
//            held-out eligible rows with less missing now than then by 0.15 or more (by the per-game vacHist),
//            actual over projected, sn off / on before / on now: points 0.6% / -2.5% / -0.9% (n 93), rebounds
//            -11.1% / -14.0% / -10.7% (31), assists -15.8% / -19.1% / -15.6% (31), threes -31.7% / -32.7% /
//            -30.1% (31), pts+reb+ast -9.6% / -12.1% / -11.2% (93): the minutes base no longer makes them worse
//            but for pts+reb+ast, and the work missing's size runs them under either way (vc fit again on the base,
//            vcM, left out on every stat: TRY_VCM), so props.mjs minutesBackOf keeps them a role CHECK on the
//            over. (2) The minutes expected held to 48 a game (an overtime game's 53 a full game; the per-minute
//            rate takes them all). (3) Early in a season: his minutes pulled toward last season's a game by
//            MIN_RECENT games' worth, the per-game base till he has MIN_RECENT games without last season's: a
//            short opener isn't his minutes (a 20-minute blowout opener after a 34-minute season: 18% under the
//            per-game base before, under 1% now). (4) WHOLE_TOL's tolerance on the eligible players' bias alone,
//            every player's strict. Held out with them: points 0.6478 (sn +0.0047, its eligible bias -0.2562 to
//            -0.2389), rebounds 0.6267 (+0.0071, 0.0184 to 0.0268), assists 0.6108 (+0.0068, 0.0325 to 0.0396),
//            threes 0.5613 (+0.0034, -0.0259 to -0.0215), pts+reb+ast 0.6447 (+0.0042, -0.2572 to -0.263); every
//            player's smaller on each. Unmeasured: 2026-27's opening weeks. The history's one season has no last
//            season's on any row (no per-minute prior of his own, no last season's minutes), and a season's
//            first 30% is the fit's warm-up, never scored: the regime the season opens in, and the early-season
//            pull, were never held out. The hourly refit holds out the latest 30% of the history, so 2026-27's
//            games are judged as they come in (the minutes base and its bias dropped by the gate if they say so)
//   pace     the NBA's (audit #10; props.mjs STATS pace, a late term after the minutes base on the whole stat's
//            gate, its eligible players' bias within WHOLE_TOL's tolerance as the minutes base's: a factor on every
//            row, the lean refit with it): the other side's possessions a game over the league's (pg 0; his own
//            team's pace is in his own numbers), the game's expected possessions (both teams' over the league's,
//            matchups.mjs nbaMatchups paceG) over its average in his games this season (pg 2), or the other side's
//            over its average in his games (pg 3), each average pulled toward even by PACE_M games and read only
//            from games whose pace was known (paceKnown), to the power po; tonight's pace not known, 1. The
//            opponent's and the role's tables learn against the base times the pace's factor, so they keep what a
//            defense allows past its possessions, not its pace again, and the opponent's power a is fit again
//            with po on the fit window (a's grid). pg 1 (the game's expected over the league's) counted his own
//            team's pace twice, once in his numbers: off the search (PG_FORMS), kept readable. Measured
//            2026-10-13, its review (2025-26, held out March to the Finals): kept on points po 1.5/pg 2 (held out
//            0.6478 to 0.6466, +0.001; the eligible players' bias -0.2389 to -0.2597, every player's 0.0773 to
//            0.0595), threes 1.5/2 (0.5613 to 0.5608, +0.0005; -0.0215 to -0.0249) and pts+reb+ast 1.5/2 (0.6447
//            to 0.644, +0.0007; -0.263 to -0.2963, every player's 0.3932 to 0.3643), a 0.5 after its refit;
//            rebounds (1/3, +0.0002) and assists (1.5/2, +0.0001) under the floor. Before the review (pg 1 kept,
//            the tables holding the pace): points 0.6465, threes 0.5607, pts+reb+ast 0.6441, nearly all of it
//            kept by the clean forms. Each one's eligible players' bias larger (within the tolerance, half a
//            percent of the mean actual), every player's smaller. Unmeasured: a new season's opening
//            weeks (a team's prior its last season's pace at PACE_CARRY of its distance from the league's,
//            matchups.mjs; the history's one season opened with no league's pace, every row 1).
//            positions (ps; props.mjs STATS positions, ESPN's G, F, C): the opponent's table and the priors by
//            position group (ps 1), the role's table by it too (ps 2), in place of one pool. Left out on every stat
//            (points, assists, pts+reb+ast not taken on the fit window; rebounds 1 held out -0.001; threes 1
//            +0.0003 with its bias larger): the minutes base and the per-player rates already carry a center's
//            rebounds and a guard's threes, and a third of the opponent's games a table thins it. Off the search
//            (TRY_PS)
//   ice time the NHL's (audit #13; props.mjs STATS minutes 60): the minutes base with a skater's time on ice for
//            the minutes (matchups.mjs nhlMatchups share: his time on ice over a full game's 60, the game's own,
//            learned after it; fullMin), sn and sr searched late on the whole stat's gate with WHOLE_TOL's tolerance
//            as the NBA's, the factors on top of it (the work missing tonight searched on shots and not taken, vc
//            0; the back-to-back not in its ctx: nothing on the base for a teammate's return, so a jump in his ice
//            time is a role CHECK on the over, props.mjs iceJumpOf). Late flags after it on the same gate
//            (WHOLE_TOL, one budget a stat; props.mjs CTX): c_ppLean, his share of his team's power play lately
//            (matchups.mjs ppLean, this season's games, recent ones counting most) over his season's, a log; c_teamShots, his side's expected shots on goal tonight
//            over the league's (hockey.mjs, its shots a game against the other side's allowed), a log; c_mTotal, the
//            betting total over 6 goals (playerlogs.mjs boxTotals: the finals' closes, a mild look-ahead as the
//            NBA's lines; live the book's), a log. Measured 2026-10-13 (2025-26 and 2026-27's first games, 56516
//            player games, held out the last 30%), against the code before on the same lines (shots 0.593, points
//            0.5474): shots sn 0.5/sr 0.5 (+0.0009; eligible bias 0.0411 to 0.0444, every player's 0.1282 to
//            0.1132) and c_ppLean 0.05 (+0.0003, 0.0444 to 0.0466) kept, held out 0.5918; c_teamShots 0 (0.5 no
//            better held out) and c_mTotal not taken. Points: sn, c_ppLean and c_mTotal not taken on the fit window,
//            c_teamShots 0.25 kept (+0.0006, 0.0366 to 0.0367), and with the power play by the other side's
//            penalties (c_pp, never taken) kept in its search: off it the main search's path moved (the work missing
//            then taken, vc 0.25 +0.0003, on a start 0.0005 worse) and points held out 0.5471 against 0.5469 with it.
//            The review of 2026-10-13: c_ppLean read from his share of the team's power play, not his minutes (they
//            swing with how many power plays the last opponents gave), this season's games alone (last season's no
//            longer in the recent part early on): kept at 0.1 (+0.0004, bias 0.0444 to 0.046, every player's 0.1132
//            to 0.1089), shots held out 0.5917; the WHOLE_TOL terms judged against the bias before the first of them
//            (no NHL or NBA term changed by it). The eligible held-out rows, actual over projected before and after
//            (all: shots -2.0% to -2.2%): shots after an ice-time jump (his last three's minutes 1.2 times his
//            season's or more by the base's own reading, n 173) -6.5% to -14.9% (without c_ppLean -13.1%; the jumps
//            with his power-play share up 0.3 or more, n 67, -0.5% without it and -5.9% with it: the lean and the
//            base count a promotion to the top unit twice there; the rest, n 106, -20.6% either way). So the jump's
//            over is a role CHECK (iceJumpOf); a teammate's return explains little of it (the work missing then over
//            now 0.02 or more, n 49, -6.5%; never past 0.07, so the NBA's minutesBackOf (0.15) never fires on the
//            NHL). Points with his side's expected shots low (-0.08 or less, n 1438) -15.5% to -12.8%. The dead
//            terms off each stat's ctx (props.mjs NHL_SOG_CTX, NHL_PTS_CTX) and the minutes mark off points: the
//            NHL props' fit 121s to 173s locally (262s with every term searched). Unmeasured: even-strength and
//            power-play ice time projected apart (the audit's plan) in place of the lean on the total
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
//   start    the start-of-season prior (audit #11; sp, a late term after the carryover on the stat's early games,
//            searched on a stat marked start: props.mjs START): a veteran's prior (his own longer run: last
//            season's, the seasons before at half) trusted too far into a new season, an aging one's, a moved
//            one's (a new team: his old role doesn't carry). A table learned as the replay goes (each day's games
//            after they're projected, the eligible players'): how the games of players whose prior is their own
//            ran against their base, each weighed by the prior's weight in it (priorW: about 1 in week 1, little by
//            December) and read against the stat's own level (every eligible game's actual over base so far), by
//            his position, his age (under 25, 25-27, 28-30, 31 and over: nflverse's birth dates; unknown, the NBA's,
//            its own) and new team or not, each cell pulled toward its position's and that toward the stat's by
//            SP_M games' worth. Applied as (1 + the cell's level)^(sp x priorW) on his base: in full on a game his
//            prior alone makes, fading as his season's games come in; a rookie's (the position's prior: dp) and a
//            row without a run of his own untouched. Its gate (SUBGROUP, its rows his first SP_EARLY games of a
//            season): the gain its early games' (the check's lines need 3 of this season's, so it barely sees
//            them): their log loss at lines at the median of his last 16 games, any season, DRAFT_GAIN or more on
//            SUBGROUP_N lines; their bias smaller, their eligible rows' and the rest's no larger (SUBGROUP_TOL);
//            and the whole stat's held-out log loss no worse. Those lines are a naive book's (his usual, no shade
//            for age or a move, which is what sp adds; the real books shade some): its gain an upper bound on the
//            edge against them (the history has no prop lines to read it at). Not searched with fewer than
//            SUBGROUP_N such games held out or on the fit window (its size is picked there; the NBA's history one
//            season so far: 2026-27's openers held out first, searched once a season's are in the fit window and the
//            next's held out, 2027-28 at the soonest). Its table learned and read on a stat marked start only (the
//            rest pay nothing). Measured 2026-10-13 (held out the 2024 to 2026
//            openers): kept on rushing yards (sp 1, early +0.0016, -5.5% to -3.3% actual over projected, n 1259;
//            the whole stat 0.6479 to 0.6478), receiving yards (0.5, +0.0039, -2.4% to -2.2%, n 1617; 0.6497 to
//            0.6493) and rush+rec yards (1, +0.0081, -3.5% to -2.5%, n 2154; 0.6538 to 0.6527), each one's eligible
//            bias larger on the whole (rush+rec yards -1.17 to -1.20 yards a game; the lean refit, the rest within
//            its tolerance). The table it learned (rush+rec yards, as the history leaves it): wide receivers 31 and
//            over -0.10 (on a new team -0.24), 28-30 -0.07 (new -0.19), under 25 +0.10; backs 28-30 -0.13 (new
//            -0.16), 25-27 new -0.10; tight ends under 25 +0.11, 28-30 -0.06; quarterbacks' rushing 31 and over
//            -0.13. Left out: passing yards, attempts, completions (the whole stat worse), TDs and interceptions (not
//            taken), carries (the whole stat worse, its eligible rows' bias), receptions (its rows ran over: their
//            bias larger). About 5s to 14s a stat searched (rushing, receiving and rush+rec yards' fit)
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
//            role left out, kept only if the held-out games are better with it). The tables' recency (od, audit
//            #15; a late term on the whole stat's strict gate, searched on a stat marked recency: props.mjs
//            RECENCY): each table's sums, last season's carried part too, times 1 - od at each new game of its
//            side, so its latest games count most; where the opponent's power is 0 on every group, tried with a at
//            OD_A. Measured 2026-10-13 on every NFL, NBA and NHL stat: kept on NBA rebounds (0.05, held out +0.0004,
//            both biases smaller; re-checked 2026-10-14 on three other stretches, not held, so off it too: props.mjs
//            RECENCY on no stat); points, threes and pts+reb+ast gained (+0.0003 to +0.0012) with every player's
//            bias larger, the rest not taken (props.mjs RECENCY). The other side's key defenders out tonight (its
//            production missing, its top-four defensemen, its secondary and front seven: props.mjs CTX oppOut,
//            oppD, oppDB, oppFront, matchups.mjs) measured the same day as late flags and kept on none
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
//   plays    the NFL's expected plays tonight (audit #19b; ep, a late term on the whole stat's strict gate after the
//            NBA's pace, searched on a stat marked plays: props.mjs PLAYS), in place of the defense's pace (pc: its
//            other side's part is in it, so never both): his team's expected plays (eg 1, off the search: its own
//            plays a game times the other side's pace, matchups.mjs playsX; eg 3: the game's expected total times his
//            team's share of it, playsS, the share its time of possession's measure) over their average in his games
//            this season (eg 4, off the search: playsS over his team's actual plays in his games; eg 2: playsX over
//            them, playsA), each average pulled toward even by PLAYS_M games, to the power ep; none read tonight
//            (neither team's tallies: matchups.mjs), pc as before. His own team's pace is in his numbers, so
//            tonight's is read against his games'; but pulled toward even, early in a season (his numbers leaning
//            on last season's) part of his own team's pace is put back on them (the review of 2026-10-13; pulled
//            toward last season's games' instead, the gain fell to +0.0001: playsFactor); the market's script b,
//            fit before it, stays as fit, so it's judged on top of it; the spread's c_mSpread, where a stat has it
//            (not passing attempts), is a ctx term tried after it, on top of it. The opponent's tables still learn
//            with the other side's pace in them, as with pc. Measured 2026-10-13 on the eight volume stats: kept on passing attempts (ep 0.5/eg 3, held out 0.6219 to 0.6208,
//            +0.0011, in place of pc 0.5; the eligible players' bias 0.4952 to 0.4694, every player's 0.7758 to
//            0.7468); left out on the rest (props.mjs PLAYS' notes), their search off. Unmeasured: seconds a play in
//            neutral situations and nflverse's drive times (the cached play-by-play keeps neither: a refetch of
//            every season), the share of the plays standing in for the time of possession; a player on a new team
//            (traded, or signed in the off-season) keeps his old team's games' average as the one tonight's is
//            read against, as his numbers keep his old team's games (consistent, but the new team's pace read as
//            tonight's swing)
//   team     the team's game first, then its players' (audit #19c; tr and its form tf, a late term on the whole
//            stat's strict gate after the carryover and the start-of-season prior, before the pull toward the
//            middle; searched on a stat marked team: props.mjs TEAM): each team's expected total of the stat (T,
//            makeModel's squad: its projected players' total a game this season, pulled toward last season's or
//            the league's by TR_K games, times the other side's allowed over the league's; tf 2 and 3 times the
//            betting lines' implied points for his side over their average, at half or in full) against his
//            team's players' projections summed (S: his own tonight, each teammate's latest by his share of the
//            team's last SQUAD_N games, a regular out tonight left out as the history counts an absence, live each
//            one's chance of playing; a part-timer by whether he played the team's latest game alone, live too; a
//            regular back from an absence (his season's share of the team's games SQUAD_REG or more, the latest
//            missed) at his season's share where he plays, live only with a prop of his own on the board: squadIn;
//            tf 4 T without the other side's allowed, each player's projection reading it already), his projection
//            times (T / S)^tr (T / S held to TR_CAP either way): shrunk
//            toward his share of the team's, never reset to it. Who got in tonight isn't read (a blowout's garbage
//            time, a late scratch: measured that way first, the NBA's gain was mostly that look-ahead). How far the
//            bottom-up projections were from adding up, held out (2026-10-13; the players summed and the team's
//            expected, each over what those players did, and each one's miss a team-game): NFL rushing yards 1.032
//            and 0.969 (miss 34.0% and 33.4%), carries 1.020 and 0.973 (23.9%, 22.7%), receiving yards 1.010 and
//            0.973 (24.6%, 24.0%), receptions 1.050 and 0.983 (22.1%, 20.4%); NBA points 1.006 and 0.997 (12.7%,
//            8.8%), rebounds 1.036 and 1.014, assists 1.054 and 0.999 (19.3%, 15.4%), threes 1.009 and 1.003; NHL
//            shots 1.070 and 1.009 (19.2%, 17.9%), points 1.169 and 1.010 (49.4%, 46.5%); the NBA's expected
//            minutes 248 a team-game for the players who got in against 240 played (miss 10.9%), the NHL's ice time
//            299 and 298 (4.0%). A starter's return (2026-10-14, held out, the rows whose team had a regular back
//            from an absence playing; actual minus projected): counted at none before, it lifted his teammates as
//            their work shrank, NBA points' -0.221 to -0.336 at tr 0.25, carries' -0.451 to -0.618, rushing
//            yards' -2.39 to -3.12; counted at his season's share, -0.125, -0.362 and -1.96, the held-out log loss
//            the same or better. The regulars' playing tonight is read as the vacated terms read it (the
//            history's absence: a late scratch read with the injury report's); a regular in the team's latest
//            game counted whatever happened tonight instead (the bound), NBA assists' gain at tr 0.25 fell from
//            0.0062 to 0.0036 a row's log likelihood but held, so it's kept. T without the other side's (tf 4):
//            within 0.0012 a row either way of tf 1, the gain mostly the teammates adding up, not the opponent
//            read twice. Kept on NFL carries (tr 0.25) and NBA assists (0.25), each tf 4; the rest left out on
//            the bias or the gain (props.mjs TEAM's notes). Left over: a regular resting or scratched off the
//            injury report counted live, the history knowing he sat; a part-timer listed out counted live, as
//            the history can't tell. Unmeasured: minutes made to add up to
//            240 as a term of their own (the minutes base's expected share before the rate), the NHL's ice time made
//            to add up by line
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
//            left out, kept only if the held-out games are better with it). And who absorbs it (audit #7, vl: a
//            late term on its own rows' gate, the rows with work missing tonight): the split learned from the
//            history in place of the even ones (matchups.mjs absorbTable: by class, the NFL's position and place
//            in its order, the NBA's position and starter or bench; across positions too, the work lost where
//            the team's volume falls with him out), its index (props.mjs STATS vacLearned) and vc searched together.
//            Measured 2026-10-13 and off the search (TRY_VL): the table reads sane (the NFL's, 643 fresh absences
//            from 2016: a WR1 out, the receivers below him take 0.33 of his targets, the WR2 stepping up 0.14, the
//            WR2 0.1, the tight ends 0.09, the backs 0.07, about 0.77 kept; an RB1 out, the backup 0.4 of his
//            carries, the rest 0.31), but every size and split was worse on the fit window than the even split the
//            stat had (the fit window's log-likelihood at its best try (vc 0.25 on each, larger worse): carries -75,
//            rushing yards -10, receiving yards -20, rush+rec yards -47, NBA points -12, rebounds -9, assists -3,
//            threes -3, pts+reb+ast -31; receptions not better at any; measured with w, pl and K as the main search
//            fit them around the even split, vl a late term on top: a retry fits the main search once with vs at the
//            learned index first, and compares), and on the NFL's held-out work
//            change the cut's correlation was no better than the split in proportion (backs 0.316 against 0.337,
//            receivers 0.200 against 0.205 (flatter 0.224), tight ends 0.187 against 0.220; the same position's
//            alone or the proportion scaled by the learned share kept, no better)
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
//   recency  every stat's (hl, tried after the rest as fit, 2026-10-14, the owner's): newer games counting more in
//            the lean, the dispersion r and the recalibration fit on the fit window, by a half-life of HL seasons
//            (3, 2, 1), picked inside the fit window and kept only with a held-out gain of DRAFT_GAIN or more (the
//            floor every late term clears; it was any gain over 0 till 2026-10-14, which kept NFL passing attempts
//            at +0.0001) and both biases no larger (fitStat: floors.hl); live, nothing new to read: the scale, r and
//            cal it fit
//   middle  every stat's (sl, a late term on the whole stat's gate, tried after the rest as fit): the projection
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
//            (the check as fit) beside the gate's. Re-checked 2026-10-14 (the bias drops: the pull moves the
//            stat's mean as well as its shape, so the bias test partly measured that): a mean-preserving form, each
//            day's eligible projections summed as without it (no outcome read), passed on NFL passing yards (0.15,
//            +0.0029, both biases equal or smaller) and MLB outs (0.15, +0.0041; held out the last 45% +0.0045,
//            the last 20% +0.0050 (0.1), the middle -0.0033, its fit window picking -0.1); on passing TDs,
//            interceptions and receptions it gained (+0.0031, +0.0023, +0.0006) with every player's bias 0.0003
//            larger; a trailing 20 days' form (readable live) left outs out on the bias (0.0355 to 0.0447). Not
//            taken here: the day's form needs a slate's projections together live, the integrator's call. MLB
//            hits' +0.0005 held on other stretches (the last 20% +0.0006, kept; the middle +0.0007, left out on
//            the bias)
// A term's held-out gain is the log loss without it less with it, the others as they stand: an a_<group>'s
// against the stat's a as the search left it (with every group's set, a's first pass value: nothing read it
// after); a group left out, a is searched again (fitStat).
//
// The count's spread: a negative binomial around the projection, its dispersion r fit too (lower: wider), and
// how it grows with the projection (rk: r x (mu / the average)^rk, a starter's yards tighter around his
// projection than the plain shape gives; kept only if the held-out games are better with it: rAt), and where
// the fit kept it (ex, below exitTracker) a mixture with a short game (he left it hurt, benched or pulled) at
// its chance learned from the history, the mean the projection's either way. Every
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

// The early exit (audit #17, ex: a late term on the whole stat's gate, the low lines' log loss and the high rows'
// no worse too):
// a player can leave a game early (hurt, benched, pulled), which one negative binomial around the projection
// doesn't shape, a low line's under and over most of all. A short game is one his share of the work (row.share:
// the NFL's snaps, the NBA's minutes, each the game's own) ran under EXIT_FRAC of his typical (the median of his
// shares this season before it, EXIT_MIN games or more). Its chance learned as the replay goes (exitTracker,
// from the games before each day only): every row's, by his position, his role before the game (row.role), and
// whether his last game this season was short or tonight is his first game back from an absence (row.ret, the
// NFL's), each level pulled toward the one above it by EXIT_M games, his own short games' rate pulling his
// role's by EXIT_OWN_M before the short last game's or first game back's level reads; and what a short game keeps
// of a full one's work (its share over his typical, EXIT_F0 till EXIT_FM of them). The count is then a mixture:
// a short game at that chance with ex - 1 times his base's added (ex sizes the base only: the short last game's
// and first game back's levels at their own read; held to EXIT_CAP), its mean that fraction of a full game's,
// else a full game, the full game's mean set so the mixture's is the projection (exitMix): the projection, its
// lean and every bias as without it, only the shape around them. The book's line is read for the guards on the
// plain shape (props.mjs impliedNow): the mixture prices the line, nothing else.
// The base read 2026-10-13 (his own rate pulled after the levels then, since before them) (the eligible rows with a typical share of 0.4 or more, each against the chance
// before its day): the NFL's 31762 ran short 6.8% (a WR1 3.2%, a WR4 or lower 15.5%, an RB2 or lower 11.6%), 37.7%
// after a short last game (n 1516; 25% read), 17.6% in a first game back (n 1715; 12.9% read); the NBA's 16896
// 3.2% (a starter 1.8%, the bench 5% to 8%), 22.2% after a short last game (n 450; 15.8% read); the chance's
// log loss on whether each ran short 0.2179 against one rate's 0.2555 (NFL), 0.1300 against 0.1536 (NBA). The
// betting lines' side read nothing (the NFL's favored by 9.5 or more 5.7%, underdogs 7.1%, the rest 6.8%; the
// NBA's 2.9%, 3.2%, 3.4%): not a level. The NHL's skaters ran short 0.3% to 0.7% (time on ice), MLB has no
// share read, the NHL's goalies none: not searched (props.mjs EXIT).
// Measured 2026-10-13 (held out the last 30%; ex searched last of the late terms, each size at its own best r,
// both sides on one replay: 0.4s to 3.3s a stat), the held-out log loss without it and with it, the low lines'
// (LOW_LINE or under) beside it: kept on NFL interceptions ex 4 (0.5503 to 0.5486, +0.0017; low lines, 1024 of
// them, 0.5508 to 0.5491; r 10 to 150: the mixture took the spread's whole excess; 4 the grid's top, larger
// untried), rushing yards 2 (0.6479 to 0.6471, +0.0008; 219 low, 0.6877 to 0.6783), receiving yards 3 (0.6497 to
// 0.6479, +0.0018; 47 low, 0.7409 to 0.642; 2 held out +0.0022, the fit window's choice 3), rush+rec yards 2
// (0.6538 to 0.652, +0.0018; 55 low, 0.8266 to 0.7526) and NBA points 3 (0.6466 to 0.6463, +0.0003; 38 low,
// 0.4006 to 0.4049, too few to judge). Left out: receptions 1 (-0.0004; 770 low, 0.6533 to 0.6541), carries 1
// (+0.0001; 467 low, 0.6551 to 0.6499), passing yards (-0.0004), attempts (-0.0013), completions (-0.0019),
// passing TDs not taken; NBA rebounds (+0; 799 low 0.6472 to 0.6477), assists (-0.0006; 2588 low 0.6219 to
// 0.6224), threes (-0.0002; 4342 low 0.5694 to 0.5697), pts+reb+ast (-0.0003). The receptions' and threes' low
// lines, the audit's worry, are as well shaped by the plain negative binomial: their short games ride in its r.
// Measured again after the review of 6c51e015 (ex sizing the base only, his own rate before the levels, a game
// with no share read leaving his last game unknown; and the gate's high rows: a short last game, a first game
// back or a chance of EXIT_HIGH or more, at SUBGROUP_N lines their log loss no worse and their over said no
// further from what happened): ex times the whole of a 25% level had pinned those rows at EXIT_CAP, a coin-flip
// short game (a WR at 60 on a 30.5 line, r 3: over 0.793 plain, 0.638 so). Kept on receiving yards alone, ex 3
// (0.6497 to 0.6479, +0.0018; 47 low, 0.7409 to 0.64; its 975 high rows 0.6552 to 0.648, over said 0.4467 to 0.439,
// was 0.4338). Left out: interceptions, now ex 2 (+0.0006, r 10 to 16; 1024 low 0.5508 to 0.5502; 58 high rows,
// too few: said 0.3, was 0.138), rushing yards ex 2 (+0.0006; its 1419 high rows 0.6441 to 0.6454, worse), rush+rec
// yards ex 2 (+0.0017; its 2086 high rows 0.6451 to 0.6441, their over said 0.4629 to 0.4687 against 0.4525:
// further); NBA points off the search (its +0.0003 the floor's, picked from about 17: noise).
// Each stat's mark only where it was kept (props.mjs EXIT); the bias is the same either way (the mean's kept)
export const EXIT_FRAC = 0.5;
const EXIT_MIN = 3;
const EXIT_M = 20;
const EXIT_OWN_M = 100;
const EXIT_F0 = 0.3;
const EXIT_FM = 20;
const EXIT_CAP = 0.5;
// (the history's rows the base rate needs before any chance is read: fewer, none)
const EXIT_N = 200;
// (the low lines whose held-out log loss the early exit's gate reads apart: check's low)
export const LOW_LINE = 2.5;
// The early exit's chances learned from the history (above): learn a day's rows after they were all projected,
// of a row before its game ({ q: the chance of a short game, q0: his base's (his role's, his own rate pulled
// toward it: the short last game's and first game back's level not in it; exitMix sizes only this part by ex),
// f: what one keeps, tier: 'L' after a short last game, 'B' a first game back, else null, n: the base's rows };
// null till EXIT_N rows). His own short games' rate pulls the base before the short last game's or first game
// back's level reads (review of 6c51e015: pulled after it, his plain rate dragged those levels back toward his
// usual, 25% read where 37.7% ran short); a game with no share read (its snap counts not in yet) leaves his last
// game unknown, never the one before it ('-': the role's chance, not a stale short last game's)
export function exitTracker() {
  const cls = new Map();
  const own = new Map();
  const keysOf = (row) => {
    const pos = row.pos ?? '';
    const role = `${pos}|${row.role ?? '-'}`;
    const o = own.get(row.pid);
    const last = o?.season === row.season && o.last === true ? 'L' : '-';
    const back = row.ret?.k === 1 ? 'B' : '-';
    return ['*', pos, role, `${role}|${last}${back}`];
  };
  return {
    of(row) {
      const all = cls.get('*');
      if (!(all?.n >= EXIT_N)) return null;
      let q = all.s / all.n;
      let f = (all.fs + EXIT_FM * EXIT_F0) / (all.s + EXIT_FM);
      const keys = keysOf(row);
      let whole = true;
      for (const k of keys.slice(1, 3)) {
        const c = cls.get(k);
        if (!c) {
          whole = false;
          break;
        }
        q = (c.s + EXIT_M * q) / (c.n + EXIT_M);
        f = (c.fs + EXIT_FM * f) / (c.s + EXIT_FM);
      }
      const o = own.get(row.pid);
      if (o?.n) q = (o.s + EXIT_OWN_M * q) / (o.n + EXIT_OWN_M);
      const q0 = q;
      const tag = keys[3].slice(-2);
      const c = whole ? cls.get(keys[3]) : null;
      if (c) {
        q = (c.s + EXIT_M * q) / (c.n + EXIT_M);
        f = (c.fs + EXIT_FM * f) / (c.s + EXIT_FM);
      }
      return { q, q0, f, tier: tag[0] === 'L' ? 'L' : tag[1] === 'B' ? 'B' : null, n: all.n };
    },
    learn(rows) {
      for (const row of rows) {
        const sh = Number.isFinite(row.share) && row.share > 0 ? Math.min(1, row.share) : null;
        if (sh === null) {
          const o = own.get(row.pid);
          if (o && o.season === row.season) o.last = null;
          continue;
        }
        let o = own.get(row.pid);
        if (!o) o = { season: row.season, shares: [], n: 0, s: 0 };
        if (o.season !== row.season) o = { ...o, season: row.season, shares: [] };
        if (o.shares.length >= EXIT_MIN) {
          const s = [...o.shares].sort((a, b) => a - b);
          const typ = s[Math.floor(s.length / 2)];
          const short = sh < EXIT_FRAC * typ;
          for (const k of keysOf(row)) {
            const c = cls.get(k) ?? { n: 0, s: 0, fs: 0 };
            c.n++;
            if (short) (c.s++), (c.fs += sh / typ);
            cls.set(k, c);
          }
          o.n++;
          if (short) o.s++;
          o.last = short;
        } else o.last = false;
        o.shares = [...o.shares, sh].slice(-20);
        own.set(row.pid, o);
      }
    },
  };
}
// (the mixture a projection's chances take: { q, f } where the fit kept the early exit (ex) and the row has its
// chance, else null: the plain negative binomial. ex sizes his base's chance only (exitQ0): fit on the bulk of
// the rows, a base of 3% to 8%, it works there as a heavier low tail as much as a count of exits (interceptions'
// r 10 to 150), so a short last game's or a first game back's level goes on at its own read, the base's ex
// times added over it (review of 6c51e015: ex times the whole of a 25% level pinned those rows at EXIT_CAP, a
// coin-flip short game, 3 to 8 points of under where the model knows least); held to EXIT_CAP)
export function exitMix(params, p) {
  const ex = params?.ex;
  if (!ex || !(p?.exitQ > 0)) return null;
  const q0 = Math.min(p.exitQ, p.exitQ0 ?? p.exitQ);
  const q = Math.min(EXIT_CAP, p.exitQ + (ex - 1) * q0);
  if (!(q > 0)) return null;
  return { q, f: Math.min(0.9, Math.max(0, p.exitF ?? EXIT_F0)) };
}
// (the rows the early exit's gate reads apart besides the low lines (check's high): a short last game, a first
// game back, or a chance learned of EXIT_HIGH or more, where the mixture leans hardest)
const EXIT_HIGH = 0.1;
const exitHigh = (p) => p?.exitQ > 0 && (!!p.exitTier || p.exitQ >= EXIT_HIGH);
// (its parts, [weight, mean]: the full game's mean set so the mixture's is mu)
const mixParts = (mu, mix) => {
  const full = mu / (1 - mix.q * (1 - mix.f));
  return [[1 - mix.q, full], [mix.q, Math.max(1e-3, full * mix.f)]];
};
// The reflected count (flip, DECISIONS.md D43, 2026-10-19): a left-skewed stat (a starter's outs: a hook ends the
// start early, so the long tail runs toward 0 and the mass sits near a cap; the median above the mean) is shaped
// as M - k at mean M - mu, a negative binomial on the outs still to get, M the stat's cap (props.mjs STATS flip:
// the grid the fit tries, kept only where the held-out games are better with it, as rk is). The plain negative
// binomial is right-skewed, so on outs its chance over the line ran 3 to 7 points low at any mean (the Bot's over
// chance .433 where overs landed .512; the shape's own log loss on the counts 2.80 against 2.67 to 2.73 reflected).
// A mean at or past the cap, or a line the cap can't clear (a complete game's 27 at a cap of 24), reads the plain
// shape, so nothing is ever priced impossible
const flipOf = (params, mu, line = null) => (params?.flip > 0 && mu < params.flip - 0.05 && (line === null || line < params.flip - 0.5) ? params.flip : null);
const flipLog = (k, mu, r, M) => nbLog(Math.max(0, M - Math.min(k, M)), M - mu, r);
// (over the line: k > line, so M - k < M - line, that is M - k at most M - floor(line) - 1)
function flipOver(line, mu, r, M) {
  const top = M - Math.floor(line) - 1;
  if (top < 0) return 0;
  const m = M - mu;
  let p = Math.pow(r / (r + m), r);
  let cdf = p;
  for (let k = 0; k < top; k++) {
    p *= ((k + r) / (k + 1)) * (m / (r + m));
    cdf += p;
  }
  return Math.min(1, Math.max(0, cdf));
}
const logAt = (k, mu, params) => {
  const M = flipOf(params, mu);
  return M ? flipLog(k, mu, rAt(params, mu), M) : nbLog(k, mu, rAt(params, mu));
};
const overAt = (line, mu, params) => {
  const M = flipOf(params, mu, line);
  return M ? flipOver(line, mu, rAt(params, mu), M) : nbOver(line, mu, rAt(params, mu));
};
// The log chance of k at a projection, with the early exit's mixture where it's on (mix), else nbLog's (the
// reflected count's where the fit kept a cap: flip)
export function chanceLog(k, mu, params, mix = null) {
  if (!mix) return logAt(k, mu, params);
  const [[w1, m1], [w2, m2]] = mixParts(mu, mix);
  const a = Math.log(w1) + logAt(k, m1, params);
  const b = Math.log(w2) + logAt(k, m2, params);
  const top = Math.max(a, b);
  return top + Math.log(Math.exp(a - top) + Math.exp(b - top));
}
// The chance of going over a line at a projection, the same way (nbOver's)
export function chanceOver(line, mu, params, mix = null) {
  if (!mix) return overAt(line, mu, params);
  return mixParts(mu, mix).reduce((t, [w, m]) => t + w * overAt(line, m, params), 0);
}

// A line's chances at a projection: over and under with a push left out (each the chance given no push, so
// they sum to 1), and the push's own chance (a whole-number line: the count landing on it; a half-point line
// has none). The recalibration (cal, or its side's: calAt) on the over's; the early exit's mixture (mix,
// exitMix) where the fit kept it
export function lineChances(line, mu, params, mix = null) {
  const raw = chanceOver(line, mu, params, mix);
  const push = Number.isInteger(line) && line >= 0 ? Math.min(0.99, Math.exp(chanceLog(line, mu, params, mix))) : 0;
  const over = recal(Math.min(1, raw / (1 - push)), calAt(params, mu, line));
  return { over, under: 1 - over, push };
}

// The projection a line's price implies: the mean at which the stat's spread (its dispersion as at any
// projection, no recalibration) goes over the line as often as the book's fair chance says (fairOver; an assumed
// -110's 0.5: the line its median), the early exit's mixture as the model's own where it's on (mix). By halves
// on the log of the mean; null where it can't be had
export function impliedMean(line, fairOver, params, mix = null) {
  if (!Number.isFinite(line) || !(fairOver > 0 && fairOver < 1) || !params) return null;
  const plain = { ...params, cal: null, calSide: null };
  let lo = Math.log(0.01);
  // (a reflected count's mean searched under its cap: past it the shape reads plain, and the halves need one curve)
  let hi = Math.log(flipOf(plain, 0, line) ? plain.flip - 0.06 : Math.max(10, line * 20 + 10));
  if (lineChances(line, Math.exp(hi), plain, mix).over < fairOver) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (lineChances(line, Math.exp(mid), plain, mix).over < fairOver) lo = mid;
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
// (and audit round C's (props.mjs CTX, matchups.mjs batterTables and nflRoundC) the same way, each a late term on
// the same floor: MLB's lineup strikeouts and on-base, ballpark, plate appearances by slot, air and home on the
// whole stat's gate (the air and home signed, each side's bias no larger: SIGNED); the NFL's own line changed,
// a back's late-season load and the last regular-season game on their own rows' (SUBGROUP), the pass rate over
// expected on the whole stat's, a passing-down back by the script signed)
// (and the feeds round (the owner, 2026-10-18: every stat the site has, INPUTS.md): the NFL's Next Gen Stats
// (ngs.mjs) and the other sports' new inputs, each a value 0 at the league's level and about 1 a unit either way,
// a late term on the same floor and the whole stat's gate, signed (each side's bias no larger: SIGNED), soft where
// its gain is real but small (softable: a c_ term). FEEDS: their keys, each on its stats' ctx in props.mjs only
// where it's measured and kept or left for the gate to judge again)
export const FEEDS = ['c_cpoe', 'c_ttt', 'c_aggr', 'c_sep', 'c_cush', 'c_yacoe', 'c_ryoe', 'c_box8', 'c_oppBox', 'c_shOn', 'c_shSlot', 'c_shDist', 'c_oppBlk', 'c_zoneEdge', 'c_opp3', 'c_zone3', 'c_ryoeP', 'c_xHit', 'c_xTb', 'c_hardHit', 'c_pullAir'];
const FEED_GRID = [-0.06, -0.03, -0.015, 0.015, 0.03, 0.06];
// (a feed that's 0 on one side by its form (ryoeP: over 0 or 0), judged on the whole stat's gate, not each side's:
// its other side has no rows to judge)
const FEED_ONE_SIDED = new Set(['c_ryoeP']);
export const ROUND_C = ['c_lineupK', 'c_lineupKd', 'c_lineupOb', 'c_parkH', 'c_parkTB', 'c_paX', 'c_airTemp', 'c_windOutB', 'c_homeBat', 'c_olOut', 'c_proe', 'c_rbLoad', 'c_rbPass', 'c_lastGame', 'c_parkRel', 'c_hitEnv', 'c_rzPass', 'c_rzPassM', 'c_rzGap', ...FEEDS];
const ROUND_C_GRID = {
  c_lineupK: [0.25, 0.5, 0.75, 1, 1.25],
  c_lineupKd: [0.25, 0.5, 0.75, 1, 1.25],
  c_lineupOb: [-1, -0.5, 0.5, 1],
  c_parkH: [0.25, 0.5, 0.75, 1],
  c_parkTB: [0.25, 0.5, 0.75, 1],
  c_paX: [0.25, 0.5, 0.75, 1],
  c_airTemp: [-0.03, -0.02, -0.01, 0.01, 0.02, 0.03],
  c_windOutB: [-0.04, -0.02, -0.01, 0.01, 0.02, 0.04],
  c_homeBat: [-0.03, -0.02, -0.01, 0.01, 0.02],
  c_olOut: [-0.04, -0.02, -0.01, 0.01, 0.02],
  c_proe: [-0.1, -0.05, 0.05, 0.1, 0.2],
  c_rbLoad: [-0.1, -0.05, -0.03, 0.03, 0.05],
  c_rbPass: [-0.05, -0.03, -0.015, 0.015, 0.03, 0.05],
  c_lastGame: [-0.15, -0.1, -0.05, 0.05],
  c_parkRel: [0.25, 0.5, 0.75, 1],
  c_hitEnv: [0.025, 0.05, 0.075, 0.1],
  // (the red zone's dropbacks on passing TDs (props.mjs CTX rzPass, rzPassM), per 10% over the league's)
  c_rzPass: [-0.02, -0.01, 0.01, 0.02, 0.03, 0.05],
  c_rzPassM: [-0.02, -0.01, 0.01, 0.02, 0.03, 0.05],
  c_rzGap: [-0.01, 0.005, 0.01, 0.02, 0.03, 0.05],
  ...Object.fromEntries(FEEDS.map((k) => [k, FEED_GRID])),
  // (a rusher's yards over expected on its good side alone (ryoeP: ngs.mjs), its sizes larger: an efficient back's
  // carries ran 11% over his projection held out, the grid's 0.06 taking back half of it)
  c_ryoeP: [0.03, 0.06, 0.1, 0.15],
  // (a batter's expected hits on contact over his hits (xHit: matchups.mjs contactTable), its sizes larger: taken at the
  // grid's 0.06 on hits and total bases, each side's held-out bias cut by two thirds or more)
  c_xHit: [-0.03, 0.03, 0.06, 0.1, 0.15],
};
// The soft terms (the owner's ask, 2026-10-15: a small real effect kept at a small weight the runs keep re-tuning,
// not all or nothing at the floor). A late term the gate leaves out on its gain alone (under MIN_GAIN, over 0; or
// on the whole stat's bias, which the joint check below judges again) comes in at a weight w on its size as the
// search took it (softSize: the size times w, its form as taken), w from the strength of its evidence on the
// held-out lines (softWeight): each line's log loss without it less with it, paired; z, their mean over its
// standard error; w = 1 - (SOFT_Z / z)^2 (James-Stein's shrink: z 1 or under, none; z 2, 0.75; z 3, 0.89), and
// none unless both halves of the held-out games (by date) gained. So a weak but steady effect comes in small and
// grows as its games come in (z grows with the root of their count); a term that hurts or flips shrinks to 0.
// Safety: (a) the soft set is added one term at a time, the surest first, each kept only if the held-out log loss
// falls with it and the eligible players' and every player's bias are no larger than the hard-gated model's
// (softJoint), and the set as a whole judged the same at the end, else the hard-gated model alone; (b) a weight
// moves at most SOFT_DAY a day (softStep, from the last run's: state.json's params.soft, at the hours since it),
// so one night can't swing it; (c) only the late terms the search tries (softable: a context flag or a blend
// that's off at 0 and grows smoothly from it) are ever soft; the ones off the search for a leak or look-ahead
// (mk, the market's view; vl, vcM, ps, cs) never, nor ones whose off isn't 0 of a size (ex, ep, od, rp, ij, ro,
// sn) or not one of the whole stat's (its own rows' bias past the owner's tolerance (ownBias below: within it, a soft
// fail), the fifths, a side's: SOFT_FAILS); (d) a term the gate
// keeps is in at its size as before (a soft term with strong evidence: weight 1); (e) a weight over SOFT_CAP only where
// each half of the held-out games shows it alone, z SOFT_HALF_Z or more in both (the skeptic's review, 2026-10-15:
// with the outcomes shuffled within each season, 14 NFL refits of receiving yards and rush+rec yards, a pure-noise
// term got a target of 0.89 once (c_newCoach, z 2.99, its halves' gains 0.000085 and 0.000026) and passed the joint
// check at 0.25x, two more tried and turned back by it; the hourly refit judges again on nearly the same held-out
// games, so it isn't fresh evidence. A noise term's two halves rarely both clear 1.5 (under 1% of the time), a
// real one's do as its games come in: pl on rush+rec yards, z 3.77, halves about 2.5 each. Under it the weight
// stays at SOFT_CAP or less, the cost of a wrong one bounded); (f) never the flags whose history reads the game's
// own box score or snap counts (who played, the line's starters: SOFT_NEVER), a gain there may be what's known only
// once the game starts
export const SOFT_Z = 1;
export const SOFT_DAY = 0.25;
export const SOFT_CAP = 0.25;
export const SOFT_HALF_Z = 1.5;
const SOFT_NEVER = new Set(['c_olOut', 'c_rb1Out', 'c_aheadOut', 'c_oppOut', 'c_oppD', 'c_oppDB', 'c_oppFront']);
const SOFT_ON = new Set(['sp', 'pl', 'sk', 'rx', 'sl', 'ot', 'ab', 'nt', 'tr', 'po', 'bq']);
// (the form keys a soft term's size may carry, as taken, unscaled)
const SOFT_FORMS = { tr: ['tf'], po: ['pg'], bq: ['bqK'] };
const SOFT_FAILS = new Set(['gain', 'bias', "all players' bias", "the other players' bias", "the rest's bias", "the eligible rest's bias", 'its own bias within tolerance']);
// A term's own rows' bias (a flag or a share term judged on the rows it's on: SUBGROUP) must be smaller with it, as
// before; or, the owner's tolerance (2026-10-17, the Emanuel Wilson case: ab on carries +0.0014 held out, four times
// the floor, its own 925 rows' bias -0.587 to -0.612 carries a game, left out on that alone), no larger by more than
// OWN_TOL of the stat's own unit (0.05 carries on carries, 0.05 yards on yards, 0.05 points on points: the bias is a
// game's, projected less actual) where the term's held-out gain is OWN_TOL_GAIN times its floor (MIN_GAIN) or more.
// Within it the term is never in hard: the fail is one of its own kind the soft stage takes ('its own bias within
// tolerance', SOFT_FAILS), so the term comes in at its soft weight on its held-out evidence, judged again each fit
// (a term whose own rows run a little further under for a gain that size is worth a shrunk weight, not all of it).
// Under the gain, or past the tolerance, 'its own bias' as before: left out, never soft. Here, out of fitStat, so
// tests/model-own-bias-tolerance can drive it
export const OWN_TOL = 0.05;
export const OWN_TOL_GAIN = 4;
// (o and t: the rows it's on without and with the term (biasOf); raw: its held-out gain, unrounded; floor: its
// MIN_GAIN. null passes; 'not measured' under SUBGROUP_N rows; 'within tolerance'; 'larger')
export function ownBias(o, t, raw, floor, n = SUBGROUP_N) {
  if ((o?.n ?? 0) < n) return 'not measured';
  const [ob, tb] = [Math.abs(biasRawOf(o)), Math.abs(biasRawOf(t))];
  if ((tb === 0 && ob === 0) || tb < ob) return null;
  if (Number.isFinite(raw) && Number.isFinite(floor) && raw >= OWN_TOL_GAIN * floor && tb <= ob + OWN_TOL) return 'within tolerance';
  return 'larger';
}
export const softable = (key) => !SOFT_NEVER.has(key) && (key.startsWith('c_') || SOFT_ON.has(key));
// (a late term the gate left out, soft-eligible: softable, its size as taken one of its own (and its form), every
// fail one the joint check judges again)
export const softEligible = (key, v, fails) => softable(key) && !!v && Object.keys(v).every((k) => k === key || (SOFT_FORMS[key] ?? []).includes(k)) && Number.isFinite(v[key]) && fails.every((f) => SOFT_FAILS.has(f));
// (the weight's evidence: off and on, each held-out line's log loss by its row (check's lossBy), in date order)
export function softWeight(off, on, min = SUBGROUP_N) {
  const d = [];
  for (const [row, l0] of off ?? []) {
    const l1 = on?.get(row);
    if (Number.isFinite(l0) && Number.isFinite(l1)) d.push(l0 - l1);
  }
  const n = d.length;
  if (n < min) return { n, gain: null, z: null, halves: null, w: 0, why: 'too few lines' };
  const mean = d.reduce((t, x) => t + x, 0) / n;
  const se = Math.sqrt(d.reduce((t, x) => t + (x - mean) ** 2, 0) / (n - 1) / n);
  const z = se > 0 ? mean / se : 0;
  const h = Math.floor(n / 2);
  const halves = [d.slice(0, h), d.slice(h)].map((p) => p.reduce((t, x) => t + x, 0) / p.length);
  // (each half's own z: its mean over its own standard error)
  const halfZ = [d.slice(0, h), d.slice(h)].map((p, j) => {
    const sd = Math.sqrt(p.reduce((t, x) => t + (x - halves[j]) ** 2, 0) / (p.length - 1) / p.length);
    return sd > 0 ? halves[j] / sd : 0;
  });
  const r = (x, k = 1e6) => Math.round(x * k) / k;
  const steady = halves.every((x) => x > 0);
  const full = z > SOFT_Z && steady ? Math.round((1 - (SOFT_Z / z) ** 2) * 1000) / 1000 : 0;
  const capped = full > SOFT_CAP && !halfZ.every((x) => x >= SOFT_HALF_Z);
  const w = capped ? SOFT_CAP : full;
  return { n, gain: r(mean), z: r(z, 100), halves: halves.map((x) => r(x)), halfZ: halfZ.map((x) => r(x, 100)), w, why: capped ? `held to ${SOFT_CAP}: a half under z ${SOFT_HALF_Z}` : w ? null : z <= SOFT_Z ? 'z 1 or under' : 'a half lost' };
}
// (this run's weight: the last run's moved toward the target by at most SOFT_DAY a day since it (days: a first
// run's, one))
export function softStep(w0, target, days = 1) {
  const cap = SOFT_DAY * Math.min(1, Math.max(0, Number.isFinite(days) ? days : 1));
  const w = (w0 ?? 0) + Math.max(-cap, Math.min(cap, target - (w0 ?? 0)));
  return Math.round(Math.max(0, Math.min(1, w)) * 1000) / 1000;
}
// (a soft term's size at a weight: its own size times w, its form as taken)
export const softSize = (key, v, w) => ({ ...v, [key]: Math.round(v[key] * w * 1e5) / 1e5 });
// (the last run's weight on this run's size: the same form, the same sign, its size as a share of this one's (the
// grid's size moved); else 0)
export function softFrom(prev, key, v) {
  if (!prev?.size || !(prev.w > 0) || !Number.isFinite(prev.size[key]) || !Number.isFinite(v?.[key]) || !v[key]) return 0;
  if ((SOFT_FORMS[key] ?? []).some((k) => prev.size[k] !== v[k])) return 0;
  const w = (prev.w * prev.size[key]) / v[key];
  return w > 0 ? Math.min(1, w) : 0;
}
// (the joint check: with the soft terms (t) the held-out log loss lower than without the last one (prev), and the
// eligible players' and every player's bias no larger than the hard-gated model's (base); its fails)
export function softJoint(base, t, prev = base) {
  const fails = [];
  const [a, b] = [t?.check?.llRaw, prev?.check?.llRaw];
  if (!(Number.isFinite(a) && Number.isFinite(b))) fails.push('log loss not measured');
  else if (!(a < b)) fails.push('log loss');
  const no = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= Math.abs(y);
  if (!no(biasRawOf(t?.check), biasRawOf(base?.check))) fails.push('bias');
  if (!no(biasRawOf(t?.all), biasRawOf(base?.all))) fails.push("all players' bias");
  return fails;
}
const MIN_GAIN = { c_rbOutPass: DRAFT_GAIN, c_backupRun: DRAFT_GAIN, lp: DRAFT_GAIN, bq: DRAFT_GAIN, vl: DRAFT_GAIN, sn: DRAFT_GAIN, ps: DRAFT_GAIN, po: DRAFT_GAIN, ep: DRAFT_GAIN, vcM: DRAFT_GAIN, c_blowS: DRAFT_GAIN, c_blowB: DRAFT_GAIN, c_newStart: DRAFT_GAIN, c_newCoach: DRAFT_GAIN, c_qb1Out: DRAFT_GAIN, c_qbDeep: DRAFT_GAIN, c_ppShare: 0.0001, rp: DRAFT_GAIN, nt: DRAFT_GAIN, ij: DRAFT_GAIN, ro: DRAFT_GAIN, ab: DRAFT_GAIN, c_aheadOut: DRAFT_GAIN, ot: DRAFT_GAIN, sk: DRAFT_GAIN, rx: DRAFT_GAIN, pl: DRAFT_GAIN, sp: DRAFT_GAIN, sl: DRAFT_GAIN, mk: DRAFT_GAIN, c_mSpread: DRAFT_GAIN, c_b2b: DRAFT_GAIN, c_oppB2b: DRAFT_GAIN, c_b2bS: DRAFT_GAIN, c_b2bB: DRAFT_GAIN, c_ppLean: DRAFT_GAIN, c_teamShots: DRAFT_GAIN, c_mTotal: DRAFT_GAIN, od: DRAFT_GAIN, c_oppOut: DRAFT_GAIN, c_oppD: DRAFT_GAIN, c_oppDB: DRAFT_GAIN, c_oppFront: DRAFT_GAIN, ex: DRAFT_GAIN, tr: DRAFT_GAIN, ...Object.fromEntries(ROUND_C.map((k) => [k, DRAFT_GAIN])) };
// (the defense tables' recency (od, audit #15): a table's sums times 1 - od at each new game of its side, so
// its latest games count most (0: the season's sums as before); tried late on the whole stat's strict gate, and
// where the opponent's power is 0 on every group (nothing reads the tables) with a at OD_A, the tables' recency
// maybe what they lacked)
const OD = [0.05, 0.1, 0.2];
const OD_A = 0.5;
// (the organic trend's ratio held to this either way)
const TREND_CAP = 2;
// (the recalibration by side (cs): the fewest of the fit window's lines a side takes to have its own; and the
// smallest line props.mjs's skew guard reads (below it a count's own skew is real), the held-out check's skew
// rows read from it too)
const CS_MIN = 300;
export const SKEW_MIN_LINE = 5;
// (the recalibration by side tried at all: kept on no stat on 2026-10-12, and its gate a full held-out replay
// on every stat each hourly run, so off: its check numbers (each side's log loss, the skew rows) still logged
// from the fit as it stands (floors.cs); true to try it again. Re-checked 2026-10-14 against the stats as they
// stand (the pull toward the middle settled): NFL receiving yards +0.0008 and rush+rec yards +0.0010, the over
// side's log loss worse on both (their standing under-projection, not a side's shape); passing TDs +0.0012, the
// under side too few lines; NHL shots +0.0007 with both sides no worse, but not held on two other stretches
// (the last 20%: +0.0004, the over side worse; the middle: +0.0002); NHL saves +0.0006, the under side too few;
// every NBA and MLB stat and NHL points +0.0001 or less)
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
// (round D, 2026-10-17, the Emanuel Wilson case: ab back in the search. A back who stepped into the lead's job
// (the lead out two games, 20 carries in each) was projected at his season's snap share leaning to his last
// game's (sr), his backup weeks in the blend: 16 to 17 carries against lines at 20. The same absence (ab: his
// games with the same regulars out, AB_MIN of them, his average there in place of his base) is the term that
// reads those games alone, and it's soft (SOFT_ON): left out on the hard gate, it comes in at a shrunk weight on
// its held-out evidence instead of all or nothing, which it couldn't in 2026-10-12's search. ro and ot stay out.
// Replayed 2026-10-17: on carries 0.25, +0.0014 held out (four times the floor) but its own 925 rows' bias -0.587
// to -0.612 carries a game, and "its own bias" isn't a fail the soft stage takes (SOFT_FAILS): left out; rushing
// yards 0 gain, its own bias larger too; not taken on the receiving stats. The owner's call, 2026-10-17: a term's own
// rows may run further under by OWN_TOL of the stat's unit for a gain of OWN_TOL_GAIN floors (ownBias), and within it
// the term comes in soft, never hard: ab on carries at its soft weight, Wilson's carries read his games in the lead's
// absence by that much)
const SHARE = ['ab'];
// (the carryover's last season games read (pl: his last PL_N, where last season had PL_MIN or more), and his
// last five's games (rx: this season's under RX_MIN))
const PL_N = 8;
const PL_MIN = 12;
const RX_MIN = 3;
// (the start-of-season prior (sp, audit #11; header): its powers tried; the games' worth each level of its table
// is pulled toward the one above it by (a cell toward his position's, his position's toward the whole stat's,
// that toward even); the learned level held to SP_CAP either way; the ages its cells split at (under 25, 25 to
// 27, 28 to 30, 31 and over; unknown its own); the early games its gate reads (his first SP_EARLY of the season),
// and their lines: at the median of his last SP_LINE_LAST games before the day, any season, SP_LINE_N or more
// (the book's line for a veteran's opener is about his usual: the check's own lines need 3 of this season's))
const SP = [0.5, 1, 2];
const SP_M = 20;
const SP_CAP = 0.5;
export const SP_AGES = [25, 28, 31];
export const SP_EARLY = 4;
const SP_LINE_N = 8;
// (each row's age bucket, read once (makeModel ageKey))
const SP_AGE_OF = new WeakMap();
const SP_LINE_LAST = 16;
// (the learned split (vl) too, on the rows with work missing tonight (matchups.mjs vac over 0))
// (the flags on a few of the rows, each judged on its own rows' bias (fitStat): the held-out rows it's on, this
// many or more, and the rest's no larger by more than this share of their mean actual (the lean refit with it
// moves them a little); ppShare, on every skater, judged on the whole stat's as before. The next man up's rows
// are the ones whose role moves up with the missing out of the order, the injury return's his 1st to RAMP-th
// games back from an absence of ia games or more)
const SUBGROUP = new Set(['bq', 'c_rbOutPass', 'c_backupRun', 'vl', 'c_newCoach', 'c_qb1Out', 'c_qbDeep', 'c_midSeason', 'c_aheadOut', 'rp', 'nt', 'ij', 'ab', 'c_b2b', 'c_oppB2b', 'c_b2bS', 'c_b2bB', 'c_blowS', 'c_blowB', 'c_newStart', 'c_oppD', 'c_oppDB', 'c_oppFront', 'sp', 'c_olOut', 'c_rbLoad', 'c_lastGame']);
// (a signed context term, about 0 over the whole stat (the lines' spread, c_mSpread: each game a favorite and
// an underdog, their errors cancelling in the whole stat's bias): judged on the whole stat's gate and on each
// sign's rows too (its value over SIGNED_AT, and under -SIGNED_AT: the favorites' rows and the underdogs',
// every player's, SUBGROUP_N or more each), each one's held-out bias no larger: a size that over-corrects one
// side and under-corrects the other passes the whole stat's gate alone)
const SIGNED = new Set(['c_mSpread', 'c_rbPass', 'c_homeBat', 'c_airTemp', 'c_windOutB', 'c_hitEnv', 'c_rzPass', 'c_rzPassM', 'c_rzGap', ...FEEDS.filter((k) => !FEED_ONE_SIDED.has(k))]);
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
// (the work missing's size fit again on the NBA's minutes base (vcM: vc's grid on top of sn, the whole stat's
// strict gate): left out on every stat on 2026-10-13 (points 0.75 to 0.5 held out -0.0002, rebounds 0.5 to 0.25
// -0.0006, its bias larger; assists, threes, pts+reb+ast no better size on the fit window), its search about
// 10s a stat every hourly run: true to try it again)
const TRY_VCM = false;
// (the NBA's positions and pace (audit #10), late terms on the whole stat's gate after the minutes base: ps 1
// the opponent's table and the priors by position group, 2 the role's table by it too; po the pace's power,
// pg its form (0 the other side's, 2 the game's expected over its average in his games, 3 the other side's
// over its average in his games), the opponent's power a fit again with it)
const PS = [{ ps: 1 }, { ps: 2 }];
// (the positions searched at all: kept on no stat on 2026-10-13 (points, assists, pts+reb+ast not taken on the
// fit window; rebounds 1 held out -0.001; threes 1 +0.0003 with its bias larger), its search and gate about
// 15s a run: true to try it again)
const TRY_PS = false;
// (who absorbs the work missing (vl, audit #7) searched at all: kept on no stat on 2026-10-13 (each size and
// split worse on the fit window than the even split the stat had, not taken; the history's table measured
// sane: header), its search five to ten replays a stat every hourly run and the NFL's matchups 8s to 13s with
// the learned cut read: true to try it again (props.mjs passes it to the matchups, so the cut is read only then))
export const TRY_VL = false;
const PO = [0.5, 1, 1.5];
// (pace's forms searched: 0 the other side's, 2 the game's expected over its average in his games, 3 the other
// side's over its average in his games; 1 (the game's expected over the league's: his own team's pace twice)
// off the search since 2026-10-13)
const PG_FORMS = [0, 2, 3];
const PACE_M = 5;
// (the NFL's expected plays tonight (audit #19b; props.mjs PLAYS), a late term on the whole stat's gate: ep its
// power, eg its form: 1 his team's expected plays (matchups.mjs playsX: its own plays a game times the other
// side's pace) over their average in his games this season, 2 the same over his team's actual plays in his games
// (playsA), 3 the game's expected total times his team's share of it (playsS: the time of possession's
// measure) over its average in his games, 4 that over the actual; each average pulled toward even by PLAYS_M
// games (playsFactor). In place of the defense's pace (pc: the other side's part is in it), never on top of it. Measured
// 2026-10-13 on every NFL volume stat with all four forms: the search took only 2 and 3 (passing attempts 0.5/3,
// kept; rushing yards 0.5/2 and rush+rec yards 0.5/2, passing yards, completions and receiving yards 3, left
// out), so 1 and 4 are off the search (EG_FORMS), kept readable)
const EP = [0.5, 1];
const EG_FORMS = [2, 3];
const PLAYS_M = 4;
// (a row's pace known: the league's read (matchups.mjs paceKnown); a row without the flag, by its paceG)
const paceKnownOf = (row) => row.paceKnown ?? Number.isFinite(row.paceG);
// (expected plays' factor (ep), by its form eg: tonight's (playsX, or playsS for 3 and 4) over its average in his
// games this season (the expected's for 1 and 3, his team's actual's for 2 and 4), the average pulled toward even
// by PLAYS_M games; tonight's not read, null (the stat as without it). Pulled toward even, not toward his own
// team's level: early in a season (his numbers leaning on last season's) a fast team's pace is partly put back
// on them, a slow team's taken off, fading as his games come in (the review of 2026-10-13). Measured the other
// way (2026-10-13: pulled toward the same average in his games last season, itself pulled toward even, so a fast
// team against an average side reads about even): passing attempts' gain fell to +0.0001 (ep 1/eg 3, held out
// 0.6219 to 0.6218, under the floor: left out), against +0.0011 this way, so the held-out games want some of his
// team's pace on top of his numbers early on; kept this way, the gate judging it each refit)
export const playsFactor = (row, cur, eg) => {
  const now = eg >= 3 ? row.playsS : row.playsX;
  if (!(Number.isFinite(now) && now > 0)) return null;
  const k = eg === 2 || eg === 4 ? 'ea' : eg === 3 ? 'es' : 'ex';
  return now / (((cur?.[`${k}s`] ?? 0) + PLAYS_M) / ((cur?.[`${k}n`] ?? 0) + PLAYS_M));
};
// (the team's game first, then its players' (audit #19c, tr: props.mjs STATS team, a late term on the whole
// stat's strict gate, tried after the rest but the pull toward the middle and the early exit): his team's players
// of the stat summed (S, before the lean: his own projection tonight, and each teammate's latest projection (his
// last game's, before it) times how many of the team's last SQUAD_N games this season he played in, a regular (in
// SQUAD_REG of them or more) not playing tonight left out, as the history counts an absence, one under it counted
// only where he played in the team's latest game, one back from an absence (a regular by his season's share of the
// team's games, missing its latest) at his season's share where he plays tonight; live, a regular's and a returning
// one's chance of playing in that place, a returning one only with a prop of his own on the board: squadIn,
// makeModel's squadMates) against the team's own expected total of it (T: its
// projected players' total a game this season, pulled toward last season's (8 games of it or more) or the
// league's by TR_K games, times the other side's allowed over the league's the same way: makeModel's squad); with
// tf 2 or 3, T times the betting lines' implied points for his side over their average to the power TF_MKT (a
// game without lines as tf 1); tf 4 the team's own total alone, the other side's allowed not read (every player's
// projection reads the opponent already: its a and posOpp). Each player's projection times (T / S)^tr, T / S held to TR_CAP either way: shrunk
// toward his share of the team's game by tr, never reset to it. None till his team has TR_MIN games this season
// and the league 20 team-games, or S or T unread: 1, the stat as without it. Not the sum of the ones who played
// tonight: who got in reads the game (a blowout's garbage time, a late scratch), which no one knows before it;
// measured that way first (2026-10-13), the NBA's held-out log loss fell 0.0136 on points and 0.0173 on
// pts+reb+ast, mostly that look-ahead)
const TR = [0.1, 0.25, 0.5, 0.75, 1];
const TF = [1, 2, 3, 4];
const TF_MKT = { 1: 0, 2: 0.5, 3: 1, 4: 0 };
const TR_K = 4;
export const TR_MIN = 2;
const TR_CAP = 2;
// (the team allocation mean-preserving (a stat marked trNorm, params.trn): its factor over the running mean of the
// factors before the day, their last TR_NORM rows, so it moves projections between players and games, never the
// level the lean was fit at. The plain factor's held-out level moved with its mean, the lean refit on the fit window
// not following it (receiving yards' eligible bias -0.7389 to -1.2602 a game at tr 0.25/tf 3, the stat left out on
// it); and it reads the lines' implied points over their average (squadMkt, tf 2 and 3) without that average's
// level mattering. Measured 2026-10-14 (props.mjs TEAM_NORM). Live, the history's latest mean (params.trNow))
export const TR_NORM = 3000;
export const trNormBuf = () => ({ cs: [0], pend: [], day: null });
// (a factor over the running mean of the ones before its day (nb: trNormBuf), its log lf then counted)
export function trNormOf(nb, day, lf, n) {
  if (nb.day !== day) {
    for (const y of nb.pend) nb.cs.push(nb.cs[nb.cs.length - 1] + y);
    nb.pend = [];
    nb.day = day;
  }
  nb.pend.push(lf);
  const len = nb.cs.length - 1;
  const k = Math.min(len, n);
  return k ? Math.exp((nb.cs[len] - nb.cs[len - k]) / k) : 1;
}
// (the latest mean, live's: the last n factors the history leaves, its last day's with them)
export function trNowOf(nb, n) {
  if (!nb) return 1;
  const all = [...nb.cs.slice(1).map((c, i) => c - nb.cs[i]), ...nb.pend].slice(-n);
  return all.length ? Math.exp(all.reduce((t, y) => t + y, 0) / all.length) : 1;
}
// (who's likely to play tonight (makeModel's squadMates): each of the team's players of the stat by how many of its
// last SQUAD_N games this season he played in; a regular, SQUAD_REG of them or more: his not playing an absence
// known before the game, as the history counts it)
export const SQUAD_N = 5;
export const SQUAD_REG = 0.6;
// (the team allocation's factor on a row (tr): sq its team-game's {S, T, m}; 1 off or unread)
export function squadF(params, sq) {
  const T = params.tf === 4 ? sq?.T0 : sq?.T;
  if (!params?.tr || !sq || !(sq.S > 0) || !(T > 0)) return 1;
  const t = T * (sq.m > 0 ? Math.pow(sq.m, TF_MKT[params.tf] ?? 0) : 1);
  return Math.pow(Math.min(TR_CAP, Math.max(1 / TR_CAP, t / sq.S)), params.tr);
}
// (the betting lines' implied points for a row's side over their average (tf 2 and 3), null without them)
export const squadMkt = (row, env) => {
  const v = row?.mkt?.[row.home ? 0 : 1];
  return Number.isFinite(v) && v > 0 && env?.avgMkt > 0 ? v / env.avgMkt : null;
};
const IJ_TRIES = [0, 0.5, 1].flatMap((ij) => [1, 2].flatMap((ia) => [0, 0.5, 1].filter((ir) => ij || ir).map((ir) => ({ ij, ia, ir }))));
const lateTries = (key, stat = {}) => (key === 'vl' ? (stat.vacLearned ?? []).flatMap((vs) => GRID.vc.filter((x) => x).map((vc) => ({ vl: 1, vs, vc }))) : key === 'ps' ? PS : key === 'po' ? PO.flatMap((po) => PG_FORMS.map((pg) => ({ po, pg }))) : key === 'ep' ? EP.flatMap((ep) => EG_FORMS.map((eg) => ({ ep, eg }))) : key === 'tr' ? TR.flatMap((tr) => TF.map((tf) => ({ tr, tf }))) : key === 'sn' ? SN.flatMap((sn) => SR.map((sr) => ({ sn, sr }))) : key === 'vcM' ? GRID.vc.filter((x) => x).map((vc) => ({ vc, vcM: vc })) : key === 'mk' ? MK.flatMap((mk) => GRID.b.map((b) => ({ mk, b }))) : key === 'rp' ? NU.map((nu) => ({ rp: 1, nu })) : key === 'ij' ? IJ_TRIES : key === 'bq' ? BQ.flatMap((bq) => BQ_K.map((bqK) => ({ bq, bqK }))) : key === 'ro' ? [{ ro: 1 }] : (GRID[key] ?? GRID.c).filter((x) => x).map((x) => ({ [key]: x })));
// (a late term's setting as the log says it: a flag's size, a compound's each part)
const sizeOf = (key, t) => (key === 'vcM' ? t.vc : Object.keys(t).length === 1 ? t[key] : Object.entries(t).map(([k, v]) => `${k} ${v}`).join('/'));
const SUBGROUP_N = 100;
// (the late terms on every row judged on the whole stat's bias with SUBGROUP_TOL (fitStat): the NBA's minutes base
// and its pace (po: a factor on every row, the lean refit with it), the NHL's ice-time base and its skaters' late
// flags. One budget a stat: each judged against the eligible bias before the first of them, so the tolerance
// doesn't compound term by term (the review of 2026-10-13: shots 0.0411 to 0.0444 to 0.0466, each step legal))
export const WHOLE_TOL = new Set(['sn', 'po', 'c_ppLean', 'c_teamShots', 'c_mTotal']);
const SUBGROUP_TOL = 0.005;
// (and the eligible players' among the rows it's on, judged too where this many or more)
const SUBGROUP_ELIG_N = 50;
// (a list's bias a game, projected less actual, its count and its mean actual; null with none)
const biasOf = (list) => {
  if (!list.length) return null;
  const mu = list.reduce((t, x) => t + x.p.mu, 0);
  const v = list.reduce((t, x) => t + x.v, 0);
  const out = { n: list.length, bias: Math.round(((mu - v) / list.length) * 10000) / 10000, mean: Math.round((v / list.length) * 1000) / 1000, ratio: mu ? Math.round((v / mu - 1) * 10000) / 10000 : null };
  // (the unrounded bias, not enumerable: the gates compare it (rawOf), the state saves the rounded one)
  Object.defineProperty(out, 'biasRaw', { value: (mu - v) / list.length, enumerable: false });
  return out;
};
// The gates' reads of a check's or a split's numbers, unrounded (round D, 2026-10-17: every held-out number the
// fit's gates compare is kept to 4 places for the logs and the state, and the compares read those: a gain of
// 0.00025 read as two log losses 4 places apart passed the 0.0003 floor, a bias larger by under 0.00005 read "no
// larger". The unrounded values ride along, not enumerable (check's llRaw, biasRaw, maeRaw; biasOf's biasRaw; a
// sub-check's llRaw), and every compare reads them through these; a value without its raw (an older saved
// check) falls back to the rounded one). The reported gains stay rounded to 4 places (r4)
export const llOf = (c) => (c && c.llRaw !== undefined ? c.llRaw : (c?.logLoss ?? null));
export const biasRawOf = (b) => (b && b.biasRaw !== undefined ? b.biasRaw : (b?.bias ?? null));
const maeOf = (c) => (c && c.maeRaw !== undefined ? c.maeRaw : (c?.mae ?? null));
// (a term's held-out gain: the log loss without it less with it, each unrounded; a side not measured counts 0, as
// the gates always read it)
export const gainOf = (off, tried) => (llOf(off) ?? 0) - (llOf(tried) ?? 0);
const r4 = (x) => (x === null || x === undefined ? null : Math.round(x * 10000) / 10000);
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
const fresh = () => ({ ...zero(), byGame: new Map(), wn: 0, wsum: 0, recent: [], rw: [], vac: [0, 0, 0], recentVac: [], shares: [], shw: [], shVac: [], srecent: [], qrecent: [], trecent: [], tail: [], lastSh: false, last: null });
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
  // (the early exit's chances (ex, exitTracker): learned whether or not it's on, read only where it is)
  const exits = exitTracker();
  const opps = new Map();
  const roles = new Map();
  const pos = new Map();
  // (a receiving stat's teams' targets a game, this season's and last's, and the league's a team-game)
  const teams = new Map();
  const lgT = { n: 0, sum: 0 };
  // (the team allocation's (tr, a stat marked team): each team's total of the stat a game, its projected players'
  // (the ones with a projection before it, as S sums), this season's and last's; the other side's allowed the
  // same way; the league's a team-game by season)
  const squads = new Map();
  const against = new Map();
  const lgSq = new Map();
  // (and each team's players of the stat in its last SQUAD_N games this season, by id, each with his latest
  // projection before the lean (his last game's, before it): S's teammates (squadMates))
  const rosters = new Map();
  const squadExp = (row, own0 = false) => {
    const lgOf = (s) => {
      const x = lgSq.get(s);
      return x?.n >= 20 ? x.sum / x.n : null;
    };
    const lg = lgOf(row.season) ?? lgOf(row.season - 1);
    const t = squads.get(row.team);
    if (!lg || !(t?.season === row.season && t.n >= TR_MIN)) return null;
    const own = (t.sum + TR_K * (t.prevN >= 8 ? t.prevSum / t.prevN : lg)) / (t.n + TR_K);
    const a = against.get(row.opp);
    const ac = a?.season === row.season ? a : null;
    if (own0) return own;
    return (own * (((ac?.sum ?? 0) + TR_K * lg) / ((ac?.n ?? 0) + TR_K))) / lg;
  };
  const val = (row) => Math.max(0, Math.round(row.s[stat.key]));
  // (his position group: the stat's (posGroup), or where it has positions of its own and the fit kept them
  // (ps, the NBA's guards, forwards and centers: props.mjs nbaPos), those: the opponent's table and the priors
  // by them)
  const posKey = (row) => (params.ps && stat.positions ? stat.positions(row.pos) : (stat.posGroup?.(row.pos) ?? row.pos));
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
  // (the backup quarterback's base (bq, round E 2026-10-17: the CHECK audit's biggest gap, a backup priced from the
  // few-start starters' pool while his own numbers and his team's never entered): his team's passing attempts a
  // game (teamPass: its quarterbacks' this season, pulled toward last season's (8 games or more), else the
  // league's, by 4 games; null till the league has 20 team-games), and his own career rate per pass attempt of the
  // stat (every game he threw in, relief work included: dbV over dbA), shrunk toward the few-start starters' per-
  // attempt rate (poolRate: their total over their attempts, every start's where the few-start ones have under
  // POOL_ATT) by bqK attempts of his own. The made-up part of a few-start starter's prior (under 10 starts) leans
  // to the team's attempts times his own rate by bq; the rest of the prior is his own starts', as before)
  const teamPass = new Map();
  const lgP = { n: 0, sum: 0 };
  const POOL_ATT = 500;
  const teamPassOf = (row) => {
    if (lgP.n < 20) return null;
    const t = teamPass.get(row.team);
    const cur = t?.season === row.season ? t : null;
    const last = cur ? { n: t.prevN, sum: t.prevSum } : t?.season === row.season - 1 ? t : null;
    const prior = last?.n >= 8 ? last.sum / last.n : lgP.sum / lgP.n;
    return ((cur?.sum ?? 0) + 4 * prior) / ((cur?.n ?? 0) + 4);
  };
  const poolRate = (row) => {
    const p = pos.get(posKey(row));
    return p && p.fqa >= POOL_ATT ? p.fqsum / p.fqa : p && p.qa >= POOL_ATT ? p.qsum / p.qa : null;
  };
  const half = (x, season) => (x.season === season ? 1 : x.season === season - 1 ? 0.5 : 0);
  // (the eligible players' average at his position: the prior for a player with no longer run of his own)
  const pool = (row) => {
    const p = pos.get(posKey(row));
    return p && p.n >= 20 ? p.sum / p.n : (env.mean ?? 1);
  };
  // (the pool's floor (lp): the lowest season rate among the eligible players at his position this season with
  // LP_FLOOR_N games or more; null under LP_FLOOR_PLAYERS of them (the season's first weeks: no floor, his prior as
  // it was))
  const poolFloor = (row) => {
    const p = pos.get(posKey(row));
    if (!p?.by) return null;
    let floor = null;
    let seen = 0;
    for (const o of p.by.values()) {
      if (o.season !== row.season || o.n < LP_FLOOR_N) continue;
      seen++;
      const r = o.sum / o.n;
      if (floor === null || r < floor) floor = r;
    }
    return seen >= LP_FLOOR_PLAYERS ? floor : null;
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
  // (the start-of-season prior (sp, audit #11): how a veteran's games run against his base where his own longer
  // run is his prior (last season's, the seasons before at half), learned as the replay goes from the eligible
  // players' games (each day's after it's projected), by his position, his age (SP_AGES; the NFL's birth dates,
  // playerlogs.mjs; unknown, the NBA's, its own) and whether he's on a new team (tonight's isn't the one he ended
  // last season with: his old role doesn't carry). Each game weighs by the prior's weight in his base (priorW: a
  // week-1 game about 1, a December one little), and is read against the level every eligible game of the stat
  // runs at (actual over base, all of them), so a cell holds what the prior's games miss past the stat's own
  // lean: g = sum of w(v - R b) over sum of w^2 b, a cell pulled toward his position's and that toward the whole
  // stat's by SP_M games' worth, held to SP_CAP. Applied (params.sp) as (1 + g)^(sp x priorW) on his base: in
  // full on a prior-only game, fading as his season's games come in. Learned whether or not it's on, on a stat
  // marked start (props.mjs START) only: the rest never read it, and its keys and tallies cost every replay)
  const SP_ON = !!stat.start;
  const spCells = new Map();
  const spAll = { v: 0, b: 0 };
  const bornOf = (row) => row.born ?? players.get(row.pid)?.born ?? null;
  // (his age's bucket read once a row (SP_AGE_OF): the same every replay, his birth date his row's or his earlier
  // games')
  const ageKey = (row) => {
    const hit = SP_AGE_OF.get(row);
    if (hit !== undefined) return hit;
    const born = bornOf(row);
    const age = born ? (Date.parse(row.date) - Date.parse(born)) / (365.25 * 864e5) : NaN;
    const i = Number.isFinite(age) ? SP_AGES.findIndex((a) => age < a) : null;
    const k = i === null ? 'u' : i < 0 ? `${SP_AGES[SP_AGES.length - 1]}+` : i === 0 ? `<${SP_AGES[0]}` : `${SP_AGES[i - 1]}-${SP_AGES[i] - 1}`;
    SP_AGE_OF.set(row, k);
    return k;
  };
  // (his team before this season: the one he ended last season with (from, kept at the season's turn), or, his
  // first game of a season not learned yet (live, a season's opener), his latest)
  const spTeam = (row, pl) => {
    const from = pl.season === row.season ? pl.from : pl.team;
    return from !== null && from !== undefined && row.team !== null && row.team !== undefined && String(from) !== String(row.team) ? 'new' : 'same';
  };
  const spLevels = (row, pl) => {
    const pk = posKey(row);
    return ['*', `pos ${pk}`, `${pk}|${ageKey(row)}|${spTeam(row, pl)}`];
  };
  const spRead = (keys) => {
    let g = 0;
    for (const k of keys) {
      const c = spCells.get(k);
      if (!c?.nw || !(c.den > 0)) continue;
      const bbar = c.den / c.nw;
      g = (c.num + SP_M * bbar * g) / (c.den + SP_M * bbar);
    }
    return Math.min(SP_CAP, Math.max(-SP_CAP, g));
  };
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
  // (the role's opponent table's key: his role, and with ps 2 his position group too (an NBA starting center
  // apart from a starting guard))
  const roleKeyOf = (row) => {
    const r = roleAt(row);
    return r && params.ps === 2 && stat.positions ? `${r}-${posKey(row)}` : r;
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
    // (the low-usage prior (lp, round D 2026-10-17, the owner's backlog: the NHL's Jiricek under 0.5 points,
    // projected 0.1 against a market near 0.35): a player under the eligible pool (row.eligible false: not among
    // his team's top six forwards or top two defensemen) has a prior of his own run alone, and the fit's lean and
    // recalibration never see his rows, so his projection rests on that run however thin. His prior leans by lp
    // toward the pool's floor (poolFloor: the lowest season rate among the eligible players at his position with
    // LP_FLOOR_N games or more, this season), the least a man in the pool produces: a second-pair defenseman is
    // shrunk toward the pool's floor, not its average. Judged on the rows it moves alone (the non-eligible held-out
    // rows' log loss at their medians and their bias: fitStat's lp gate); the eligible players' projections are
    // exactly as before, so the stat's own check can't move)
    const lpFloor = params.lp && row.eligible === false && has(stat, 'lp') ? poolFloor(row) : null;
    if (lpFloor !== null) prior = (1 - params.lp) * prior + params.lp * lpFloor;
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
    let bqUsed = null;
    let share = null;
    let minLean = null;
    if (params.qs && stat.starts && row.pos === 'QB' && row.qbStart) {
      const longQ = prev.qn + 0.5 * older.qn;
      const longQsum = prev.qsum + 0.5 * older.qsum;
      const draftQ = draftF(row, dr, 'q');
      let priorQ = longQ >= 10 ? longQsum / longQ : (longQsum + (10 - longQ) * poolStart(row) * draftQ) / 10;
      // (the backup quarterback's base (bq, above): the made-up part of a few-start starter's prior leans by bq to
      // his team's attempts a game times his own career rate per attempt, shrunk toward the pool's by bqK attempts)
      if (params.bq && longQ < 10) {
        const tAtt = teamPassOf(row);
        const pr = poolRate(row);
        if (tAtt !== null && pr !== null) {
          const ownRate = ((pl.dbV ?? 0) + params.bqK * pr) / ((pl.dbA ?? 0) + params.bqK);
          const madeUp = (1 - params.bq) * poolStart(row) * draftQ + params.bq * tAtt * ownRate;
          priorQ = (longQsum + (10 - longQ) * madeUp) / 10;
          bqUsed = { teamAtt: Math.round(tAtt * 10) / 10, own: Math.round(ownRate * 10000) / 10000, att: pl.dbA ?? 0, pool: Math.round(pr * 10000) / 10000 };
        }
      }
      draftUsed = longQ < 10 ? draftQ : 1;
      const rateQ = (cur.qsum + K * priorQ) / (cur.qn + K);
      const recentQ = cur.qrecent.length >= 3 ? avg(cur.qrecent) : rateQ;
      rate = (1 - params.qs) * rate + params.qs * rateQ;
      if (priorW !== null && cur.qn + K > 0) priorW = (1 - params.qs) * priorW + (params.qs * K) / (cur.qn + K);
      recent = (1 - params.qs) * recent + params.qs * recentQ;
      mode = 'starts';
    } else if (params.sn && (stat.snaps || stat.minutes) && row.pos !== 'QB') {
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
        // (the NBA's minutes (stat.minutes): his last MIN_RECENT kept games' average in the last game's place, a
        // minutes jump over three games the role's, not one game's foul trouble or overtime)
        const lastN = stat.minutes ? MIN_RECENT : 1;
        exp = (1 - sr * lw) * wavg(ks, kw) + sr * lw * avg(ks.slice(-lastN));
        if (stat.minutes) {
          // (the work his team was missing in the games the last three's lean reads (matchups.mjs vacs), for
          // vacHist below: a fill-in's minutes jump made with a starter out taken back down by vacF once he's
          // back, at the lean's own weight on those games, not the per-game blend's w)
          minLean = { lean: sr * lw, vac: avg(kept.slice(-lastN).map((i) => cur.shVac[i]?.[params.vs ?? 0] ?? 0)), season: wavg(ks, kw), recent: avg(ks.slice(-lastN)) };
          // (early in a season his minutes pulled toward last season's a game (4 games' counts or more) by
          // MIN_RECENT games' worth, so one short opener (a blowout, foul trouble) isn't his minutes; without
          // last season's, the per-game base till he has MIN_RECENT games of his own. Unmeasured: the history's
          // one season has no last season's, and a season's first 30% is the fit's warm-up, never scored)
          const prevMin = prev.shn >= 4 ? Math.min(1, prev.sh / prev.shn) : null;
          if (prevMin !== null) exp = (kept.length * exp + MIN_RECENT * prevMin) / (kept.length + MIN_RECENT);
          else if (kept.length < MIN_RECENT) (exp = null), (minLean = null);
        }
      } else if (covered) exp = prev.shn >= 4 ? (stat.minutes ? Math.min(1, prev.sh / prev.shn) : prev.sh / prev.shn) : null;
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
        mode = stat.minutes ? 'minutes' : 'snaps';
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
    // (the start-of-season prior (sp): a veteran's base (his own longer run his prior) by his cell's learned level
    // to the power sp x the prior's weight in it; none where his prior is the position's (a rookie's: the draft's
    // prior, dp) or the prior's weight unknown)
    const spKeys = SP_ON && longN >= 10 && Number.isFinite(priorW) && priorW > 0 ? spLevels(row, pl) : null;
    const spG = spKeys ? spRead(spKeys) : 0;
    const spF = spKeys && params.sp ? Math.pow(1 + spG, params.sp * priorW) : 1;
    const base = spF * trendF * rampF * ((1 - params.w) * rate + params.w * recent);
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
    const roleKey = roleKeyOf(row);
    if (myRole && Number.isFinite(params.roleK)) {
      const x = roles.get(`${row.opp}|${roleKey}`);
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
    // (the NBA's (stat.pace, po): the other side's possessions a game over the league's (pg 0: his own team's
    // pace is in his own numbers), or the game's expected (pg 1: the two teams' product), to the power po)
    // (pg 2: the game's expected over its average in his games this season, pulled toward even by PACE_M games:
    // his own team's pace, in his numbers already, counted once)
    // (pg 3: the other side's over its average in his games this season the same way: his own team's out of it
    // altogether. Pace not known tonight (the league's not read yet): 1 on either, not 1 over his average)
    // (pg 1 counts his own team's pace twice (it's in his numbers): off the search since 2026-10-13 (PG_FORMS),
    // kept readable for a fit made before)
    const paceNow = !stat.pace || !params.po ? 1 : params.pg >= 2 ? (!paceKnownOf(row) ? 1 : params.pg === 2 ? row.paceG / (((cur.pgs ?? 0) + PACE_M) / ((cur.pgn ?? 0) + PACE_M)) : row.pace / (((cur.ops ?? 0) + PACE_M) / ((cur.opn ?? 0) + PACE_M))) : ((params.pg ? row.paceG : row.pace) ?? 1);
    // (the NFL's expected plays (stat.plays, ep): his team's expected tonight over its average in his games, by
    // eg's form (EG_FORMS), to the power ep; in place of the defense's pace (pc), whose part it holds
    // (the average pulled toward even: playsFactor). A row without them (an older cache's, a team unseen), pc as before)
    const playsNow = stat.plays && params.ep ? playsFactor(row, cur, params.eg) : null;
    const paceF = stat.pace ? (params.po ? Math.pow(paceNow, params.po) : 1) : playsNow !== null ? Math.pow(playsNow, params.ep) : stat.volume && params.pc ? Math.pow(row.pace ?? 1, params.pc) : 1;
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
    let vacHist = (1 - params.w) * rateVac + params.w * recentVac;
    // (the NBA's minutes base (mode minutes): its part of the base made with the work missing in the games its
    // minutes read, the season's (rateVac) and the last three's at the lean's weight (minLean), blended in by sn
    // as the base is)
    if (mode === 'minutes' && minLean) vacHist = (1 - params.sn) * vacHist + params.sn * ((1 - minLean.lean) * rateVac + minLean.lean * minLean.vac);
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
    // (the base as it would be without the start-of-season prior's factor (sp: what its table learns against, so
    // the table's the same on or off; the same absence's blend (ab) with his base before it))
    const spB0 = spF === 1 || sameAvg === null ? baseUsed / spF : (1 - params.ab) * (base / spF) * vacF0 + params.ab * sameAvg;
    const vacF = sameAvg === null ? vacF0 : 1;
    const oppA = oppAOf(row);
    const raw = factorProduct(params, { base: baseUsed, opp, oppA, script, ctxF, funnelF, paceF, tgtF, vacF });
    // (the pull toward the stat's typical projection (sl, middle): none where it's off or rm unknown)
    const slF = middleF(params, raw);
    const mu = Math.max(0.05, (params.scale ?? 1) * raw * slF);
    return { mu, raw, slF, rate, recent, base: baseUsed, same: sameAvg === null ? null : { avg: sameAvg, n: row.sameGames.length, base, vacF: vacF0 }, sameOn, opp, oppA, volume, posOpp, roleOpp, role: myRole ?? null, roleKey: roleKey ?? null, roleUp: upOf(row).roleUp ?? null, ramp: rampF, trendF, back: IJ && isBack(row, ia) ? row.ret : null, funnel: row.funnel ?? null, funnelF, paceF, tgtF, vac: vacNow, vacHist, vacF, minutes: mode === 'minutes' && minLean ? { season: minLean.season * fullMin(stat), recent: minLean.recent * fullMin(stat) } : null, script, ctx, ctxF, prior, own: cur.n ? cur.sum / cur.n : null, games: cur.n, prevGames: prev.n, mode, share, starts: cur.qn, careerStarts: cur.qn + prev.qn + older.qn, K, priorW, bq: bqUsed, sp: spKeys ? { cell: spKeys[2], g: spG, f: spF, b0: spB0 } : null, draft: draftUsed !== 1 || draftY !== 1 ? { pick: dr.pick, factor: draftUsed, ...(draftY !== 1 ? { perTarget: draftY } : {}) } : null };
  };
  return {
    // (a row's projection, its early exit's chance on it (exitQ, exitF; exitMix reads them where ex is on))
    project(row) {
      const p = parts(row);
      const e = p ? exits.of(row) : null;
      if (p && e) (p.exitQ = e.q), (p.exitQ0 = e.q0), (p.exitF = e.f), (p.exitTier = e.tier);
      return p;
    },
    // (the start-of-season prior's table as learned (sp): each level's games and its level read (g: under 0 the
    // prior's games ran under the stat's level), the cells pulled toward their position's as projected)
    startTable() {
      const out = {};
      for (const [k, c] of spCells) {
        const keys = k === '*' ? ['*'] : k.startsWith('pos ') ? ['*', k] : ['*', `pos ${k.split('|')[0]}`, k];
        out[k] = { n: c.n, ne: c.nw > 0 ? Math.round((c.sw * c.sw) / c.nw) : 0, g: Math.round(spRead(keys) * 1000) / 1000 };
      }
      return out;
    },
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
    // (his team's own expected total of the stat tonight (tr's T), null till read: squadExp)
    squad(row, own = false) {
      return stat.team ? squadExp(row, own) : null;
    },
    // (his team's players of the stat now, each with how many of its last SQUAD_N games this season he played in (w:
    // 0 to 1), whether he played in its latest (last), his share of its games this season (sw) and whether he's a
    // regular back from an absence (back: sw SQUAD_REG or more, w under it, the latest missed), the ones in none of
    // the last games and not back left out, and his latest projection before the lean (mu; none yet, left out): S's
    // teammates, the replay's and live (props.mjs priceProps); null with none of its games this season learned)
    squadMates(team, season) {
      const t = rosters.get(String(team));
      if (!t || t.season !== season || !t.games.length) return null;
      const latest = t.games[t.games.length - 1];
      return [...t.seen]
        .map(([pid, s]) => {
          const w = s.games.filter((g) => t.games.includes(g)).length / t.games.length;
          const last = s.games.includes(latest);
          const sw = (s.n ?? 0) / Math.max(1, t.n ?? 0);
          return { pid, pos: s.pos, mu: s.mu, w, last, sw, back: !last && w < SQUAD_REG && sw >= SQUAD_REG };
        })
        .filter((x) => (x.w > 0 || x.back) && x.mu > 0);
    },
    // (a day's rows learned together, after all of them were projected)
    learn(rows) {
      // (the team allocation's team-games (tr): their projected players' total)
      const sq = stat.team ? new Map() : null;
      // (a receiving stat's team-games: their targets, the day's rows' total, unread where a row's are)
      const games = new Map();
      // (and every team-game's pass attempts, the backup's base (bq): rolled into teamPass once the day is learned)
      const passGames = new Map();
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
        if (sq) {
          let t = rosters.get(String(row.team));
          if (!t || t.season !== row.season) t = { season: row.season, games: [], seen: new Map(), n: 0, all: new Set() };
          if (!t.all.has(row.game)) t.all.add(row.game), t.n++;
          if (!t.games.includes(row.game)) t.games = [...t.games, row.game].slice(-SQUAD_N);
          const s = t.seen.get(String(row.pid)) ?? { pos: row.pos, games: [], mu: null, n: 0, all: new Set() };
          if (!s.all.has(row.game)) s.all.add(row.game), s.n++;
          s.pos = row.pos;
          if (before) s.mu = before.mu / (params.scale ?? 1);
          if (!s.games.includes(row.game)) s.games = [...s.games, row.game].slice(-SQUAD_N);
          t.seen.set(String(row.pid), s);
          rosters.set(String(row.team), t);
        }
        if (sq && before) {
          const k = row.game + '|' + row.team;
          const g = sq.get(k) ?? { team: row.team, opp: row.opp, season: row.season, sum: 0 };
          g.sum += v;
          sq.set(k, g);
        }
        if (before) {
          // (the opponent's tables: by position, and by role where the row has one)
          const tally = (table, key) => {
            let o = table.get(key);
            if (!o || o.season !== row.season) {
              const last = o && o.season === row.season - 1 ? o : null;
              o = { season: row.season, n: 0, got: 0, usual: 0, prevN: last?.n ?? 0, prevGot: last?.got ?? 0, prevUsual: last?.usual ?? 0 };
            }
            // (its recency (od): every sum, last season's carried part too, times 1 - od at each new game of
            // this side, so its latest games count most; its own game's rows alike)
            if (params.od && o.g !== undefined && o.g !== row.game) for (const k of ['n', 'got', 'usual', 'prevN', 'prevGot', 'prevUsual']) o[k] *= 1 - params.od;
            o.g = row.game;
            o.n++;
            o.got += v;
            // (the NBA's pace taken out first where it's on (stat.pace, po): the tables learn what the other
            // side allows past its possessions, not its pace a second time)
            o.usual += before.base * (stat.pace ? before.paceF : 1);
            table.set(key, o);
          };
          tally(opps, `${row.opp}|${posKey(row)}`);
          const myRole = roleKeyOf(row);
          if (myRole) tally(roles, `${row.opp}|${myRole}`);
          // (the start-of-season prior's table (sp): the eligible players' games, each against his base without
          // the term's own factor, read against the stat's level (every eligible game's actual over base so far)
          // and weighed by the prior's weight in it, his levels each)
          if (SP_ON && row.eligible !== false && before.base > 0) {
            const b0 = before.sp?.b0 ?? before.base;
            if (before.sp && before.priorW > 0) {
              const R = spAll.b > 0 ? spAll.v / spAll.b : 1;
              const w = before.priorW;
              for (const k of spLevels(row, pl)) {
                const c = spCells.get(k) ?? { num: 0, den: 0, nw: 0, sw: 0, n: 0 };
                c.num += w * (v - R * b0);
                c.den += w * w * b0;
                c.nw += w * w;
                c.sw += w;
                c.n++;
                spCells.set(k, c);
              }
            }
            spAll.v += v;
            spAll.b += b0;
          }
        }
        // (his seasons: this one, last, and the ones before it (career))
        let p = pl;
        if (!p) p = { season: row.season, cur: fresh(), prev: zero(), career: zero(), dbA: 0, dbV: 0 };
        else if (p.season !== row.season) {
          const consecutive = p.season === row.season - 1;
          const before = addAcc(p.career, p.prev);
          p = {
            season: row.season,
            cur: fresh(),
            prev: consecutive ? { ...addAcc(zero(), p.cur), vac: p.cur.vac, tail: p.cur.tail } : zero(),
            career: consecutive ? before : addAcc(before, p.cur),
            // (a quarterback's career pass attempts and the stat with them, every season's: the backup's base (bq))
            dbA: p.dbA ?? 0,
            dbV: p.dbV ?? 0,
            healthy: p.healthy,
            settled: p.settled,
            // (the team he ended last season with: the start-of-season prior's new team (sp))
            from: p.team,
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
        // (the game's expected possessions over the league's in his games this season, and the other side's (the
        // NBA's pace, pg 2 and 3: tonight's read against them); only games whose pace was known, a placeholder 1
        // from before the league's was read left out, not pulling the average toward even)
        // (the NFL's expected plays in his games this season (ep): the expected (playsX, playsS) and his team's actual
        // (playsA), each where read)
        if (stat.plays) {
          for (const [k, v] of [['ex', row.playsX], ['es', row.playsS], ['ea', row.playsA]]) {
            if (!(Number.isFinite(v) && v > 0)) continue;
            p.cur[`${k}s`] = (p.cur[`${k}s`] ?? 0) + v;
            p.cur[`${k}n`] = (p.cur[`${k}n`] ?? 0) + 1;
          }
        }
        if (stat.pace && paceKnownOf(row)) {
          p.cur.pgs = (p.cur.pgs ?? 0) + row.paceG;
          p.cur.pgn = (p.cur.pgn ?? 0) + 1;
          p.cur.ops = (p.cur.ops ?? 0) + row.pace;
          p.cur.opn = (p.cur.opn ?? 0) + 1;
        }
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
          // (the NBA's minutes (stat.minutes) held to a regulation game's 48 in what's expected tonight, an
          // overtime game's 53 a full game; the per-minute rate (sh, ss) takes them all)
          p.cur.shares = [...p.cur.shares, stat.minutes ? Math.min(1, sh) : sh].slice(-20);
          p.cur.shw = [...p.cur.shw, wt].slice(-20);
          p.cur.shVac = [...p.cur.shVac, row.vacs ?? [0, 0, 0]].slice(-20);
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
        // (a quarterback's pass attempts in the game (a start's or relief's) and the stat with them: his career
        // rate per attempt, the backup's base (bq); and his team's attempts in the game (teamPass, rolled below))
        const att = row.pos === 'QB' && Number.isFinite(row.s.passAtt) ? Math.max(0, row.s.passAtt) : 0;
        if (row.pos === 'QB') {
          p.dbA = (p.dbA ?? 0) + att;
          p.dbV = (p.dbV ?? 0) + v;
          const tk = `${row.game}|${row.team}`;
          const tp = passGames.get(tk) ?? { team: row.team, season: row.season, att: 0 };
          tp.att += att;
          passGames.set(tk, tp);
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
        // (his birth date and his latest game's team: the start-of-season prior's age and new team (sp))
        p.born = row.born ?? pl?.born ?? null;
        if (row.team !== null && row.team !== undefined) p.team = row.team;
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
        const q = pos.get(k) ?? { n: 0, sum: 0, sh: 0, ss: 0, qn: 0, qsum: 0, qa: 0, fqn: 0, fqsum: 0, fqa: 0, tg: 0, ts: 0, by: new Map() };
        if (row.eligible !== false) {
          q.n++;
          q.sum += v;
          // (each eligible player's own season run, for the pool's floor (lp: poolFloor); a new season starts his over)
          const own = q.by.get(row.pid);
          if (own && own.season === row.season) (own.n++), (own.sum += v);
          else q.by.set(row.pid, { season: row.season, n: 1, sum: v });
          if (sh !== null) (q.sh += sh), (q.ss += v);
          if (tg?.ok && tg.sum > 0) (q.tg += row.s.targets), (q.ts += v);
        }
        // (the starters' pool: every quarterback's start, eligible or not (a backup's start is a start), and the
        // starts of the ones with fewer than 10 before it apart)
        if (started) {
          q.qn++;
          q.qsum += v;
          q.qa += att;
          if (startsBefore < 10) (q.fqn++), (q.fqsum += v), (q.fqa += att);
        }
        pos.set(k, q);
      }
      exits.learn(rows);
      // (the team allocation's totals (tr): each team's a game and the other side's allowed, last season's kept
      // apart, and the league's)
      if (sq) {
        const add = (map, key, g) => {
          let t = map.get(key);
          if (!t || t.season !== g.season) {
            const last = t && t.season === g.season - 1 ? t : null;
            t = { season: g.season, n: 0, sum: 0, prevN: last?.n ?? 0, prevSum: last?.sum ?? 0 };
          }
          t.n++;
          t.sum += g.sum;
          map.set(key, t);
        };
        for (const g of sq.values()) {
          add(squads, g.team, g);
          add(against, g.opp, g);
          const l = lgSq.get(g.season) ?? { n: 0, sum: 0 };
          l.n++;
          l.sum += g.sum;
          lgSq.set(g.season, l);
        }
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
      // (the teams' pass attempts a game (the backup's base, bq), the same way; a team-game with no attempts read none)
      for (const g of passGames.values()) {
        if (!(g.att > 0)) continue;
        let t = teamPass.get(g.team);
        if (!t || t.season !== g.season) {
          const last = t && t.season === g.season - 1 ? t : null;
          t = { season: g.season, n: 0, sum: 0, prevN: last?.n ?? 0, prevSum: last?.sum ?? 0 };
        }
        t.n++;
        t.sum += g.att;
        teamPass.set(g.team, t);
        lgP.n++;
        lgP.sum += g.att;
      }
    },
  };
}

// (his team's sum (tr's S) from its players now (squadMates, before tonight's game): each one's latest projection
// times how many of its last games he played in and his chance of playing tonight (in(id): 0 to 1), his own taken
// out and put back at his projection tonight, in full (mine, before the lean); none read, null)
export function squadSum(mates, pid, mine, inOf, base = null) {
  if (!mates?.length || !(mine > 0)) return null;
  const b = base ?? squadBase(mates, inOf);
  return b.sum - (b.part.get(String(pid)) ?? 0) + mine;
}
// (whether each teammate counts in S tonight, one rule for the replay and the live price: a regular (SQUAD_REG of
// the team's last SQUAD_N games or more) at reg(x), his playing tonight; one under it who played in the team's
// latest at 1 either way (who gets in reads the game; live, the injury report not read for him either, so the price
// is the fit's); one back from an absence (a regular by his season's share of the team's games, sw, missing its
// latest: back) at back(x), at his season's share in place of his last games' (squadBase), so a starter's return
// counts his work in S and doesn't lift his teammates; the rest none. The replay reads reg and back as whether he
// played tonight, the history's absence as the vacated terms read it; live, his chance of playing (props.mjs
// priceProps), one back only with a prop of his own on the game's board)
export const squadIn = (reg, back = reg) => (x) => (x.w >= SQUAD_REG ? reg(x) : x.last ? 1 : x.back ? back(x) : 0);
// (every teammate's part of it, summed, and each one's (by id): once a team-game, each row's sum from it; one back
// from an absence at his season's share)
export function squadBase(mates, inOf) {
  const part = new Map();
  let sum = 0;
  for (const x of mates ?? []) {
    const v = (x.back ? Math.max(x.w, x.sw) : x.w) * x.mu * Math.min(1, Math.max(0, inOf(x)));
    part.set(String(x.pid), v);
    sum += v;
  }
  return { sum, part };
}

// (the team allocation (tr) on a day's projections, where it's on or searched (params.tr, params.trRead: the rest of
// the replays never read it): each row's S (squadSum by squadIn: his teammates by the team's last games,
// a regular not in tonight's game out, as the history counts an absence; the rest at their share of its last games
// where they played in its latest, whether or not they get in tonight (who got in reads the game), none where they
// didn't (an absence going on, or out of the rotation), but a regular back from an absence in tonight's game at his
// season's share (his return known before it, as a regular's absence is)), its team's expected total (T, the
// model's squad; T0 without the other side's allowed, tf 4's) and the lines' implied points for its side (m), on
// the row (p.squad, with sum: the ones who played summed, the log's gap), and each projection times squadF (1 where
// it's off; the projection before it on p.preTr, the pull toward the middle's search's). batch: the day's rows,
// every one who played)
function squadUp(list, batch, params, env, m) {
  const by = new Map();
  for (const x of list) {
    const k = x.row.game + '|' + x.row.team;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(x);
  }
  const played = new Set(batch.map((r) => r.game + '|' + r.team + '|' + r.pid));
  const scale = params.scale ?? 1;
  for (const [k, xs] of by) {
    const row = xs[0].row;
    const mates = m.squadMates(row.team, row.season);
    const inOf = squadIn((x) => (played.has(k + '|' + x.pid) ? 1 : 0));
    const T = m.squad(row);
    const T0 = m.squad(row, true);
    const mk = squadMkt(row, env);
    const sum = xs.reduce((t, x) => t + x.p.mu, 0) / scale;
    const base = mates?.length ? squadBase(mates, inOf) : null;
    for (const x of xs) {
      x.p.squad = { S: squadSum(mates, x.row.pid, x.p.mu / scale, inOf, base), T, T0, m: mk, sum };
      let f = squadF(params, x.p.squad);
      if (params.trn && f !== 1) f /= trNormOf((m.trNorm ??= trNormBuf()), row.date.slice(0, 10), Math.log(f), params.trn);
      if (f !== 1) (x.p.preTr = x.p.mu), (x.p.mu = Math.max(0.05, x.p.mu * f));
    }
  }
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
    if (win) {
      const list = [];
      for (const row of batch) {
        const p = m.project(row);
        if (p) list.push({ row, p, v: Math.max(0, Math.round(row.s[stat.key])), win });
      }
      if (stat.team && (params.tr || params.trRead)) squadUp(list, batch, params, env, m);
      for (const x of list) out.push(x);
    }
    m.learn(batch);
    i = j;
  }
  return { model: m, out };
}

const R = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 6, 8, 10, 16, 30, 60, 150];
// (the recency weight's half-lives tried, in seasons (hl: fitStat), a season a year of days; the share of the fit
// window its pick fits on, the rest scoring it; TRY_HL false: not tried, every stat as before)
export const TRY_HL = true;
export const HL = [8, 4, 3, 2, 1];
// (the held-out tries a stat's half-life gets, the best inside first, then softer: fitStat)
export const HL_TRIES = 3;
// (each sport's rule era (2026-10-18, the owner's): the NFL's dynamic kickoff (2024), MLB's pitch clock and shift ban
// (2023); none for the NBA's and NHL's two-season windows. The weights tried on the games before it: ERA_W)
export const ERAS = { nfl: '2024-09-01', mlb: '2023-03-30', nba: null, nhl: null };
export const ERA_W = [0.5, 0.25];
export const INNER_FIT = 0.7;
const YEAR_MS = 365.25 * 864e5;
// (the dispersion's growth with the projection tried: rAt)
const RK = [0.5, 1];
// (a window's rows the fit scores: the eligible players', the ones a book posts props for and the desk bets,
// where there are enough; else all)
const scored = (out, win) => {
  const all = out.filter((x) => x.win === win);
  const mine = all.filter((x) => x.row.eligible !== false);
  return mine.length >= 200 ? mine : all;
};
// (a window's log-likelihood at its best dispersion, at a growth rk about rm, and the early exit's ex where it's on)
// (wOf: each row's weight, the recency's (hl); none, every row 1)
function scoreOf(out, win, shape = { rk: 0, rm: 1 }, wOf = null) {
  const list = scored(out, win);
  let best = null;
  for (const r of R) {
    let ll = 0;
    const p = { r, ...shape };
    for (const x of list) ll += (wOf ? wOf(x) : 1) * chanceLog(x.v, x.p.mu, p, exitMix(p, x.p));
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
// ones' catches 12% to 16% under the projection, the short ones' 5% to 9%: the listed absences' (the injury
// report's; the role backtest 2026-10-13, eligible 2016 on, without the term: deep receptions -7.4%, rush+rec
// yards -13.3%; short -5.0%, -6.9%). The fit's flag reads the unlisted ones too (a benching), whose deep ones ran
// -6.6% and -6.9% and short ones -2.0% and -2.7% (held out +7.8%, +10.4%): the fitted size a blend of the two)
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
// (an NBA bench player who started his team's last game (c_newStart: props.mjs CTX newStart), a 0 or 1 flag)
const NEW_START = [-0.1, -0.05, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2];
// (an NHL skater's power-play time's lean (c_ppLean: a log, about -1 to 1) and his side's expected shots
// (c_teamShots: a log, about -0.25 to 0.25, its size the power of the ratio): props.mjs CTX)
const PP_LEAN = [-0.2, -0.1, 0.05, 0.1, 0.2, 0.3, 0.5];
const TEAM_SHOTS = [-0.25, 0.25, 0.5, 0.75, 1];
// (the NHL's market total (c_mTotal: the betting total over 6 goals, a log, about -0.1 to 0.1), its power)
const M_TOTAL = [-0.5, 0.5, 1, 1.5];
// (the other side's key defenders out tonight (audit #15; props.mjs CTX): the NBA's production missing per 10
// (c_oppOut, about its average: a star out about 4 over it), the NHL's top-four defensemen's time on ice missing over a game's 60 (c_oppD, one
// about 0.4), the NFL's regulars' defensive snap shares missing, its secondary's (c_oppDB) and its front seven's
// (c_oppFront, one starter about 0.9): a few percent a starter either way)
const OPP_OUT = [-0.01, 0.005, 0.01, 0.02];
const OPP_D = [-0.1, 0.1, 0.2, 0.4];
const OPP_DEF = [-0.03, 0.03, 0.06, 0.1];
// (the early exit's sizes tried (ex): times the short game's chance learned)
const EX = [0.5, 1, 1.5, 2, 3, 4];
// (round D, 2026-10-17, the owner's backlog, each a late flag on its own rows (SUBGROUP), soft where the gate
// leaves it out: c_rbOutPass, his team's lead back out, on a quarterback's passing stats (props.mjs CTX rbOutPass:
// the same reading as rb1Out, 0 to 1, the quarterback's rows alone; the backs' and receivers' rb1Out stays as it
// was), either way; c_backupRun, a backup quarterback's own rushing (CTX backupRun: he's his team's passer and
// not its lead quarterback by the work, matchups.mjs qbBackup), the role backtest's +6% to +12% over the
// projection the reason for the negative sizes; lp, the low-usage prior (below: has, poolFloor), 0.25 to 1)
const LP_FLOOR_N = 5;
const LP_FLOOR_PLAYERS = 5;
const RB_OUT_PASS = [-0.05, -0.025, 0.025, 0.05, 0.075, 0.1];
const BACKUP_RUN = [-0.2, -0.15, -0.1, -0.075, -0.05, 0.05, 0.1];
const LP = [0.25, 0.5, 0.75, 1];
// (bq, the backup quarterback's base (round E, 2026-10-17): the made-up part of a few-start starter's prior leans by
// bq to his team's attempts a game times his own career rate per attempt, that rate shrunk toward the few-start
// starters' by bqK attempts (50 about a start and a half, 400 about ten starts); off at 0, soft where the gate leaves
// it out (SOFT_ON), its own rows the few-start starters' (SUBGROUP))
const BQ = [0.25, 0.5, 0.75, 1];
const BQ_K = [50, 150, 400];
const GRID = { ...CARRY_GRID, c_rbOutPass: RB_OUT_PASS, c_backupRun: BACKUP_RUN, lp: LP, bq: BQ, sp: SP, sl: SL, ot: [0.25, 0.5, 0.75, 1], ab: [0.25, 0.5, 0.75, 1], nt: [0.5, 0.75, 1], c_aheadOut: AHEAD_OUT, aPos: [0, 0.25, 0.5, 0.75, 1], kd: [0, 0.1, 0.25, 0.5], dp: [0, 0.5, 1], qs: [0, 0.5, 1], K: [2, 4, 8, 16, 32], w: [0, 0.2, 0.4, 0.6], a: [0, 0.5, 1], b: [-0.5, 0, 0.5, 1, 1.5], c: [-0.3, -0.15, -0.07, 0, 0.07, 0.15, 0.3], roleK: [Infinity, 32, 16, 8, 4, 2], fun: [0, 1, 2, 4, 8], pc: [0, 0.5, 1, 1.5], tg: [0, 0.5, 1], vc: [0, 0.25, 0.5, 0.75, 1, 1.25], c_oppShots: POWER, c_slot: POWER, c_leash: POWER, c_precip: [-0.04, -0.02, -0.01, 0, 0.01, 0.02], c_oppGoalie: [-0.6, -0.4, -0.2, -0.1, 0, 0.1, 0.2], c_rb1Out: RB1_OUT, c_newCoach: COACH, c_qb1Out: QB1_OUT, c_qbDeep: QB_DEEP, c_ppShare: PP_SHARE, c_mSpread: M_SPREAD, c_b2b: B2B, c_oppB2b: B2B, c_b2bS: B2B, c_b2bB: B2B, c_blowS: B2B, c_blowB: B2B, c_newStart: NEW_START, c_ppLean: PP_LEAN, c_teamShots: TEAM_SHOTS, c_mTotal: M_TOTAL, c_oppOut: OPP_OUT, c_oppD: OPP_D, c_oppDB: OPP_DEF, c_oppFront: OPP_DEF, ex: EX, ...ROUND_C_GRID };
// (the vacated work's split, by index into matchups.mjs's: in proportion, flatter, equally, for each measure
// of work the stat has (vacSplits: 3 a measure); searched with vc)
const splitsOf = (stat) => Array.from({ length: stat.vacSplits ?? 3 }, (_, i) => i);
// (the snaps-based rate's blend and the expected share's weight on his last game (sr), searched together: the
// weight means nothing without the blend)
const SN = [0.5, 1];
const SR = [0, 0.25, 0.5, 0.75, 1];
// (the NBA's minutes: his last games' average his expected minutes lean to by sr, in the last game's place)
const MIN_RECENT = 3;
// (a full game's minutes, the minutes base's (props.mjs STATS minutes): the NBA's 48 (true reads as 48), the
// NHL's 60)
export const fullMin = (stat) => (typeof stat?.minutes === 'number' ? stat.minutes : 48);
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
  : key === 'sn' ? !!(stat.snaps || stat.minutes)
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
  : key === 'sp' ? !!stat.start
  : key === 'lp' ? !!stat.lowPool
  : key === 'bq' ? !!stat.starts
  : key === 'ps' ? !!stat.positions
  : key === 'po' ? !!stat.pace
  : key === 'ep' ? !!stat.plays
  : key === 'tr' ? !!stat.team
  : key === 'od' ? !!stat.recency
  : key === 'ex' ? !!stat.exit
  : key === 'vl' ? !!(TRY_VL && stat.vacated && stat.vacLearned?.length)
  : !!stat.volume;
// (whether fitStat searches a term on a stat (the tests' read: vl off the search while TRY_VL is false))
export const searched = (stat, key) => has(stat, key);

// (a window's chances of going over a line at each player's median so far, and what happened)
function linePairs(list, params) {
  const hist = new Map();
  const out = [];
  for (const x of [...list].sort((a, b) => a.row.date.localeCompare(b.row.date))) {
    const past = (hist.get(x.row.pid) ?? []).filter((h) => h.season === x.row.season).map((h) => h.v);
    if (past.length >= 3) {
      const vals = past.sort((a, b) => a - b);
      const line = Math.floor(vals[Math.floor(vals.length / 2)]) + 0.5;
      out.push({ x, vals, line, p: chanceOver(line, x.p.mu, params, exitMix(params, x.p)), over: x.v > line ? 1 : 0 });
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

// (the recalibration that best fits a window's chances to what happened; wOf, each pair's row's weight: the
// recency's (hl), none every one 1)
function fitRecal(pairs, wOf = null) {
  let best = { ll: Infinity, cal: [0, 1] };
  const ws = pairs.map((x) => (wOf ? wOf(x.x) : 1));
  for (let a = -0.6; a <= 0.6001; a += 0.05) {
    for (let b = 0.5; b <= 1.6001; b += 0.05) {
      let ll = 0;
      for (let i = 0; i < pairs.length; i++) {
        const x = pairs[i];
        const p = recal(x.p, [a, b]);
        ll -= ws[i] * Math.log(x.over ? p : 1 - p);
      }
      if (ll < best.ll) best = { ll, cal: [Math.round(a * 100) / 100, Math.round(b * 100) / 100] };
    }
  }
  return best.cal;
}

// A stat's context terms to fit (c_<key>): its ctx's, the betting lines' spread (c_mSpread) only where the
// history has the lines (env.mktN: the rows with them; without, it reads 0 on every row and isn't fit)
export const fitCtxs = (stat, env) => ctxKeys(stat).map((k) => `c_${k}`).filter((k) => (k !== 'c_mSpread' || env?.mktN > 0) && (k !== 'c_mTotal' || env?.totN > 0));

// A stat's settings fit (one at a time, twice round) on the fit window, then checked on the last 30%
export function fitStat(stat, rows, env) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 300) return null;
  const at = (q) => sorted[Math.floor(sorted.length * q)].date.slice(0, 10);
  const cuts = [at(0.3), at(0.7)];
  // (the start-of-season prior's early lines (sp): each row's at the median of his last SP_LINE_LAST games before
  // its day, any season, SP_LINE_N or more; and the held-out early games it's judged on counted before any replay
  // (eligible, his first SP_EARLY of a season after the history's first, 10 games of his before it), and the fit
  // window's the same (spFit: its size is picked there, so with none there every size ties): too few of either
  // and it isn't searched (the NBA's history one season so far: its first openers with a prior of their own,
  // 2026-27's, are held out first; searched once a season's are in the fit window and the next's held out)
  const spLines = new Map();
  let spHeld = 0;
  let spFit = 0;
  if (has(stat, 'sp')) {
    const hist = new Map();
    const first = sorted[0].season;
    let i = 0;
    while (i < sorted.length) {
      const day = sorted[i].date.slice(0, 10);
      let j = i;
      while (j < sorted.length && sorted[j].date.slice(0, 10) === day) j++;
      const batch = sorted.slice(i, j);
      for (const row of batch) {
        const h = hist.get(row.pid);
        if (h?.vals.length >= SP_LINE_N) {
          const vals = h.vals.slice(-SP_LINE_LAST).sort((a, b) => a - b);
          spLines.set(row, Math.floor(vals[Math.floor(vals.length / 2)]) + 0.5);
        }
        const inSeason = h?.season === row.season ? h.inSeason : 0;
        const before = h ? h.vals.length - inSeason : 0;
        if (day >= cuts[0] && row.eligible !== false && row.season > first && inSeason < SP_EARLY && before >= 10) {
          if (day >= cuts[1]) spHeld++;
          else spFit++;
        }
      }
      for (const row of batch) {
        const h = hist.get(row.pid) ?? { vals: [], season: row.season, inSeason: 0 };
        if (h.season !== row.season) (h.season = row.season), (h.inSeason = 0);
        h.vals.push(Math.max(0, Math.round(row.s[stat.key])));
        h.inSeason++;
        hist.set(row.pid, h);
      }
      i = j;
    }
  }
  // (a window's early games (sp: the eligible players', his first SP_EARLY of the season, a prior of his own):
  // their log loss at the early lines (recalibrated as the check is), their count and lines, and their bias)
  const earlyOf = (o, pc) => {
    const list = o.filter((x) => x.win === 2 && x.row.eligible !== false && x.p.sp && x.p.games < SP_EARLY);
    let ll = 0;
    let lines = 0;
    for (const x of list) {
      const line = spLines.get(x.row);
      if (line === undefined) continue;
      const p = Math.min(0.995, Math.max(0.005, recal(chanceOver(line, x.p.mu, pc, exitMix(pc, x.p)), calAt(pc, x.p.mu, line))));
      ll -= Math.log(x.v > line ? p : 1 - p);
      lines++;
    }
    const b = biasOf(list);
    const out = { n: list.length, lines, logLoss: lines ? Math.round((ll / lines) * 10000) / 10000 : null, bias: b?.bias ?? null, ratio: b?.ratio ?? null };
    Object.defineProperty(out, 'llRaw', { value: lines ? ll / lines : null, enumerable: false });
    Object.defineProperty(out, 'biasRaw', { value: biasRawOf(b), enumerable: false });
    return out;
  };
  // (the betting lines' terms (mk, c_mSpread) only where the history has the lines (fitCtxs, env.mktN: the rows
  // with them); without, nothing to fit, the stat as before)
  const ctxs = env.ctx ? fitCtxs(stat, env) : [];
  const aPos = aKeys(stat);
  let params = { K: 4, w: 0.2, a: 0.5, b: 0.5, ...OPTIONAL, ...Object.fromEntries(aPos.map((k) => [k, null])), ...Object.fromEntries(ctxs.map((k) => [k, 0])), ...(stat.vacated ? { vs: 0 } : {}), ...(stat.snaps || stat.minutes ? { sr: 0 } : {}), ...(stat.perTarget ? { yk: 40 } : {}), ...(stat.trNorm ? { trn: TR_NORM } : {}), mk: 0 };
  // (the draft's prior (dp) apart: tried last, on top of the rest as fit (below))
  // (and the context flags with a floor of their own (MIN_GAIN: a new head coach's first games) the same way,
  // tried after the rest: searched with them, a flag left out still moved the others' sizes)
  // (the role and work share's (SHARE: ro, ab; c_aheadOut where a stat's ctx has it; ot) after the next man up
  // and the injury return: the injury-driven terms first, the organic trend on what they leave)
  const AFTER_RP = ['c_aheadOut'];
  const share = (list) => list.filter((k) => SHARE.includes(k) && has(stat, k));
  // (the learned split (vl) first: after the minutes base (the NBA's), before the next man up's and the rest
  // that read the work missing)
  const late = [...(stat.minutes ? (TRY_VCM && stat.vacated ? ['sn', 'vcM'] : ['sn']) : []), ...(has(stat, 'vl') ? ['vl'] : []), ...[...(TRY_PS ? ['ps'] : []), 'po', 'ep'].filter((k) => has(stat, k)), ...(has(stat, 'od') ? ['od'] : []), ...(TRY_MK && env.mktN > 0 ? ['mk'] : []), ...ctxs.filter((k) => MIN_GAIN[k] !== undefined && !AFTER_RP.includes(k)), ...['rp', 'nt', 'ij'].filter((k) => has(stat, k)), ...share(['ro', 'ab']), ...ctxs.filter((k) => AFTER_RP.includes(k)), ...share(['ot']), ...(has(stat, 'lp') ? ['lp'] : []), ...(has(stat, 'bq') ? ['bq'] : []), ...[...CARRY, 'sp', 'tr', 'sl', 'ex'].filter((k) => has(stat, k))];
  const optional = [...Object.keys(OPTIONAL).filter((k) => k !== 'dp' && has(stat, k) && !(k === 'sn' && stat.minutes)), ...aPos, ...ctxs.filter((k) => !late.includes(k))];
  const keys = ['K', 'w', 'a', 'b', ...optional];
  const allOff = Object.fromEntries(optional.map((k) => [k, offOf(k)]));
  let best = scoreOf(replayStat(stat, sorted, params, env, cuts).out, 1);
  // (the stat's own a idle where every position group its rows hold has an a_<group> set: nothing reads it,
  // so it isn't searched then)
  const groups = [...new Set(sorted.map((r) => oppGroup(r.pos)))];
  const aIdle = (p) => aPos.length > 0 && groups.every((g) => p[`a_${g}`] !== null && p[`a_${g}`] !== undefined);
  // (the defense tables' recency's tries (od): its sizes, and where nothing reads the tables (the opponent's power
  // 0 on every group its rows hold) each with a at OD_A in its place; every group's own a 0, none)
  const aZero = (p) => groups.every((g) => (p[`a_${g}`] ?? p.a) === 0);
  const odTries = (p) => (!aZero(p) ? OD.map((od) => ({ od })) : aIdle(p) ? [] : OD.map((od) => ({ od, a: OD_A })));
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
  const plain = { r: best.r, rk: 0, flip: 0 };
  let shape = plain;
  let shapeLl = best.ll;
  for (const rk of RK) {
    const s = scoreOf(firstOut, 1, { rk, rm });
    if (s.ll > shapeLl) (shapeLl = s.ll), (shape = { r: s.r, rk });
  }
  // (the reflected count (flip, D43): a left-skewed stat's cap, each tried at its own best r and growth on the fit
  // window; kept below only if the held-out games are better with it, as rk is)
  for (const flip of Array.isArray(stat.flip) ? stat.flip : [])
    for (const rk of [0, ...RK]) {
      const s = scoreOf(firstOut, 1, { rk, rm, flip });
      if (s.ll > shapeLl) (shapeLl = s.ll), (shape = { r: s.r, rk, flip });
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
    if (key === 'vl') return (x) => (x.row.vac ?? 0) > 0;
    if (key === 'c_aheadOut') return (x) => (x.row.aheadOut ?? 0) > 0;
    if (key === 'nt') return onOf('rp', t);
    if (key === 'ab') return (x) => !!x.p.sameOn;
    if (key === 'sp') return (x) => !!x.p.sp && x.p.games < SP_EARLY;
    if (key === 'ij') return (x) => isBack(x.row, t.ia);
    if (key === 'bq') return (x) => !!x.p.bq;
    const i = ctxKeys(stat).indexOf(key.slice(2));
    return (x) => (x.p.ctx?.[i] ?? 0) > 0;
  };
  // (a signed term's sides (SIGNED): its favorites' rows and its underdogs', by its value on the row)
  const sidesOf = (key) => {
    const i = ctxKeys(stat).indexOf(key.slice(2));
    return [(x) => (x.p.ctx?.[i] ?? 0) > SIGNED_AT, (x) => (x.p.ctx?.[i] ?? 0) < -SIGNED_AT];
  };
  // (o: the replay's output where the caller has it at these projections already (the early exit's: its
  // size moves no projection, only the chances around them))
  // (opts: wOf, the recency's weights on the fit window's recalibration (hl); all, every player's check always)
  const heldOut = (p, split = null, sides = null, given = null, opts = {}) => {
    const o = given ?? replayStat(stat, sorted, p, env, cuts).out;
    const pairs = linePairs(o.filter((x) => x.win === 1 && x.row.eligible !== false), p);
    const cal = fitRecal(pairs, opts.wOf ?? null);
    // (and by side where it's tried (cs): each side's own, a side with too few lines none (cal))
    const calSide = p.cs ? sideCals(pairs) : null;
    const pc = { ...p, cal, calSide };
    const young = has(stat, 'dp') ? [...[0, 1].map((y) => check(youngOf(o, y), pc)), check(youngOf(o, 1).filter((x) => x.p.games < 3), pc)] : null;
    const all = has(stat, 'dp') || late.length || opts.all ? check(allOf(o), pc) : null;
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
    return { cal, calSide, check: check(o.filter((x) => x.win === 2 && x.row.eligible !== false), pc), young, all, nonElig: biasOf(allOf(o).filter((x) => x.row.eligible === false)), nonEligCheck: has(stat, 'lp') ? check(allOf(o).filter((x) => x.row.eligible === false), pc) : null, parts, early: has(stat, 'sp') ? earlyOf(o, pc) : null };
  };
  let current = heldOut(params);
  const gains = {};
  for (const key of optional) {
    if (params[key] === offOf(key)) {
      gains[key] = null;
      continue;
    }
    const without = heldOut({ ...params, [key]: offOf(key) });
    // (judged unrounded (gainOf), shown to 4 places)
    const raw = gainOf(without.check, current.check);
    gains[key] = r4(raw);
    if (!(raw > 0)) {
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
        const s = scoreOf(replayStat(stat, sorted, { ...params, a: v, scale: 1 }, env, cuts).out, 1, { rk: params.rk ?? 0, rm, flip: params.flip ?? 0 });
        if (!aBest || s.ll > aBest.ll) aBest = { ll: s.ll, a: v };
      }
      if (aBest.a !== params.a) {
        const tryP = { ...params, a: aBest.a };
        tryP.scale = scaleOf(tryP);
        const tried = heldOut(tryP);
        if ((llOf(tried.check) ?? Infinity) <= (llOf(nextCheck.check) ?? Infinity)) (next = tryP), (nextCheck = tried);
      }
    }
    params = { ...next, cal: nextCheck.cal };
    current = nextCheck;
  }
  // (the dispersion's growth, the same way: the plain negative binomial unless the held-out games say so)
  // (and the reflected count (flip, D43) the same way, judged first as a package with the growth it was picked with:
  // not better held out than the plain shape, both go)
  if (params.flip) {
    const without = heldOut({ ...params, ...plain });
    const raw = gainOf(without.check, current.check);
    gains.flip = r4(raw);
    if (!(raw > 0)) (params = { ...params, ...plain }), (current = without);
  } else gains.flip = null;
  if (params.rk) {
    const without = heldOut({ ...params, ...plain, flip: params.flip ?? 0 });
    const raw = gainOf(without.check, current.check);
    gains.rk = r4(raw);
    if (!(raw > 0)) (params = { ...params, ...plain, flip: params.flip ?? 0 }), (current = without);
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
  // projections before the lean (the pull reads nothing the replay learns from while the returners' ramp is off
  // (ij, ir: off on every stat as of 2026-10-12); kept on, the replay reads the projections, so each size is
  // replayed in full instead (exact, floors.sl)), its pull on the projection before the team allocation where
  // that's kept (p.preTr), as the real projection's, the lean fit again at each on the fit window's eligible
  // players, scored at the stat's best dispersion. Its gate below replays both sides in full)
  const middleSearch = (shape) => {
    const exact = !!(params.ij || params.ir);
    const o = replayStat(stat, sorted, { ...params, sl: 0, scale: 1 }, env, cuts).out;
    const fitOf = (list) => list.filter((x) => x.win === 1 && x.row.eligible !== false);
    const at = (sl) => {
      const list = exact && sl ? replayStat(stat, sorted, { ...params, sl, scale: 1 }, env, cuts).out : o;
      const f = exact ? (x) => x.p.mu : (x) => x.p.mu * middleF({ sl, rm }, x.p.preTr ?? x.p.mu);
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
  // (the team allocation's search (tr): one replay without it, each size and form's projections made from its
  // projections before the lean (its factor reads nothing the replay learns from: S and T from before the day's
  // games), the lean fit again at each on the fit window's eligible players, scored at the stat's best
  // dispersion. Its gate below replays both sides in full. And how far the players' projections were from adding
  // up (gap): the held-out team-games with the team's expected total read, their players' projections summed (S,
  // at the lean) and the team's expected (T) against what those players did (A): each total over A's, and each
  // one's miss (the sum of |S - A| over A's))
  const squadSearch = (shape) => {
    const o = replayStat(stat, sorted, { ...params, tr: 0, trRead: true, scale: 1 }, env, cuts).out;
    const fitE = o.filter((x) => x.win === 1 && x.row.eligible !== false);
    const at = (t) => {
      // (mean-preserving where the stat's marked (params.trn): each factor over the running mean before its day)
      const nf = new Map();
      if (params.trn) {
        const nb = trNormBuf();
        for (const x of o) {
          const g = squadF(t, x.p.squad);
          if (g !== 1) nf.set(x, trNormOf(nb, x.row.date.slice(0, 10), Math.log(g), params.trn));
        }
      }
      const f = (x) => (x.p.mu * squadF(t, x.p.squad)) / (nf.get(x) ?? 1);
      const sum = fitE.reduce((s, x) => s + f(x), 0);
      const k = sum > 0 ? fitE.reduce((s, x) => s + x.v, 0) / sum : 1;
      return o.map((x) => ({ ...x, p: { mu: Math.max(0.05, k * f(x)) } }));
    };
    const s0 = scoreOf(at({}), 1, shape);
    let sBest = s0;
    let v = null;
    for (const t of lateTries('tr', stat)) {
      const sc = scoreOf(at(t), 1, shape);
      if (sc.ll > sBest.ll) (sBest = sc), (v = t);
    }
    const games = new Map();
    for (const x of o) {
      if (x.win !== 2) continue;
      const k = x.row.game + '|' + x.row.team;
      const g = games.get(k) ?? { S: x.p.squad?.sum ?? 0, T: x.p.squad?.T ?? null, A: 0, mE: 0, mA: 0, mOk: true };
      g.A += x.v;
      // (the minutes base's (the NBA's minutes, the NHL's ice time): his expected tonight and what he played)
      if (stat.minutes) {
        if (x.p.mode === 'minutes' && Number.isFinite(x.p.share) && Number.isFinite(x.row.share)) (g.mE += x.p.share * fullMin(stat)), (g.mA += x.row.share * fullMin(stat));
        else g.mOk = false;
      }
      games.set(k, g);
    }
    const read = [...games.values()].filter((g) => g.T > 0 && g.S > 0);
    const sc = params.scale ?? 1;
    const sum = (fn) => read.reduce((t, g) => t + fn(g), 0);
    const A = sum((g) => g.A);
    const r4 = (x) => Math.round(x * 10000) / 10000;
    const gap = A > 0 ? { n: read.length, of: games.size, s: r4(sum((g) => g.S * sc) / A), t: r4(sum((g) => g.T) / A), missS: r4(sum((g) => Math.abs(g.S * sc - g.A)) / A), missT: r4(sum((g) => Math.abs(g.T - g.A)) / A) } : null;
    // (and the minutes' sum: the team-games with every player's expected minutes read, their average expected and
    // played a game, and the miss)
    const mins = [...games.values()].filter((g) => stat.minutes && g.mOk && g.mA > 0);
    if (gap && mins.length) {
      const mA = mins.reduce((t, g) => t + g.mA, 0);
      gap.minutes = { n: mins.length, expected: Math.round((mins.reduce((t, g) => t + g.mE, 0) / mins.length) * 10) / 10, played: Math.round((mA / mins.length) * 10) / 10, miss: r4(mins.reduce((t, g) => t + Math.abs(g.mE - g.mA), 0) / mA) };
    }
    return { s0, sBest, v, gap };
  };
  let trGap = null;
  // (the early exit's chance and what a short game keeps, the held-out eligible rows' average: the log's read of
  // its base)
  const exitRead = (o) => {
    const h = o.filter((x) => x.win === 2 && x.row.eligible !== false && x.p.exitQ > 0);
    const mean = (fn) => (h.length ? Math.round((h.reduce((t, x) => t + fn(x), 0) / h.length) * 10000) / 10000 : null);
    return { n: h.length, q: mean((x) => x.p.exitQ), f: mean((x) => x.p.exitF) };
  };
  // (the eligible held-out bias before the first WHOLE_TOL term judged: their one budget)
  let wholeBase = null;
  // (the soft terms' candidates (softEligible: left out on its gain or the whole stat's bias alone, its gain over 0),
  // the late terms the gate kept, and the ones it left out for a reason of their own rows (never soft this run))
  const softCands = [];
  const softHard = [];
  const softOut = new Set();
  for (const key of late) {
    // (the role order reads nowhere without the role's opponent table (roleK) or the next man up (rp): nothing
    // to try)
    if (key === 'ro' && !(Number.isFinite(params.roleK) || params.rp)) {
      gains.ro = null;
      continue;
    }
    // (the work missing's size fit again on the NBA's minutes base (vcM: vc's grid, on the whole stat's strict
    // gate): vc was fit before the base, its minutes lean reading the absences' games apart (minLean); nothing
    // to refit without the base)
    if (key === 'vcM' && !params.sn) {
      gains.vcM = null;
      continue;
    }
    // (nor the next man up's target floor without the volume base (vol))
    if (key === 'nt' && !params.vol) {
      gains.nt = null;
      continue;
    }
    // (nor the start-of-season prior without SUBGROUP_N held-out early games to judge it on (spHeld: a season
    // after the history's first, his first SP_EARLY games, a run of his own before it), nor SUBGROUP_N on the fit
    // window to pick its size on (spFit: none there, every size ties))
    if (key === 'sp' && (spHeld < SUBGROUP_N || spFit < SUBGROUP_N)) {
      gains.sp = null;
      floors.sp = { size: null, fails: [...(spHeld < SUBGROUP_N ? ['too few early games held out'] : []), ...(spFit < SUBGROUP_N ? ['too few early games on the fit window'] : [])], held: spHeld, fit: spFit };
      continue;
    }
    const spT0 = Date.now();
    const shape = { rk: params.rk ?? 0, rm, flip: params.flip ?? 0 };
    let s0;
    let sBest;
    let v = null;
    // (the early exit's (ex): its size moves no projection, so one replay scores every size and is the held-out
    // check's on both sides, the lean as it stands)
    let given = null;
    let exT0 = null;
    if (key === 'sl') ({ s0, sBest, v, exact: slExact } = middleSearch(shape));
    else if (key === 'tr') ({ s0, sBest, v, gap: trGap } = squadSearch(shape));
    else if (key === 'ex') {
      exT0 = Date.now();
      given = replayStat(stat, sorted, params, env, cuts).out;
      s0 = scoreOf(given, 1, shape);
      sBest = s0;
      for (const x of lateTries(key, stat)) {
        const sc = scoreOf(given, 1, { ...shape, ...x });
        if (sc.ll > sBest.ll) (sBest = sc), (v = x);
      }
    } else {
      // (the low-usage prior (lp) searched on the fit window's non-eligible rows alone: the ones it moves)
      const rowsOf = key === 'lp' ? (o) => o.filter((x) => x.row.eligible === false) : (o) => o;
      s0 = scoreOf(rowsOf(replayStat(stat, sorted, params, env, cuts).out), 1, shape);
      sBest = s0;
      for (const x of key === 'od' ? odTries(params) : lateTries(key, stat)) {
        const sc = scoreOf(rowsOf(replayStat(stat, sorted, { ...params, ...x }, env, cuts).out), 1, shape);
        if (sc.ll > sBest.ll) (sBest = sc), (v = x);
      }
      // (the NBA's pace: the opponent's power a fit again with it on the fit window (the tables learn past the
      // pace with it on, so the a fit before it is read again; a's grid, 2 replays more)
      if (key === 'po' && v && !aIdle(params)) {
        for (const a of GRID.a) {
          if (a === params.a) continue;
          const sc = scoreOf(replayStat(stat, sorted, { ...params, ...v, a }, env, cuts).out, 1, shape);
          if (sc.ll > sBest.ll) (sBest = sc), (v = { ...v, a });
        }
      }
    }
    gains[key] = null;
    if (!v) {
      if (key === 'sp') floors.sp = { size: null, fails: ['not taken on the fit window'], held: spHeld, fit: spFit, seconds: Math.round((Date.now() - spT0) / 100) / 10 };
      if (key === 'ep') floors.ep = { size: null, fails: ['not taken on the fit window'], seconds: Math.round((Date.now() - spT0) / 100) / 10 };
      if (key === 'tr') floors.tr = { size: null, fails: ['not taken on the fit window'], gap: trGap, seconds: Math.round((Date.now() - spT0) / 100) / 10 };
      if (ROUND_C.includes(key)) floors[key] = { size: null, fails: ['not taken on the fit window'] };
      continue;
    }
    const offP = { ...params, r: s0.r };
    offP.scale = given ? params.scale : scaleOf(offP);
    const sub = SUBGROUP.has(key) ? onOf(key, v) : null;
    const sides = SIGNED.has(key) ? sidesOf(key) : null;
    const off = heldOut(offP, sub, sides, given);
    const tryP = { ...params, ...v, r: sBest.r };
    tryP.scale = given ? params.scale : scaleOf(tryP);
    const tried = heldOut(tryP, sub, sides, given);
    // (the gain judged unrounded, shown to 4 places: rounded first, a held-out gain of 0.00025 read 0.0003 and
    // passed the floor (NFL receiving yards' nt, at z 0.57, 2026-10-15))
    // (the low-usage prior's gain (lp) is the non-eligible rows' own: the eligible players' check can't move)
    const raw = key === 'lp' ? gainOf(off.nonEligCheck, tried.nonEligCheck) : gainOf(off.check, tried.check);
    gains[key] = r4(raw);
    // (the start-of-season prior's gain is its early games' (sp: the check's own lines need 3 of this season's
    // games, so it barely sees them): their log loss at the early lines without it less with it, SUBGROUP_N lines
    // each or not measured; the whole stat's held-out log loss no worse beside it)
    const spRaw = off.early?.lines >= SUBGROUP_N && tried.early?.lines >= SUBGROUP_N ? gainOf(off.early, tried.early) : null;
    if (key === 'sp') gains.sp = r4(spRaw);
    // (every compare below on the unrounded numbers: biasRawOf, llOf)
    const fine = (a, b, tol = 0) => (!Number.isFinite(a) || !Number.isFinite(b) ? 'not measured' : Math.abs(a) <= Math.abs(b) + tol ? null : 'larger');
    const fails = [];
    if (key === 'sp' && spRaw === null) fails.push('its early lines not measured');
    else if (!((key === 'sp' ? spRaw : raw) >= MIN_GAIN[key])) fails.push('gain');
    if (key === 'sp' && raw < 0) fails.push("the whole stat's log loss");
    if (sub) {
      const [o, t] = [off.parts, tried.parts];
      // (its own rows' bias smaller; or within OWN_TOL for a gain of OWN_TOL_GAIN floors, a soft fail: ownBias above)
      const on = ownBias(o?.on, t?.on, raw, MIN_GAIN[key]);
      if (on) fails.push(on === 'larger' ? 'its own bias' : on === 'within tolerance' ? 'its own bias within tolerance' : 'its own bias not measured');
      // (and its own rows' eligible players', the ones a book posts props for, no larger the same way: a term
      // learned on every player's rows, most of them low-usage, can right those and push the bettable ones the
      // other way (ij on receptions, 2026-10-12: its rows -6.9% to +4.1% actual over projected, the eligible's
      // -1.5% to +10.1%); fewer than SUBGROUP_ELIG_N of them: not measured, left out)
      const oe = (o?.onElig?.n ?? 0) < SUBGROUP_ELIG_N ? 'not measured' : fine(biasRawOf(t?.onElig), biasRawOf(o?.onElig), SUBGROUP_TOL * (o?.onElig?.mean ?? 0));
      if (oe) fails.push(oe === 'larger' ? "its own eligible rows' bias" : "its own eligible rows' bias not measured");
      const rb = fine(biasRawOf(t?.rest), biasRawOf(o?.rest), SUBGROUP_TOL * (o?.rest?.mean ?? 0));
      if (rb) fails.push(rb === 'larger' ? "the rest's bias" : "the rest's bias not measured");
      const re = fine(biasRawOf(t?.restElig), biasRawOf(o?.restElig), SUBGROUP_TOL * (o?.restElig?.mean ?? 0));
      if (re) fails.push(re === 'larger' ? "the eligible rest's bias" : "the eligible rest's bias not measured");
    } else {
      // (a base on every row (WHOLE_TOL: the NBA's minutes) moves the whole stat's lean, refit on the fit window,
      // a little either way on the held-out games: its bias no larger by more than SUBGROUP_TOL of their mean
      // actual, as a flag's rest is judged (the eligible players' alone: every player's held strict, as every
      // other term's); every other term's no larger at all. The hourly refit judges it again each run, so a
      // bias grown past the tolerance as the season comes in drops it)
      // (WHOLE_TOL's against the bias before the first of them, wholeBase: the budget shared, not one a term)
      // (and the NBA's team allocation (tr on a stat marked teamWhole, props.mjs NBA_TEAM) the same: a factor on every
      // row, the lean refit with it; its every player's bias read in two parts below (splitAll))
      const teamWhole = key === 'tr' && !!stat.teamWhole;
      const wholeTol = WHOLE_TOL.has(key) || teamWhole;
      if (wholeTol) wholeBase ??= off.check ?? null;
      const eb = wholeTol ? fine(biasRawOf(tried.check), biasRawOf(wholeBase), SUBGROUP_TOL * (wholeBase?.mean ?? 0)) : fine(biasRawOf(tried.check), biasRawOf(off.check));
      if (eb) fails.push(eb === 'larger' ? 'bias' : 'bias not measured');
      // (every player's bias in its two parts where the pooled one cancels (teamWhole): the eligible players' (eb
      // above) and the rest's (nonElig), the rest's no larger; pooled, a term that shrank both could read larger, the
      // eligible players' under no longer cancelling the rest's over (NBA points 2026-10-14: -0.2658 to -0.2423 and
      // +0.9938 to +0.9694, pooled 0.0595 to 0.0707))
      const splitAll = teamWhole;
      const ab = splitAll ? fine(biasRawOf(tried.nonElig), biasRawOf(off.nonElig)) : fine(biasRawOf(tried.all), biasRawOf(off.all));
      if (ab) fails.push(ab === 'larger' ? (splitAll ? "the other players' bias" : "all players' bias") : "all players' bias not measured");
      // (the low-usage prior's own rows (lp): the non-eligible players' bias no larger, SUBGROUP_N of them or not measured)
      if (key === 'lp') {
        const lb = (off.nonElig?.n ?? 0) < SUBGROUP_N ? 'not measured' : fine(biasRawOf(tried.nonElig), biasRawOf(off.nonElig));
        if (lb) fails.push(lb === 'larger' ? "the other players' bias" : "the other players' bias not measured");
      }
      // (the pull toward the middle's own point: the held-out fifths by projection missing less (each one's
      // actual over projected, off 0, summed), the eligible players')
      // (the early exit's own point: the low lines' held-out log loss (LOW_LINE or under) no worse, where each
      // side has CS_MIN of them; fewer (a yards stat's medians), the whole stat's gain alone)
      // (and its high rows' (check's high: a short last game, a first game back, a chance of EXIT_HIGH or more),
      // where its confidence sits: their log loss no worse and their over's chance said no further from what
      // happened, where there are SUBGROUP_N of them; fewer, not measured and left out (review of 6c51e015: the
      // whole stat's gain and the low lines' could pass with those rows miscalibrated))
      if (key === 'ex') {
        const [a, b] = [tried.check?.low, off.check?.low];
        if (a?.lines >= CS_MIN && b?.lines >= CS_MIN && llOf(a) > llOf(b)) fails.push("the low lines' log loss");
        const [h1, h0] = [tried.check?.high, off.check?.high];
        if (!(h1?.lines >= SUBGROUP_N && h0?.lines >= SUBGROUP_N)) fails.push('the high rows not measured');
        else {
          if (llOf(h1) > llOf(h0)) fails.push("the high rows' log loss");
          const miss = (h) => Math.abs((h.saidRaw ?? h.said) - (h.wasRaw ?? h.was));
          if (miss(h1) > miss(h0)) fails.push("the high rows' over said");
        }
      }
      if (key === 'sl') {
        const [a, b] = [fifthsMiss(tried.check), fifthsMiss(off.check)];
        if (!(Number.isFinite(a) && Number.isFinite(b))) fails.push('fifths not measured');
        else if (!(a < b)) fails.push('fifths');
      }
      // (a signed term's each side no larger too (SIGNED): the favorites' rows, then the underdogs')
      if (sides) {
        ['the favorites', 'the underdogs'].forEach((name, j) => {
          const [o, t] = [off.parts?.sides?.[j], tried.parts?.sides?.[j]];
          const r = (o?.n ?? 0) < SUBGROUP_N ? 'not measured' : fine(biasRawOf(t), biasRawOf(o));
          if (r) fails.push(r === 'larger' ? `${name}' bias` : `${name}' bias not measured`);
        });
      }
    }
    floors[key] = { size: sizeOf(key, v), fails, bias: [off.check?.bias ?? null, tried.check?.bias ?? null], allBias: [off.all?.bias ?? null, tried.all?.bias ?? null], ...(key === 'tr' ? { nonElig: [off.nonElig?.bias ?? null, tried.nonElig?.bias ?? null] } : {}), ...(sub ? { on: [off.parts?.on ?? null, tried.parts?.on ?? null], onElig: [off.parts?.onElig ?? null, tried.parts?.onElig ?? null], rest: [off.parts?.rest?.bias ?? null, tried.parts?.rest?.bias ?? null] } : {}), ...(sides ? { sides: [0, 1].map((j) => [off.parts?.sides?.[j] ?? null, tried.parts?.sides?.[j] ?? null]) } : {}), ...(key === 'sl' ? { fifths: [off.check?.fifths ?? null, tried.check?.fifths ?? null], exact: slExact } : {}), ...(key === 'ex' ? { low: [off.check?.low ?? null, tried.check?.low ?? null], high: [off.check?.high ?? null, tried.check?.high ?? null], logLoss: [off.check?.logLoss ?? null, tried.check?.logLoss ?? null], r: [s0.r, sBest.r], ...exitRead(given), seconds: Math.round((Date.now() - exT0) / 100) / 10 } : {}), ...(key === 'sp' ? { early: [off.early, tried.early], whole: [off.check?.logLoss ?? null, tried.check?.logLoss ?? null], held: spHeld, fit: spFit, seconds: Math.round((Date.now() - spT0) / 100) / 10 } : {}), ...(key === 'ep' ? { logLoss: [off.check?.logLoss ?? null, tried.check?.logLoss ?? null], seconds: Math.round((Date.now() - spT0) / 100) / 10 } : {}), ...(key === 'tr' ? { logLoss: [off.check?.logLoss ?? null, tried.check?.logLoss ?? null], gap: trGap, seconds: Math.round((Date.now() - spT0) / 100) / 10 } : {}), ...(ROUND_C.includes(key) ? { logLoss: [off.check?.logLoss ?? null, tried.check?.logLoss ?? null] } : {}), ...(key === 'lp' ? { logLoss: [off.nonEligCheck?.logLoss ?? null, tried.nonEligCheck?.logLoss ?? null], lines: [off.nonEligCheck?.lines ?? null, tried.nonEligCheck?.lines ?? null], nonElig: [off.nonElig ?? null, tried.nonElig ?? null] } : {}) };
    if (!fails.length) (params = { ...tryP, cal: tried.cal }), (current = tried);
    if (!softable(key)) continue;
    if (!fails.length) softHard.push(key);
    else if (raw > 0 && softEligible(key, v, fails)) softCands.push({ key, v, sw: softWeight(off.check?.lossBy, tried.check?.lossBy) });
    else if (!fails.every((f) => SOFT_FAILS.has(f))) softOut.add(key);
  }
  // (the soft terms (SOFT_Z above): each candidate's target weight from its evidence, this run's moved toward it
  // from the last run's (env.soft.prev: state.json's params.soft) by SOFT_DAY a day at most, and a term soft last
  // run and not a candidate now (not taken, or its gain 0 or under) fading toward 0 the same way at its last size;
  // then added one at a time, the heaviest first, each kept only on the joint check (softJoint), the set judged
  // again at the end: failing, the hard-gated model alone. Its numbers: floors.soft; the live weights:
  // params.soft (each term's size as taken, its weight, target and z, and when)
  const prevSoft = env.soft?.prev ?? null;
  const nowMs = env.soft?.now ?? null;
  const daysOf = (at) => (Number.isFinite(nowMs) && at ? (nowMs - Date.parse(at)) / 864e5 : 1);
  const softTerms = softCands.map((c) => ({ key: c.key, v: c.v, sw: c.sw, target: c.sw.w, w0: softFrom(prevSoft?.[c.key], c.key, c.v), days: daysOf(prevSoft?.[c.key]?.at) }));
  for (const [k, p] of Object.entries(prevSoft ?? {})) {
    if (softTerms.some((e) => e.key === k) || softHard.includes(k) || softOut.has(k) || !late.includes(k) || !softable(k) || !(p?.w > 0) || !p.size) continue;
    softTerms.push({ key: k, v: p.size, sw: null, target: 0, w0: p.w, days: daysOf(p.at), fade: true });
  }
  for (const e of softTerms) e.w = softStep(e.w0, e.target, e.days);
  let softJ = null;
  if (softTerms.some((e) => e.w > 0)) {
    const hardAt = current;
    let accP = params;
    let acc = current;
    for (const e of [...softTerms].filter((x) => x.w > 0).sort((a, b) => b.w - a.w)) {
      const tryP = { ...accP, ...softSize(e.key, e.v, e.w) };
      tryP.scale = scaleOf(tryP);
      const t = heldOut(tryP);
      e.fails = softJoint(hardAt, t, acc);
      e.kept = !e.fails.length;
      if (e.kept) (accP = { ...tryP, cal: t.cal }), (acc = t);
    }
    const jointFails = acc === hardAt ? ['none kept'] : softJoint(hardAt, acc);
    const brief = (h) => ({ logLoss: h.check?.llRaw === null || h.check?.llRaw === undefined ? null : Math.round(h.check.llRaw * 1e5) / 1e5, bias: h.check?.bias ?? null, allBias: h.all?.bias ?? null });
    softJ = { hard: brief(hardAt), soft: brief(acc), fails: jointFails };
    if (!jointFails.length) (params = accP), (current = acc);
    else for (const e of softTerms) e.kept = false;
  }
  const softAt = Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : null;
  const softLive = softTerms.filter((e) => e.kept && e.w > 0);
  if (softLive.length) params.soft = Object.fromEntries(softLive.map((e) => [e.key, { w: e.w, target: e.target, z: e.sw?.z ?? null, size: e.v, at: softAt }]));
  floors.soft = { terms: softTerms.map((e) => ({ key: e.key, size: sizeOf(e.key, e.v), w0: Math.round(e.w0 * 1000) / 1000, target: e.target, w: e.kept ? e.w : 0, tried: e.w, z: e.sw?.z ?? null, n: e.sw?.n ?? null, halves: e.sw?.halves ?? null, why: e.sw?.why ?? (e.fade ? 'fading: not a candidate this run' : null), fails: e.fails ?? null, kept: !!e.kept })), hard: softHard, out: [...softOut], joint: softJ };
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
    const shape = { rk: params.rk ?? 0, rm, ex: params.ex ?? 0, flip: params.flip ?? 0 };
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
      // (every compare unrounded: gainOf, biasRawOf, llOf, maeOf)
      const raw = gainOf(off.check, tried.check);
      gains.dp = r4(raw);
      const no = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= Math.abs(b);
      const fails = [];
      if (!(raw >= DRAFT_GAIN)) fails.push('gain');
      if (!no(biasRawOf(tried.check), biasRawOf(off.check))) fails.push('bias');
      if (!no(biasRawOf(tried.all), biasRawOf(off.all))) fails.push("all players' bias");
      ['rookies', 'first two'].forEach((name, y) => {
        const a = tried.young?.[y];
        const b = off.young?.[y];
        if (!(a?.lines >= DRAFT_LINES && b?.lines >= DRAFT_LINES)) fails.push(`${name} too few`);
        else {
          if (llOf(a) > llOf(b)) fails.push(`${name}' log loss`);
          if (!no(biasRawOf(a), biasRawOf(b))) fails.push(`${name}' bias`);
        }
      });
      const ea = tried.young?.[2];
      const eb = off.young?.[2];
      if (!(ea?.n >= DRAFT_EARLY && eb?.n >= DRAFT_EARLY)) fails.push('early games too few');
      else {
        if (!no(biasRawOf(ea), biasRawOf(eb))) fails.push('early bias');
        if (maeOf(ea) > maeOf(eb)) fails.push('early error');
      }
      if (!fails.length) (params = { ...tryP, cal: tried.cal }), (current = tried);
      // (its own check, the gate's own numbers: without it and at the size the search took, each at its own
      // dispersion, lean and recalibration)
      const brief = (c) => (c ? { n: c.n, lines: c.lines, logLoss: c.logLoss, bias: c.bias, mae: c.mae } : null);
      rookie = { ...rookie, kept: params.dp, fails, check: [brief(off.check), brief(tried.check)], all: [brief(off.all), brief(tried.all)], rookie: [brief(off.young?.[0]), brief(tried.young?.[0])], young: [brief(off.young?.[1]), brief(tried.young?.[1])], early: [brief(off.young?.[2]), brief(tried.young?.[2])] };
    }
  }
  // (the recency weight (hl), tried after the rest as fit and left as they are: newer games count more in the
  // fit's last three fits on the fit window, the lean (scale), the dispersion (r) and the recalibration (cal), by
  // a half-life in seasons (HL), so the league's drift is followed. One replay at the lean 1 (the lean's a
  // multiple of every projection: scaled from it, as the pull toward the middle's search does). The half-life
  // picked inside the fit window (its first INNER_FIT fit at each, its last games scored unweighted: the one that
  // scores best, better than none; none, not tried), then judged on the held-out games against none the same way
  // (the lean, r and recalibration fit unweighted): kept only with a held-out gain of DRAFT_GAIN or more, the late
  // terms' floor, and the eligible players' and every player's bias no larger. Left out: the stat exactly as it was. Its numbers: floors.hl)
  gains.hl = null;
  if (TRY_HL) {
    const hlT0 = Date.now();
    const shape = { rk: params.rk ?? 0, rm, ex: params.ex ?? 0, flip: params.flip ?? 0 };
    const o1 = replayStat(stat, sorted, { ...params, scale: 1 }, env, cuts).out;
    const fitE = o1.filter((x) => x.win === 1 && x.row.eligible !== false);
    const fitL = scored(o1, 1);
    const tOf = (x) => Date.parse(x.row.date.slice(0, 10));
    // (the sport's rule era (ERAS): its games before the break weighed ew, 1 none)
    const eraT = Date.parse(ERAS[env?.sport] ?? '') || null;
    const wAt = (hl, ref, ew = 1) => (hl || ew < 1 ? (x) => (hl ? 0.5 ** (Math.max(0, ref - tOf(x)) / (hl * YEAR_MS)) : 1) * (eraT && ew < 1 && tOf(x) < eraT ? ew : 1) : null);
    const leanOf = (list, w) => {
      const sMu = list.reduce((t, x) => t + (w ? w(x) : 1) * x.p.mu, 0);
      return sMu > 0 ? Math.round((list.reduce((t, x) => t + (w ? w(x) : 1) * x.v, 0) / sMu) * 1000) / 1000 : 1;
    };
    const scaled = (k) => o1.map((x) => ({ ...x, p: { ...x.p, mu: Math.max(0.05, k * x.p.mu) } }));
    // (each row's log-likelihood at a lean and dispersion, weighted)
    const llOf = (list, k, r, w) => {
      const pr = { r, ...shape };
      let ll = 0;
      for (const x of list) ll += (w ? w(x) : 1) * chanceLog(x.v, Math.max(0.05, k * x.p.mu), pr, exitMix(pr, x.p));
      return ll;
    };
    const rOf = (list, k, w) => R.reduce((b, r) => {
      const ll = llOf(list, k, r, w);
      return !b || ll > b.ll ? { ll, r } : b;
    }, null).r;
    // (inside the fit window: its first INNER_FIT by date to fit the lean and r at each half-life, the rest scored)
    const days = fitL.map(tOf).sort((a, b) => a - b);
    const mid = days.length ? days[Math.floor(days.length * INNER_FIT)] : 0;
    const innerFit = fitL.filter((x) => tOf(x) < mid);
    const innerFitE = fitE.filter((x) => tOf(x) < mid);
    const innerVal = fitL.filter((x) => tOf(x) >= mid);
    const inner = {};
    // (the half-lives better than none inside the fit window, the best first)
    let better = [];
    if (innerFit.length >= 200 && innerVal.length >= 100 && innerFitE.length) {
      for (const h of [0, ...HL]) {
        const w = wAt(h, mid);
        const k = leanOf(innerFitE, w);
        inner[h] = Math.round((llOf(innerVal, k, rOf(innerFit, k, w), null) / innerVal.length) * 1e5) / 1e5;
      }
      better = HL.filter((h) => inner[h] > inner[0]).sort((a, b) => inner[b] - inner[a]);
    }
    // (soft, the owner's D8: the best inside first; one the held-out games don't bear out steps to the softer ones,
    // the longer half-lives that also beat none inside, softest last, HL_TRIES in all: a small drift kept at a long
    // half-life, never all or nothing)
    const tries = better.length ? [better[0], ...better.filter((h) => h > better[0]).sort((a, b) => a - b)].slice(0, HL_TRIES) : [];
    let fails = [];
    let off = null;
    let tried = null;
    let ks = [null, null];
    let rs = [null, null];
    let hl = 0;
    const stepped = [];
    if (!tries.length) fails.push(Object.keys(inner).length ? 'not taken inside the fit window' : 'too few games to try');
    else {
      const k0 = leanOf(fitE, null);
      const r0 = rOf(fitL, k0, null);
      off = heldOut({ ...params, scale: k0, r: r0 }, null, null, scaled(k0), { all: true });
      for (const h of tries) {
        const w = wAt(h, Date.parse(cuts[1]));
        const k = leanOf(fitE, w);
        const r = rOf(fitL, k, w);
        const tryP = { ...params, scale: k, r, hl: h };
        tried = heldOut(tryP, null, null, scaled(k), { wOf: w, all: true });
        ks = [k0, k];
        rs = [r0, r];
        const raw = gainOf(off.check, tried.check);
        gains.hl = r4(raw);
        const no = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= Math.abs(b);
        fails = [];
        if (!(raw >= DRAFT_GAIN)) fails.push('gain');
        if (!no(biasRawOf(tried.check), biasRawOf(off.check))) fails.push('bias');
        if (!no(biasRawOf(tried.all), biasRawOf(off.all))) fails.push("all players' bias");
        stepped.push({ hl: h, gain: r4(raw), fails: [...fails] });
        if (!fails.length) {
          (params = { ...tryP, cal: tried.cal }), (current = tried);
          hl = h;
          break;
        }
      }
    }
    floors.hl = { size: hl || null, fails, inner, tries: stepped, bias: [off?.check?.bias ?? null, tried?.check?.bias ?? null], allBias: [off?.all?.bias ?? null, tried?.all?.bias ?? null], logLoss: [off?.check?.logLoss ?? null, tried?.check?.logLoss ?? null], scale: ks, r: rs, seconds: Math.round((Date.now() - hlT0) / 100) / 10 };
    // (the rule era (ERAS: the NFL's 2024 kickoff, MLB's 2023 pitch clock and shift ban), judged where the history
    // has games on both sides of the break: the fit and held-out windows' games before the newest half of the ones
    // since the break fit at each era weight (ERA_W: the games before the break at that share, with the half-life
    // kept), that newest half scored unweighted; kept with DRAFT_GAIN a game or more over none (floors.era))
    const both = o1.filter((x) => x.win >= 1);
    const bothE = both.filter((x) => x.row.eligible !== false);
    const bothL = bothE.length >= 200 ? bothE : both;
    let eraW = 1;
    if (eraT) {
      const post = bothL.filter((x) => tOf(x) >= eraT);
      const pre = bothL.filter((x) => tOf(x) < eraT);
      if (post.length >= 200 && pre.length >= 200) {
        const pd = post.map(tOf).sort((a, b) => a - b);
        const cutE = pd[Math.floor(pd.length * 0.5)];
        const eFit = bothL.filter((x) => tOf(x) < cutE);
        const eFitE = bothE.filter((x) => tOf(x) < cutE);
        const eVal = bothL.filter((x) => tOf(x) >= cutE);
        const score = (ew) => {
          const w = wAt(hl, cutE, ew);
          const k = leanOf(eFitE, w);
          return Math.round((llOf(eVal, k, rOf(eFit, k, w), null) / eVal.length) * 1e5) / 1e5;
        };
        const byW = { 1: score(1) };
        for (const ew of ERA_W) byW[ew] = score(ew);
        const best = ERA_W.filter((ew) => byW[ew] - byW[1] >= DRAFT_GAIN).sort((a, b) => byW[b] - byW[a])[0];
        if (best) eraW = best;
        floors.era = { at: ERAS[env.sport], w: eraW, tried: byW, val: eVal.length, fails: best ? [] : ['gain'] };
      } else floors.era = { at: ERAS[env.sport], w: 1, fails: ['too few games on a side of the break'] };
    }
    // (live: a kept half-life or era weight read from the newest game, the lean and r fit again by it on the fit and
    // held-out windows both, so the recent seasons count most in the settings the props are priced with; none kept,
    // the settings as fit)
    if (hl || eraW < 1) {
      const newest = Math.max(...both.map(tOf));
      const w = wAt(hl, newest, eraW);
      const k = leanOf(bothE, w);
      const r = rOf(bothL, k, w);
      floors.hl.live = { scale: [params.scale ?? null, k], r: [params.r ?? null, r], eraW };
      params = { ...params, scale: k, r, ...(eraW < 1 ? { eraW } : {}) };
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
    const csRaw = sided.calSide ? gainOf(current.check, sided.check) : null;
    gains.cs = r4(csRaw);
    const fails = [];
    if (!sided.calSide) fails.push('too few lines');
    else {
      if (!(csRaw >= DRAFT_GAIN)) fails.push('gain');
      [0, 1].forEach((i) => {
        const [a, b] = [sided.check?.bySide?.[i], current.check?.bySide?.[i]];
        const name = i ? 'over the line' : 'under the line';
        if (!(a?.lines >= CS_MIN && b?.lines >= CS_MIN)) fails.push(name + ' not measured');
        else if (llOf(a) > llOf(b)) fails.push(name + "'s log loss");
      });
    }
    floors.cs = { size: sided.calSide ? JSON.stringify(sided.calSide) : null, fails, bias: [current.check?.bias ?? null, sided.check?.bias ?? null], allBias: [current.all?.bias ?? null, sided.all?.bias ?? null], bySide: [current.check?.bySide ?? null, sided.check?.bySide ?? null], skew: [current.check?.skew ?? null, sided.check?.skew ?? null] };
    if (!fails.length) (params = { ...params, cs: 1, calSide: sided.calSide, cal: sided.cal }), (current = sided);
  }
  const finalRun = replayStat(stat, sorted, params, env, cuts);
  // (the mean-preserving allocation's latest mean, live's (params.trn: trNow))
  if (params.trn && params.tr) params.trNow = Math.round(trNowOf(finalRun.model.trNorm, params.trn) * 10000) / 10000;
  const final = finalRun.out;
  // (the start-of-season prior's table as the history leaves it (sp: learned whether or not it's kept), for the
  // log)
  const start = has(stat, 'sp') ? { table: finalRun.model.startTable(), held: spHeld, fit: spFit } : null;
  // (the held-out numbers with no matchup or context terms at all, for the before and after)
  const base = optional.length ? heldOut({ ...params, ...allOff }).check : current.check;
  // (and every player's held-out games, eligible or not, a sanity check on the history's selection: an NFL
  // game he took under 10 offensive snaps in (a kneel-down, a gadget play: a backup's line no projection is
  // for) left out of it, as the board never posts his prop)
  const all = allOf(final);
  return { params, gains, floors, base, check: current.check, checkAll: check(all, params), fitN: best.n, rookie, start };
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
  // (the low lines' (LOW_LINE or under: a catch or two, a shot, a three), the early exit's gate's own)
  const low = { lines: 0, ll: 0 };
  // (and the rows its mixture leans on hardest (exitHigh: a short last game, a first game back, a chance of
  // EXIT_HIGH or more): their log loss and their over's chance said against what happened)
  const high = { lines: 0, ll: 0, said: 0, was: 0 };
  // (each line's log loss by its row, for the soft terms' paired test (softWeight); kept off the saved check)
  const lossBy = new Map();
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
      const p = Math.min(0.995, Math.max(0.005, recal(chanceOver(line, x.p.mu, params, exitMix(params, x.p)), calAt(params, x.p.mu, line))));
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
      lossBy.set(x.row, -Math.log(over ? p : 1 - p));
      if (line <= LOW_LINE) (low.lines++), (low.ll -= Math.log(over ? p : 1 - p));
      if (exitHigh(x.p)) (high.lines++), (high.ll -= Math.log(over ? p : 1 - p)), (high.said += p), (high.was += over);
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
  const out = {
    n: list.length,
    mae: r4(mae / list.length),
    bias: r4((sumMu - sumV) / list.length),
    mean: r4(sumV / list.length),
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
    low: { lines: low.lines, logLoss: low.lines ? r4(low.ll / low.lines) : null },
    high: { lines: high.lines, logLoss: high.lines ? r4(high.ll / high.lines) : null, said: high.lines ? r4(high.said / high.lines) : null, was: high.lines ? r4(high.was / high.lines) : null },
    skew: { n: skew.n, said: skew.n ? r4(skew.said / skew.n) : null, was: skew.n ? r4(skew.was / skew.n) : null },
    fifths: fifthsOf(list),
  };
  // (the lines' losses and the unrounded log loss, not enumerable: the soft terms read them, the state never
  // saves them)
  Object.defineProperty(out, 'lossBy', { value: lossBy, enumerable: false });
  Object.defineProperty(out, 'llRaw', { value: nLine ? ll / nLine : null, enumerable: false });
  // (and the bias, the error, each side's, the low lines' and the high rows' log loss unrounded the same way: the
  // gates read them (llOf, biasRawOf), never the 4-place numbers above)
  const hide = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: false });
  hide(out, 'biasRaw', (sumMu - sumV) / list.length);
  hide(out, 'maeRaw', mae / list.length);
  out.bySide.forEach((s, i) => hide(s, 'llRaw', side[i].lines ? side[i].ll / side[i].lines : null));
  hide(out.low, 'llRaw', low.lines ? low.ll / low.lines : null);
  hide(out.high, 'llRaw', high.lines ? high.ll / high.lines : null);
  hide(out.high, 'saidRaw', high.lines ? high.said / high.lines : null);
  hide(out.high, 'wasRaw', high.lines ? high.was / high.lines : null);
  return out;
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
