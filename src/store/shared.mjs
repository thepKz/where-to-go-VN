export const tableNames = ['households', 'members', 'marks', 'custom_places', 'rounds', 'votes', 'picks'];
export function emptyTables() { return Object.fromEntries(tableNames.map(name => [name, []])); }
export function rowKey(table, row) {
  if (table === 'marks') return [row.household_id, row.place_id, row.member_id].join('/');
  if (table === 'votes') return [row.round_id, row.member_id, row.place_id].join('/');
  if (table === 'picks') return [row.household_id, row.round_id].join('/');
  return row.id;
}
export function applyChange(tables, { table, row }) {
  if (!tableNames.includes(table)) throw new TypeError('Unknown table');
  const key = rowKey(table, row);
  if (!key) throw new TypeError('Missing key');
  const index = tables[table].findIndex(existing => rowKey(table, existing) === key);
  if (index < 0) tables[table].push(row);
  else tables[table][index] = row;
  return tables;
}
/**
 * Đổi danh tính trong một thay đổi đang chờ: thay đổi ghi lúc máy chưa vào nhà mang mã người dùng và mã nhà tạm,
 * khi vào nhà xong phải mang mã thật. Mã vòng có chứa mã nhà nên đổi theo.
 */
export function remapChange(change, from, to) {
  if (from.memberId === to.memberId && from.householdId === to.householdId) return change;
  const member = value => (value === from.memberId ? to.memberId : value);
  const house = value => (value === from.householdId ? to.householdId : value);
  const round = value => (typeof value === 'string' && from.householdId ? value.split(from.householdId).join(to.householdId) : value);
  const row = { ...change.row };
  switch (change.table) {
    case 'households': row.id = house(row.id); break;
    case 'members': row.id = member(row.id); row.household_id = house(row.household_id); break;
    case 'marks': row.household_id = house(row.household_id); row.member_id = member(row.member_id); break;
    case 'custom_places': row.household_id = house(row.household_id); row.added_by = member(row.added_by); break;
    case 'rounds': row.household_id = house(row.household_id); row.id = round(row.id); break;
    case 'votes': row.member_id = member(row.member_id); row.round_id = round(row.round_id); break;
    case 'picks': row.household_id = house(row.household_id); row.round_id = round(row.round_id); if (row.picked_by) row.picked_by = member(row.picked_by); break;
    default: break;
  }
  return { ...change, row };
}
