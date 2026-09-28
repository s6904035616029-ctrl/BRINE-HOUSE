# 🍣 BRINE-HOUSE - ระบบสั่งอาหาร

โปรเจกต์ Next.js (App Router, **JavaScript ไม่ใช่ TypeScript**) เชื่อมต่อ Supabase และ deploy บน Vercel

## 🗄️ Database Schema Reference (Supabase)
ตารางเหล่านี้มีอยู่แล้วในฐานข้อมูล (ไม่ต้องสร้างใหม่) ใช้อ้างอิงตลอดทั้งโปรเจกต์:

1. **`sessions`**: `id`, `table_number`, `adult_count`, `child_count`, `status`, `created_at`
2. **`menu_categories`**: `id`, `name`, `sort_order`
3. **`menu_items`**: `id`, `category_id`, `name`
4. **`orders`**: `id`, `session_id`, `table_number`, `items` (jsonb), `status`, `created_at`

## ⚠️ Important Note for Next.js App Router
โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ค่า `params` ใน Dynamic Route (เช่น `app/order/[sessionId]/page.js`)
เป็น **Promise** ต้อง unwrap ด้วย `use()` จาก React เสมอ:

```javascript
'use client';
import { use } from 'react';

export default function OrderPage({ params }) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;
  // ...
}
```

(ใน Server Component ให้ใช้ `const { sessionId } = await params;` แทน)

## 🔐 Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

บน Vercel ให้ตั้งค่าที่ Project Settings → Environment Variables (ไม่ commit `.env.local`)

## 🚀 How to Run Locally
1. `npm install`
2. ใส่ค่า Supabase ใน `.env.local`
3. `npm run dev`

## 🗺️ Routes
- `/` หน้าแรก (ทดสอบ deploy)
- `/generate-qr` สร้าง QR Code (พนักงาน) — ยังไม่ได้สร้าง
- `/kitchen` หน้าจอห้องครัว — ยังไม่ได้สร้าง
