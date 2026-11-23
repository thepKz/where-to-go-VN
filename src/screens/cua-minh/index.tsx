import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useApp, useNames, useStore } from '../../app-context'
import { copy } from '../../copy'
import { uuid } from '../../store/uuid'
import type { Group, Mark, Place, Verdict } from '../../store'
import { Button, Card, Chip, EmptyState, Icon, PlaceRow, Sheet, sortByDistance } from '../../ui'
import { Glyph } from '../chi-tiet/icons'
import { mineText } from './text'
import './cua-minh.css'

type Tab = 'want' | 'great' | 'visited'
const tabs: Tab[] = ['want', 'great', 'visited']
const groups = Object.keys(copy.groups) as Group[]

function verdictOf(marks: Mark[]): Exclude<Verdict, null> | undefined {
  return marks.some(mark => mark.verdict === 'never') ? 'never' : marks.some(mark => mark.verdict === 'great') ? 'great' : marks.some(mark => mark.verdict === 'ok') ? 'ok' : undefined
}

function toLink(value: string) {
  const text = value.trim()
  if (!text) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url.href : null
  } catch { return null }
}

function isMapsLink(value: string) {
  const host = new URL(value).hostname
  return /(^|\.)google\.[a-z.]+$/.test(host) && /\/maps/.test(new URL(value).pathname) || host === 'maps.app.goo.gl' || host === 'goo.gl'
}

function AddPlace({ open, onClose, initialGroup }: { open: boolean; onClose: () => void; initialGroup: Group }) {
  const { store } = useStore()
  const app = useApp()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [link, setLink] = useState('')
  const [group, setGroup] = useState<Group>(initialGroup)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => { setError(''); onClose() }
  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (busy) return
    const url = toLink(link)
    if (url === null) { setError(copy.errors.link); return }
    if (!name.trim() || (!address.trim() && !url)) { setError(copy.errors.placeFields); return }
    setBusy(true); setError('')
    const id = `tu-them-${uuid()}`
    const full = address.trim() || mineText.fromLink
    const place: Place = {
      id, name: name.trim(), group, kind: copy.groups[group], address: full, district: '', areaId: null, lat: null, lng: null, geo: 'none',
      dishes: [], dishNotes: [], price: null, hours: null, hoursText: null, why: '',
      sources: url ? [{ url, site: copy.collection.source, kind: 'khac', says: '', checked: store.now(), verified: 'none' }] : [],
      mapsUrl: url && isMapsLink(url) ? url : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name.trim()} ${address.trim()}`.trim())}`,
      trust: 0, badges: [], status: 'open', updated: store.now(),
    }
    try {
      await store.addCustomPlace(place)
      await store.updateMark(id, { want: true })
      setName(''); setAddress(''); setLink('')
      onClose()
      app.navigate(`/cho/${encodeURIComponent(id)}`)
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : copy.failed)
    } finally { setBusy(false) }
  }
  return <Sheet open={open} onClose={close} title={copy.collection.add}>
    <form className="add-form" onSubmit={submit} noValidate>
      <label className="field"><span>{copy.collection.name}</span><input value={name} maxLength={160} autoComplete="off" onChange={event => setName(event.target.value)} /></label>
      <label className="field"><span>{copy.collection.address}</span><input value={address} maxLength={240} autoComplete="off" onChange={event => setAddress(event.target.value)} /></label>
      <label className="field"><span>{mineText.linkLabel}</span><input value={link} maxLength={500} inputMode="url" autoComplete="off" onChange={event => setLink(event.target.value)} /></label>
      <div className="group-pick" role="group" aria-label={mineText.chooseGroup}>{groups.map(key => <Chip key={key} data-add-group={key} selected={group === key} onClick={() => setGroup(key)}><Icon name={key} /><span>{copy.groups[key]}</span></Chip>)}</div>
      {error && <p className="small" role="alert">{error}</p>}
      <div className="actions"><Button primary type="submit" disabled={busy}>{copy.collection.save}</Button><Button className="quiet" onClick={close}>{copy.collection.cancel}</Button></div>
    </form>
  </Sheet>
}

export default function CuaMinh() {
  const { store, state } = useStore()
  const app = useApp()
  const [tab, setTab] = useState<Tab>('want')
  const [adding, setAdding] = useState(false)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const nameOf = useNames()

  const rows = useMemo(() => {
    const byPlace = new Map<string, Mark[]>()
    for (const mark of state.marks) byPlace.set(mark.place_id, [...(byPlace.get(mark.place_id) || []), mark])
    const result: Record<Tab, { place: Place; marks: Mark[]; verdict?: Exclude<Verdict, null>; stamp: string }[]> = { want: [], great: [], visited: [] }
    for (const place of store.getPlaces()) {
      const marks = byPlace.get(place.id)
      if (!marks) continue
      const verdict = verdictOf(marks)
      const row = { place, marks, verdict, stamp: marks.reduce((latest, mark) => mark.updated_at > latest ? mark.updated_at : latest, '') }
      if (marks.some(mark => mark.want)) result.want.push(row)
      if (verdict === 'great') result.great.push(row)
      if (marks.some(mark => mark.visited_at || mark.verdict)) result.visited.push(row)
    }
    // Có vị trí thì gần trước, chỗ không có toạ độ nằm cuối, bằng nhau thì chỗ mới đánh dấu trước. Chưa có vị trí thì chỗ mới đánh dấu trước.
    const recent = (left: { stamp: string }, right: { stamp: string }) => right.stamp.localeCompare(left.stamp)
    for (const key of tabs) result[key] = app.origin ? sortByDistance(result[key], app.origin, row => row.place, recent) : result[key].sort(recent)
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.marks, state.catalog, state.custom_places, app.origin])

  const list = rows[tab]
  const move = (event: KeyboardEvent, index: number) => {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + tabs.length - 1) % tabs.length : -1
    if (next < 0) return
    event.preventDefault(); setTab(tabs[next]); tabRefs.current[tabs[next]]?.focus()
  }
  const label = (key: Tab) => key === 'want' ? copy.collection.want : key === 'great' ? copy.collection.great : copy.collection.visited

  return <main data-screen="cua-minh" className="mine">
    <div className="mine-head"><h1>{copy.mine}</h1><Button primary data-action="them-cho" onClick={() => setAdding(true)}><Glyph name="plus" />{copy.collection.add}</Button></div>
    <div className="mine-tabs" role="tablist" aria-label={mineText.tabs} hidden={adding}>{tabs.map((key, index) => <button key={key} type="button" role="tab" id={`mine-tab-${key}`} aria-controls="mine-panel" aria-label={label(key)} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} ref={element => { tabRefs.current[key] = element }} onClick={() => setTab(key)} onKeyDown={event => move(event, index)}>{label(key)}<span className="tab-count" data-count={rows[key].length}>{rows[key].length}</span></button>)}</div>
    <div className="mine-body" id="mine-panel" role="tabpanel" aria-labelledby={`mine-tab-${tab}`} hidden={adding}>
      {list.length === 0 ? <EmptyState action={<Button onClick={() => app.navigate('/')}>{mineText.next}</Button>}>{mineText.empty[tab]}</EmptyState> : <Card className="mine-list">
        <div className="mine-rows">{list.map(({ place, marks, verdict }) => {
          const who = state.members.length > 1 ? [...new Set(marks.filter(mark => mark.want).map(mark => nameOf(mark.member_id)))].join(' và ') : ''
          const meta = <>
            {tab === 'want' && who && <span><span data-user-content>{who}</span> {mineText.added}</span>}
            {tab === 'visited' && verdict && <span>{copy.verdicts[verdict]}</span>}
          </>
          return <PlaceRow key={place.id} place={place} origin={app.origin} arrow source="mine" meta={meta} />
        })}</div>
      </Card>}
    </div>
    <AddPlace open={adding} onClose={() => setAdding(false)} initialGroup={app.group} />
  </main>
}
