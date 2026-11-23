import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../app-context'
import { copy } from '../../copy'
import { syncText } from '../../store/messages'
import type { Member } from '../../store'
import { Button, Card, Icon, Sheet } from '../../ui'
import { copyText } from '../../ui/clipboard'

/** Tên máy để hiện: tên người dùng đã đặt, chưa đặt thì một tên thay thế lời thường. */
const shownName = (member: Member) => (member.name.trim() && member.name !== copy.deviceDefault ? member.name : copy.unnamed)

export default function Nha() {
  const { store, state } = useStore()
  const { memberId, householdId } = state.identity
  const member = state.members.find(row => row.id === memberId)
  const household = state.households.find(house => house.id === householdId)
  const members = [...state.members].sort((left, right) => (left.id === memberId ? -1 : right.id === memberId ? 1 : left.joined_at.localeCompare(right.joined_at)))
  const [name, setName] = useState(member?.name === copy.deviceDefault ? '' : member?.name || '')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const listRef = useRef<HTMLElement>(null)
  useEffect(() => { setName(member?.name === copy.deviceDefault ? '' : member?.name || '') }, [member?.name])
  // Người định gỡ đã đi khỏi nhà bằng đường khác thì đóng hộp hỏi lại.
  useEffect(() => { if (target && !state.members.some(row => row.id === target.id)) setTarget(null) }, [target, state.members])
  const saveName = async () => { try { if (name.trim() && name !== member?.name) await store.setName(name) } catch (error) { setMessage((error as Error).message) } }
  const join = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try { await saveName(); await store.joinHousehold(code); setCode('') }
    catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  const createHouse = async () => {
    setBusy(true); setMessage('')
    try { await saveName(); await store.createHousehold() }
    catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  const copyCode = async () => {
    if (await copyText(household?.invite_code || '')) { setCopied(true); return }
    // Không chép được thì chọn sẵn chữ mã để người dùng tự chép.
    const node = document.querySelector('[data-invite-code]')
    if (node) { const range = document.createRange(); range.selectNodeContents(node); const selection = getSelection(); selection?.removeAllRanges(); selection?.addRange(range) }
    setMessage(copy.copyFailed)
  }
  const remove = async () => {
    if (!target) return
    setRemoving(true); setRemoveError('')
    try { await store.removeMember(target.id); setTimeout(() => listRef.current?.focus(), 0) }
    catch (error) { setRemoveError((error as Error).message || syncText.removeFailed) }
    finally { setRemoving(false); setTarget(null) }
  }
  const nameField = <label>{copy.device}<input data-user-content value={name} maxLength={80} onChange={event => setName(event.target.value)} onBlur={() => void saveName()} autoComplete="nickname" /></label>
  // Lời "đã vào cùng nhà" của lần vào trước không còn đúng khi máy đã bị gỡ.
  const shown = householdId || message !== copy.joined ? message : ''
  const joinCard = <Card className="join-card"><form className="join-form" onSubmit={event => void join(event)}><h2 className="join-title" id="join-title">{copy.joinTitle}</h2><div className="join-row"><input id="join-code" aria-label={copy.enterCode} placeholder={copy.codePlaceholder} inputMode="numeric" aria-describedby="join-title" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" onChange={event => setCode(event.target.value)} /><Button primary type="submit" data-action="vao-nha" disabled={busy}>{copy.join}</Button></div>{shown && <p className="error" role={shown === copy.joined ? 'status' : 'alert'}>{shown}</p>}</form></Card>

  // Máy chưa ở trong nhà nào (đã bị gỡ): không có dữ liệu của nhà cũ, chỉ có lối tạo nhà mới hoặc nhập mã.
  if (!householdId) {
    return <main data-screen="nha" data-detached><div className="screen-title"><div><h1>{copy.houseTitle}</h1><p className="small house-why">{copy.houseWhy}</p></div></div><div className="house-grid">
      <Card className="stack">{nameField}<p className="status" role="status"><Icon name="pin" />{copy.detached}</p><Button primary data-action="tao-nha" disabled={busy} onClick={() => void createHouse()}>{copy.createNew}</Button></Card>
      {joinCard}
    </div></main>
  }

  return <main data-screen="nha"><div className="screen-title"><div><h1>{copy.houseTitle}</h1><p className="small house-why">{copy.houseWhy}</p></div></div><div className="house-grid">
    <Card className="stack">{nameField}<div className="stack"><div className="row between"><span data-invite-code className="invite-code">{household?.invite_code}</span><Button icon="copy" data-action="chep-ma" onClick={() => void copyCode()}>{copied ? copy.copied : copy.copy}</Button></div><p data-invite-hint>{copy.inviteWhy}</p></div><p className="status" data-sync={state.sync} role="status"><Icon name={state.sync === 'ok' ? 'check' : 'shuffle'} />{state.sync === 'ok' ? (state.members.length > 1 ? copy.syncPair : copy.syncAlone) : copy.sync[state.sync]}</p></Card>
    <div className="house-column">
      <Card ref={listRef} tabIndex={-1}>
        <ul className="member-list">{members.map(row => {
          const self = row.id === memberId
          return <li key={row.id} className="member-row" data-member-id={row.id} data-member-self={self || undefined}>
            <span className="member-name" data-user-content>{shownName(row)}</span>
            {self ? <span className="badge">{copy.thisDevice}</span> : <Button data-action="go-may" aria-label={`${copy.removeMember} ${shownName(row)}`} disabled={removing} onClick={() => { setRemoveError(''); setTarget(row) }}>{copy.removeMember}</Button>}
          </li>
        })}</ul>
        {removeError && <p className="error" role="alert">{removeError}</p>}
      </Card>
      {joinCard}
    </div>
    <Sheet open={!!target} onClose={() => setTarget(null)} title={copy.removeTitle} focus='[data-action="huy"]'>
      <div className="stack"><p>{target && target.name.trim() && target.name !== copy.deviceDefault ? <><span data-user-content>{target.name.trim()}</span> {copy.removeAfterTail}</> : copy.removeAfter}</p><div className="confirm-actions"><Button data-action="huy" onClick={() => setTarget(null)}>{copy.removeCancel}</Button><Button primary data-action="dong-y" disabled={removing} onClick={() => void remove()}>{copy.removeConfirm}</Button></div></div>
    </Sheet>
  </div></main>
}
