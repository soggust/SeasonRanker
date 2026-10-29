// Basketball-Reference's team roster page: each row's number and the player's id (his page's name).
//   <th data-stat="number">0</th><td data-stat="player"><a href='/players/t/tatumja01.html'>Jayson Tatum</a></td>
// (2026-10: the player cell lost its data-append-csv="tatumja01" attribute, which the reader had keyed on; the
// link names him now, and the old attribute is still read when a page has it)
export function parseRosterNumbers(html) {
  const out = new Map();
  for (const m of html.matchAll(/data-stat="number"[^>]*>([^<]*)<\/th>\s*<td[^>]*data-stat="player"[^>]*>(?:\s*<a href=['"]\/players\/\w\/([a-z0-9]+)\.html['"])?/g)) {
    const id = m[2] ?? /data-append-csv="([^"]+)"/.exec(m[0])?.[1];
    // (two numbers in a season, "8, 24": the later one)
    const num = m[1].split(',').map((x) => x.trim()).filter(Boolean).at(-1);
    if (id && num) out.set(id, num);
  }
  return out;
}
