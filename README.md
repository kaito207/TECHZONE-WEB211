# TECHZONE WEB2053 – Website hoàn chỉnh bản demo offline

## Chạy trên Windows
1. Cài Python 3 (chọn Add Python to PATH).
2. Giải nén ZIP, mở thư mục TECHZONE_WEB2053_FULL.
3. Nhấp đúp `CHAY_WEBSITE.bat` hoặc mở Terminal tại thư mục và chạy `python server.py`.
4. Mở http://127.0.0.1:3000 (KHÔNG chạy Live Server cổng 5500).

## Tài khoản và dữ liệu
- Admin lần đầu: `admin@techzone.vn` / `123456` (chỉ dùng demo trên localhost).
- Đăng ký khách hàng tại `/register.html`, đăng nhập `/login.html`.
- Đổi mật khẩu ở `/account.html`, xem đơn hàng `/my-orders.html`.
- 20 sản phẩm thuộc 5 danh mục, 20 ảnh SVG minh họa offline trong `assets/`.
- Admin quản lý sản phẩm, tải ảnh từ máy, danh mục, bài viết SEO, cấu hình Facebook, đơn hàng, danh sách khách hàng.
- Dữ liệu lưu trong `db.json`; người dùng và mật khẩu băm lưu trong `users.json` (tạo khi chạy lần đầu). Sao lưu cả hai file.
- Blog, nội dung Facebook, Email và hướng dẫn GA4/Search Console trong thư mục `docs/`. Các hoạt động marketing thực tế cần tài khoản và bằng chứng thật.

## Lưu ý
Ảnh SVG là hình minh họa sản phẩm, không phải ảnh chụp chính hãng. Bạn có thể tải ảnh thật từ máy ở trang Admin. Website phục vụ demo bài học trên localhost, chưa đủ bảo mật để đưa công khai lên Internet.
