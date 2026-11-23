import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { copy } from '../copy'
import { areaRows, dishList, floorLabel, formatAreaCount, formatDistance, formatOpenStatus, formatTextHoursStatus, formatTime, kindLine, placeDistance, placeNameInArea, priceLabel, sortByDistance } from '../core/index.mjs'
import { copyText } from './clipboard'
import { store, type Group, type Place, type Point } from '../store'

export function Icon({ name, ...props }: { name: string } & React.SVGProps<SVGSVGElement>) {
  const paths: Record<string, ReactNode> = {
    an: <path d="M4 13h16a8 8 0 0 1-16 0ZM8 22h8M8 3v6M12 2v7M16 3v6" />,
    'ca-phe': <path d="M4 8h12v6a6 6 0 0 1-12 0V8ZM16 9h2a3 3 0 0 1 0 6h-2M3 22h16M7 2v3M12 2v3" />,
    nhau: <path d="M5 7h12v14H5zM17 9h3v8h-3M9 11v6M13 11v6M5 7a3 3 0 0 1 1-6 3 3 0 0 1 5 0 3 3 0 0 1 5 1 3 3 0 0 1 1 5" />,
    choi: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><path d="m9 9 2 2 4-4" /></>,
    heart: <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15s13-10 8-15Z" />,
    map: <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16" />,
    building: <path d="M4 21V5l8-3 8 3v16M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2M10 21v-4h4v4" />,
    home: <path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7" />,
    gear: <><path d="m9 3 1-2h4l1 2 3 2 3 1 1 4-2 2-1 3v3l-4 3-3-1-3 1-4-3v-3l-1-3-2-2 1-4 3-1Z" /><circle cx="12" cy="11" r="3" /></>,
    locate: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></>,
    arrow: <path d="m9 5 7 7-7 7" />, back: <path d="m15 5-7 7 7 7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />, check: <path d="m5 12 4 4L19 6" />,
    flame: <path d="M12 22c4 0 7-2.9 7-7 0-3.1-1.7-5.6-4.7-8.4.2 2.2-.5 3.4-1.5 4.2.1-3.7-1.8-6.8-4.8-8.8.2 3.4-2.9 5.7-2.9 9.5C5.1 18.9 8.1 22 12 22Z" />,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    edit: <path d="m4 16 10-10 4 4L8 20l-4 1 1-5ZM13 7l2 2" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v13h5" /></>,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />,
    shuffle: <path d="M3 6h3c5 0 7 12 12 12h3M3 18h3c5 0 7-12 12-12h3m-3-3 3 3-3 3m0 6 3 3-3 3" />,
    people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1a6 6 0 0 1 12 0v1" /><circle cx="17.5" cy="9.5" r="2.5" /><path d="M17 14.3a5 5 0 0 1 4 4.7v1" /></>,
    done: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    share: <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 13v7h14v-7" />,
    wallet: <path d="M3 7h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V7Zm0 0V6a2 2 0 0 1 2-2h12M16 14h2" />,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.pin}</svg>
}
export function GroupIcon({ group, className = '' }: { group: Group; className?: string }) { return <span className={`group-icon ${group} ${className}`}><Icon name={group} /></span> }
export function Button({ primary, icon, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; icon?: string }) {
  return <button type="button" className={`button ${primary ? 'primary' : 'secondary'} ${className}`} data-primary={primary || undefined} {...props}>{icon && <Icon name={icon} />}{children}</button>
}
export function Chip({ selected, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) { return <button type="button" className="chip" aria-pressed={!!selected} {...props}>{children}</button> }
export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }) { return <section className={`card ${className}`} data-region="card" {...props} /> }
export function Badge({ name, label, dataPlaceField }: { name: string; label?: ReactNode; dataPlaceField?: string }) { const text = label ?? copy.badges[name as keyof typeof copy.badges]; return text ? <span className="badge" data-badge={name} data-place-field={dataPlaceField}><Icon name="check" />{text}</span> : null }
export function EmptyState({ children = copy.noPlaces, action }: { children?: ReactNode; action?: ReactNode }) { return <div className="empty-state"><Icon name="pin" /><p>{children}</p>{action}</div> }

/** Khoảng cách từ điểm xuất phát tới một chỗ. Chỗ không có toạ độ thì không có khoảng cách. */
export function distanceOf(origin: Point | null | undefined, place: Place) {
  return placeDistance(origin, place)
}

/** Máy bàn: rộng từ 1024px và cao từ 640px. Còn lại (điện thoại, máy tính bảng, khung ngang, khung thấp) là bố cục một cột. */
export function useWide() {
  const query = '(min-width:1024px) and (min-height:640px)'
  const [wide, setWide] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const media = matchMedia(query)
    const change = () => setWide(media.matches)
    media.addEventListener('change', change); change()
    return () => media.removeEventListener('change', change)
  }, [])
  return wide
}

/**
 * Vùng cuộn chung. Mép nào còn nội dung thì mép đó mờ dần, nên không có mép nào cắt cứng ngang dòng chữ.
 * Dùng cho trang, tấm, danh sách bên trái bản đồ.
 */
export function ScrollArea({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ above: false, more: false })
  useLayoutEffect(() => {
    const element = ref.current!
    const check = () => {
      const above = element.scrollTop > 0.5
      const more = element.scrollHeight - element.clientHeight - element.scrollTop > 0.5
      setEdge(previous => previous.above === above && previous.more === more ? previous : { above, more })
    }
    const resize = new ResizeObserver(check)
    resize.observe(element)
    if (element.firstElementChild) resize.observe(element.firstElementChild)
    element.addEventListener('scroll', check, { passive: true })
    check()
    return () => { resize.disconnect(); element.removeEventListener('scroll', check) }
  }, [])
  return <div className={`scroll-area ${className}`} data-more={edge.more} data-above={edge.above} {...props}>
    <div ref={ref} className="scroll-viewport" data-scrolls={edge.more || edge.above || undefined} data-scroll-edges style={{ maskImage: (edge.above || edge.more) && (className.includes('map-') || ref.current?.closest('dialog')) ? `linear-gradient(to bottom, ${edge.above ? 'transparent, black 16px' : 'black'}, ${edge.more ? 'black calc(100% - 16px), transparent' : 'black'})` : undefined, '--fade-top': edge.above ? '40px' : '0px', '--fade-bottom': edge.more ? '40px' : '0px' } as React.CSSProperties}>
      <div className="scroll-content">{children}</div>
    </div>
  </div>
}

type DataProps = { [key: `data-${string}`]: string | boolean | undefined }
/** Tấm trượt từ đáy. Với docked thì không chặn nền: hiện thành thẻ nhỏ nằm cạnh nội dung, vẫn giữ tiêu điểm bên trong và Escape để đóng. */
export function Sheet({ headingEnd, back = false, open, onClose, title, titleProps, dialogProps, className = '', docked = false, focus, returnFocus, children }: { headingEnd?: ReactNode; back?: boolean; open: boolean; onClose: () => void; title: string; titleProps?: DataProps; dialogProps?: DataProps; className?: string; docked?: boolean; focus?: string; returnFocus?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnTarget = useRef<HTMLElement | null>(null)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    const dialog = ref.current!
    if (open) {
      returnTarget.current = returnFocus ? document.querySelector<HTMLElement>(returnFocus) : docked ? document.querySelector<HTMLElement>('[data-sheet-opener]') ?? document.querySelector<HTMLElement>('[data-pin-selected]') ?? document.activeElement as HTMLElement | null : document.activeElement as HTMLElement | null
      if (!returnTarget.current || returnTarget.current === document.body) returnTarget.current = document.querySelector<HTMLElement>('[data-action="chon-thanh-pho"]')
      setClosing(false)
      if (!dialog.open) { if (docked) dialog.show(); else dialog.showModal() }
      const target = (focus ? dialog.querySelector<HTMLElement>(focus) : null) ?? dialog.querySelector<HTMLElement>('input,button,[tabindex="0"]')
      target?.focus({ preventScroll: true })
      return
    }
    if (!dialog.open) return
    setClosing(true)
    dialog.close()
    const target = returnTarget.current?.isConnected ? returnTarget.current : returnFocus ? document.querySelector<HTMLElement>(returnFocus) : document.querySelector<HTMLElement>('[data-action="chon-thanh-pho"]')
    target?.focus({ preventScroll: true })
    window.setTimeout(() => (returnTarget.current?.isConnected ? returnTarget.current : returnFocus ? document.querySelector<HTMLElement>(returnFocus) : null)?.focus({ preventScroll: true }), 0)
    const timer = window.setTimeout(() => setClosing(false), 160)
    return () => window.clearTimeout(timer)
  }, [open, docked, focus, returnFocus])
  const close = () => {
    const target = returnTarget.current?.isConnected ? returnTarget.current : returnFocus ? document.querySelector<HTMLElement>(returnFocus) : document.querySelector<HTMLElement>('[data-action="chon-thanh-pho"]')
    target?.focus({ preventScroll: true })
    window.setTimeout(() => (returnTarget.current?.isConnected ? returnTarget.current : returnFocus ? document.querySelector<HTMLElement>(returnFocus) : null)?.focus({ preventScroll: true }), 0)
    onClose()
  }
  return <dialog ref={ref} role="dialog" className={`sheet ${docked ? 'docked' : ''} ${closing ? 'is-closing' : ''} ${className}`} aria-label={title} {...dialogProps} onKeyDown={event => {
    if (event.key === 'Escape' && docked) { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const targets = Array.from(ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(element => element.getClientRects().length)
    const first = targets[0], last = targets[targets.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === ref.current) close() }}><div className="sheet-inner" data-region="sheet"><div className="row between">{back && <Button aria-label={copy.close} icon="back" onClick={close} />}<h2 {...titleProps}>{title}</h2>{headingEnd}{!back && <Button aria-label={copy.close} icon="close" onClick={close} />}</div><ScrollArea>{children}</ScrollArea></div></dialog>
}

/** Tình trạng mở cửa theo giờ hiện tại. Không có giờ thì không vẽ gì. */
export function OpenStatus({ place, className = '' }: { place: Pick<Place, 'hours'>; className?: string }) {
  const text = formatOpenStatus(place.hours ?? undefined, store.now())
  return text ? <span className={`open-status ${text.startsWith('Đang mở') ? 'is-open' : 'is-closed'} ${className}`} data-place-field="hours">{text}</span> : null
}

/** Giờ mở của thẻ gợi ý, hàng kết quả và chi tiết: có giờ thì nói đang mở hay đóng, không có thì nói thẳng là chưa rõ giờ. */
export function HoursLine({ place, className = '' }: { place: Pick<Place, 'hours' | 'hoursText'>; className?: string }) {
  if (formatOpenStatus(place.hours ?? undefined, store.now())) return <OpenStatus place={place} className={className} />
  const textStatus = formatTextHoursStatus(place.hoursText, store.now())
  if (textStatus) return <span className={`open-status is-unknown ${className}`} data-place-field="hours">{textStatus}</span>
  return <span className={`open-status is-unknown ${className}`} data-hours-unknown data-place-field="hours">{copy.hoursUnknown}</span>
}

/** Dòng loại của chỗ. Loại trống thì nhóm ăn hiện món, nhóm khác hiện tên nhóm. */
export function KindLine({ place, dishes = true }: { place: Pick<Place, 'kind' | 'group' | 'dishNotes'>; dishes?: boolean }) {
  const line = kindLine(place, { dishes })
  if (line.dishes) return <span data-place-field="dishes">{line.dishes}</span>
  return line.kind ? <span data-place-field="kind">{line.kind}</span> : null
}

/** Thứ cần để chốt khi chỗ không có câu vì sao: món tối đa ba và địa chỉ. Giá đã có trong dòng thông tin chung. */
export function PlaceDetails({ place }: { place: Place }) {
  if (place.why) return null
  const dishes = dishList(place, 3)
  const address = place.address?.trim()
  if (!dishes.length && !address) return null
  return <div className="place-lines">
    {dishes.length > 0 && <p className="place-line"><Icon name={place.group} /><span data-place-field="dishes">{dishes.join(', ')}</span></p>}
    {address && <p className="place-line"><Icon name="pin" /><span data-place-field="address">{address}</span></p>}
  </div>
}

export { sortByDistance, areaRows }
/** Số chỗ của một khu. Chữ cho máy đọc màn hình nói rõ đó là số chỗ. */
export function AreaCount({ count }: { count: number }) { return <span className="area-count">{formatAreaCount(count, copy.places)}</span> }
/** Khoảng cách tới tâm khu, chỉ khi đã có vị trí. */
export function AreaDistance({ meters }: { meters: number | null }) { return meters === null ? null : <span className="small" data-distance={Math.round(meters)}>{formatDistance(meters)}</span> }

/** Mẫu thông tin chung của một dòng quán. */
export function PlaceMeta({ place, origin, showArea = true, showDistance = true }: { place: Place; origin?: Point | null; showArea?: boolean; showDistance?: boolean }) {
  const meters = showDistance ? distanceOf(origin, place) : null
  const area = place.areaId ? store.getSnapshot().catalog.areas.find(item => item.id === place.areaId) : undefined
  const price = priceLabel(place)
  return <div className="small place-row-meta">
    {floorLabel(place.floor) && <span data-place-field="floor">{floorLabel(place.floor)}</span>}
    <KindLine place={place} />
    {price && <span data-place-field="price">{price}</span>}
    {meters !== null ? <span data-distance={meters}>{formatDistance(meters, place.geo)}</span> : showArea && area?.name ? <span data-place-field="area">{area.name}</span> : null}
    <HoursLine place={place} />
  </div>
}

/** Gửi một chỗ cho người kia: hộp chia sẻ của máy nếu có, không thì chép đường dẫn. */
export async function sharePlace(place: Place): Promise<'shared' | 'copied' | 'failed' | 'cancelled'> {
  const url = `${location.origin}${location.pathname}#/cho/${encodeURIComponent(place.id)}`
  try {
    if (typeof navigator.share === 'function') { await navigator.share({ title: place.name, text: `${copy.todayGo} ${place.name}`, url }); return 'shared' }
  } catch (error) { if ((error as Error).name === 'AbortError') return 'cancelled' }
  return (await copyText(url)) ? 'copied' : 'failed'
}

export function cardHours(place: Place) {
  const hours = formatOpenStatus(place.hours ?? undefined, store.now())
  const open = hours.startsWith('Đang mở')
  const next = /^Đang đóng, mở lúc (\d{1,2}:\d{2})/.exec(hours)
  const badge = open ? hours.replace('Đang mở', 'Mở') : next ? 'Mở lúc ' + formatTime(next[1]) : hours.startsWith('Đang đóng') ? 'Đã đóng' : ''
  const missing = hours.startsWith('Chưa có giờ') ? hours : ''
  return { open, badge, missing }
}

/** Một hàng chỗ trong danh sách: tên, loại, cách bao xa, tình trạng mở cửa, rồi mũi tên nếu cần. Bấm mở chi tiết. */
export function PlaceRow({ place, origin, icon = true, arrow = false, distance = true, showArea = true, meta, area, selected = false, source = 'map', children }: { place: Place; origin?: Point | null; icon?: boolean; arrow?: boolean; distance?: boolean; showArea?: boolean; meta?: ReactNode; area?: { name?: string | null } | null; selected?: boolean; source?: string; children?: ReactNode }) {
  const href = `#/cho/${encodeURIComponent(place.id)}?from=${encodeURIComponent(source)}`
  const meters = distance ? distanceOf(origin, place) : null
  const { open, badge } = cardHours(place)
  const text = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = text.current
    if (!box) return
    const kind = box.querySelector<HTMLElement>('[data-place-field="kind"],.dish-meta [data-place-field="dishes"]')
    const fit = () => {
      if (!box.clientWidth) return
      if (kind) { kind.style.display = ''; if (kind.scrollWidth > kind.clientWidth + 1) kind.style.display = 'none' }
    }
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    fit()
    void document.fonts.ready.then(fit)
    return () => observer.disconnect()
  }, [place, meters, badge])
  return <article className="place-row dish-card" data-card data-place-id={place.id} data-region="place-row" data-selected={selected || undefined}>
    <a href={href} className="place-row-link">
      {icon && <GroupIcon group={place.group} />}
      <div className="place-row-text" ref={text}>
        <strong aria-label={place.name} data-name data-place-name>{placeNameInArea(place, showArea ? null : area || null)}</strong>
        <div className="dish-meta"><KindLine place={place} />{meters !== null && <span data-distance={meters}><Icon name="pin" />{formatDistance(meters, place.geo)}</span>}{badge && <span data-place-field="hours" role="img" aria-label={badge} className={open ? 'hours-open' : 'hours-closed'}><span>{badge}</span></span>}</div>
        <div className="dish-extra">{priceLabel(place) && <span data-place-field="price">{priceLabel(place)}</span>}{floorLabel(place.floor) && <span data-place-field="floor">{floorLabel(place.floor)}</span>}{!badge && <HoursLine place={place} />}{meters === null && showArea && <span data-place-field="area">{area?.name}</span>}{meta}</div>
      </div>
      {arrow && <Icon name="arrow" />}
    </a>
    {children}
  </article>
}
