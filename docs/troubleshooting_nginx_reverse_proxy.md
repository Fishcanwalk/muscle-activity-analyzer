# 📑 บันทึกการวิเคราะห์และแก้ไขปัญหา (Technical Incident Report)
## ปัญหา Nginx Reverse Proxy Routing Conflict ระหว่าง Frontend (SvelteKit) และ Backend API (FastAPI) บน Cloud Server

---

### ข้อมูลเบื้องต้น (Incident Overview)
* **ระบบ:** Cyberpump: Muscle Activity Analyzer
* **สภาพแวดล้อม (Environment):** 
  * Cloud Server (Ubuntu 22.04 LTS) บนระบบคลาวด์ภาครัฐ (GCC/GDCC)
  * สถาปัตยกรรม Monorepo รันด้วย Docker & Docker Compose
  * Web Server / Reverse Proxy: Nginx พร้อมใบรับรองความปลอดภัย HTTPS (Let's Encrypt SSL)
* **บริการภายใน (Services):**
  * **Frontend:** SvelteKit Node.js SSR (พอร์ต 3000)
  * **Backend:** FastAPI Python (พอร์ต 9000)
  * **Database:** MongoDB 7 (พอร์ต 27017)
* **โดเมนที่เกิดปัญหา:** `https://cyberpump.online`

---

### 1. อาการของปัญหา (Symptom)
1. ผู้ใช้สามารถเข้าใช้งานหน้าเว็บไซต์ `https://cyberpump.online` ได้ตามปกติ
2. หน้า Dashboard และระบบล็อกอิน (`/login`) สามารถส่งคำขอและยืนยันตัวตนกับฐานข้อมูลได้ตามปกติ
3. เมื่อเปิดหน้า Swagger UI ของ FastAPI ที่ `https://cyberpump.online/docs` สามารถเปิดดูรายการ API ได้
4. **แต่เมื่อกดปุ่ม "Execute" เพื่อทดสอบ API** (เช่น `GET /health` หรือ API ใต้ `/v1/`) หรือยิงคำขอผ่าน curl:
   ```bash
   curl -X GET 'https://cyberpump.online/health'
   ```
   **กลับได้รับผลลัพธ์เป็น HTTP 404 Not Found** และเนื้อหาที่ตอบกลับมาเป็นหน้า HTML ของ Frontend (SvelteKit):
   ```http
   HTTP/2 404 
   server: nginx
   content-type: text/html
   x-sveltekit-page: true

   <!doctype html>
   <html>
     ...
     <title>Cyberpump</title>
     <h1>404</h1> <p>Not Found</p>
     ...
   </html>
   ```

---

### 2. การวิเคราะห์หาสาเหตุที่แท้จริง (Root Cause Analysis - RCA)

จากการตรวจสอบ Header `x-sveltekit-page: true` และเนื้อหา HTML บ่งชี้ว่า **คำขอถูก Nginx ส่งไปยังคอนเทนเนอร์ Frontend (พอร์ต 3000) แทนที่จะเป็น Backend (พอร์ต 9000)** โดยมีสาเหตุเชิงลึก 2 ประเด็นซ้อนกัน:

#### สาเหตุที่ 1: ความแตกต่างระหว่าง Server-Side Proxy กับ Client-Side Browser Request
* **ทำไม Dashboard & Login ถึงทำงานได้?**
  * บนหน้าเว็บ Frontend ทำงานด้วยเทคโนโลยี SvelteKit Server-Side Rendering (SSR)
  * เมื่อผู้ใช้กดล็อกอิน ฝั่งเซิร์ฟเวอร์ของ SvelteKit จะส่งคำขอตรงไปยัง Backend ผ่านเครือข่ายภายในของ Docker (`http://backend:9000`) ทาง Internal DNS โดยตรง ไม่ได้วิ่งออกไปผ่าน Nginx ภายนอก จึงทำงานได้ปกติ
* **ทำไม Swagger UI ถึงไม่ทำงาน?**
  * หน้า Swagger UI (`/docs`) ทำงานเป็น Single Page Application (SPA) บนเบราว์เซอร์ของผู้ใช้
  * เมื่อกดปุ่ม Execute บนหน้าเว็บ ตัวเบราว์เซอร์ของผู้ใช้จะเป็นผู้ยิง HTTP Request ตรงไปยัง `https://cyberpump.online/health` ผ่าน Nginx Reverse Proxy โดยตรง

#### สาเหตุที่ 2: การกำหนด Routing Rules ใน Nginx Configuration ไม่ครอบคลุม
เมื่อตรวจสอบไฟล์คอนฟิกของ Nginx ก่อนการแก้ไข พบว่ามีเพียงคำสั่ง:
```nginx
# มีเฉพาะ path ของหน้าเอกสาร
location /docs {
    proxy_pass http://127.0.0.1:9000/docs;
}
location /openapi.json {
    proxy_pass http://127.0.0.1:9000/openapi.json;
}

# คำขออื่นๆ ทั้งหมด ตกมาที่บล็อกนี้
location / {
    proxy_pass http://127.0.0.1:3000; # ส่งเข้า Frontend SvelteKit
}
```
เมื่อเบราว์เซอร์ยิงคำขอไปที่ `/health` หรือ `/v1/...`:
1. Nginx ตรวจสอบว่าไม่ตรงกับ `/docs` และ `/openapi.json`
2. จึงส่งคำขอไปยัง `location /` (พอร์ต 3000 - SvelteKit)
3. เนื่องจาก SvelteKit ไม่มี Route `/health` อยู่ในระบบ จึงส่งหน้า 404 HTML ของ SvelteKit กลับมา

#### สาเหตุที่ 3: ความสับสนเรื่อง Symbolic Link ใน Nginx ของ Ubuntu
* ในตอนแรก มีการพยายามแก้ไขไฟล์ที่ `/etc/nginx/sites-available/cyberpump` แต่ไม่เกิดผล
* **สาเหตุ:** ใน Ubuntu โฟลเดอร์ที่ Nginx นำไปใช้งานจริงคือ `/etc/nginx/sites-enabled/` โดยเมื่อตรวจสอบพบว่ามีไฟล์ทางลัดชื่อ `cyberpump` แต่ชี้ (Symlink) ไปยังไฟล์จริงชื่อ **`/etc/nginx/sites-available/default`**
* การแก้ไขจึงต้องทำที่ไฟล์ต้นทาง (`default`) คอนฟิกจึงจะมีผลจริง

---

### 3. ขั้นตอนการแก้ไขปัญหา (Resolution Steps)

#### ขั้นตอนที่ 1: ตรวจหาไฟล์คอนฟิกที่แท้จริง
ใช้คำสั่งค้นหาจุดที่มีการประกาศ `location /docs` บนเซิร์ฟเวอร์:
```bash
grep -rn "location /docs" /etc/nginx/
```
ผลลัพธ์พบว่าไฟล์คอนฟิกที่กำลังทำงานอยู่จริงคือ:
```text
/etc/nginx/sites-available/default:16:    location /docs {
```

#### ขั้นตอนที่ 2: เพิ่ม Directive สำหรับ API Endpoints
เปิดไฟล์ `/etc/nginx/sites-available/default` ขึ้นมาแก้ไข:
```bash
sudo nano /etc/nginx/sites-available/default
```

ทำการเพิ่มบล็อกสำหรับส่งคำขอ API ไปยัง FastAPI Backend (พอร์ต 9000) ให้ครอบคลุมทุก Endpoint:
```nginx
# 1. API Documentation
location /docs {
    proxy_pass http://127.0.0.1:9000/docs;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /openapi.json {
    proxy_pass http://127.0.0.1:9000/openapi.json;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

# 2. Backend Health Check Endpoint
location /health {
    proxy_pass http://127.0.0.1:9000/health;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

# 3. Backend Business APIs (Auth, Telemetry, Sessions, Calibration)
location /v1/ {
    proxy_pass http://127.0.0.1:9000/v1/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# 4. Users Endpoint
location /users/ {
    proxy_pass http://127.0.0.1:9000/users/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# 5. Frontend Web Application (SvelteKit)
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

#### ขั้นตอนที่ 3: ตรวจสอบและรีสตาร์ต Nginx
```bash
# ตรวจสอบความถูกต้องของไวยากรณ์คอนฟิก
sudo nginx -t

# รีสตาร์ต Nginx เพื่อเคลียร์ connection pool เดิม
sudo systemctl restart nginx
```

---

### 4. ผลการทดสอบหลังการแก้ไข (Verification & Validation)

1. **ทดสอบ Health Endpoint ผ่าน curl:**
   ```bash
   curl -i -X GET 'https://cyberpump.online/health'
   ```
   **ผลลัพธ์:**
   ```json
   HTTP/2 200 
   content-type: application/json
   server: nginx

   {
     "status": "ok"
   }
   ```
2. **ทดสอบผ่าน Swagger UI (`https://cyberpump.online/docs`):**
   * กดปุ่ม Execute ที่ `GET /health` ได้รับสถานะ `200 OK`
   * ทดสอบ API ในกลุ่ม `/v1/auth`, `/v1/sessions` สามารถส่งคำขอและได้รับผลลัพธ์เป็น JSON จาก FastAPI อย่างถูกต้อง
3. **ทดสอบหน้าเว็บหลัก (`https://cyberpump.online/dashboard`):**
   * หน้าเว็บยังคงเข้าถึงและทำงานร่วมกับ Backend ได้ตามปกติ ไม่พบผลกระทบข้างเคียง (No Regression)

---

### 5. บทเรียนที่ได้รับและแนวทางป้องกัน (Lessons Learned & Best Practices)

1. **การออกแบบ Reverse Proxy สำหรับระบบแบบ Fullstack Single Domain:**
   * หาก Frontend และ Backend ใช้โดเมนเดียวกัน (เช่น `example.com`) ต้องกำหนด Path Prefix สำหรับ API ให้ชัดเจน (เช่น `/api/`, `/v1/`, `/health`) และระบุใน Nginx ให้ครบถ้วนก่อนส่งที่เหลือเข้า `location /`
   * หรือพิจารณาแยก Subdomain อย่างชัดเจน เช่น `app.example.com` (Frontend) และ `api.example.com` (Backend) เพื่อลดความซับซ้อนของ Routing Rules
2. **การแยกแยะต้นทางของ Request (Client vs Server-side):**
   * การที่ฟังก์ชันบนหน้าเว็บทำงานได้ ไม่ได้แปลว่า API ภายนอกจะเข้าถึงได้โดยตรงเสมอไป เพราะมีกลไก Server-Side Proxy ภายในคั่นอยู่ การทดสอบระบบต้องครอบคลุมทั้งการคลิกบนหน้าเว็บและการยิง API ดิบ
3. **การตรวจสอบ Symbolic Link บน Linux Nginx:**
   * ก่อนทำการแก้ไขคอนฟิก Nginx ควรตรวจสอบเสมอว่าไฟล์ใน `/etc/nginx/sites-enabled/` ชี้ไปที่ไฟล์ใดจริงใน `sites-available/` ด้วยคำสั่ง `ls -l /etc/nginx/sites-enabled/` เพื่อป้องกันการแก้ไขผิดไฟล์
