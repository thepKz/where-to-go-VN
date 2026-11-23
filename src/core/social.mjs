/**
 * Người kia đang ở đâu trong lượt này, lấy từ phiếu của lượt.
 * Trả về null khi nhà chỉ có một máy. state: none (chưa vào lượt), swiping (đang lướt), done (đã lướt xong).
 * Có nhiều máy khác thì lấy máy đi xa nhất.
 */
export function otherProgress({ members, votes, placeIds, myId }) {
  const others = (members ?? []).filter(member => member.id !== myId);
  if (!others.length) return null;
  const ids = placeIds ?? [];
  const total = new Set(ids).size;
  const rows = others.map(member => ({ id: member.id, count: new Set((votes ?? []).filter(vote => vote.member_id === member.id && ids.includes(vote.place_id)).map(vote => vote.place_id)).size }));
  rows.sort((left, right) => right.count - left.count);
  const best = rows[0];
  return { id: best.id, count: best.count, state: total > 0 && best.count >= total ? 'done' : best.count > 0 ? 'swiping' : 'none' };
}
/** Mã những người khác đã Thích một chỗ trong lượt (phiếu mới nhất của mỗi người). */
export function otherLikers({ votes, placeId, myId }) {
  const latest = new Map();
  for (const vote of votes ?? []) if (vote.place_id === placeId && vote.member_id !== myId) latest.set(vote.member_id, vote.like);
  return [...latest].filter(([, like]) => like).map(([id]) => id);
}
