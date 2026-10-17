// The NFL's primary helmets, 2000 to today: each team's eras (a new era at every major helmet change: a new
// shell color or finish, a stripe change, a facemask color change, a new logo), oldest first, the last one
// open-ended. Alternates, throwbacks and Color Rush helmets are left out. Keyed as team-colors.ts is. A `?` in
// `note` marks something the sources didn't settle. (The helmet piece draws each team's primary logo as the
// side decal; the Browns' plain shell, the Bengals' tiger stripes, the Eagles' wings, the Rams' and Vikings'
// horns and the Football Team's player number need a decal field the table doesn't have yet.)
//
// Sources: the Wikipedia "Logos and uniforms of the <team>" articles (or the team article's "Logos and uniforms"
// section), sportslogos.net's helmet histories (https://www.sportslogos.net/logos/list_by_team/<id>/, each era's
// helmet page and its description), and news coverage of the changes cited per team. Hexes are the teams'
// published colors (teamcolorcodes.com) where one fits, else an approximation.
import type { HelmetTable } from '@ranker/engine/uniform-eras';

const GREY_MASK = '#8a8d8f';

export const HELMET_ERAS: HelmetTable = {
  // Wikipedia (Logos and uniforms of the San Francisco 49ers); sportslogos.net /list_by_team/179 (2009 helmet:
  // "Gold helmet, red and white stripes ... grey facemask")
  '49ers': [
    { from: 2000, to: 2008, shell: '#b3995d', finish: 'metallic', stripe: 'triple', colors: ['#aa0000', '#000000'], mask: '#aa0000', logo: '#aa0000', note: 'black-cardinal-black stripe, cardinal mask; SF oval with black and gold trim' },
    { from: 2009, shell: '#b3995d', finish: 'metallic', stripe: 'triple', colors: ['#aa0000', '#ffffff'], mask: GREY_MASK, logo: '#aa0000', note: 'red-white-red stripe returns, grey mask; which color is the center stripe (red or white)?' },
  ],
  // Wikipedia (Logos and uniforms of the Chicago Bears: navy masks since 1982); sportslogos.net /list_by_team/169
  // (1997-2001 and 2002- helmets: navy shell and mask, orange wishbone C with white trim, no stripes)
  Bears: [
    { from: 2000, to: 2001, shell: '#0b162a', stripe: 'none', mask: '#0b162a', logo: '#c83803' },
    { from: 2002, shell: '#0b162a', stripe: 'none', mask: '#0b162a', logo: '#c83803', note: 'navy darkened slightly in 2002' },
  ],
  // sportslogos.net /list_by_team/154 (1981-: "Orange helmet, black tiger stripes with black facemask")
  Bengals: [
    { from: 2000, shell: '#fb4f14', stripe: 'none', mask: '#000000', logo: '#000000', note: 'no crown stripe: black tiger stripes cover the shell (logo = the stripes)' },
  ],
  // Wikipedia (Logos and uniforms of the Buffalo Bills); sportslogos.net /list_by_team/149
  Bills: [
    { from: 2000, to: 2001, shell: '#c60c30', stripe: 'triple', colors: ['#00338d', '#ffffff'], mask: '#ffffff', logo: '#00338d', note: 'red shell, blue and white stripes; stripe order (blue center?)' },
    { from: 2002, to: 2010, shell: '#c60c30', stripe: 'triple', colors: ['#0d254c', '#a5acaf'], mask: '#ffffff', logo: '#00338d', note: 'navy, nickel, royal and white stripes; simplified to center + trim?' },
    { from: 2011, to: 2020, shell: '#ffffff', stripe: 'triple', colors: ['#c60c30', '#00338d'], mask: GREY_MASK, logo: '#00338d', note: 'white shell, red/royal/navy stripes, grey facemask (sportslogos and the 2021 change "from grey to white")' },
    { from: 2021, shell: '#ffffff', stripe: 'triple', colors: ['#c60c30', '#00338d'], mask: '#ffffff', logo: '#00338d', note: 'white facemask from 2021' },
  ],
  // Wikipedia (Logos and uniforms of the Denver Broncos: navy masks from 1997, 2024 Mile High Collection);
  // sportslogos.net /list_by_team/161 (1997-: "Navy helmet, white bronco logo with orange stripes, navy facemask")
  Broncos: [
    { from: 2000, to: 2023, shell: '#0a2343', stripe: 'none', mask: '#0a2343', logo: '#ffffff', note: 'horse head white with orange mane; no crown stripe? (sportslogos mentions "orange stripes", likely the mane)' },
    { from: 2024, shell: '#0a2343', stripe: 'none', mask: '#0a2343', logo: '#ffffff', note: 'updated logo; triangle clusters (not a stripe) on the crown' },
  ],
  // Wikipedia (Logos and uniforms of the Cleveland Browns: grey mask 2006, brown 2015, white 2024);
  // sportslogos.net /list_by_team/155 (1975-95/1999-2005: "brown and white stripes with white facemask")
  Browns: [
    { from: 2000, to: 2005, shell: '#f1592a', stripe: 'triple', colors: ['#ffffff', '#311d00'], mask: '#ffffff', note: 'no logo; brown-white-brown stripe; mask white? (sportslogos: same helmet as 1975-95)' },
    { from: 2006, to: 2014, shell: '#f1592a', stripe: 'triple', colors: ['#ffffff', '#311d00'], mask: GREY_MASK, note: 'no logo; grey facemask' },
    { from: 2015, to: 2023, shell: '#ff3c00', stripe: 'triple', colors: ['#ffffff', '#311d00'], mask: '#311d00', note: 'no logo; brighter orange, brown facemask' },
    { from: 2024, shell: '#ff3c00', stripe: 'triple', colors: ['#ffffff', '#311d00'], mask: '#ffffff', note: 'no logo; white facemask' },
  ],
  // Wikipedia (Tampa Bay Buccaneers, Logos and uniforms: 2014 darker pewter, chrome-effect mask, bigger logo);
  // sportslogos.net /list_by_team/176 (1997-2013 pewter, flag logo; 2020-: pewter shell, black facemask)
  Bucs: [
    { from: 2000, to: 2013, shell: '#8f8f8c', finish: 'metallic', stripe: 'none', mask: '#5a5a5a', logo: '#d50a0a', note: 'pewter shell, red flag; mask color (dark pewter/grey?)' },
    { from: 2014, shell: '#5f5a54', finish: 'metallic', stripe: 'none', mask: '#4a4a4a', logo: '#d50a0a', note: 'darker pewter, larger flag, chrome-effect mask; kept through the 2020 uniform change? (sportslogos calls the 2020 mask black)' },
  ],
  // sportslogos.net /list_by_team/177 (white shell, grey facemask; new cardinal head 2005, feather shading 2023)
  Cardinals: [
    { from: 2000, to: 2004, shell: '#ffffff', stripe: 'none', mask: GREY_MASK, logo: '#97233f' },
    { from: 2005, shell: '#ffffff', stripe: 'none', mask: GREY_MASK, logo: '#97233f', note: 'modernized cardinal head (shading added 2023)' },
  ],
  // sportslogos.net /list_by_team/164 (San Diego) and /6446 (Los Angeles)
  Chargers: [
    { from: 2000, to: 2006, shell: '#002244', stripe: 'none', mask: '#002244', logo: '#ffffff', note: 'white bolt with navy and gold outline' },
    { from: 2007, to: 2018, shell: '#ffffff', finish: 'metallic', stripe: 'none', mask: '#002244', logo: '#ffc20e', note: 'gold bolt with powder blue and navy outline' },
    { from: 2019, to: 2019, shell: '#ffffff', finish: 'metallic', stripe: 'none', mask: '#ffc20e', logo: '#ffc20e', note: 'gold facemask (navy mask kept only with the navy alternates)' },
    { from: 2020, shell: '#ffffff', stripe: 'none', mask: '#ffc20e', logo: '#ffc20e', note: 'bolt outline powder blue only; player number under the bolt; finish metallic or gloss?' },
  ],
  // Wikipedia (Logos and uniforms of the Kansas City Chiefs: white masks since 1974); sportslogos.net /list_by_team/162
  Chiefs: [
    { from: 2000, shell: '#e31837', stripe: 'none', mask: '#ffffff', logo: '#ffffff', note: 'white arrowhead with red KC outlined black' },
  ],
  // Wikipedia (Logos and uniforms of the Indianapolis Colts: blue mask to grey in 2004); sportslogos.net /list_by_team/158
  Colts: [
    { from: 2000, to: 2003, shell: '#ffffff', stripe: 'single', colors: ['#002c5f'], mask: '#002c5f', logo: '#002c5f' },
    { from: 2004, shell: '#ffffff', stripe: 'single', colors: ['#002c5f'], mask: GREY_MASK, logo: '#002c5f', note: 'grey facemask' },
  ],
  // Wikipedia (Washington Commanders: gold masks since 1978); sportslogos.net /list_by_team/168 (Redskins),
  // /6741 (Washington Football Team), /6832 (Commanders)
  Commanders: [
    { from: 2000, to: 2019, shell: '#5a1414', stripe: 'triple', colors: ['#ffb612', '#ffffff'], mask: '#ffb612', logo: '#ffb612', note: 'Redskins: white, burgundy and gold stripes (order?); logo the feathered head in a gold-ringed circle' },
    { from: 2020, to: 2021, shell: '#5a1414', stripe: 'triple', colors: ['#ffb612', '#ffffff'], mask: '#ffb612', logo: '#ffb612', note: 'Washington Football Team: the Redskins helmet with the logo swapped for the gold player number; the gold/white stripes stayed' },
    { from: 2022, to: 2025, shell: '#5a1414', stripe: 'single', colors: ['#ffb612'], mask: '#5a1414', logo: '#ffb612', note: 'Commanders: satin burgundy, gold W, single gold stripe, burgundy facemask' },
    { from: 2026, shell: '#5a1414', stripe: 'single', colors: ['#ffb612'], mask: '#ffb612', logo: '#ffb612', note: '2026 glossy burgundy helmet, gold facemask back; stripe pattern (single gold or the classic gold/white)?' },
  ],
  // Wikipedia (Logos and uniforms of the Dallas Cowboys: "Metallic Silver Blue", blue/white/blue stripe);
  // sportslogos.net /list_by_team/165
  Cowboys: [
    { from: 2000, shell: '#869397', finish: 'metallic', stripe: 'triple', colors: ['#ffffff', '#002a5c'], mask: '#002a5c', logo: '#002a5c', note: 'blue star with white and blue border; facemask navy or grey?' },
  ],
  // Wikipedia (Miami Dolphins: 2013 white helmet and mask, navy prominent on the stripe; 2018 navy dropped);
  // sportslogos.net /list_by_team/150
  Dolphins: [
    { from: 2000, to: 2012, shell: '#ffffff', stripe: 'triple', colors: ['#008e97', '#f26a24'], mask: '#ffffff', logo: '#008e97', note: 'aqua, orange and navy stripes (order?); mask white for the whole era or aqua/navy early?' },
    { from: 2013, to: 2017, shell: '#ffffff', stripe: 'triple', colors: ['#005778', '#008e97'], mask: '#ffffff', logo: '#008e97', note: 'new swimming dolphin; navy-led stripe with aqua and orange' },
    { from: 2018, shell: '#ffffff', stripe: 'triple', colors: ['#008e97', '#fc4c02'], mask: '#ffffff', logo: '#008e97', note: 'navy dropped from the stripe? (sportslogos has no description)' },
  ],
  // Wikipedia (Logos and uniforms of the Philadelphia Eagles); sportslogos.net /list_by_team/167 (1996-: "Green
  // helmet with modern silver, black and white wing on side")
  Eagles: [
    { from: 2000, shell: '#004c54', stripe: 'none', mask: '#000000', logo: '#ffffff', note: 'no stripe: white wings with silver and black; facemask black?' },
  ],
  // sportslogos.net /list_by_team/173 (black shells, no stripes, black masks; new logo 2003; matte, chrome mask 2020)
  Falcons: [
    { from: 2000, to: 2002, shell: '#101820', stripe: 'none', mask: '#000000', logo: '#a71930', note: 'old falcon logo: main color red or black?' },
    { from: 2003, to: 2019, shell: '#101820', stripe: 'none', mask: '#000000', logo: '#a71930', note: 'new F-shaped falcon' },
    { from: 2020, to: 2025, shell: '#101820', finish: 'matte', stripe: 'none', mask: '#a5acaf', logo: '#a71930', note: 'matte shell, chrome-like silver facemask' },
    { from: 2026, shell: '#101820', finish: 'gloss', stripe: 'none', mask: GREY_MASK, logo: '#a71930', note: '2026 set: low-gloss black shell, grey facemask' },
  ],
  // Wikipedia (Logos and uniforms of the New York Giants); sportslogos.net /list_by_team/166 ("Metallic blue helmet
  // with red stripe")
  Giants: [
    { from: 2000, shell: '#0b2265', finish: 'metallic', stripe: 'single', colors: ['#a71930'], mask: GREY_MASK, logo: '#ffffff', note: 'white lowercase ny' },
  ],
  // Wikipedia (Logos and uniforms of the Jacksonville Jaguars); sportslogos.net /list_by_team/159
  Jaguars: [
    { from: 2000, to: 2008, shell: '#101820', stripe: 'none', mask: '#101820', logo: '#d7a22a', note: 'gold and teal jaguar head' },
    { from: 2009, to: 2012, shell: '#101820', finish: 'metallic', stripe: 'none', mask: '#101820', logo: '#d7a22a', note: 'black with a teal color-shift sheen on shell and mask; metallic or chrome?' },
    { from: 2013, to: 2017, shell: '#101820', finish: 'matte', stripe: 'none', fade: ['#101820', '#9f792c'], mask: '#101820', logo: '#d7a22a', note: 'two-tone: matte black at the front fading to glossy metallic gold at the back' },
    { from: 2018, shell: '#101820', stripe: 'none', mask: '#101820', logo: '#d7a22a', note: 'all-black gloss; mask black? (sportslogos has no description)' },
  ],
  // Wikipedia (Logos and uniforms of the New York Jets); sportslogos.net /list_by_team/152
  Jets: [
    { from: 2000, to: 2018, shell: '#ffffff', stripe: 'double', colors: ['#125740'], mask: '#125740', logo: '#125740', note: 'two parallel green stripes' },
    { from: 2019, to: 2023, shell: '#125740', finish: 'metallic', stripe: 'none', mask: '#000000', logo: '#ffffff' },
    { from: 2024, shell: '#125740', finish: 'metallic', stripe: 'none', mask: '#ffffff', logo: '#ffffff', note: '1978-89 style JETS wordmark' },
  ],
  // sportslogos.net /list_by_team/170; 2017 change (black dropped, chrome/silver mask, wider center stripe):
  // ESPN and sportslogos.net news, April 2017
  Lions: [
    { from: 2000, to: 2002, shell: '#b0b7bc', stripe: 'triple', colors: ['#0076b6', '#ffffff'], mask: '#0076b6', logo: '#0076b6', note: 'blue and white stripes (order?); mask blue?' },
    { from: 2003, to: 2008, shell: '#b0b7bc', stripe: 'triple', colors: ['#0076b6', '#000000'], mask: '#0076b6', logo: '#0076b6', note: 'black added to the stripes; mask blue?' },
    { from: 2009, to: 2016, shell: '#b0b7bc', stripe: 'triple', colors: ['#0076b6', '#000000'], mask: '#000000', logo: '#0076b6', note: 'new lion logo, black facemask' },
    { from: 2017, to: 2023, shell: '#b0b7bc', stripe: 'triple', colors: ['#0076b6', '#ffffff'], mask: '#a5acaf', logo: '#0076b6', note: 'black dropped; chrome-silver facemask; stripe pattern?' },
    { from: 2024, shell: '#b0b7bc', stripe: 'triple', colors: ['#0076b6', '#ffffff'], mask: '#0076b6', logo: '#0076b6', note: '2024 set: blue and white stripes to match the sleeves, Honolulu blue facemask (as 1984-2002)' },
  ],
  // sportslogos.net /list_by_team/171 (1980-: "Yellow with green facemask, and green and white stripes")
  Packers: [
    { from: 2000, shell: '#ffb612', stripe: 'triple', colors: ['#ffffff', '#203731'], mask: '#203731', logo: '#203731', note: 'green-white-green stripe' },
  ],
  // Wikipedia (Carolina Panthers: logo blue darkened 2012); sportslogos.net /list_by_team/174 (1995-2011: "Silver
  // with black facemask, black and lightblue curved stripes")
  Panthers: [
    { from: 2000, to: 2011, shell: '#bfc0bf', finish: 'metallic', stripe: 'triple', colors: ['#101820', '#0085ca'], mask: '#101820', logo: '#0085ca', note: 'black center stripe outlined in blue (the reverse of the jersey trim)' },
    { from: 2012, shell: '#bfc0bf', finish: 'metallic', stripe: 'triple', colors: ['#101820', '#0085ca'], mask: '#101820', logo: '#0085ca', note: 'revised logo with darker blue; stripe unchanged' },
  ],
  // sportslogos.net /list_by_team/151 (2000-: "Silver helmet, navy logo, red facemask")
  Patriots: [
    { from: 2000, shell: '#b0b7bc', finish: 'metallic', stripe: 'none', mask: '#c60c30', logo: '#002244', note: 'Flying Elvis; facemask red per sportslogos, navy?' },
  ],
  // sportslogos.net /list_by_team/163 (Oakland) and /6708 (Las Vegas)
  Raiders: [
    { from: 2000, to: 2019, shell: '#a5acaf', finish: 'metallic', stripe: 'single', colors: ['#000000'], mask: GREY_MASK, logo: '#000000' },
    { from: 2020, shell: '#a5acaf', finish: 'metallic', stripe: 'single', colors: ['#000000'], mask: '#a5acaf', logo: '#000000', note: 'Las Vegas: facemask matches the silver shell (vs grey before; a slight change?)' },
  ],
  // sportslogos.net /list_by_team/178 (St. Louis) and /5941 (Los Angeles); 2017 white horns and white mask:
  // NFL.com / therams.com, March 2017
  Rams: [
    { from: 2000, to: 2016, shell: '#002244', stripe: 'none', mask: '#002244', logo: '#b3995d', note: 'horns (not a stripe) in metallic New Century Gold' },
    { from: 2017, to: 2019, shell: '#002244', stripe: 'none', mask: '#ffffff', logo: '#ffffff', note: 'white horns, white facemask' },
    { from: 2020, shell: '#003594', stripe: 'none', mask: '#003594', logo: '#ffd100', note: 'royal blue with yellow-gold horns; facemask royal or navy?' },
  ],
  // sportslogos.net /list_by_team/153 (1999-: black shell, two tapered purple stripes, black facemask)
  Ravens: [
    { from: 2000, shell: '#000000', stripe: 'double', colors: ['#241773'], mask: '#000000', logo: '#241773' },
  ],
  // sportslogos.net /list_by_team/175 (2000-: "Gold with black facemask and black and white stripes")
  Saints: [
    { from: 2000, shell: '#d3bc8d', finish: 'metallic', stripe: 'triple', colors: ['#000000', '#ffffff'], mask: '#000000', logo: '#000000', note: 'black and white stripes (order?)' },
  ],
  // Wikipedia (Seattle Seahawks, Logos and uniforms); sportslogos.net /list_by_team/180
  Seahawks: [
    { from: 2000, to: 2001, shell: '#a5acaf', finish: 'metallic', stripe: 'none', mask: '#002a5c', logo: '#002a5c' },
    { from: 2002, to: 2011, shell: '#4d6fa8', finish: 'metallic', stripe: 'none', mask: '#002244', logo: '#002244', note: '"Seahawks Blue" shell (hex approximate?)' },
    { from: 2012, shell: '#002244', stripe: 'none', mask: '#002244', logo: '#a5acaf', note: 'College Navy, feather pattern along the crown (not a stripe); finish gloss?' },
  ],
  // Wikipedia (Logos and uniforms of the Pittsburgh Steelers); sportslogos.net /list_by_team/156
  Steelers: [
    { from: 2000, shell: '#101820', stripe: 'single', colors: ['#ffb612'], mask: '#101820', logo: '#ffffff', note: 'Steelmark on the right side only' },
  ],
  // Wikipedia (Logos and uniforms of the Houston Texans); sportslogos.net /list_by_team/157
  Texans: [
    { from: 2002, to: 2023, shell: '#03202f', stripe: 'none', mask: '#03202f', logo: '#a71930', note: 'red, white and blue bull head' },
    { from: 2024, shell: '#021018', stripe: 'none', mask: '#021018', logo: '#eb0028', note: 'darker blue, brighter red' },
  ],
  // Wikipedia (Logos and uniforms of the Tennessee Titans); sportslogos.net /list_by_team/160; 2026: CBS Sports and
  // NBC/AP coverage of the March 2026 rebrand
  Titans: [
    { from: 2000, to: 2017, shell: '#ffffff', stripe: 'triple', colors: ['#0c2340', '#c8102e'], mask: '#0c2340', logo: '#4b92db', note: 'navy tapered stripes (red trim?)' },
    { from: 2018, to: 2025, shell: '#0c2340', stripe: 'single', colors: ['#8a8d8f'], mask: '#8a8d8f', logo: '#4b92db', note: 'silver sword-shaped center stripe, metallic grey facemask' },
    { from: 2026, shell: '#ffffff', stripe: 'single', colors: ['#c8102e'], mask: '#ffffff', logo: '#4b92db', note: 'Shield logo, white facemask; the red "six-string" center stripe (thin navy lines inside it) drawn as a single red stripe' },
  ],
  // Wikipedia (Logos and uniforms of the Minnesota Vikings); sportslogos.net /list_by_team/172
  Vikings: [
    { from: 2000, to: 2005, shell: '#4f2683', stripe: 'none', mask: '#4f2683', logo: '#ffffff', note: 'white and gold horn' },
    { from: 2006, to: 2012, shell: '#4f2683', finish: 'metallic', stripe: 'none', mask: '#4f2683', logo: '#ffffff', note: 'revised horn' },
    { from: 2013, shell: '#4f2683', finish: 'matte', stripe: 'none', mask: '#101820', logo: '#ffffff', note: 'matte purple, black facemask' },
  ],
};
