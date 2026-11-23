import { copy } from '../copy'
// Chữ hiện cho người dùng của lớp lưu trữ. Câu ngắn, lời thường.
export const syncText = {
  rejected: 'Một thay đổi chưa lưu được nên đã bỏ qua, các thay đổi khác vẫn lưu bình thường',
  tooMany: 'Bạn nhập sai nhiều lần, chờ mười lăm phút rồi thử lại nhé',
  removeFailed: 'Chưa gỡ được máy này, bạn thử lại nhé',
  setup: copy.errors.setup,
  houseFull: copy.errors.houseFull,
  wrongCode: copy.errors.code,
  join: copy.errors.join,
  connection: copy.errors.connection,
} as const
