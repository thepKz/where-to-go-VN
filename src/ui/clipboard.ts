/**
 * Chép chữ vào bộ nhớ tạm. navigator.clipboard chỉ có ở kết nối an toàn, nên trang mở qua địa chỉ mạng nhà
 * dùng lệnh chép cũ. Không chép được thì trả về false để màn báo bằng lời thường.
 */
export async function copyText(text: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true } } catch {}
  const before = document.activeElement as HTMLElement | null
  try {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
    document.body.appendChild(field)
    field.select()
    const done = document.execCommand('copy')
    field.remove()
    before?.focus?.()
    return done
  } catch { before?.focus?.(); return false }
}
