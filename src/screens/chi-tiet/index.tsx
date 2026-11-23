import { useEffect, useRef, useState } from 'react'
import { useApp, useNames, useStore } from '../../app-context'
import { copy } from '../../copy'
import { CITY_CENTERS, detailDishes, detailLocation, directionsUrl, sameDishKind, kindLine, formatDate, formatDistance, formatHours, formatTime, isChecked, latestChecked, mapTarget, orderSources, priceLabel, siteName } from '../../core/index.mjs'
import type { Mark, Place, Verdict } from '../../store'
import { cardHours, Badge, Button, Card, EmptyState, GroupIcon, Icon, KindLine, distanceOf, sharePlace } from '../../ui'
import { Glyph } from './icons'
import { detailText } from './text'
import './chi-tiet.css'

type Kept = Exclude<Verdict, null>
const verdictOrder: Kept[] = ['great', 'ok', 'never']

function summarize(marks: Mark[]) {
  const verdict: Kept | undefined = marks.some(mark => mark.verdict === 'never') ? 'never' : marks.some(mark => mark.verdict === 'great') ? 'great' : marks.some(mark => mark.verdict === 'ok') ? 'ok' : undefined
  return {
    want: marks.some(mark => mark.want),
    visited: marks.some(mark => mark.visited_at || mark.verdict),
    verdict,
    both: new Set(marks.filter(mark => mark.want).map(mark => mark.member_id)).size > 1,
  }
}

function Note({ placeId, saved }: { placeId: string; saved: string }) {
  const { store } = useStore()
  const [draft, setDraft] = useState(saved)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const focused = useRef(false)
  const latest = useRef({ draft: saved, saved })
  latest.current = { draft, saved }
  useEffect(() => { if (!focused.current) setDraft(saved) }, [saved])
  const save = () => {
    const { draft: value, saved: kept } = latest.current
    if (value === kept) return
    setError('')
    store.updateMark(placeId, { note: value }).catch(() => setError(copy.errors.note))
  }
  useEffect(() => {
    if (draft === saved) return
    const timer = setTimeout(save, 800)
    return () => clearTimeout(timer)
  }, [draft])
  useEffect(() => () => {
    const { draft: value, saved: kept } = latest.current
    if (value !== kept) void store.updateMark(placeId, { note: value }).catch(() => {})
  }, [placeId])
  if (!editing) return <button type="button" className="note-trigger" data-action="them-ghi-chu" onClick={() => setEditing(true)}><Icon name="edit" />Thêm ghi chú</button>
  return <div className="note-box" data-user-content>
    <textarea aria-label={detailText.noteLabel} placeholder={detailText.notePlaceholder} rows={2} value={draft} maxLength={4000}
      onFocus={() => { focused.current = true }} onBlur={() => { focused.current = false; save() }} onChange={event => setDraft(event.target.value)} />
    {error && <p className="small" role="alert">{error}</p>}
  </div>
}

export default function ChiTiet() {
  const { store, state } = useStore()
  const app = useApp()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')
  const [changing, setChanging] = useState(false)
  const [moreDishes, setMoreDishes] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [allSources, setAllSources] = useState(false)
  const [sourcesFor, setSourcesFor] = useState(app.id)
  if (sourcesFor !== app.id) { setSourcesFor(app.id); setMoreDishes(false); setHoursOpen(false); setAllSources(false) }
  const nameOf = useNames()
  const place = store.getPlace(app.id)
  if (!place) return <main data-screen="chi-tiet"><EmptyState action={<Button onClick={() => app.navigate('/')}>{detailText.home}</Button>}>{copy.errors.missingPlace}</EmptyState></main>

  const memberId = state.identity.memberId
  const marks = state.marks.filter(mark => mark.place_id === place.id)
  const mine = marks.find(mark => mark.member_id === memberId)
  const all = summarize(marks)
  // Chữ "muốn đi" cạnh tên chỉ để nói người kia muốn đi. Máy mình muốn đi thì nút Muốn đi đã bấm sẵn, không nói lại.
  const wanters = marks.filter(mark => mark.want && mark.member_id !== memberId).map(mark => nameOf(mark.member_id))
  const others = marks.filter(mark => mark.member_id !== memberId && mark.note.trim())
  const area = place.areaId ? state.catalog.areas.find(row => row.id === place.areaId) : null
  const distance = distanceOf(app.origin || CITY_CENTERS[app.city], place)
  const { open, badge, missing } = cardHours(place)
  const hours = place.hoursText?.replace(/\b\d{1,2}:\d{2}\b/g, formatTime) || formatHours(place.hours)
  const titleKind = kindLine(place, { dishes: false }).kind
  const dishes = detailDishes(place).filter(dish => !titleKind || !sameDishKind(dish, titleKind))
  const showTitleKind = !!titleKind && !dishes.some(dish => sameDishKind(dish, titleKind))
  const price = priceLabel(place)
  const today = formatDate(store.now())
  const chosenToday = state.picks.some(pick => pick.place_id === place.id && formatDate(pick.picked_at) === today)
  const ordered = orderSources(place.sources)
  const shownSources = ordered
  const checkedDay = latestChecked(place.sources, place.updated)
  const closed = place.status === 'closed'
  const custom = !!place.household_id
  const badges = [
    ...place.badges.filter(name => name in copy.badges).map(name => ({ name, data: true })),
    ...(all.verdict === 'great' ? [{ name: 'ngon-that', data: false }] : []),
    ...(all.both ? [{ name: 'ca-hai-muon-di', data: false }] : []),
  ]
  const link = custom ? place.sources.find(source => source.url) : null
  const href = directionsUrl(place)
  const map = mapTarget(place, state.catalog.areas)
  const address = detailLocation(place, area)
  const from = new URLSearchParams(app.path.split('?')[1] || '').get('from') || 'near'
  const hasMenu = Array.isArray(place.menu) && place.menu.length > 0
  const hot = place.hot?.sources?.[0]

  const run = async (job: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await job() } catch { setError(copy.failed) } finally { setBusy(false) }
  }
  const choose_here = () => run(() => store.pickPlace(place.id))
  const send = async () => {
    setSent('')
    const result = await sharePlace(place)
    if (result === 'copied') setSent(copy.sendCopied); else if (result === 'failed') setSent(copy.sendFailed)
  }
  const toggleWant = () => run(() => store.updateMark(place.id, { want: !mine?.want }))
  const toggleVisited = () => { setChanging(false); return run(() => mine?.visited_at ? store.updateMark(place.id, { visited_at: null, verdict: null }) : store.updateMark(place.id, { visited_at: store.now() })) }
  const choose = (verdict: Kept) => { setChanging(false); return run(() => store.updateMark(place.id, { verdict: mine?.verdict === verdict ? null : verdict, visited_at: mine?.visited_at || store.now() })) }

  return <main data-screen="chi-tiet" className={`detail${hasMenu ? ' has-menu' : ''}`} data-place-id={place.id} data-mark-want={String(all.want)} data-mark-visited={String(all.visited)} data-mark-verdict={all.verdict}>
    <header className="detail-head">
      <GroupIcon group={place.group} />
      <div className="detail-title">
        <h1 data-place-name>{place.name}</h1>
        <div className="dish-meta">{showTitleKind && <KindLine place={place} dishes={false} />}{distance !== null && <span data-distance={distance}>{formatDistance(distance, place.geo)}</span>}{badge ? <span data-place-field="hours" className={open ? "hours-open" : "hours-closed"} aria-label={badge}><span>{badge}</span></span> : missing && <span data-place-field="hours" className="hours-closed" aria-label={missing}><span>{missing}</span></span>}</div>
      </div>
    </header>
    {hot && <p className="detail-hot" data-section="hot"><Icon name="flame" />Đang được nhắc nhiều <span data-place-field="source">{hot.site || hot.url}</span> <time data-place-field="source" dateTime={hot.date}>{new Date(hot.date).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' })}</time></p>}
    {chosenToday && <Card className="detail-chosen" data-region="chosen-today"><Icon name="check" /><p>{detailText.chosenToday}</p></Card>}
    {(badges.length > 0 || all.verdict === 'never') && <div className="badges">
      {badges.map(item => <Badge key={item.name} name={item.name} dataPlaceField={item.data ? 'source' : undefined} />)}
      {all.verdict === 'never' && mine?.verdict !== 'never' && <span className="badge" data-badge="khong-quay-lai">{detailText.never}</span>}
    </div>}
    <div className="detail-grid">
      <div className="detail-main">
        <Card className="detail-facts" data-region="facts">
          <a className="fact detail-address" data-action={map ? 'xem-tren-ban-do' : undefined} href={map ? `#/ban-do?cho=${encodeURIComponent(place.id)}&from=${encodeURIComponent(from)}` : undefined}><Icon name="pin" role="img" aria-label={copy.detail.address} /><span data-address data-place-field="address">{address}</span>{area && <span data-area-name data-place-field="area">{area.name}</span>}</a>
          {price && <div className="fact detail-price"><Glyph name="wallet" label={copy.detail.price} /><span><strong data-place-field="price" data-field="price">{price}</strong></span></div>}
          {!hours && <span className="fact-inline" data-hours-unknown><Glyph name="clock" />{copy.hoursUnknown}</span>}
          {hours && <>
            <button type="button" className="fact-inline fact-hours-row" data-field="hours" aria-expanded={hoursOpen} onClick={() => setHoursOpen(value => !value)}><Glyph name="clock" label={copy.detail.hours} /><span data-place-field="hours">{hours}</span><Icon name="arrow" /></button>
            <div className="detail-fold" data-open={hoursOpen} inert={!hoursOpen}><div><p className="detail-hours-week" data-place-field="hours">{place.hours?.length ? formatHours(place.hours) : hours}</p></div></div>
          </>}
          {dishes.length > 0 && <div className="fact dishes" data-field="dishes"><Icon name={place.group} role="img" aria-hidden={undefined} aria-label={copy.detail.dishes} /><ul className="chips" data-place-field="dishes">{(moreDishes ? dishes : dishes.slice(0, 3)).map(name => <li key={name}>{name}</li>)}{dishes.length > 3 && <li><button aria-expanded={moreDishes} onClick={() => setMoreDishes(!moreDishes)}>{moreDishes ? "Thu gọn" : `thêm ${dishes.length - 3}`}</button></li>}</ul></div>}
          {place.why && <p data-field="why" data-place-field="why">{place.why}</p>}
        </Card>
        {hasMenu && <section className="detail-menu" data-menu><h2 className="detail-h">Giá một số món</h2><ul>{place.menu!.slice(0, 8).map((item, index) => <li key={`${item.name}-${index}`} data-menu-item data-place-field="dishes"><span>{item.name}</span><strong>{item.price == null ? 'Chưa rõ giá' : `${Math.round(item.price / 1000)} nghìn`}</strong></li>)}</ul>{place.menuUrl && <a className="button secondary" href={place.menuUrl} target="_blank" rel="noopener noreferrer">Xem menu</a>}</section>}
      </div>
      <section className="detail-actions" data-region="actions" data-chosen={chosenToday && !closed ? '' : undefined}>
          {closed && <p role="status">{detailText.closed}</p>}
          {!closed && !chosenToday && <Button primary className="detail-primary" data-action="chot" icon="check" disabled={busy} onClick={() => void choose_here()}>Chốt</Button>}
          {!closed && <div className="detail-quick-actions">
            <a className="button secondary" data-action="chi-duong" href={href} target="_blank" rel="noopener noreferrer"><Icon name="arrow" />Chỉ đường</a>
            <Button data-action="muon-di" icon="heart" className="want-button" aria-pressed={!!mine?.want} disabled={busy} onClick={() => void toggleWant()}>Muốn đi</Button>
            <Button data-action="da-di" icon="done" aria-pressed={!!mine?.visited_at} disabled={busy} onClick={() => void toggleVisited()}>Đã đi</Button>
          </div>}
          {sent && <p className="small" role="status">{sent}</p>}
          {wanters.length > 0 && <p className="who small"><Icon name="heart" role="img" aria-label={detailText.whoWants} aria-hidden={undefined} /><span data-user-content>{[...new Set(wanters)].join(' và ')}</span><span>{detailText.wantsSuffix}</span></p>}
          {mine?.visited_at && mine.verdict && !changing && <div className="verdict-now"><span data-verdict-current={mine.verdict}>{copy.verdicts[mine.verdict]}</span><Button data-action="doi-phan-quyet" disabled={busy} onClick={() => setChanging(true)}>{detailText.change}</Button></div>}
          {mine?.visited_at && (!mine.verdict || changing) && <div className="verdicts" role="group" aria-label={detailText.verdictGroup}>
            {verdictOrder.map(verdict => <Button key={verdict} data-verdict={verdict} aria-pressed={mine.verdict === verdict} disabled={busy} onClick={() => void choose(verdict)}>{copy.verdicts[verdict]}</Button>)}
          </div>}
          {error && <p role="alert">{error}</p>}
        <Note placeId={place.id} saved={mine?.note || ''} />
        {others.map(mark => <p className="small other-note" key={mark.member_id} data-user-content>{nameOf(mark.member_id)}: {mark.note}</p>)}
      </section>
      <Card className="detail-sources" data-region="sources">
        <button className="sources-toggle" data-place-field="source" data-action="xem-them-nguon" aria-expanded={allSources} aria-controls="detail-sources" onClick={() => setAllSources(!allSources)}>{place.sources.length} nguồn<Icon name="arrow" /></button>
        <div className="detail-fold" id="detail-sources" data-open={allSources} inert={!allSources}><div>
        {custom ? <>
          <h2 className="detail-h">{detailText.userAdded}</h2>
          {link && <a className="source-row" data-source href={link.url} target="_blank" rel="noopener noreferrer"><span className="source-text"><strong>{detailText.userLink}</strong></span><Glyph name="external" /></a>}
        </> : <>
          <ul className="source-list" id="source-list">{shownSources.map((source, index) => <li key={`${source.url}-${index}`}>
            <a className="source-row" data-source href={source.url} target="_blank" rel="noopener noreferrer">
              <span className="source-text">
                <span className="source-head"><strong>{siteName(source)}</strong>{!isChecked(source) && <span className="source-tag">{copy.unchecked}</span>}</span>
                {source.says && <span className="small source-says" data-place-field="source">{source.says}</span>}
              </span>
              <Glyph name="external" />
            </a>
          </li>)}</ul>
        </>}
        {(custom ? place.updated : checkedDay) && <p className="small">{custom ? detailText.userAddedOn : copy.detail.updated} {formatDate((custom ? place.updated : checkedDay)!)}</p>}
        </div></div>
        {place.mapsUrl && <a aria-label={copy.detail.google} className="button secondary google-link" data-action="xem-google" href={place.mapsUrl} target="_blank" rel="noopener noreferrer">Google Maps<Glyph name="external" /></a>}
      </Card>
    </div>
  </main>
}
