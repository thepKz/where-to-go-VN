import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PersonName, useApp, useStore } from '../../app-context'
import { copy } from '../../copy'
import { directionsUrl, filterPlacesByCity, otherLikers, otherProgress } from '../../core/index.mjs'
import type { Place, Point } from '../../store'
import { Badge, Button, Card, EmptyState, Icon, PlaceDetails, PlaceMeta, sharePlace, useWide } from '../../ui'
import { BothWant, useBothWant } from '../../ui/both'
import MiniMap from '../ban-do/mini-map'
import './goi-y.css'

const pickedKey = 'di-dau-picked-here'
const badgeOrder = ['ngon-that', 'ca-hai-muon-di', 'nhieu-nguon', 'michelin']
/** Thẻ gợi ý chỉ hiện một nhãn của chỗ để dễ so, trang chi tiết hiện đủ. */
const pickBadges = (names: string[]) => [...badgeOrder.filter(name => names.includes(name))].slice(0, 1)

/** Câu vì sao đáng đi nếu có. Không có thì PlaceDetails hiện món, giá, địa chỉ để vẫn đủ thứ mà chốt. */
function Why({ place }: { place: Place }) {
  return place.why ? <p className="suggestion-why" data-place-field="why">{place.why}</p> : <PlaceDetails place={place} />
}

/** Loại, khu hoặc quận, khoảng cách rồi tình trạng mở cửa. */
function Facts({ place, origin }: { place: Place; origin: Point | null }) {
  return <PlaceMeta place={place} origin={origin} />
}

/** Dòng trạng thái ngắn về người kia. Chữ data-waiting giữ nguyên nghĩa: đang chờ người kia lướt xong. */
function OtherStatus({ progress, waiting, full = false }: { progress: ReturnType<typeof otherProgress>; waiting: boolean; full?: boolean }) {
  const { state } = useStore()
  if (!progress) return null
  const name = state.members.find(member => member.id === progress.id)?.name?.trim()
  const custom = !!name && name !== copy.deviceDefault
  return <p className="other-status" role="status" data-other-state={({ none: 'chua-vao', swiping: 'dang-luot', done: 'xong' } as const)[progress.state]} data-waiting={waiting || undefined}><span>{custom || full ? <><PersonName id={progress.id} /> {copy.otherState[progress.state]}</> : <span className="cap">{copy.otherState[progress.state]}</span>}</span></p>
}

function LikedBy({ id, matched = false }: { id: string; matched?: boolean }) {
  const { state } = useStore()
  const name = state.members.find(member => member.id === id)?.name?.trim()
  return <span className="badge liked-by" data-liked-by={name && name !== copy.deviceDefault ? name : ''} data-badge={matched ? 'ca-hai-thich' : undefined}><Icon name="heart" /><span><PersonName id={id} /> {copy.likesWord}</span></span>
}

function Chosen({ place, byMe, origin }: { place: Place; byMe: boolean; origin: Point | null }) {
  const [note, setNote] = useState('')
  const send = async () => {
    setNote('')
    const result = await sharePlace(place)
    if (result === 'copied') setNote(copy.sendCopied); else if (result === 'failed') setNote(copy.sendFailed)
  }
  return <Card className="chosen" data-chosen data-place-id={place.id}>
    <span className="chosen-mark" aria-hidden="true"><Icon name="check" /></span>
    <a className="chosen-name" href={`#/cho/${encodeURIComponent(place.id)}`}><h2 data-name data-place-name>{place.name}</h2></a>
    <Facts place={place} origin={origin} />
    <div className="chosen-actions">
      <a className="button primary" data-action="chi-duong" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer"><Icon name="arrow" />{copy.direction}</a>
      {byMe && <Button data-action="gui-nguoi-kia" icon="share" onClick={() => void send()}>{copy.send}</Button>}
      <a className="button secondary" href={`#/cho/${encodeURIComponent(place.id)}`}>{copy.viewPlace}</a>
    </div>
    {note && <p className="small" role="status">{note}</p>}
  </Card>
}

export default function GoiY() {
  const { store, state } = useStore()
  const app = useApp()
  const wide = useWide()
  const both = useBothWant()
  const [error, setError] = useState('')
  const [roundReady, setRoundReady] = useState(false)
  const starting = useRef(false)
  const startedFor = useRef('')
  const [rerolls, setRerolls] = useState(0)
  const touch = useRef<number | null>(null)
  const voting = useRef(new Set<string>())
  const myId = state.identity.memberId
  const round = state.rounds.find(row => row.id === app.roundId)
  const blocked = state.marks.filter(mark => mark.verdict === 'never').map(mark => mark.place_id)
  const places = roundReady ? filterPlacesByCity(round?.place_ids.map(id => store.getPlace(id)).filter((place): place is Place => !!place && !blocked.includes(place.id)) || [], app.city, state.catalog.areas) : []
  const votes = state.votes.filter(vote => vote.round_id === round?.id)
  const mine = votes.filter(vote => vote.member_id === myId)
  const active = places.findIndex(place => !mine.some(vote => vote.place_id === place.id))
  const complete = active === -1 && places.length > 0
  const likersOf = (placeId: string) => otherLikers({ votes, placeId, myId })
  const matched = (placeId: string) => mine.some(vote => vote.place_id === placeId && vote.like) && likersOf(placeId).length > 0
  const likes = places.filter(place => mine.some(vote => vote.place_id === place.id && vote.like)).sort((left, right) => Number(matched(right.id)) - Number(matched(left.id)))
  const hasMatch = likes.some(place => matched(place.id))
  const progress = otherProgress({ members: state.members, votes, placeIds: places.map(place => place.id), myId })
  const waiting = !!progress && progress.state !== 'done'
  const pick = state.picks.find(row => row.round_id === round?.id)
  const picked = pick ? places.find(place => place.id === pick.place_id) : undefined
  const byMe = !!pick && sessionStorage.getItem(pickedKey) === pick.round_id
  useEffect(() => {
    if (starting.current) return
    const where = app.where ?? app.origin
    const whereKey = typeof where === 'string' ? where : where ? `${where.lat},${where.lng}` : 'mac-dinh'
    if (startedFor.current === whereKey) return
    startedFor.current = whereKey
    starting.current = true
    setRoundReady(false)
    void store.startRound(app.group, where, blocked).then(next => { app.setRoundId(next.id); setRoundReady(true) }).catch(() => setError(copy.failed)).finally(() => { starting.current = false })
  }, [app.where, app.origin?.lat, app.origin?.lng, app.group, store])
  useEffect(() => { if (active >= 0 && !matchMedia('(min-width:1024px) and (min-height:640px)').matches) document.querySelector<HTMLElement>('.suggestion.active h2')?.focus({ preventScroll: true }) }, [active])
  const vote = async (placeId: string, like: boolean) => {
    if (!round || voting.current.has(placeId)) return
    voting.current.add(placeId)
    try { await store.vote(round.id, placeId, like) } catch { setError(copy.failed) } finally { voting.current.delete(placeId) }
  }
  const more = async () => {
    if (!round) { app.navigate('/'); return }
    const next = await store.startRound(round.group, app.where || round.where, round.place_ids)
    app.setRoundId(next.id); setRerolls(value => value + 1)
  }
  const confirm = async (placeId: string) => {
    if (!round) return
    try { sessionStorage.setItem(pickedKey, round.id) } catch {}
    await store.pick(round.id, placeId)
  }
  const badgeNames = (placeId: string, badges: string[]) => {
    const marks = state.marks.filter(mark => mark.place_id === placeId)
    return [...badges, ...(marks.some(mark => mark.verdict === 'great') ? ['ngon-that'] : []), ...(new Set(marks.filter(mark => mark.want).map(mark => mark.member_id)).size > 1 ? ['ca-hai-muon-di'] : [])]
  }
  const showResults = !!(pick && picked) || complete
  useLayoutEffect(() => { if (showResults) window.scrollTo(0, 0) }, [showResults])
  // Máy bàn: cột hai là bản đồ nhỏ của chỗ đang nói tới, kèm danh sách cả hai muốn đi khi có.
  const mapPlaces = pick && picked ? [picked] : likes
  const title = pick && picked ? copy.chosenTitle : complete ? hasMatch ? copy.match : copy.result : copy.suggestions

  // Mọi thẻ kết quả cùng một kiểu. Chỉ chỗ cả hai cùng thích mới có nút son, vì đó là lý do duy nhất để đề cử.
  const row = (place: Place) => {
    const liker = likersOf(place.id)[0]
    const names = pickBadges(badgeNames(place.id, place.badges))
    return <Card key={place.id} className="result" data-card data-place-id={place.id}>
      <div className="result-copy"><a className="result-name" href={`#/cho/${encodeURIComponent(place.id)}`}><h2 data-name data-place-name>{place.name}</h2></a>
        <Facts place={place} origin={app.origin} />
        <Why place={place} />
        {(liker || names.length > 0) && <div className="badges">{names.map(name => <Badge key={name} name={name} />)}{liker && <LikedBy id={liker} matched />}</div>}
      </div>
      <Button primary={matched(place.id)} data-action="chot" onClick={() => void confirm(place.id)}>{copy.confirm}</Button>
    </Card>
  }

  return <main data-screen="goi-y" className={showResults ? `results${wide ? ' two-col' : ''}` : ''}>
    <div className="screen-title"><h1>{title}</h1>{!complete && !pick && places.length > 0 && <div className="pager mobile-only"><span className="pager-dots" aria-hidden="true">{places.map((place, index) => <span key={place.id} className={index === active ? 'active' : ''} />)}</span><span className="small">{active + 1} {copy.pagerOf} {places.length}</span></div>}</div>
    {error && <p role="alert">{error}</p>}
    {!places.length ? <EmptyState /> : pick && picked ? <Chosen place={picked} byMe={byMe} origin={app.origin} /> : complete ? <div className="results-body">
      <OtherStatus progress={progress} waiting={waiting && !hasMatch} full />
      {!likes.length && <p>{copy.noLikes}</p>}
      <div className="results-grid">{likes.map(place => row(place))}</div>
      <div className="results-actions">
        <Button data-action="ba-cho-khac" icon="shuffle" onClick={() => void more()}>{copy.more}</Button>
        {rerolls >= 1 && !likes.length && <p>{copy.change}</p>}
      </div>
    </div> : <>
      <OtherStatus progress={progress} waiting={false} />
      <div className="suggestions">{places.map((place, index) => {
        const voted = mine.find(vote => vote.place_id === place.id)
        const liker = likersOf(place.id)[0]
        return <Card key={place.id} className={`suggestion ${index === active ? 'active' : ''}`} data-card data-place-id={place.id} onTouchStart={event => { touch.current = event.touches[0].clientX }} onTouchEnd={event => { if (touch.current !== null && !voted) { const delta = event.changedTouches[0].clientX - touch.current; if (Math.abs(delta) > 70) void vote(place.id, delta > 0) }; touch.current = null }}>
          <a className={`suggestion-art ${place.group}`} href={`#/cho/${encodeURIComponent(place.id)}`} aria-label={`${copy.see} ${place.name}`}><Icon name={place.group} /></a>
          <div className="suggestion-body"><a href={`#/cho/${encodeURIComponent(place.id)}`}><h2 data-name data-place-name tabIndex={-1}>{place.name}</h2></a>
            <Facts place={place} origin={app.origin} />
            <Why place={place} />
            <div className="badges">{pickBadges(badgeNames(place.id, place.badges)).map(name => <Badge key={name} name={name} />)}{liker && <LikedBy id={liker} />}</div>
            {voted ? <p className="small">{voted.like ? copy.liked : copy.skipped}</p> : <div className="pair"><Button data-action="bo" icon="close" onClick={() => void vote(place.id, false)} disabled={voting.current.has(place.id)}>{copy.skip}</Button><Button primary data-action="thich" icon="heart" onClick={() => void vote(place.id, true)} disabled={voting.current.has(place.id)}>{copy.like}</Button></div>}
          </div>
        </Card>
      })}</div>
    </>}
    {showResults && wide && <aside className="results-aside"><MiniMap places={mapPlaces} origin={app.origin} /><BothWant places={both} limit={3} /></aside>}
  </main>
}
