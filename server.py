from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from http import cookies
import json, threading, os, hashlib, hmac, secrets, time
ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
lock=threading.RLock(); sessions={}
USERS=ROOT/'users.json'; DB=ROOT/'db.json'
def hash_password(p,salt=None):
 salt=salt or secrets.token_hex(16)
 return salt+':'+hashlib.pbkdf2_hmac('sha256',p.encode(),bytes.fromhex(salt),200000).hex()
def valid(p,stored):
 try:
  salt=stored.split(':')[0];return hmac.compare_digest(hash_password(p,salt),stored)
 except Exception:return False
if not USERS.exists():
 USERS.write_text(json.dumps([{'id':'admin','name':'Quản trị viên','email':'admin@techzone.vn','password':hash_password('123456'),'role':'admin'}],ensure_ascii=False,indent=2),encoding='utf8')
class Handler(SimpleHTTPRequestHandler):
 def send_json(self,status,obj,extra=None):
  raw=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)))
  if extra:self.send_header('Set-Cookie',extra)
  self.end_headers();self.wfile.write(raw)
 def user(self):
  c=cookies.SimpleCookie()
  try:c.load(self.headers.get('Cookie',''))
  except Exception:return None
  sid=c.get('tz_session');sid=sid.value if sid else ''
  with lock:
   sess=sessions.get(sid)
   if not sess or sess[1]<time.time():return None
   return sess[0]
 def body(self):
  n=int(self.headers.get('Content-Length','0'))
  if n<0 or n>5000000:raise ValueError('Dung lượng không hợp lệ')
  return json.loads(self.rfile.read(n))
 def api(self):
  path=urlparse(self.path).path
  if not path.startswith('/api/'):return False
  try:
   if path=='/api/me' and self.command=='GET':
    self.send_json(200,{'user':self.user()});return True
   if path=='/api/register' and self.command=='POST':
    data=self.body();name=str(data.get('name','')).strip()[:80];email=str(data.get('email','')).strip().lower();password=str(data.get('password',''))
    if not name or '@' not in email or len(password)<6:return self.send_json(400,{'error':'Tên, email hoặc mật khẩu không hợp lệ'}) or True
    with lock:
     users=json.loads(USERS.read_text(encoding='utf8'))
     if any(x['email']==email for x in users):return self.send_json(409,{'error':'Email đã tồn tại'}) or True
     users.append({'id':secrets.token_hex(8),'name':name,'email':email,'password':hash_password(password),'role':'customer'})
     USERS.write_text(json.dumps(users,ensure_ascii=False,indent=2),encoding='utf8')
    self.send_json(200,{'ok':True});return True
   if path=='/api/login' and self.command=='POST':
    data=self.body();email=str(data.get('email','')).strip().lower();password=str(data.get('password',''))
    with lock:users=json.loads(USERS.read_text(encoding='utf8'))
    found=next((x for x in users if x['email']==email and valid(password,x['password'])),None)
    if not found:self.send_json(401,{'error':'Email hoặc mật khẩu không đúng'});return True
    user={k:found[k] for k in ('id','name','email','role')};sid=secrets.token_urlsafe(32)
    with lock:sessions[sid]=(user,time.time()+86400)
    self.send_json(200,{'user':user},'tz_session='+sid+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400');return True
   if path=='/api/logout' and self.command=='POST':
    c=cookies.SimpleCookie();c.load(self.headers.get('Cookie',''));sid=c.get('tz_session')
    with lock:
     if sid:sessions.pop(sid.value,None)
    self.send_json(200,{'ok':True},'tz_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return True
   if path=='/api/db' and self.command=='GET':
    with lock:data=json.loads(DB.read_text(encoding='utf8'))
    if not (self.user() or {}).get('role')=='admin':data['orders']=[]
    self.send_json(200,data);return True
   if path=='/api/db' and self.command=='POST':
    if (self.user() or {}).get('role')!='admin':self.send_json(403,{'error':'Chỉ admin được sửa dữ liệu'});return True
    obj=self.body()
    if not isinstance(obj,dict) or not all(isinstance(obj.get(k),list) for k in ('products','categories','posts','orders')) or not isinstance(obj.get('settings'),dict):raise ValueError('Dữ liệu không hợp lệ')
    with lock:
     temp=ROOT/'db.tmp';temp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8');temp.replace(DB)
    self.send_json(200,{'ok':True});return True
   if path=='/api/orders' and self.command=='POST':
    user=self.user()
    if not user:self.send_json(401,{'error':'Vui lòng đăng nhập để đặt hàng'});return True
    order=self.body();items=order.get('items',[])
    if not isinstance(items,list) or not items or len(items)>100:raise ValueError('Giỏ hàng không hợp lệ')
    with lock:
     db=json.loads(DB.read_text(encoding='utf8'));total=0;newitems=[]
     for item in items:
      product=next((p for p in db['products'] if p['id']==item.get('id')),None);qty=item.get('qty')
      if not product or type(qty)!=int or qty<1 or product['stock']<qty:raise ValueError('Sản phẩm hết hàng hoặc số lượng không hợp lệ')
      total+=product['price']*qty;newitems.append({'id':product['id'],'qty':qty,'price':product['price']})
     for item in newitems:
      p=next(p for p in db['products'] if p['id']==item['id']);p['stock']-=item['qty'];p['sold']=p.get('sold',0)+item['qty']
     customer=order.get('customer',{});customer={k:str(customer.get(k,'')).strip()[:250] for k in ('name','phone','address')}
     if not all(customer.values()):raise ValueError('Thiếu thông tin giao hàng')
     result={'id':'DH'+str(int(time.time()*1000)),'date':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'userId':user['id'],'customer':customer,'items':newitems,'total':total,'status':'Mới đặt'}
     db['orders'].append(result);temp=ROOT/'db.tmp';temp.write_text(json.dumps(db,ensure_ascii=False,indent=2),encoding='utf8');temp.replace(DB)
    self.send_json(200,{'order':result});return True
   if path=='/api/customers' and self.command=='GET':
    if (self.user() or {}).get('role')!='admin':self.send_json(403,{'error':'Không có quyền'});return True
    with lock: users=json.loads(USERS.read_text(encoding='utf8'))
    self.send_json(200,{'customers':[{k:u[k] for k in ('id','name','email','role')} for u in users]});return True
   if path=='/api/change-password' and self.command=='POST':
    user=self.user()
    if not user:self.send_json(401,{'error':'Cần đăng nhập'});return True
    data=self.body();old=str(data.get('oldPassword',''));new=str(data.get('newPassword',''))
    if len(new)<8:self.send_json(400,{'error':'Mật khẩu mới cần ít nhất 8 ký tự'});return True
    with lock:
     users=json.loads(USERS.read_text(encoding='utf8'));found=next((u for u in users if u['id']==user['id']),None)
     if not found or not valid(old,found['password']):self.send_json(400,{'error':'Mật khẩu cũ không đúng'});return True
     found['password']=hash_password(new);USERS.write_text(json.dumps(users,ensure_ascii=False,indent=2),encoding='utf8')
    self.send_json(200,{'ok':True});return True
   if path=='/api/my-orders' and self.command=='GET':
    user=self.user()
    if not user:self.send_json(401,{'error':'Cần đăng nhập'});return True
    with lock:orders=json.loads(DB.read_text(encoding='utf8'))['orders']
    self.send_json(200,{'orders':[x for x in orders if x.get('userId')==user['id']]});return True
   self.send_json(404,{'error':'API không tồn tại'});return True
  except Exception as e:self.send_json(400,{'error':str(e)});return True
 def do_GET(self):
  path=urlparse(self.path).path
  if path in ('/users.json','/db.json','/db.tmp'):self.send_error(403);return
  if path=='/admin.html' and (self.user() or {}).get('role')!='admin':self.send_response(302);self.send_header('Location','/login.html');self.end_headers();return
  if not self.api():super().do_GET()
 def do_POST(self):
  if not self.api():self.send_error(404)
 def end_headers(self):
  self.send_header('X-Content-Type-Options','nosniff');super().end_headers()
if __name__=='__main__':
 print('TECHZONE: http://127.0.0.1:3000',flush=True)
 ThreadingHTTPServer(('127.0.0.1',3000),Handler).serve_forever()
