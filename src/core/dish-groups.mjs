export function groupByDish(places) {
  const bins = new Map();
  for (const place of places) {
    const kind = place.kind?.trim() || ({an:'Món khác','ca-phe':'Cà phê',nhau:'Nhậu',choi:'Chơi'})[place.group];
    const name = [[/^(?:quán )?trà(?: |$)/i,'Trà'],[/^(?:kem|tiệm bánh)(?: |$)/i,'Kem và bánh'],[/bánh mì/i,'Bánh mì'],[/phở|bún|miến/i,'Phở và bún'],[/lẩu|nướng/i,'Lẩu và nướng'],[/pizza|pasta|món ý/i,'Món Ý']].find(([pattern]) => pattern.test(kind))?.[1] || kind.charAt(0).toLocaleUpperCase('vi') + kind.slice(1);
    if (!bins.has(name)) bins.set(name, []);
    bins.get(name).push(place);
  }
  const groups = new Map();
  for (const [name, rows] of bins) {
    if (rows.length <= 30) { groups.set(name, rows); continue; }
    for (const place of rows) {
      const district = place.district?.trim();
      const key = district ? `${name} ở ${district}` : `${name} khác`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(place);
    }
  }
  const rank = new Map(places.map((place, index) => [place, index]));
  return new Map([...groups].sort((a, b) => rank.get(a[1][0]) - rank.get(b[1][0])));
}
