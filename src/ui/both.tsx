import { useMemo } from 'react'
import { useApp, useStore } from '../app-context'
import { copy } from '../copy'
import type { Place } from '../store'
import { Card, PlaceRow } from './index'

/** Chỗ cả hai người đều muốn đi, mới đánh dấu trước, tối đa năm. */
export function useBothWant(): Place[] {
  const { store, state } = useStore()
  return useMemo(() => {
    const byPlace = new Map<string, { members: Set<string>; stamp: string }>()
    for (const mark of state.marks) {
      if (!mark.want) continue
      const entry = byPlace.get(mark.place_id) || { members: new Set<string>(), stamp: '' }
      entry.members.add(mark.member_id)
      if (mark.updated_at > entry.stamp) entry.stamp = mark.updated_at
      byPlace.set(mark.place_id, entry)
    }
    return [...byPlace].filter(([, entry]) => entry.members.size > 1).sort((left, right) => right[1].stamp.localeCompare(left[1].stamp))
      .map(([id]) => store.getPlace(id)).filter((item): item is Place => !!item && item.status !== 'closed').slice(0, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.marks, state.catalog, state.custom_places])
}

/** Danh sách chỗ cả hai muốn đi. Không có chỗ nào thì không vẽ gì. */
export function BothWant({ places, limit = 5 }: { places: Place[]; limit?: number }) {
  const app = useApp()
  if (!places.length) return null
  return <Card className="both-card" data-region="both-want"><h2 className="both-title">{copy.bothWant}</h2><div className="both-list">{places.slice(0, limit).map(item => <PlaceRow key={item.id} place={item} origin={app.origin} arrow />)}</div></Card>
}
