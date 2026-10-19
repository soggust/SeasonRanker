// MLB's batted balls from Baseball Savant (Statcast) for the props' feeds round (the owner, 2026-10-18: the site's
// spray and air in the bettor; INPUTS.md): every ball in play, its batter, game, quality of contact and direction,
// gathered by batter and game into [balls in play, hits, total bases, expected batting average summed (Statcast's
// estimated_ba_using_speedangle), expected slugging summed, hard hit (95 mph or more), barrels (launch_speed_angle 6),
// pulled in the air (a fly ball or a line drive to his pull side: SPRAY_PULL degrees or more)]. Kept under
// .cache/model/savant/<season>/<from>.json a week's window each: a window wholly before today kept for good, the
// current one asked again after 12 hours. Read by matchups.mjs contactTable, learned after each game's day.
// Free (no key); one request a week's window, about 8 seconds.

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CACHE, writeJson } from './sources.mjs';

const SEARCH = 'https://baseballsavant.mlb.com/statcast_search/csv';
// (whether the desk reads Statcast at all: off while no stat's ctx carries a contact term (props.mjs: xHit held by the
// replay gate, 2026-10-18), so a run doesn't download it for nothing; on, playerlogs.mjs mlbRows reads it)
export const CONTACT_ON = false;
export const SPRAY_PULL = 15;
const HIT_TB = { single: 1, double: 2, triple: 3, home_run: 4 };
const DAY = 864e5;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

// (one CSV line's fields, quotes honored)
function fields(line) {
  const out = [];
  let f = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(f), (f = '');
    else if (c !== '\r') f += c;
  }
  out.push(f);
  return out;
}

// A window's CSV to its aggregates: { '<game_pk>|<batter>': [bip, h, tb, xba, xslg, hh, brl, pullAir] }
export function contactOf(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split('\n').filter(Boolean);
  if (!lines.length) return {};
  const head = fields(lines[0]);
  const at = (k) => head.indexOf(k);
  const I = { pk: at('game_pk'), b: at('batter'), ev: at('events'), ty: at('type'), xba: at('estimated_ba_using_speedangle'), xslg: at('estimated_slg_using_speedangle'), ls: at('launch_speed'), lsa: at('launch_speed_angle'), bb: at('bb_type'), hx: at('hc_x'), hy: at('hc_y'), st: at('stand') };
  if (I.pk < 0 || I.b < 0) return {};
  const out = {};
  for (const line of lines.slice(1)) {
    const f = fields(line);
    if (I.ty >= 0 && f[I.ty] !== 'X') continue;
    const key = `${f[I.pk]}|${f[I.b]}`;
    const v = (out[key] ??= [0, 0, 0, 0, 0, 0, 0, 0]);
    v[0]++;
    const tb = HIT_TB[f[I.ev]] ?? 0;
    if (tb) (v[1] += 1), (v[2] += tb);
    const xba = Number(f[I.xba]);
    const xslg = Number(f[I.xslg]);
    if (f[I.xba] !== '' && Number.isFinite(xba)) v[3] += xba;
    if (f[I.xslg] !== '' && Number.isFinite(xslg)) v[4] += xslg;
    if (Number(f[I.ls]) >= 95) v[5]++;
    if (f[I.lsa] === '6') v[6]++;
    const hx = Number(f[I.hx]);
    const hy = Number(f[I.hy]);
    if ((f[I.bb] === 'fly_ball' || f[I.bb] === 'line_drive') && f[I.hx] !== '' && Number.isFinite(hx) && Number.isFinite(hy)) {
      const angle = (Math.atan2(hx - 125.42, 198.27 - hy) * 180) / Math.PI;
      if ((f[I.st] === 'R' && angle <= -SPRAY_PULL) || (f[I.st] === 'L' && angle >= SPRAY_PULL)) v[7]++;
    }
  }
  for (const v of Object.values(out)) (v[3] = Math.round(v[3] * 1000) / 1000), (v[4] = Math.round(v[4] * 1000) / 1000);
  return out;
}

// Every ball in play between two days (ISO), by game and batter: the windows read or asked for. null when a window
// that isn't kept can't be had (the terms read 0 for its games: their rows carry no contact)
export async function mlbContact(from, to, { get = fetch, now = Date.now() } = {}) {
  const out = new Map();
  let failed = 0;
  for (let t = Date.parse(`${from}T00:00Z`); t <= Date.parse(`${to}T00:00Z`); t += 7 * DAY) {
    const a = isoDay(t);
    const b = isoDay(Math.min(t + 6 * DAY, Date.parse(`${to}T00:00Z`)));
    const season = a.slice(0, 4);
    const file = path.join(CACHE, 'savant', season, `${a}.json`);
    const done = Date.parse(`${b}T00:00Z`) + 2 * DAY < now;
    let got = null;
    if (existsSync(file) && (done ? true : now - statSync(file).mtimeMs < 12 * 36e5)) got = JSON.parse(readFileSync(file, 'utf8'));
    if (!got) {
      const url = `${SEARCH}?all=true&hfPR=hit_into_play%7C&hfGT=R%7CF%7CD%7CL%7CW%7C&hfSea=${season}%7C&player_type=batter&game_date_gt=${a}&game_date_lt=${b}&min_pitches=0&min_results=0&min_pas=0&type=details`;
      const res = await get(url, { signal: AbortSignal.timeout(180e3) }).catch(() => null);
      const text = res?.ok ? await res.text().catch(() => null) : null;
      if (text !== null && /game_pk/.test(text.slice(0, 4000))) {
        got = contactOf(text);
        mkdirSync(path.dirname(file), { recursive: true });
        writeJson(file, got);
      } else if (existsSync(file)) got = JSON.parse(readFileSync(file, 'utf8'));
      else failed++;
    }
    for (const [k, v] of Object.entries(got ?? {})) out.set(k, v);
  }
  if (failed) console.warn(`mlb: Statcast's batted balls: ${failed} weeks not read (their games' contact terms read 0)`);
  return out;
}
