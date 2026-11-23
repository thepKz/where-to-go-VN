/** Khung bản đồ của một thành phố, có thêm lề theo độ. */
export function mapCityBounds({ places = [], areas = [], padding = 0.1 } = {}) {
  const points = [
    ...areas,
    ...places.filter(place => Number.isFinite(place?.lat) && Number.isFinite(place?.lng)),
  ].filter(point => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  if (!points.length) return null;
  const latitudes = points.map(point => point.lat);
  const longitudes = points.map(point => point.lng);
  const round = value => Number(value.toFixed(6));
  return {
    south: round(Math.min(...latitudes) - padding),
    west: round(Math.min(...longitudes) - padding),
    north: round(Math.max(...latitudes) + padding),
    east: round(Math.max(...longitudes) + padding),
  };
}

/** Chỗ nằm trong nơi chứa chỉ tách thành ghim riêng khi đã phóng đủ gần. */
export function shouldShowPlacePin(place, zoom, threshold = 18) {
  return !place?.areaId || zoom >= threshold;
}

/** Chạm ngắn chỉ là bấm, còn vượt ngưỡng thì là kéo bản đồ. */
export function isMapTap(start, end, threshold = 6) {
  if (!start || !end) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) < threshold;
}

/** Chọn viên nơi chứa cần thu nhỏ để các hộp không còn giao nhau. */
export function selectCollapsedAreaPins(boxes, collapsedSize = 44) {
  const state = new Map(boxes.map(box => [box.id, false]));
  const rect = box => {
    const size = state.get(box.id) ? collapsedSize : null;
    if (size === null) return { left: box.left, right: box.left + box.width, top: box.top, bottom: box.top + box.height };
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    return { left: cx - size / 2, right: cx + size / 2, top: cy - size / 2, bottom: cy + size / 2 };
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left], b = boxes[right], ar = rect(a), br = rect(b);
        if (!(ar.left < br.right && ar.right > br.left && ar.top < br.bottom && ar.bottom > br.top)) continue;
        let target = a.count === b.count ? (a.id > b.id ? a : b) : (a.count < b.count ? a : b);
        if (state.get(target.id)) target = state.get(a.id) ? b : a;
        if (!state.get(target.id)) { state.set(target.id, true); changed = true; }
      }
    }
  }
  return boxes.filter(box => state.get(box.id)).map(box => box.id).sort();
}

/** Lọc các chỗ có ghim lẻ nằm trong khung bản đồ hiện tại. */
export function filterMapPlacesInBounds(places, bounds, targetOf = place => place, zoom = 19) {
  if (!bounds) return [];
  return places.filter(place => {
    const target = targetOf(place);
    return place.geo !== 'area' && target && shouldShowPlacePin(target, zoom) && target.lat >= bounds.south && target.lat <= bounds.north && target.lng >= bounds.west && target.lng <= bounds.east;
  });
}
