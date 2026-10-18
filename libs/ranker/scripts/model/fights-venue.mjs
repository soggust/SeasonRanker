// The venue terms' inputs, fights-venue.mjs (fights-model.mjs; the owner, 2026-10-17: home advantage "matters
// slightly, like most sports: include it and let history set its weight"). A bout's venue is ESPN's (the
// scoreboard's venue on each bout, apps/mma/scripts/fights.mjs venueOf: { name, city, state, country }); a fighter's
// country is ESPN's flag for him on the scoreboard (his citizenship), else his bio's (the fighters' cache). ESPN
// gives a fighter's gym by name only (no place), so his country stands for where he lives and trains.
//
//   home: he fights in his own country (the names ESPN uses on both sides normalized: "Korea" is South Korea,
//     "Holland" the Netherlands; England, Scotland, Wales and Northern Ireland each their own, as ESPN keeps them)
//   travel: the great-circle distance from his country's centre (its people's, roughly: the USA's in the middle
//     west, Russia's between Moscow and the Caucasus) to the venue's (its city's where kept below, else its
//     country's), in thousands of kilometres; a fighter or venue with no country: unknown
//   shift: the time zones crossed (the longitudes' gap / 15, the short way round, at most 12)
//   altitude: the venue's height (metres) for the cities above 1,000 m that hold cards (Mexico City, Denver and
//     Broomfield, Salt Lake City, Rio Rancho / Albuquerque...); every other venue counted as low
//   apex: the UFC Apex (ESPN's "Meta APEX", Las Vegas: the 25-foot cage, no paying crowd)
//   empty: no crowd: the Apex, and every card of the pandemic's closed-door months (2020-03-14 to 2021-04-23,
//     Fight Island too)

// (ESPN's names for one country made one)
const ALIAS = { Korea: 'South Korea', Holland: 'Netherlands', 'United States': 'USA', 'Chinese Taipei': 'Taiwan', Trinidad: 'Trinidad and Tobago', Turkey: 'Türkiye', 'Czech Republic': 'Czechia' };
export const countryKey = (c) => {
  const s = String(c ?? '').trim();
  if (!s || s === 'default' || s === 'null') return null;
  return ALIAS[s] ?? s;
};

// [latitude, longitude] of each country's centre (its people's where it's big)
export const COUNTRY = {
  USA: [38.5, -92], Canada: [45.5, -76], Mexico: [21, -100], Brazil: [-21, -46], Argentina: [-34, -61], Chile: [-33.5, -70.7], Uruguay: [-34.8, -56.2],
  Peru: [-12, -77], Ecuador: [-1.5, -78.5], Colombia: [5, -74.5], Venezuela: [9, -67], Bolivia: [-17, -65], Paraguay: [-25.3, -57.6], Suriname: [5.8, -55.2],
  Guyana: [6.8, -58.2], Panama: [9, -79.5], 'Costa Rica': [9.9, -84], Nicaragua: [12.5, -86], Honduras: [14.5, -87], Cuba: [22, -79.5], Jamaica: [18.1, -77.3],
  Haiti: [18.9, -72.5], 'Dominican Republic': [18.7, -70.2], 'Puerto Rico': [18.3, -66.4], 'Virgin Islands': [18.3, -64.9], Aruba: [12.5, -70], Barbados: [13.2, -59.6],
  'Trinidad and Tobago': [10.6, -61.3],
  England: [52.5, -1.5], Scotland: [56, -4], Wales: [51.8, -3.5], 'Northern Ireland': [54.6, -6.5], Ireland: [53.3, -7.5], France: [47, 2.5], Germany: [51, 10],
  Netherlands: [52.2, 5.3], Belgium: [50.8, 4.4], Luxembourg: [49.6, 6.1], Switzerland: [46.9, 8], Austria: [47.6, 14.5], Italy: [42.5, 12.5], Spain: [40.3, -3.7],
  Portugal: [39.5, -8.5], Denmark: [56, 10], Sweden: [59, 15.5], Norway: [60, 9.5], Finland: [61.5, 25], Iceland: [64.1, -21.9], Estonia: [58.8, 25.5],
  Latvia: [56.9, 24.6], Lithuania: [55.2, 24], Poland: [52, 19.5], Czechia: [49.8, 15.5], Slovakia: [48.7, 19.5], Hungary: [47.2, 19.3], Slovenia: [46.1, 14.8],
  Croatia: [45.3, 16], 'Bosnia & Herzegovina': [44, 17.8], Serbia: [44.2, 20.8], Montenegro: [42.7, 19.3], Albania: [41.2, 20], Macedonia: [41.6, 21.7],
  Greece: [38.5, 23], Bulgaria: [42.7, 25], Romania: [45.5, 25], Moldova: [47, 28.6], Ukraine: [49, 31.5], Belarus: [53.7, 28], Cyprus: [35, 33.2],
  Russia: [50, 42], Georgia: [42, 43.5], Armenia: [40.2, 44.6], Azerbaijan: [40.4, 49.5], Kazakhstan: [46, 70], Uzbekistan: [41, 67], Kyrgyzstan: [42, 74.5],
  Tajikistan: [38.6, 69], Turkmenistan: [38.5, 58], Mongolia: [47.9, 106.9], Türkiye: [39.5, 32.5], Assyria: [36, 43],
  Israel: [31.8, 34.9], Palestine: [31.9, 35.2], Lebanon: [33.9, 35.7], Jordan: [31.9, 36], Syria: [34.8, 37], Iraq: [33.3, 44.2], Iran: [34, 51.5],
  Kuwait: [29.3, 47.9], Bahrain: [26.1, 50.5], Qatar: [25.3, 51.5], 'United Arab Emirates': [24.5, 54.6], 'Saudi Arabia': [24.7, 46.7], Afghanistan: [34.5, 69],
  Pakistan: [30, 71], India: [23, 79], Nepal: [27.7, 85.3], Myanmar: [19.5, 96], Thailand: [14.5, 100.8], Vietnam: [16, 106.5], Philippines: [14, 121.5],
  Indonesia: [-6.5, 108], Singapore: [1.35, 103.8], China: [31, 114], 'Hong Kong': [22.3, 114.2], Macau: [22.2, 113.55], Taiwan: [24, 121], 'South Korea': [36.8, 127.5],
  Japan: [35.5, 137.5], Guam: [13.45, 144.8], Australia: [-33, 147], 'New Zealand': [-38.5, 175.5], Samoa: [-13.8, -172], 'American Samoa': [-14.3, -170.7],
  Tonga: [-21.2, -175.2],
  Morocco: [33, -6.8], Algeria: [36, 3.5], Tunisia: [36, 10], Egypt: [30, 31.2], Sudan: [15.6, 32.5], Nigeria: [8, 6], Ghana: [6.5, -1], 'Ivory Coast': [6.5, -5],
  Liberia: [6.4, -10], Guinea: [10, -11], 'Guinea-Bissau': [11.9, -15.6], Senegal: [14.7, -16], 'Cape Verde': [15, -23.6], Niger: [13.5, 2.1], 'Burkina Faso': [12.4, -1.5],
  Cameroon: [5, 11.5], Congo: [-4.3, 15.3], 'Democratic Republic of Congo': [-4.3, 15.3], Angola: [-8.8, 13.2], Uganda: [0.5, 32.5], Zimbabwe: [-18.5, 30.5],
  'South Africa': [-27, 27],
};

// [latitude, longitude, metres] of the cities that hold cards often, and every one above 1,000 m (the rest at their
// country's centre, low)
export const CITY = {
  'Las Vegas': [36.17, -115.14, 610], Uncasville: [41.43, -72.11, 30], 'San Jose': [37.34, -121.89, 25], 'Atlantic City': [39.36, -74.42, 5], Chicago: [41.88, -87.63, 180],
  'New York': [40.75, -73.99, 10], Brooklyn: [40.68, -73.98, 10], Newark: [40.74, -74.17, 10], 'Los Angeles': [34.05, -118.25, 90], Anaheim: [33.8, -117.88, 50],
  Inglewood: [33.96, -118.35, 40], Hollywood: [26.01, -80.15, 3], Miami: [25.78, -80.19, 2], Sunrise: [26.16, -80.26, 3], Tampa: [27.94, -82.45, 5], Orlando: [28.54, -81.38, 30],
  Jacksonville: [30.33, -81.66, 5], Houston: [29.76, -95.37, 15], Dallas: [32.78, -96.8, 140], Arlington: [32.74, -97.1, 180], 'San Antonio': [29.42, -98.49, 200],
  Austin: [30.27, -97.74, 150], Phoenix: [33.45, -112.07, 330], Glendale: [33.53, -112.26, 330], Sacramento: [38.58, -121.49, 10], Fresno: [36.74, -119.79, 100],
  'San Diego': [32.72, -117.16, 20], Temecula: [33.49, -117.15, 300], Lemoore: [36.3, -119.78, 70], Thackerville: [33.79, -97.14, 250], Nashville: [36.16, -86.78, 150],
  Atlanta: [33.75, -84.39, 320], Boston: [42.36, -71.06, 10], Washington: [38.9, -77.04, 20], Philadelphia: [39.95, -75.17, 10], Pittsburgh: [40.44, -79.99, 230],
  'St. Louis': [38.63, -90.2, 140], 'Kansas City': [39.1, -94.58, 270], 'New Orleans': [29.95, -90.07, 2], Seattle: [47.61, -122.33, 50], Portland: [45.52, -122.68, 15],
  Honolulu: [21.31, -157.86, 5], Columbus: [39.96, -83, 230], Uniondale: [40.7, -73.59, 30], Charlotte: [35.23, -80.84, 230], Milwaukee: [43.04, -87.91, 190],
  Louisville: [38.25, -85.76, 140], Minneapolis: [44.98, -93.27, 260], 'Sioux Falls': [43.55, -96.73, 450], Mulvane: [37.47, -97.24, 380], Boise: [43.62, -116.2, 820],
  Denver: [39.74, -104.99, 1609], Broomfield: [39.92, -105.09, 1650], 'Colorado Springs': [38.83, -104.82, 1839], Pueblo: [38.25, -104.61, 1430],
  'Salt Lake City': [40.76, -111.89, 1288], 'West Valley City': [40.69, -112, 1300], 'Rio Rancho': [35.23, -106.66, 1600], Albuquerque: [35.08, -106.65, 1619],
  Reno: [39.53, -119.81, 1373], 'Mexico City': [19.43, -99.13, 2240], Guadalajara: [20.67, -103.35, 1566], Bogota: [4.71, -74.07, 2640], 'La Paz': [-16.5, -68.15, 3640],
  Quito: [-0.18, -78.47, 2850], Johannesburg: [-26.2, 28.05, 1753], Pretoria: [-25.75, 28.19, 1340], Calgary: [51.05, -114.07, 1045], Ulaanbaatar: [47.92, 106.92, 1350],
  Montreal: [45.5, -73.57, 30], Toronto: [43.65, -79.38, 80], Vancouver: [49.28, -123.12, 5], Edmonton: [53.55, -113.49, 650], Winnipeg: [49.9, -97.14, 230], Ottawa: [45.42, -75.7, 70],
  Halifax: [44.65, -63.57, 10], London: [51.51, -0.13, 15], Manchester: [53.48, -2.24, 40], Birmingham: [52.49, -1.89, 140], Dublin: [53.35, -6.26, 10], Belfast: [54.6, -5.93, 5],
  Glasgow: [55.86, -4.25, 10], Paris: [48.86, 2.35, 35], Stockholm: [59.33, 18.07, 10], Hamburg: [53.55, 9.99, 10], Berlin: [52.52, 13.4, 35], 'Abu Dhabi': [24.45, 54.38, 5],
  Dubai: [25.2, 55.27, 5], Riyadh: [24.71, 46.68, 610], Saitama: [35.86, 139.65, 10], Tokyo: [35.68, 139.69, 40], Yokohama: [35.44, 139.64, 10], Osaka: [34.69, 135.5, 10],
  Nagoya: [35.18, 136.91, 15], 'Rio De Janeiro': [-22.91, -43.17, 5], 'Sao Paulo': [-23.55, -46.63, 760], Brasilia: [-15.79, -47.88, 1170], Fortaleza: [-3.72, -38.54, 20],
  'Belo Horizonte': [-19.92, -43.94, 850], Goiania: [-16.68, -49.25, 750], Sydney: [-33.87, 151.21, 20], Melbourne: [-37.81, 144.96, 30], Perth: [-31.95, 115.86, 20],
  Adelaide: [-34.93, 138.6, 50], Brisbane: [-27.47, 153.03, 30], Auckland: [-36.85, 174.76, 20], Kallang: [1.3, 103.87, 5], Cotai: [22.14, 113.56, 5], Shanghai: [31.23, 121.47, 5],
  Moscow: [55.76, 37.62, 150], 'Saint Petersburg': [59.94, 30.31, 5], Baku: [40.41, 49.87, 0], 'Tel Aviv': [32.08, 34.78, 5], Manila: [14.6, 120.98, 10],
};

// (a US state's code: the venue's country where ESPN left it out)
const US_STATE = /^(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])$/;

// A venue's country, centre and height: { country, at: [lat, lon], alt (metres) } or null
export function placeOf(venue) {
  if (!venue) return null;
  const country = countryKey(venue.country) ?? (US_STATE.test(venue.state ?? '') ? 'USA' : null);
  // (a city kept here by name, and in the venue's country (or none named): its own place; a namesake abroad,
  // Birmingham, Alabama, or London, Ontario, isn't)
  const named = CITY[venue.city];
  const inCountry = (c) => (country === 'USA' ? c[1] < -60 && c[1] > -170 : !country || !COUNTRY[country] || kkm(c, COUNTRY[country]) < 4500);
  const city = named && inCountry(named) ? named : null;
  const at = city ? [city[0], city[1]] : country ? COUNTRY[country] ?? null : null;
  return { country, at, alt: city ? city[2] : 0, apex: /apex/i.test(venue.name ?? '') };
}

const RAD = Math.PI / 180;
// The great-circle distance between two [lat, lon], in thousands of kilometres
export function kkm(p, q) {
  const [a, b] = [p[0] * RAD, q[0] * RAD];
  const d = Math.sin((a - b) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(((p[1] - q[1]) * RAD) / 2) ** 2;
  return (2 * 6371 * Math.asin(Math.min(1, Math.sqrt(d)))) / 1000;
}
// The time zones between two longitudes (the short way round)
export function zones(lonA, lonB) {
  const d = Math.abs(lonA - lonB) % 360;
  return Math.min(d, 360 - d) / 15;
}

// (the closed-door months: no crowd at any card)
const EMPTY = ['2020-03-14', '2021-04-23'];
export const emptyOn = (date, place) => !!place?.apex || (date >= EMPTY[0] && date <= EMPTY[1]);

// One fighter's venue numbers at a bout: home (1 in his own country, 0 not, null either unknown), travel (thousand
// km), shift (zones), null where unknown
export function venueSide(country, place) {
  const c = countryKey(country);
  if (!c || !place?.country) return { home: null, travel: null, shift: null };
  const from = COUNTRY[c];
  const home = c === place.country ? 1 : 0;
  if (!from || !place.at) return { home, travel: null, shift: null };
  return { home, travel: kkm(from, place.at), shift: zones(from[1], place.at[1]) };
}
