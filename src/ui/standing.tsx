import { useApp, useStore } from '../app-context'
import { copy } from '../copy'
import { Button, Icon } from './index'
import './standing.css'

/** Chỗ đứng đặt bằng tay: nói chỗ đang dùng, có lối đổi và lối bỏ. Chỉ hiện khi đang dùng chỗ đứng đặt tay. */
export function StandingNote({ onChange, action = 'doi-cho-dung' }: { onChange?: () => void; action?: string }) {
  const app = useApp()
  const { state } = useStore()
  const standing = app.standing
  if (!app.usingStanding || !standing) return null
  const area = standing.kind === 'khu' ? state.catalog.areas.find(item => item.id === standing.areaId) : undefined
  return <div className="standing" data-manual-location data-standing-kind={standing.kind}>
    <p className="standing-text"><Icon name="locate" />{area ? <span>{copy.standing.inArea} <span data-name data-area-name>{area.name}</span></span> : <span>{copy.standing.onMap}</span>}</p>
    <div className="standing-actions">{onChange && <Button data-action={action} onClick={onChange}>{copy.standing.change}</Button>}<Button data-action="bo-cho-dung" aria-label={copy.standing.clear} onClick={app.clearStanding}>{copy.standing.clear}</Button></div>
  </div>
}
