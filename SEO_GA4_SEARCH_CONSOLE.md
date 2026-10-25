# SEO, GOOGLE ANALYTICS 4 VÀ SEARCH CONSOLE

## SEO sản phẩm và bài viết
- Trong admin.html → SEO sản phẩm, mở một sản phẩm và chỉnh Title / Meta description.
- Trong admin.html → SEO bài viết, chọn một trong 3 bài blog và chỉnh SEO Title / Meta description.
- Trong admin.html → SEO hệ thống, cấu hình tên website, mô tả, canonical URL.
- Nội dung thay đổi lưu vào localStorage trình duyệt, **không** thay thế SEO server-side. Để bot Google đọc metadata chính xác, cần xuất metadata vào HTML tĩnh hoặc render trên máy chủ trước khi triển khai công khai.
- Tối ưu heading H1, đường dẫn, nội dung hữu ích, alt text khi có ảnh thật, internal link và tốc độ tải.

## Facebook
- Trong admin.html → Facebook / Pixel, nhập URL fanpage và Pixel ID. Đây là cấu hình demo.
- Để Meta Pixel chạy thật, gắn script chính thức theo hướng dẫn Meta Events Manager vào HTML công khai, thử bằng Test Events, cấu hình sự kiện theo nhu cầu và tuân thủ quy định quyền riêng tư.

## Google Analytics 4
1. Vào analytics.google.com → Admin → Create property → Web data stream.
2. Sao chép Measurement ID dạng `G-XXXXXXXXXX`.
3. Thêm mã gtag.js vào `<head>` của tất cả trang web đã xuất bản (thay `G-XXXXXXXXXX`):

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-XXXXXXXXXX');
</script>
```

4. Triển khai trên HTTPS và kiểm tra Realtime / DebugView bằng lượt truy cập thật. Tuân thủ yêu cầu đồng ý cookie khi áp dụng.
5. Chụp màn hình trang quản trị stream và báo cáo Realtime để nộp.

## Google Search Console
1. Triển khai website lên URL công khai có thể truy cập; chọn URL-prefix hoặc Domain property ở search.google.com/search-console.
2. Xác minh bằng DNS TXT hoặc thẻ meta theo lựa chọn Google. Với phương pháp thẻ HTML, thêm vào `<head>`:

```html
<meta name="google-site-verification" content="TOKEN_GOOGLE_CUNG_CAP">
```

3. Gửi sitemap tại `https://TEN_MIEN/sitemap.xml` (cập nhật domain và URL trước khi tải lên).
4. Dùng URL Inspection kiểm tra index, Performance xem click/impression/CTR/position khi Google đã thu thập dữ liệu.
5. Chụp màn hình trạng thái Verified, Sitemaps và Performance thực tế. Trang mới có thể chưa có số liệu.

## Backlink Blog / WordPress
- Website mẫu có 3 bài blog. Nếu giảng viên yêu cầu **Blogger hoặc WordPress**, hãy đăng lại 3 bài lên nền tảng đó, thêm backlink trỏ về trang sản phẩm/danh mục và fanpage thật.
- Chụp 3 bài đã xuất bản, link bài, backlink trong nội dung.
