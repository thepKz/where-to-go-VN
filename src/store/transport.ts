import type { Change, Household, Identity, Member, Tables } from './types'
/** `entered` là máy này đã từng vào một nhà thật. Nhà không còn người này thì không tự tạo nhà mới thay. */
export interface Session { identity: Identity; household?: Household; member: Member; entered?: boolean; detached?: boolean }
/** Loại lỗi khi nói chuyện với máy chủ: tạm thời thì thử lại, vĩnh viễn thì bỏ thay đổi, auth thì đăng nhập lại, setup thì dự án chưa cài xong. */
export type SyncKind = 'temporary' | 'permanent' | 'auth' | 'setup'
export class SyncError extends Error {
  readonly kind: SyncKind
  readonly code?: string
  readonly status?: number
  constructor(message: string, kind: SyncKind, code?: string, status?: number) { super(message); this.name = 'SyncError'; this.kind = kind; this.code = code; this.status = status }
}
export interface Transport {
  bootstrap(session: Session): Promise<{ identity: Identity; tables: Tables }>
  join(code: string, name: string): Promise<{ identity: Identity; tables: Tables }>
  create(name: string): Promise<{ identity: Identity; tables: Tables }>
  write(change: Change): Promise<Tables | void>
  /** `removed` được gọi khi máy chủ báo máy này đã bị gỡ khỏi nhà. */
  listen(receive: (tables: Tables) => void, status: (online: boolean) => void, removed?: () => void): () => void
  /** Tải lại đủ bảng từ máy chủ (dùng sau khi một thay đổi bị từ chối). */
  reload?(): Promise<Tables>
  /** Gỡ một máy cùng nhà. */
  removeMember?(memberId: string): Promise<Tables>
}
