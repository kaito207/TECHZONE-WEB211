
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from http import cookies
import json
import threading
import os
import hashlib
import hmac
import secrets
import time

# ================== CẤU HÌNH ==================

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

PORT = int(os.environ.get("PORT", 3000))
HOST = "0.0.0.0"

USERS = ROOT / "users.json"
DB = ROOT / "db.json"

lock = threading.RLock()
sessions = {}


# ================== MẬT KHẨU ==================

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        200000
    )
    return salt + ":" + hashed.hex()


def valid(password, stored):
    try:
        salt = stored.split(":")[0]
        return hmac.compare_digest(
            hash_password(password, salt),
            stored
        )
    except Exception:
        return False


# ================== DỮ LIỆU ==================

def read_json(path):
    with lock:
        return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    with lock:
        temp = path.with_suffix(path.suffix + ".tmp")

        temp.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        temp.replace(path)


def init_data():
    if not DB.exists():
        raise FileNotFoundError(
            "Không tìm thấy db.json. "
            "Hãy upload db.json lên GitHub."
        )

    if not USERS.exists():
        admin_password = os.environ.get("ADMIN_PASSWORD")

        if not admin_password or len(admin_password) < 12:
            raise RuntimeError(
                "Cần thiết lập ADMIN_PASSWORD "
                "ít nhất 12 ký tự trong Render."
            )

        users = [{
            "id": "admin",
            "name": "Quản trị viên",
            "email": "admin@techzone.vn",
            "password": hash_password(admin_password),
            "role": "admin"
        }]

        write_json(USERS, users)
        print("Đã tạo tài khoản admin. - server.py:97", flush=True)


# ================== HTTP SERVER ==================

class Handler(SimpleHTTPRequestHandler):

    def send_json(self, status, obj, extra=None):
        raw = json.dumps(
            obj,
            ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)

        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )

        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))

        if extra:
            self.send_header("Set-Cookie", extra)

        self.end_headers()
        self.wfile.write(raw)

    def session_cookie(self, sid, max_age):
        secure = (
            "; Secure"
            if os.environ.get("RENDER")
            or os.environ.get("COOKIE_SECURE") == "1"
            else ""
        )

        return (
            f"tz_session={sid}; HttpOnly; "
            f"SameSite=Lax; Path=/; Max-Age={max_age}"
            f"{secure}"
        )

    def user(self):
        c = cookies.SimpleCookie()

        try:
            c.load(self.headers.get("Cookie", ""))
        except Exception:
            return None

        sid = c.get("tz_session")
        sid = sid.value if sid else ""

        with lock:
            sess = sessions.get(sid)

            if not sess or sess[1] < time.time():
                return None

            return sess[0]

    def body(self):
        n = int(self.headers.get("Content-Length", "0"))

        if n <= 0 or n > 5000000:
            raise ValueError("Dung lượng không hợp lệ")

        return json.loads(self.rfile.read(n))

    def is_admin(self):
        user = self.user()
        return bool(user and user.get("role") == "admin")

    # ================== API ==================

    def api(self):
        path = urlparse(self.path).path

        if not path.startswith("/api/"):
            return False

        try:

            # -------- KIỂM TRA ĐĂNG NHẬP --------

            if path == "/api/me" and self.command == "GET":
                self.send_json(200, {
                    "user": self.user()
                })
                return True

            # -------- ĐĂNG KÝ --------

            if path == "/api/register" and self.command == "POST":
                data = self.body()

                name = str(data.get("name", "")).strip()[:80]
                email = str(data.get("email", "")).strip().lower()
                password = str(data.get("password", ""))

                if not name or "@" not in email or len(password) < 6:
                    self.send_json(400, {
                        "error": "Thông tin đăng ký không hợp lệ"
                    })
                    return True

                with lock:
                    users = read_json(USERS)

                    if any(u["email"] == email for u in users):
                        self.send_json(409, {
                            "error": "Email đã tồn tại"
                        })
                        return True

                    users.append({
                        "id": secrets.token_hex(8),
                        "name": name,
                        "email": email,
                        "password": hash_password(password),
                        "role": "customer"
                    })

                    write_json(USERS, users)

                self.send_json(200, {"ok": True})
                return True

            # -------- ĐĂNG NHẬP --------

            if path == "/api/login" and self.command == "POST":
                data = self.body()

                email = str(data.get("email", "")).strip().lower()
                password = str(data.get("password", ""))

                users = read_json(USERS)

                found = next(
                    (
                        u for u in users
                        if u["email"] == email
                        and valid(password, u["password"])
                    ),
                    None
                )

                if not found:
                    self.send_json(401, {
                        "error": "Email hoặc mật khẩu không đúng"
                    })
                    return True

                user = {
                    k: found[k]
                    for k in ("id", "name", "email", "role")
                }

                sid = secrets.token_urlsafe(32)

                with lock:
                    sessions[sid] = (
                        user,
                        time.time() + 86400
                    )

                self.send_json(
                    200,
                    {"user": user},
                    self.session_cookie(sid, 86400)
                )
                return True

            # -------- ĐĂNG XUẤT --------

            if path == "/api/logout" and self.command == "POST":
                c = cookies.SimpleCookie()

                try:
                    c.load(self.headers.get("Cookie", ""))
                except Exception:
                    pass

                sid = c.get("tz_session")

                with lock:
                    if sid:
                        sessions.pop(sid.value, None)

                self.send_json(
                    200,
                    {"ok": True},
                    self.session_cookie("", 0)
                )
                return True

            # -------- LẤY DỮ LIỆU WEBSITE --------

            if path == "/api/db" and self.command == "GET":
                data = read_json(DB)

                if not self.is_admin():
                    data["orders"] = []

                self.send_json(200, data)
                return True

            # -------- ADMIN SỬA DỮ LIỆU --------

            if path == "/api/db" and self.command == "POST":

                if not self.is_admin():
                    self.send_json(403, {
                        "error": "Chỉ admin được sửa dữ liệu"
                    })
                    return True

                obj = self.body()

                required = (
                    "products",
                    "categories",
                    "posts",
                    "orders"
                )

                if (
                    not isinstance(obj, dict)
                    or not all(
                        isinstance(obj.get(k), list)
                        for k in required
                    )
                    or not isinstance(
                        obj.get("settings"), dict
                    )
                ):
                    raise ValueError("Dữ liệu không hợp lệ")

                write_json(DB, obj)

                self.send_json(200, {"ok": True})
                return True

            # -------- ĐẶT HÀNG --------

            if path == "/api/orders" and self.command == "POST":
                user = self.user()

                if not user:
                    self.send_json(401, {
                        "error": "Vui lòng đăng nhập"
                    })
                    return True

                order = self.body()
                items = order.get("items", [])

                if (
                    not isinstance(items, list)
                    or not items
                    or len(items) > 100
                ):
                    raise ValueError("Giỏ hàng không hợp lệ")

                with lock:
                    db = read_json(DB)

                    total = 0
                    newitems = []

                    for item in items:
                        product = next(
                            (
                                p for p in db["products"]
                                if p["id"] == item.get("id")
                            ),
                            None
                        )

                        qty = item.get("qty")

                        if (
                            not product
                            or type(qty) != int
                            or qty < 1
                            or product["stock"] < qty
                        ):
                            raise ValueError(
                                "Sản phẩm hết hàng hoặc số lượng không hợp lệ"
                            )

                        total += product["price"] * qty

                        newitems.append({
                            "id": product["id"],
                            "qty": qty,
                            "price": product["price"]
                        })

                    customer_data = order.get("customer", {})

                    if not isinstance(customer_data, dict):
                        raise ValueError("Thông tin giao hàng không hợp lệ")

                    customer = {
                        k: str(customer_data.get(k, "")).strip()[:250]
                        for k in ("name", "phone", "address")
                    }

                    if not all(customer.values()):
                        raise ValueError("Thiếu thông tin giao hàng")

                    for item in newitems:
                        p = next(
                            p for p in db["products"]
                            if p["id"] == item["id"]
                        )

                        p["stock"] -= item["qty"]
                        p["sold"] = p.get("sold", 0) + item["qty"]

                    result = {
                        "id": "DH" + str(int(time.time() * 1000)),
                        "date": time.strftime(
                            "%Y-%m-%dT%H:%M:%SZ",
                            time.gmtime()
                        ),
                        "userId": user["id"],
                        "customer": customer,
                        "items": newitems,
                        "total": total,
                        "status": "Mới đặt"
                    }

                    db["orders"].append(result)
                    write_json(DB, db)

                self.send_json(200, {"order": result})
                return True

            # -------- DANH SÁCH KHÁCH HÀNG --------

            if path == "/api/customers" and self.command == "GET":

                if not self.is_admin():
                    self.send_json(403, {
                        "error": "Không có quyền"
                    })
                    return True

                users = read_json(USERS)

                customers = [
                    {
                        k: u[k]
                        for k in ("id", "name", "email", "role")
                    }
                    for u in users
                ]

                self.send_json(200, {
                    "customers": customers
                })
                return True

            # -------- ĐỔI MẬT KHẨU --------

            if path == "/api/change-password" and self.command == "POST":
                user = self.user()

                if not user:
                    self.send_json(401, {
                        "error": "Cần đăng nhập"
                    })
                    return True

                data = self.body()
                old = str(data.get("oldPassword", ""))
                new = str(data.get("newPassword", ""))

                if len(new) < 8:
                    self.send_json(400, {
                        "error": "Mật khẩu mới cần ít nhất 8 ký tự"
                    })
                    return True

                with lock:
                    users = read_json(USERS)

                    found = next(
                        (
                            u for u in users
                            if u["id"] == user["id"]
                        ),
                        None
                    )

                    if not found or not valid(
                        old, found["password"]
                    ):
                        self.send_json(400, {
                            "error": "Mật khẩu cũ không đúng"
                        })
                        return True

                    found["password"] = hash_password(new)
                    write_json(USERS, users)

                self.send_json(200, {"ok": True})
                return True

            # -------- ĐƠN HÀNG CỦA TÔI --------

            if path == "/api/my-orders" and self.command == "GET":
                user = self.user()

                if not user:
                    self.send_json(401, {
                        "error": "Cần đăng nhập"
                    })
                    return True

                orders = read_json(DB)["orders"]

                my_orders = [
                    x for x in orders
                    if x.get("userId") == user["id"]
                ]

                self.send_json(200, {
                    "orders": my_orders
                })
                return True

            self.send_json(404, {
                "error": "API không tồn tại"
            })
            return True

        except (ValueError, KeyError, TypeError) as e:
            self.send_json(400, {"error": str(e)})
            return True

        except Exception:
            self.send_json(500, {
                "error": "Lỗi xử lý máy chủ"
            })
            return True

    # ================== GET ==================

    def do_GET(self):
        path = urlparse(self.path).path

        # Chặn truy cập file dữ liệu nhạy cảm
        name = Path(path).name.lower()

        if (
            name in {
                "users.json",
                "db.json",
                "db.tmp",
                "users.json.tmp",
                ".env",
                ".gitignore"
            }
            or name.endswith((".py", ".pyc", ".sqlite", ".db"))
            or "/.git/" in path
            or path.startswith("/.git")
        ):
            self.send_error(403)
            return

        if path == "/admin.html" and not self.is_admin():
            self.send_response(302)
            self.send_header("Location", "/login.html")
            self.end_headers()
            return

        if not self.api():
            super().do_GET()

    # ================== POST ==================

    def do_POST(self):
        if not self.api():
            self.send_error(404)

    # ================== HEADERS ==================

    def end_headers(self):
        self.send_header(
            "X-Content-Type-Options",
            "nosniff"
        )
        super().end_headers()


# ================== KHỞI ĐỘNG ==================

if __name__ == "__main__":
    init_data()

    server = ThreadingHTTPServer(
        (HOST, PORT),
        Handler
    )

    print(
        f"TECHZONE đang chạy tại http://{HOST}:{PORT}",
        flush=True
    )

    server.serve_forever()
