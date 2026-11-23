# Bản Supabase

Hướng dẫn đưa lên từng bước cho người không rành kỹ thuật nằm ở `apps/di-dau/docs/TRIEN-KHAI.md`. Tệp này chỉ ghi phần kỹ thuật.

**Đã kiểm:** `schema.sql` chạy nguyên văn hai lần liền trên PostgreSQL trong bộ nhớ (PGlite) cùng luật theo dòng, vào nhà bằng mã, giới hạn thử mã, nhà đủ bốn máy (`npm run test:sql`). Lớp lưu trữ được kiểm với máy khách giả (`npm test`).
**Chưa kiểm:** dự án Supabase thật, Realtime thật, iPhone.

## Các bước
1. Tạo dự án. Vào Authentication, Sign In / Providers, bật **Anonymous Sign-Ins**. **Không bật CAPTCHA**: ứng dụng chưa gửi mã CAPTCHA nên bật là không ai vào được. Giữ giới hạn mặc định.
2. SQL Editor, New query, dán toàn bộ `schema.sql`, bấm Run. Phải thấy Success. Chạy lại tệp này bao nhiêu lần cũng được, dùng cách đó để cập nhật luật khi tệp đổi.
3. Kiểm Database, Publications, supabase_realtime: bảy bảng `households`, `members`, `marks`, `custom_places`, `rounds`, `votes`, `picks` đều được bật.
4. Ở Vercel đặt `VITE_STORE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (xem `.env.example`). Thiếu `VITE_STORE=supabase` thì bản dựng chạy bản thử trên máy. Không dùng khoá service role. Đổi biến thì phải dựng lại.
5. Dữ liệu chỗ nằm ở `public/data/places.json` và phải có trong kho. Lệnh dựng dừng nếu tệp chỉ là dữ liệu mẫu.

## Điều cần biết
- Mất phiên (xoá dữ liệu trình duyệt, đổi máy) nghĩa là mất quyền vào nhà. Người đó nhập lại mã mời để vào lại. Dữ liệu cũ của họ vẫn nằm ở nhà nhưng gắn với máy cũ.
- Máy cũ không dùng quá 30 ngày bị gỡ tự động khi nhà đầy và có người mới vào. Hàm `remove_member` cho gỡ tay một máy cùng nhà.
- Mã mời có sáu ký tự từ 32 ký tự dễ đọc. Sai năm lần trong mười lăm phút thì bị chặn. Ai có mã đều đọc được toàn bộ lịch sử của nhà. Mã không đổi được.
- Hàng chờ nằm trên máy. Thay đổi bị luật từ chối thì bị bỏ và người dùng được báo. Lỗi mạng thì giữ và thử lại.
- Toạ độ chỉ có trong `rounds.where`, làm tròn ba số lẻ, hoặc là mã khu.
- Dọn người dùng ẩn danh cũ: xoá khỏi Authentication, Users, dữ liệu của họ tự xoá theo. Không chạy `apps/di-dau/data/supabase-seed.sql`: tệp đó thuộc thiết kế cũ và sẽ lỗi.
- Máy chủ `sync-server.mjs` chỉ để thử trên máy, không dành cho đưa lên mạng.
