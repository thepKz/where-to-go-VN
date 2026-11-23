# Đi Đâu

Xem thử trên mạng: https://thepkz.github.io/where-to-go-VN/

Bản xem thử dựng bằng `npm run pages` và tự đưa lên GitHub Pages mỗi lần đẩy lên nhánh main (tệp `.github/workflows/pages.yml`, đăng lên nhánh gh-pages). Bản này không có máy chủ đồng bộ nên chỉ dùng thử một mình trên trình duyệt. Bài kiểm và bộ đo nằm ở kho làm việc chính, không có trong kho này.

Node 24. Trong thư mục này chạy `npm install`, `npm run build`, `npm test`.

Hai cửa sổ PowerShell:

```powershell
npm run sync -- --port 4504
```

```powershell
$env:VITE_SYNC_URL='http://localhost:4504'
npm run dev -- --port 4503
```

Mở `http://localhost:4503/?seed=42&now=2026-11-14T05%3A00%3A00Z#/`.
Máy đầu tự tạo nhà. Vào Nhà để lấy mã. Máy hai dùng cửa sổ riêng, nhập mã đó.

`VITE_DATA_URL` mặc định `/data/places.json`. Trước khi chạy hoặc dựng, ưu tiên dữ liệu thật, rồi dữ liệu bên đo, cuối cùng mới dữ liệu mẫu ghi rõ.

`src/store/types.ts` là giao diện dữ liệu. Màn dùng `useStore()` và `useApp()` từ `src/app-context.tsx`. Không gọi mạng hay ghi bộ nhớ riêng trong màn. `Store` giữ các bảng và hàng chờ. Vị trí chính xác chỉ ở `useApp().origin`, không lưu.

Các màn xuất mặc định từ `src/screens/<tên>/index.tsx`. Thay ruột trong thư mục màn, không sửa `App.tsx`. Đã nhập sẵn mọi màn. Được thêm tệp CSS riêng rồi nhập từ màn. Nhãn sẵn có tại `copy.ts`, gồm `dish`, `mapFields`, `detail`, `collection`.

`node tests/browser.mjs` chạy hai máy ở 4503 và 4504, chụp và đối chiếu ảnh. `node tests/offline.mjs` kiểm bản dựng khi mất mạng. Hai bài dùng Playwright đã có ở `web/node_modules` và thước trong `../measure`, tự tắt máy chủ. `node scripts/verify.mjs` lưu kết quả build và test. `node scripts/summarize.mjs` tổng hợp số đo và kiểm cổng.

Supabase chưa kiểm trên dự án thật. Xem `supabase/README.md`.
Kết quả nghiệm thu và bảng bàn giao ở `../docs/evidence/dd-app-0/BAO-CAO.md`.

## Dùng trong nhà

Dành cho hai người dùng điện thoại trong cùng một nhà, chưa đưa lên mạng.

1. Trên máy tính, mở PowerShell trong thư mục này và gõ `npm run nha`. Lần đầu máy dựng trang nên chờ một lúc. Khi thấy dòng "Trên điện thoại cùng Wi-Fi" kèm một địa chỉ, là xong. Muốn đổi cổng thì thêm `-- --port 4660`.
2. Trên điện thoại, nối cùng Wi-Fi với máy tính, mở trình duyệt và gõ đúng địa chỉ đó, ví dụ `http://192.168.1.20:4650`. Máy đầu tiên mở sẽ tự có một nhà.
3. Vào mục Nhà, đọc mã sáu số. Người kia mở cùng địa chỉ, vào mục Nhà, nhập mã đó rồi bấm Vào nhà.

Điều cần biết:

- Máy tính phải đang bật và đang chạy lệnh trên thì điện thoại mới dùng được. Tắt máy tính thì điện thoại vẫn xem được phần đã lưu nhưng hai máy chưa thấy nhau.
- Lần đầu, tường lửa của Windows có thể hỏi có cho phép Node nhận kết nối không. Bạn tự bấm cho phép ở mạng riêng tư. Ứng dụng không tự sửa cài đặt nào của máy.
- Dữ liệu của nhà nằm ở `apps/di-dau/local/nha.json` (đổi bằng `-- --data <thư mục>` hoặc biến `DIDAU_LOCAL_DIR`). Tắt rồi bật lại máy tính thì nhà, mã, đánh dấu và lượt chốt vẫn còn. Tệp hỏng thì được giữ lại dưới tên khác và nhà bắt đầu lại từ trống.
- Điện thoại không tự lấy được vị trí qua địa chỉ này, vì trình duyệt chỉ cho lấy vị trí ở kết nối an toàn. Hãy dùng "Đặt chỗ tôi đứng" ở tab Bản đồ rồi chạm một điểm, hoặc chạm hình định vị cạnh một khu trong hộp Chọn khu. Chỗ đứng chỉ nằm trên điện thoại đó.
- Chỉ dùng trong mạng nhà. Máy chủ từ chối yêu cầu đến từ trang khác và từ địa chỉ công khai.
