# Sveltekitten Template

เทมเพลต SvelteKit สำหรับงานโปรดักชันที่จัดชุดเครื่องมือมาให้พร้อม: routing, auth, API proxy, OpenAPI client, i18n, UI component kit และ developer experience ครบถ้วน สามารถโคลนแล้วเริ่มสร้างฟีเจอร์ได้ทันที

## สารบัญ
- TL;DR
- Prerequisites
- Getting Started
- Project Highlights
- Architecture Overview
- Auth & API Proxy Flow
- Working with APIs
- Forms & Validation
- i18n (Paraglide.js)
- UI System
- Logging
- Environment Variables
- npm/bun Scripts
- Deployment
- Troubleshooting
- Appendix: Directory Snapshot

## TL;DR
1. โคลน repo แล้วติดตั้งด้วย `bun install`
2. สร้าง `.env` ใส่ `PUBLIC_APP_TITLE` และ `BACKEND_API_URL`
3. รัน `bun run dev`
4. เพิ่ม route/custom logic ได้เลย (auth guard และ proxy พร้อมใช้งาน)

## Prerequisites
- Node.js 20+ (รองรับผ่าน bun, pnpm, หรือ npm)
- fish shell (ตัวอย่างคำสั่งใช้ fish แต่แทนที่คำสั่งด้วย package manager ที่คุณชอบได้)
- Backend ที่เปิด endpoint `/openapi.json`, `/v1/auth/login`, และ `/v1/auth/refresh` หากต้องการใช้ proxy + OpenAPI client เต็มรูปแบบ

## Getting Started

### 1. Install dependencies
```fish
bun install
```

### 2. Configure environment
สร้างไฟล์ `.env` (หรือกำหนดค่าในระบบ) อย่างน้อยดังนี้
```ini
PUBLIC_APP_TITLE=Sveltekitten
BACKEND_API_URL=http://localhost:8000
```

### 3. Run locally
```fish
bun run dev
```
หรือ build + preview โปรดักชัน
```fish
bun run build
bun run preview
```

### 4. Quality checks
```fish
bun run check
bun run lint
bun run format
```

### 5. Generate OpenAPI types (optional)
```fish
bun run openapi:fastapi
```
สคริปต์นี้ดึง schema จาก `${BACKEND_API_URL}/openapi.json`

## Project Highlights
- **SvelteKit v2 + Svelte 5 + Vite 7** ด้วย adapter-node
- **Tailwind CSS v4** ผ่านปลั๊กอิน `@tailwindcss/vite`, ไม่มี config แยก เสริมด้วย component kit ใน `src/lib/components/ui`
- **TanStack Query (Svelte)** พร้อม provider ตัวอย่างใช้งานและกลไก caching
- **Auth + API proxy** รองรับ refresh token อัตโนมัติ และเชื่อมกับ FastAPI ได้ทันที
- **OpenAPI integration** ใช้ `openapi-fetch` และ type generation จาก `openapi-typescript`
- **Superforms + Zod** สำหรับฟอร์มแบบ type-safe (พร้อมตัวอย่างหน้า Login)
- **Paraglide.js i18n** โครงสร้างพร้อมทำงานหลายภาษา
- **Logger & utilities** เช่น pino, cookie helpers, auth helpers

## Architecture Overview
- `src/app.html`, `src/app.css` จัดโครงสร้างและ global styles
- `src/hooks.server.ts` รวม middleware ด้วย `sequence` (auth guard, paraglide, fastapi client)
- `src/lib/` เก็บ API clients, UI components, hooks, schemas, utilities
- `src/routes/` ใช้ file-based routing ของ SvelteKit (มีกลุ่ม `(auth)` สำหรับหน้าที่ต้องล็อกอิน)
- `static/` สำหรับไฟล์สาธารณะ เช่น `robots.txt`

## Auth & API Proxy Flow
1. **Auth guard** ตรวจทุก request ที่วิ่งเข้าโฟลเดอร์ `(auth)` หากไม่มีหรือหมดอายุ refresh token จะ redirect ไป `/login`
2. **API proxy** (`src/routes/api/proxy/[...slug]/+server.ts`) รับทุกคำขอใต้ `/api/proxy/**`
	 - แนบ `Authorization: Bearer <access_token>` จากคุกกี้ให้อัตโนมัติ
	 - หากได้ 401 และมี refresh token จะยิง `/v1/auth/refresh` เพื่อขอ access token ใหม่แล้วรีทรีไลน์เดิม
	 - หาก refresh ล้มเหลวจะล้างคุกกี้และส่งสถานะเดิมจาก backend กลับไป
3. **Login flow** (`src/routes/login`) ใช้ Superforms + Zod ทำงานฝั่งเซิร์ฟเวอร์ เซ็ตคุกกี้ `access_token`, `refresh_token` และ redirect เข้าหน้า `(auth)`

## Working with APIs

### OpenAPI client (preferred)
- สร้างไว้ใน `src/lib/api/fastapi-client.ts`
- เข้าถึงผ่าน `event.locals.fastapiClient` ใน load/action ของ server
```ts
const response = await locals.fastapiClient.POST('/v1/auth/login', {
	body: { email, password }
});
```

### Generic REST client
- ใช้ `src/lib/api/api.ts` สร้าง client กำหนด `baseUrl` เอง
- มีตัวอย่าง `pokemon-api.ts` เรียก PokeAPI สำหรับ demo

## Forms & Validation
- ใช้ `superforms` + `zod`
- Schema ตัวอย่างอยู่ใน `src/lib/schemas/auth.schema.ts`
- หน้า login แสดงวิธีผูก form, แสดง error, และเรียก action ฝั่งเซิร์ฟเวอร์

## i18n (Paraglide.js)
- ไฟล์แปลอยู่ใน `messages/`
- การตั้งค่าโปรเจกต์อยู่ใน `project.inlang/`
- ปลั๊กอิน `paraglideVitePlugin` จะ generate โค้ดลง `src/lib/paraglide/`
- เพิ่มภาษาใหม่โดยสร้างไฟล์ JSON เพิ่มใน `messages/` แล้วรัน dev/build อีกรอบ

## UI System
- ใช้ Tailwind v4 (ผ่านปลั๊กอิน Vite) สำหรับ utility-first styling
- คอมโพเนนต์ UI แยกหมวดใน `src/lib/components/ui/` เช่น button, card, dropdown menu, form controls
- Toaster (`sonner`) ถูกเพิ่มไว้ใน `src/routes/+layout.svelte`

## Logging
- ไฟล์ logger หลักอยู่ที่ `src/lib/logger.ts` ใช้ `pino` ตั้งค่าแยก dev/prod อัตโนมัติ
- นำเข้าใช้งานได้ทั้งฝั่ง server และ client (เบราว์เซอร์จะดรอป transport pretty ในโปรดักชัน)
- ตัวอย่างการเรียกใช้งาน

```ts
import { logger } from '$lib/logger';

logger.info({ userId }, 'Fetching profile');

try {
	// ...do work
} catch (error) {
	logger.error(error, 'Failed to fetch profile');
}

// ฟังก์ชันเสริมสำหรับดีบักใน dev mode เท่านั้น
logger.inspect(data);
logger.dir({ event });
logger.table(rows);
```

- ฟังก์ชัน `inspect`, `dir`, `table` จะ log เฉพาะเวลา `dev === true` เพื่อไม่ให้รบกวนโปรดักชัน
- หากต้องปรับระดับ log เพิ่ม เติม option ตาม `pino` API ภายใน `createLogger()`

## Environment Variables
- `PUBLIC_APP_TITLE` ชื่อแอปฝั่ง client (โหลดผ่าน `$env/dynamic/public`)
- `BACKEND_API_URL` URL ของ backend สำหรับ proxy และ OpenAPI (`$env/dynamic/private`)
- ตั้งค่าแบบชั่วคราวใน fish shell ได้ด้วย
```fish
set -x PUBLIC_APP_TITLE "Sveltekitten"
set -x BACKEND_API_URL "http://localhost:8000"
```

## npm/bun Scripts
- `bun run dev` เริ่มโหมดพัฒนา
- `bun run build` สร้างโปรดักชัน
- `bun run preview` เปิดเซิร์ฟเวอร์โปรดักชันแบบโลคอล
- `bun run check` ตรวจ type + lint ของ Svelte
- `bun run lint` รัน prettier --check และ eslint
- `bun run format` ใช้ prettier --write
- `bun run openapi` และ `bun run openapi:fastapi` สร้าง type จาก OpenAPI schema

## Deployment
- ใช้ `@sveltejs/adapter-node` ได้ไฟล์ Node server ภายหลัง `bun run build`
- รันด้วย `bun run preview` หรือ `node build` (ตาม script ที่คุณตั้ง)
- ตั้ง environment variable ให้เหมาะกับเครื่องปลายทาง โดยเฉพาะ `BACKEND_API_URL`
- แนะนำให้ใช้ process manager (PM2, Docker, systemd) ตามบริบท

## Troubleshooting
- **401 ซ้ำๆ จาก proxy**: ตรวจสอบ refresh token หมดอายุหรือ endpoint `/v1/auth/refresh` ทำงานหรือไม่
- **CORS**: ให้เรียก backend ผ่าน proxy `/api/proxy/**` เพื่อลดปัญหา CORS ฝั่งเบราว์เซอร์
- **OpenAPI type ไม่อัปเดต**: รัน `bun run openapi:fastapi` หลัง backend เปลี่ยน schema
- **Cookie naming**: ใช้ชื่อมาตรฐาน `access_token` และ `refresh_token` ให้สอดคล้องกับ helper ใน `src/lib/utils`

## Appendix: Directory Snapshot (short)
```
src/
	app.css
	app.html
	hooks.server.ts
	lib/
		api/
			api.ts
			fastapi-client.ts
			paths/fastapi.d.ts
		components/ui/
			button/
			card/
			dropdown-menu/
			form/
		hooks/
			auth-guard.ts
			fastapi.hook.ts
		schemas/
			auth.schema.ts
		utils/
			api-core.ts
			auth.ts
			cookies.ts
	routes/
		+layout.svelte
		+layout.ts
		+page.svelte
		(auth)/home/+page.svelte
		api/proxy/[...slug]/+server.ts
		login/
			+page.svelte
			+page.server.ts
			login-form.svelte
```

พร้อมใช้งานแล้ว! หากมีข้อเสนอแนะหรืออยากเพิ่มตัวอย่าง สามารถเปิด issue หรือ pull request ใน repository ได้เลย
