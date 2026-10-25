
/* =====================================================
   TECHZONE - APP.JS
   Website công nghệ WEB2053
   API: Python server.py
===================================================== */

let currentUser = null;
let db = null;

const $ = selector => document.querySelector(selector);

const params = new URLSearchParams(location.search);

const money = value =>
  Number(value || 0).toLocaleString("vi-VN") + " ₫";

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

/* =====================================================
   1. TẢI VÀ LƯU DỮ LIỆU
===================================================== */

async function load() {
  const me = await fetch("/api/me", {
    credentials: "same-origin"
  });

  if (!me.ok) {
    throw new Error("Không kiểm tra được tài khoản");
  }

  currentUser = (await me.json()).user;

  const response = await fetch("/api/db", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Không tải được dữ liệu sản phẩm");
  }

  db = await response.json();

  db.products ||= [];
  db.categories ||= [];
  db.posts ||= [];
  db.orders ||= [];
  db.settings ||= {};
}

async function save() {
  const response = await fetch("/api/db", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(db)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error || "Không lưu được dữ liệu vào db.json"
    );
  }
}

/* =====================================================
   2. GOOGLE ANALYTICS, META PIXEL, SEARCH CONSOLE
===================================================== */

let trackingEnabled = false;

function trackingSettings() {
  return db?.settings || {};
}

function gaId() {
  const id = String(trackingSettings().ga || "")
    .trim()
    .toUpperCase();

  return /^G-[A-Z0-9]{5,20}$/.test(id) ? id : "";
}

function pixelId() {
  const id = String(trackingSettings().pixel || "").trim();

  return /^\d{8,25}$/.test(id) ? id : "";
}

/* Thêm thẻ xác minh Google Search Console */
function applySearchConsoleVerification() {
  const token = String(
    trackingSettings().googleVerification || ""
  ).trim();

  if (!token) return;

  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) {
    console.warn("Search Console token không hợp lệ");
    return;
  }

  let meta = document.querySelector(
    'meta[name="google-site-verification"]'
  );

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "google-site-verification";
    document.head.appendChild(meta);
  }

  meta.content = token;
}

/* Google Analytics 4 */
function loadAnalytics() {
  const id = gaId();

  if (!id || window.__tzGA === id) return;

  window.__tzGA = id;
  window.dataLayer = window.dataLayer || [];

  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", id);

  const script = document.createElement("script");
  script.async = true;

  script.src =
    "https://www.googletagmanager.com/gtag/js?id=" +
    encodeURIComponent(id);

  document.head.appendChild(script);
}

/* Meta Pixel */
function loadMetaPixel() {
  const id = pixelId();

  if (!id || window.__tzPixel === id) return;

  window.__tzPixel = id;

  if (!window.fbq) {
    const fbq = function () {
      if (fbq.callMethod) {
        fbq.callMethod.apply(fbq, arguments);
      } else {
        fbq.queue.push(arguments);
      }
    };

    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";

    window.fbq = fbq;

    const script = document.createElement("script");
    script.async = true;
    script.src =
      "https://connect.facebook.net/en_US/fbevents.js";

    document.head.appendChild(script);
  }

  window.fbq("init", id);
  window.fbq("track", "PageView");
}

/* Gửi sự kiện */
function trackEvent(name, detail = {}) {
  if (!trackingEnabled) return;

  if (gaId() && typeof window.gtag === "function") {
    window.gtag("event", name, detail);
  }

  if (pixelId() && typeof window.fbq === "function") {
    if (name === "view_item") {
      window.fbq("track", "ViewContent", {
        content_ids: [detail.item_id],
        content_type: "product",
        value: detail.value,
        currency: "VND"
      });
    }

    if (name === "add_to_cart") {
      window.fbq("track", "AddToCart", {
        content_ids: [detail.item_id],
        content_type: "product",
        value: detail.value,
        currency: "VND"
      });
    }

    if (name === "purchase") {
      window.fbq("track", "Purchase", {
        value: detail.value,
        currency: "VND"
      });
    }
  }
}

/* Theo dõi xem sản phẩm và mua hàng */
function trackCurrentPage() {
  const page = document.body.dataset.page;

  if (page === "detail") {
    const product = db.products.find(
      p => String(p.id) === params.get("id")
    );

    if (product) {
      trackEvent("view_item", {
        item_id: product.id,
        item_name: product.name,
        value: Number(product.price || 0),
        currency: "VND"
      });
    }
  }

  if (page === "thankyou") {
    const order = JSON.parse(
      sessionStorage.getItem("tz_last_order") || "null"
    );

    if (
      order &&
      String(order.id) === params.get("id") &&
      sessionStorage.getItem("tz_tracked_order") !==
        String(order.id)
    ) {
      trackEvent("purchase", {
        transaction_id: order.id,
        value: Number(order.total || 0),
        currency: "VND"
      });

      if (trackingEnabled) {
        sessionStorage.setItem(
          "tz_tracked_order",
          String(order.id)
        );
      }
    }
  }
}

function enableTracking() {
  if (trackingEnabled) return;

  trackingEnabled = true;

  loadAnalytics();
  loadMetaPixel();
  trackCurrentPage();
}

/* Thông báo quyền riêng tư */
function setupTracking() {
  applySearchConsoleVerification();

  if (!gaId() && !pixelId()) return;

  const consent = localStorage.getItem(
    "tz_tracking_consent"
  );

  if (consent === "accepted") {
    enableTracking();
    return;
  }

  if (consent === "rejected") return;

  if (document.getElementById("tz-cookie-consent")) {
    return;
  }

  const banner = document.createElement("div");

  banner.id = "tz-cookie-consent";

  banner.style.cssText = `
    position:fixed;
    bottom:16px;
    left:16px;
    right:16px;
    max-width:620px;
    margin:auto;
    background:white;
    color:#172554;
    border:1px solid #cbd5e1;
    border-radius:12px;
    padding:16px;
    box-shadow:0 8px 30px #0003;
    z-index:9999;
    font:14px/1.5 Arial,sans-serif;
  `;

  banner.innerHTML = `
    <strong>Quyền riêng tư</strong>

    <p>
      TECHZONE sử dụng Google Analytics và Meta Pixel
      để đo lường truy cập và hiệu quả quảng cáo.
      Bạn có thể đồng ý hoặc từ chối.
    </p>

    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button type="button" data-consent="rejected">
        Từ chối
      </button>

      <button type="button" data-consent="accepted">
        Đồng ý
      </button>
    </div>
  `;

  banner.addEventListener("click", event => {
    const button = event.target.closest("[data-consent]");

    if (!button) return;

    const choice = button.dataset.consent;

    localStorage.setItem(
      "tz_tracking_consent",
      choice
    );

    banner.remove();

    if (choice === "accepted") {
      enableTracking();
    }
  });

  document.body.appendChild(banner);
}

/* =====================================================
   3. HEADER VÀ FOOTER
===================================================== */

function shell() {
  const count = cartData().reduce(
    (sum, item) => sum + item.qty,
    0
  );

  const header = $("#header");
  const footer = $("#footer");

  if (header) {
    header.innerHTML = `
      <div class="wrap nav">
        <a class="logo" href="index.html">
          ⚡ TECHZONE
        </a>

        <a href="index.html">Trang chủ</a>
        <a href="products.html">Sản phẩm</a>
        <a href="blog.html">Blog</a>
        <a href="marketing.html">Marketing</a>

        ${
          currentUser?.role === "admin"
            ? '<a href="admin.html">Quản trị</a>'
            : ""
        }

        ${
          currentUser
            ? `
              <a href="my-orders.html">Đơn của tôi</a>
              <a href="account.html">Tài khoản</a>
              <a href="#" id="logoutLink">
                Đăng xuất (${esc(currentUser.name)})
              </a>
            `
            : `
              <a href="login.html">Đăng nhập</a>
              <a href="register.html">Đăng ký</a>
            `
        }

        <a href="cart.html">
          🛒 Giỏ hàng (${count})
        </a>
      </div>
    `;

    const logoutLink = $("#logoutLink");

    if (logoutLink) {
      logoutLink.onclick = async event => {
        event.preventDefault();

        await fetch("/api/logout", {
          method: "POST"
        });

        location.href = "index.html";
      };
    }
  }

  if (footer) {
    footer.innerHTML = `
      <div class="wrap">
        <h3>⚡ TECHZONE</h3>
        <p>
          Website công nghệ – Assignment WEB2053
          · Giá và sản phẩm minh họa
        </p>
      </div>
    `;
  }
}

/* =====================================================
   4. HIỂN THỊ SẢN PHẨM
===================================================== */

function card(product) {
  const category = db.categories.find(
    c => c.id === product.category
  );

  return `
    <article class="card">
      <a href="detail.html?id=${encodeURIComponent(product.id)}">
        <img
          src="${esc(product.image || "p1.svg")}"
          alt="${esc(product.name)}"
          loading="lazy"
        >

        <h3>${esc(product.name)}</h3>
      </a>

      <p class="muted">
        ${esc(category?.name || product.category)}
      </p>

      <p class="price">
        ${money(product.price)}
      </p>

      <p class="small">
        Còn ${Number(product.stock || 0)} sản phẩm
      </p>

      <button
        class="btn"
        data-add="${esc(product.id)}"
      >
        Thêm vào giỏ
      </button>
    </article>
  `;
}

/* =====================================================
   5. TRANG CHỦ
===================================================== */

function home() {
  $("#categories").innerHTML = db.categories.map(c => `
    <a class="card"
       href="products.html?cat=${encodeURIComponent(c.id)}">

      <h2>${esc(c.icon || "📦")} ${esc(c.name)}</h2>

      <p>Xem sản phẩm →</p>
    </a>
  `).join("");

  $("#featured").innerHTML = db.products
    .filter(p => p.featured)
    .slice(0, 8)
    .map(card)
    .join("");

  $("#best").innerHTML = [...db.products]
    .sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0))
    .slice(0, 4)
    .map(card)
    .join("");
}

/* =====================================================
   6. DANH SÁCH SẢN PHẨM
===================================================== */

function listing() {
  const category = params.get("cat");

  $("#category").innerHTML = `
    <option value="">Tất cả danh mục</option>
    ${db.categories.map(c => `
      <option value="${esc(c.id)}">
        ${esc(c.name)}
      </option>
    `).join("")}
  `;

  $("#category").value = category || "";

  const render = () => {
    const selectedCategory = $("#category").value;

    const keyword = $("#search").value
      .trim()
      .toLowerCase();

    let products = db.products.filter(p => {
      const matchCategory =
        !selectedCategory ||
        p.category === selectedCategory;

      const matchName = String(p.name)
        .toLowerCase()
        .includes(keyword);

      return matchCategory && matchName;
    });

    const sort = $("#sort").value;

    if (sort === "asc") {
      products.sort((a, b) => a.price - b.price);
    }

    if (sort === "desc") {
      products.sort((a, b) => b.price - a.price);
    }

    $("#count").textContent =
      products.length + " sản phẩm";

    $("#products").innerHTML =
      products.map(card).join("") ||
      "<p>Không tìm thấy sản phẩm.</p>";
  };

  ["search", "category", "sort"].forEach(id => {
    $("#" + id).addEventListener("input", render);
  });

  render();
}

/* =====================================================
   7. CHI TIẾT SẢN PHẨM
===================================================== */

function detail() {
  const product = db.products.find(
    p => String(p.id) === params.get("id")
  );

  if (!product) {
    $("#detail").textContent = "Không tìm thấy sản phẩm";
    return;
  }

  document.title =
    product.seoTitle || product.name;

  const description = document.querySelector(
    'meta[name="description"]'
  );

  if (description) {
    description.content =
      product.seoDescription ||
      product.description ||
      "";
  }

  const category = db.categories.find(
    c => c.id === product.category
  );

  $("#detail").innerHTML = `
    <img
      src="${esc(product.image || "p1.svg")}"
      alt="${esc(product.name)}"
      loading="lazy"
    >

    <div class="card">
      <span class="pill">
        ${esc(category?.name || "")}
      </span>

      <h1>${esc(product.name)}</h1>

      <h2 class="price">
        ${money(product.price)}
      </h2>

      <p>${esc(product.description)}</p>

      <p>Tồn kho: ${Number(product.stock || 0)}</p>

      <button
        class="btn"
        data-add="${esc(product.id)}"
      >
        Thêm vào giỏ hàng
      </button>
    </div>
  `;
}

/* =====================================================
   8. GIỎ HÀNG
===================================================== */

function cartData() {
  try {
    const data = JSON.parse(
      localStorage.getItem("tz_cart") || "[]"
    );

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function setCart(items) {
  localStorage.setItem(
    "tz_cart",
    JSON.stringify(items)
  );

  shell();
}

/* Thêm vào giỏ */
document.addEventListener("click", event => {
  const button = event.target.closest("[data-add]");

  if (!button || !db) return;

  const product = db.products.find(
    p => String(p.id) === button.dataset.add
  );

  if (!product) return;

  const items = cartData();

  const existing = items.find(
    item => String(item.id) === String(product.id)
  );

  if ((existing?.qty || 0) >= product.stock) {
    alert("Không đủ hàng");
    return;
  }

  if (existing) {
    existing.qty++;
  } else {
    items.push({
      id: product.id,
      qty: 1
    });
  }

  setCart(items);

  trackEvent("add_to_cart", {
    item_id: product.id,
    item_name: product.name,
    value: Number(product.price || 0),
    currency: "VND"
  });

  alert("Đã thêm vào giỏ hàng");
});

/* Trang giỏ hàng */
function cart() {
  const items = cartData();

  const validItems = items.filter(item =>
    db.products.some(
      p => String(p.id) === String(item.id)
    )
  );

  if (!validItems.length) {
    $("#cart").innerHTML = `
      <p>
        Giỏ hàng trống.
        <a href="products.html">Mua sắm ngay</a>
      </p>
    `;
    return;
  }

  const rows = validItems.map(item => {
    const product = db.products.find(
      p => String(p.id) === String(item.id)
    );

    return `
      <tr>
        <td>${esc(product.name)}</td>

        <td>${money(product.price)}</td>

        <td>
          <input
            type="number"
            min="1"
            max="${product.stock}"
            value="${item.qty}"
            data-qty="${esc(product.id)}"
            style="width:80px"
          >
        </td>

        <td>
          ${money(product.price * item.qty)}
        </td>

        <td>
          <button
            class="btn danger"
            data-remove="${esc(product.id)}"
          >
            Xóa
          </button>
        </td>
      </tr>
    `;
  }).join("");

  const total = validItems.reduce((sum, item) => {
    const product = db.products.find(
      p => String(p.id) === String(item.id)
    );

    return sum + Number(product.price) * item.qty;
  }, 0);

  $("#cart").innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <tr>
          <th>Sản phẩm</th>
          <th>Đơn giá</th>
          <th>Số lượng</th>
          <th>Thành tiền</th>
          <th></th>
        </tr>

        ${rows}
      </table>
    </div>

    <h2>Tổng tiền: ${money(total)}</h2>

    <a class="btn" href="checkout.html">
      Đặt hàng
    </a>
  `;

  $("#cart").onclick = event => {
    const id = event.target.dataset.remove;

    if (!id) return;

    setCart(items.filter(
      item => String(item.id) !== id
    ));

    cart();
  };

  $("#cart").onchange = event => {
    const id = event.target.dataset.qty;

    if (!id) return;

    const item = items.find(
      x => String(x.id) === id
    );

    const product = db.products.find(
      p => String(p.id) === id
    );

    if (!item || !product) return;

    item.qty = Math.max(
      1,
      Math.min(
        product.stock,
        Number(event.target.value) || 1
      )
    );

    setCart(items);
    cart();
  };
}

/* =====================================================
   9. THANH TOÁN
===================================================== */

function checkout() {
  if (!currentUser) {
    location.href = "login.html?next=checkout.html";
    return;
  }

  $("#checkoutForm").onsubmit = async event => {
    event.preventDefault();

    const items = cartData();

    if (!items.length) {
      alert("Giỏ hàng trống");
      return;
    }

    const customer = {
      name: $("#name").value.trim(),
      phone: $("#phone").value.trim(),
      address: $("#address").value.trim()
    };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items,
          customer
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Đặt hàng thất bại"
        );
      }

      sessionStorage.setItem(
        "tz_last_order",
        JSON.stringify(result.order)
      );

      setCart([]);

      location.href =
        "thankyou.html?id=" +
        encodeURIComponent(result.order.id);

    } catch (error) {
      alert(error.message);
    }
  };
}

/* =====================================================
   10. ĐẶT HÀNG THÀNH CÔNG
===================================================== */

function thankyou() {
  const order = JSON.parse(
    sessionStorage.getItem("tz_last_order") || "null"
  );

  if (
    order &&
    String(order.id) === params.get("id")
  ) {
    $("#thanks").innerHTML = `
      <div class="card">
        <h1>Đặt hàng thành công!</h1>

        <p>
          Mã đơn:
          <b>${esc(order.id)}</b>
        </p>

        <p>
          Tổng tiền: ${money(order.total)}
        </p>

        <a href="my-orders.html" class="btn">
          Đơn hàng của tôi
        </a>
      </div>
    `;
  } else {
    $("#thanks").innerHTML = `
      <p>
        Xem đơn hàng tại
        <a href="my-orders.html">
          Đơn hàng của tôi
        </a>.
      </p>
    `;
  }
}

/* =====================================================
   11. ĐĂNG NHẬP VÀ ĐĂNG KÝ
===================================================== */

function auth() {
  const form = $("#authForm");

  form.onsubmit = async event => {
    event.preventDefault();

    const data = Object.fromEntries(
      new FormData(form)
    );

    const isRegister =
      document.body.dataset.auth === "register";

    const endpoint = isRegister
      ? "/api/register"
      : "/api/login";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Có lỗi xảy ra"
        );
      }

      if (isRegister) {
        alert("Đăng ký thành công!");
        location.href = "login.html";
        return;
      }

      const next = params.get("next");

      if (next === "checkout.html") {
        location.href = "checkout.html";
      } else if (result.user.role === "admin") {
        location.href = "admin.html";
      } else {
        location.href = "index.html";
      }

    } catch (error) {
      alert(error.message);
    }
  };
}

/* =====================================================
   12. ĐƠN HÀNG CỦA TÔI
===================================================== */

async function myorders() {
  if (!currentUser) {
    location.href = "login.html";
    return;
  }

  const response = await fetch("/api/my-orders");

  if (!response.ok) {
    $("#myOrders").textContent =
      "Không tải được đơn hàng";
    return;
  }

  const data = await response.json();

  $("#myOrders").innerHTML = data.orders.length
    ? data.orders.map(order => `
        <div class="card">
          <h3>${esc(order.id)}</h3>

          <p>
            ${esc(order.date)}
            · ${esc(order.status)}
          </p>

          <b>${money(order.total)}</b>
        </div>
      `).join("")
    : "<p>Bạn chưa có đơn hàng nào.</p>";
}

/* =====================================================
   13. TÀI KHOẢN
===================================================== */

function account() {
  if (!currentUser) {
    location.href = "login.html";
    return;
  }

  $("#accountName").textContent = currentUser.name;
  $("#accountEmail").textContent = currentUser.email;

  $("#passwordForm").onsubmit = async event => {
    event.preventDefault();

    const form = event.target;

    const oldPassword =
      form.elements.oldPassword.value;

    const newPassword =
      form.elements.newPassword.value;

    const confirmPassword =
      form.elements.confirmPassword.value;

    if (newPassword !== confirmPassword) {
      alert("Mật khẩu xác nhận không khớp");
      return;
    }

    const response = await fetch(
      "/api/change-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          oldPassword,
          newPassword
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      alert(
        data.error || "Không đổi được mật khẩu"
      );
      return;
    }

    alert("Đổi mật khẩu thành công");
    form.reset();
  };
}

/* =====================================================
   14. BLOG
===================================================== */

function blog() {
  $("#blog").innerHTML = db.posts.map(post => `
    <article class="card">
      <h2>
        <a href="post.html?id=${encodeURIComponent(post.id)}">
          ${esc(post.title)}
        </a>
      </h2>

      <p>${esc(post.excerpt)}</p>

      <a
        class="btn secondary"
        href="post.html?id=${encodeURIComponent(post.id)}"
      >
        Đọc bài viết
      </a>
    </article>
  `).join("");
}

function post() {
  const article = db.posts.find(
    p => String(p.id) === params.get("id")
  );

  if (!article) {
    $("#post").textContent = "Không tìm thấy bài viết";
    return;
  }

  document.title =
    article.seoTitle || article.title;

  const description = document.querySelector(
    'meta[name="description"]'
  );

  if (description) {
    description.content =
      article.seoDescription ||
      article.excerpt ||
      "";
  }

  const paragraphs = Array.isArray(article.content)
    ? article.content
    : [];

  const facebook = db.settings.facebook || "marketing.html";

  $("#post").innerHTML = `
    <h1>${esc(article.title)}</h1>

    <p>${esc(article.excerpt)}</p>

    ${paragraphs.map(text => `
      <p>${esc(text)}</p>
    `).join("")}

    <p>
      <a href="products.html">
        Xem sản phẩm TECHZONE
      </a>

      ·

      <a href="${esc(facebook)}">
        Fanpage
      </a>
    </p>
  `;
}

/* =====================================================
   15. MARKETING
===================================================== */

function marketing() {
  $("#marketing").innerHTML = `
    <div class="grid">
      <div class="card">
        <h2>Facebook</h2>
        <p>
          5 mẫu bài đăng quảng cáo có trong
          docs/NOI_DUNG_FACEBOOK.md
        </p>
      </div>

      <div class="card">
        <h2>Email Marketing</h2>
        <p>
          Mẫu chiến dịch và danh sách thử nghiệm
          trong docs/EMAIL_MARKETING.md
        </p>
      </div>

      <div class="card">
        <h2>Google</h2>
        <p>
          Hướng dẫn GA4 và Search Console trong
          docs/SEO_GA4_SEARCH_CONSOLE.md
        </p>
      </div>
    </div>

    <p class="notice">
      Các chiến dịch thực tế cần triển khai bằng
      tài khoản thật. Không sử dụng số liệu giả.
    </p>
  `;
}

/* =====================================================
   16. TRANG QUẢN TRỊ ADMIN
===================================================== */

function admin() {
  if (currentUser?.role !== "admin") {
    location.href = "login.html";
    return;
  }

  let tab = "products";

  const tabs = [
    ["products", "Sản phẩm"],
    ["categories", "Danh mục"],
    ["posts", "Bài viết"],
    ["settings", "SEO & Facebook"],
    ["orders", "Đơn hàng"],
    ["customers", "Khách hàng"]
  ];

  $("#tabs").innerHTML = tabs.map(([id, label]) => `
    <button
      class="btn secondary"
      data-tab="${id}"
    >
      ${label}
    </button>
  `).join("");

  $("#tabs").onclick = event => {
    const button = event.target.closest("[data-tab]");

    if (!button) return;

    tab = button.dataset.tab;
    render();
  };

  const input = (
    key,
    label,
    value = "",
    type = "text"
  ) => `
    <label>
      ${label}
      <input
        name="${key}"
        type="${type}"
        value="${esc(value)}"
      >
    </label>
  `;

  function render() {
    const panel = $("#panel");

    panel.onclick = null;
    panel.onchange = null;

    /* ---------- QUẢN LÝ SẢN PHẨM ---------- */

    if (tab === "products") {
      panel.innerHTML = `
        <h2>Quản lý sản phẩm và SEO</h2>

        <select id="choose">
          <option value="">+ Thêm sản phẩm mới</option>

          ${db.products.map(p => `
            <option value="${esc(p.id)}">
              ${esc(p.name)}
            </option>
          `).join("")}
        </select>

        <form id="edit" class="card stack">
          ${input("name", "Tên sản phẩm")}
          ${input("price", "Giá", 0, "number")}
          ${input("stock", "Tồn kho", 0, "number")}

          <label>
            Danh mục

            <select name="category">
              ${db.categories.map(c => `
                <option value="${esc(c.id)}">
                  ${esc(c.name)}
                </option>
              `).join("")}
            </select>
          </label>

          ${input("image", "Đường dẫn ảnh")}

          <label>
            Chọn ảnh từ máy
            <input
              type="file"
              id="upload"
              accept="image/*"
            >
          </label>

          <img
            id="preview"
            alt="Xem trước"
            style="width:180px;height:150px;object-fit:contain"
          >

          <label>
            Mô tả
            <textarea name="description"></textarea>
          </label>

          ${input("seoTitle", "SEO title")}
          ${input("seoDescription", "SEO description")}

          <label>
            <input
              type="checkbox"
              name="featured"
              style="width:auto"
            >
            Sản phẩm nổi bật
          </label>

          <div class="row">
            <button class="btn" type="submit">
              Lưu vào db.json
            </button>

            <button
              class="btn danger"
              type="button"
              id="delete"
            >
              Xóa sản phẩm
            </button>
          </div>
        </form>
      `;

      const form = $("#edit");
      const choose = $("#choose");

      function fill() {
        const product = db.products.find(
          p => String(p.id) === choose.value
        ) || {};

        [
          "name",
          "price",
          "stock",
          "category",
          "image",
          "description",
          "seoTitle",
          "seoDescription"
        ].forEach(key => {
          if (form.elements[key]) {
            form.elements[key].value =
              product[key] ?? "";
          }
        });

        form.elements.featured.checked =
          !!product.featured;

        $("#preview").src = product.image || "";
      }

      choose.onchange = fill;
      fill();

      $("#upload").onchange = async event => {
        const file = event.target.files[0];

        if (!file) return;

        if (file.size > 700000) {
          alert("Ảnh tối đa 700KB. Hãy nén ảnh trước.");
          return;
        }

        const data = await new Promise(resolve => {
          const reader = new FileReader();

          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });

        form.elements.image.value = data;
        $("#preview").src = data;
      };

      form.onsubmit = async event => {
        event.preventDefault();

        const product = db.products.find(
          p => String(p.id) === choose.value
        );

        const object = {};

        [
          "name",
          "price",
          "stock",
          "category",
          "image",
          "description",
          "seoTitle",
          "seoDescription"
        ].forEach(key => {
          object[key] =
            form.elements[key].value.trim();
        });

        if (!object.name) {
          alert("Nhập tên sản phẩm");
          return;
        }

        object.price = Math.max(
          0,
          Number(object.price) || 0
        );

        object.stock = Math.max(
          0,
          Math.floor(Number(object.stock) || 0)
        );

        object.featured =
          form.elements.featured.checked;

        if (product) {
          Object.assign(product, object);
        } else {
          db.products.push({
            id: "p" + Date.now(),
            sold: 0,
            ...object
          });
        }

        try {
          await save();
          alert("Đã lưu sản phẩm");
          render();
        } catch (error) {
          alert(error.message);
        }
      };

      $("#delete").onclick = async () => {
        const id = choose.value;

        if (!id) return;

        if (!confirm("Xóa sản phẩm này?")) {
          return;
        }

        const old = db.products;

        db.products = db.products.filter(
          p => String(p.id) !== id
        );

        try {
          await save();
          render();
        } catch (error) {
          db.products = old;
          alert(error.message);
        }
      };
    }

    /* ---------- QUẢN LÝ DANH MỤC ---------- */

    if (tab === "categories") {
      panel.innerHTML = `
        <h2>Quản lý danh mục</h2>

        <form id="catForm" class="card stack">
          ${input("id", "Mã danh mục")}
          ${input("name", "Tên danh mục")}
          ${input("icon", "Biểu tượng", "📦")}

          <button class="btn" type="submit">
            Thêm danh mục
          </button>
        </form>

        <div class="grid">
          ${db.categories.map(c => `
            <div class="card">
              <h3>
                ${esc(c.icon)} ${esc(c.name)}
              </h3>

              <p>${esc(c.id)}</p>

              <button
                class="btn danger"
                data-delcat="${esc(c.id)}"
              >
                Xóa
              </button>
            </div>
          `).join("")}
        </div>
      `;

      $("#catForm").onsubmit = async event => {
        event.preventDefault();

        const form = event.target;

        const id = form.elements.id.value.trim();
        const name = form.elements.name.value.trim();
        const icon = form.elements.icon.value.trim();

        if (
          !id ||
          !name ||
          db.categories.some(c => c.id === id)
        ) {
          alert("Mã danh mục trống, trùng hoặc thiếu tên");
          return;
        }

        db.categories.push({
          id,
          name,
          icon
        });

        try {
          await save();
          render();
        } catch (error) {
          db.categories.pop();
          alert(error.message);
        }
      };

      panel.onclick = async event => {
        const button = event.target.closest(
          "[data-delcat]"
        );

        if (!button) return;

        const id = button.dataset.delcat;

        if (
          db.products.some(p => p.category === id)
        ) {
          alert("Danh mục đang có sản phẩm");
          return;
        }

        if (!confirm("Xóa danh mục này?")) {
          return;
        }

        const old = db.categories;

        db.categories = db.categories.filter(
          c => c.id !== id
        );

        try {
          await save();
          render();
        } catch (error) {
          db.categories = old;
          alert(error.message);
        }
      };
    }

    /* ---------- QUẢN LÝ BÀI VIẾT ---------- */

    if (tab === "posts") {
      panel.innerHTML = `
        <h2>Quản lý bài viết và SEO</h2>

        <select id="choosePost">
          ${db.posts.map(p => `
            <option value="${esc(p.id)}">
              ${esc(p.title)}
            </option>
          `).join("")}
        </select>

        <form id="postForm" class="card stack">
          ${input("title", "Tiêu đề")}
          ${input("excerpt", "Mô tả ngắn")}

          <label>
            Nội dung (mỗi đoạn một dòng)

            <textarea
              name="content"
              rows="8"
            ></textarea>
          </label>

          ${input("seoTitle", "SEO title")}
          ${input("seoDescription", "SEO description")}

          <button class="btn" type="submit">
            Lưu bài viết
          </button>
        </form>
      `;

      const form = $("#postForm");
      const choose = $("#choosePost");

      function fillPost() {
        const article = db.posts.find(
          p => String(p.id) === choose.value
        );

        if (!article) return;

        [
          "title",
          "excerpt",
          "seoTitle",
          "seoDescription"
        ].forEach(key => {
          form.elements[key].value =
            article[key] || "";
        });

        form.elements.content.value =
          (article.content || []).join("\n");
      }

      choose.onchange = fillPost;
      fillPost();

      form.onsubmit = async event => {
        event.preventDefault();

        const article = db.posts.find(
          p => String(p.id) === choose.value
        );

        if (!article) {
          alert("Không tìm thấy bài viết");
          return;
        }

        [
          "title",
          "excerpt",
          "seoTitle",
          "seoDescription"
        ].forEach(key => {
          article[key] =
            form.elements[key].value.trim();
        });

        article.content =
          form.elements.content.value
            .split("\n")
            .map(text => text.trim())
            .filter(Boolean);

        try {
          await save();
          alert("Đã lưu bài viết");
        } catch (error) {
          alert(error.message);
        }
      };
    }

    /* ---------- SEO, FACEBOOK, GOOGLE ---------- */

    if (tab === "settings") {
      const fields = {
        siteTitle: "Tên website",
        siteDescription: "Meta description",
        siteKeywords: "Từ khóa SEO",
        canonical: "Địa chỉ website công khai",
        facebook: "URL Fanpage",
        pixel: "Meta Pixel ID",
        ga: "Google Analytics G-...",
        googleVerification:
          "Search Console verification token"
      };

      panel.innerHTML = `
        <h2>SEO hệ thống · Facebook · Google</h2>

        <form id="settingsForm" class="card stack">
          ${Object.entries(fields).map(([key, label]) =>
            input(key, label, db.settings[key] || "")
          ).join("")}

          <button class="btn" type="submit">
            Lưu cấu hình vào db.json
          </button>
        </form>

        <p class="notice">
          Google Analytics và Meta Pixel sẽ hoạt động
          khi có mã hợp lệ và khách đồng ý cookie.
          Search Console có thể tiếp tục xác minh
          bằng file HTML đã tải lên Render.
        </p>
      `;

      $("#settingsForm").onsubmit = async event => {
        event.preventDefault();

        const form = event.target;

        const oldSettings = {
          ...db.settings
        };

        Object.keys(fields).forEach(key => {
          db.settings[key] =
            form.elements[key].value.trim();
        });

        try {
          await save();

          applySearchConsoleVerification();
          setupTracking();

          alert(
            "Đã lưu cấu hình. Tải lại trang để áp dụng mã theo dõi mới."
          );
        } catch (error) {
          db.settings = oldSettings;
          alert(error.message);
        }
      };
    }

    /* ---------- QUẢN LÝ KHÁCH HÀNG ---------- */

    if (tab === "customers") {
      panel.innerHTML = `
        <h2>Danh sách khách hàng</h2>

        <div id="customers">
          Đang tải...
        </div>
      `;

      fetch("/api/customers")
        .then(response => {
          if (!response.ok) {
            throw new Error("Không có quyền truy cập");
          }

          return response.json();
        })
        .then(data => {
          $("#customers").innerHTML = `
            <div class="table-wrap">
              <table class="table">
                <tr>
                  <th>Họ tên</th>
                  <th>Email</th>
                  <th>Vai trò</th>
                </tr>

                ${data.customers.map(user => `
                  <tr>
                    <td>${esc(user.name)}</td>
                    <td>${esc(user.email)}</td>
                    <td>${esc(user.role)}</td>
                  </tr>
                `).join("")}
              </table>
            </div>
          `;
        })
        .catch(error => {
          $("#customers").textContent =
            error.message;
        });
    }

    /* ---------- QUẢN LÝ ĐƠN HÀNG ---------- */

    if (tab === "orders") {
      const statuses = [
        "Mới đặt",
        "Đang xử lý",
        "Đang giao",
        "Hoàn thành",
        "Đã hủy"
      ];

      panel.innerHTML = `
        <h2>Đơn hàng (${db.orders.length})</h2>

        <div class="table-wrap">
          <table class="table">
            <tr>
              <th>Mã</th>
              <th>Khách hàng</th>
              <th>Điện thoại</th>
              <th>Tổng</th>
              <th>Trạng thái</th>
            </tr>

            ${db.orders.map(order => `
              <tr>
                <td>${esc(order.id)}</td>

                <td>
                  ${esc(order.customer?.name || "")}
                </td>

                <td>
                  ${esc(order.customer?.phone || "")}
                </td>

                <td>${money(order.total)}</td>

                <td>
                  <select data-order="${esc(order.id)}">
                    ${statuses.map(status => `
                      <option
                        value="${status}"
                        ${status === order.status
                          ? "selected"
                          : ""}
                      >
                        ${status}
                      </option>
                    `).join("")}
                  </select>
                </td>
              </tr>
            `).join("")}
          </table>
        </div>
      `;

      panel.onchange = async event => {
        const select = event.target.closest(
          "[data-order]"
        );

        if (!select) return;

        const order = db.orders.find(
          o => String(o.id) === select.dataset.order
        );

        if (!order) return;

        const oldStatus = order.status;
        order.status = select.value;

        try {
          await save();
        } catch (error) {
          order.status = oldStatus;
          select.value = oldStatus;
          alert(error.message);
        }
      };
    }
  }

  render();
}

/* =====================================================
   17. KHỞI CHẠY WEBSITE
===================================================== */

(async function init() {
  try {
    await load();

    shell();

    setupTracking();

    const pages = {
      home,
      products: listing,
      detail,
      cart,
      checkout,
      thankyou,
      blog,
      post,
      marketing,
      admin,
      auth,
      myorders,
      account
    };

    const page = document.body.dataset.page;

    if (pages[page]) {
      await pages[page]();
    }

  } catch (error) {
    console.error("TECHZONE ERROR:", error);

    const main = document.querySelector("main");

    if (main) {
      main.innerHTML = `
        <div class="notice">
          <h2>Không kết nối được dữ liệu</h2>

          <p>${esc(error.message)}</p>

          <p>
            Vui lòng kiểm tra server.py,
            db.json và Render Logs.
          </p>
        </div>
      `;
    }
  }
})();
