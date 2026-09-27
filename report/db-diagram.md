# แผนภาพฐานข้อมูล (ER Diagram)

ไฟล์นี้อธิบายโครงสร้าง MongoDB จาก `backend/app/db.py` และ `backend/app/models/` เท่านั้น ใช้ประกอบหัวข้อ 5.2 เป็นหลัก

Mermaid ตั้งใจออกแบบให้ใช้พื้นหลังสีขาว เส้นสีดำ และรูปแบบเรียบง่าย เพื่อให้แคปภาพไปใส่ในรายงานได้ง่าย โดยไม่ฝังรูปภาพลงในเอกสาร Word

## ER Diagram: Collections และความสัมพันธ์

ตำแหน่งแนะนำในรายงาน: ข้อ 5.1 และ 5.2

```mermaid
%%{init: {"theme":"base", "themeVariables": {"background":"#ffffff", "primaryColor":"#ffffff", "primaryTextColor":"#000000", "primaryBorderColor":"#222222", "lineColor":"#222222", "secondaryColor":"#ffffff", "tertiaryColor":"#ffffff", "fontFamily":"Arial"}}}%%
erDiagram
    USERS ||--o| CALIBRATIONS : "มี calibration ของตนเอง"
    USERS ||--o{ TELEMETRY_SAMPLES : "สร้างข้อมูลเซนเซอร์"
    USERS ||--o{ SESSION_RESULTS : "บันทึกผลรายเซต"
    USERS ||--o{ REFRESH_TOKENS : "ใช้ยืนยันตัวตน"

    USERS {
        string id PK
        string email UK
        string name
        string password_hash
        array roles
        bool is_active
        datetime created_at
    }
    REFRESH_TOKENS {
        string id PK
        string jti UK
        string user_id FK
        bool revoked
        datetime created_at
        datetime expires_at
    }
    TELEMETRY_SAMPLES {
        string id PK
        string user_id FK
        string session_id
        object emg
        object fsr
        object mpu
        object vitals
        object device
        int timestamp
        datetime received_at "index ผู้ใช้ + TTL 90 วัน (ปรับได้)"
    }
    SESSION_RESULTS {
        string id PK
        string user_id FK
        string session_id
        int setNumber
        string exercise
        float weightKg
        float durationSeconds
        int totalReps
        int cleanReps
        int cheatedReps
        float formPurityPercent
        int effectiveReps
        float highTensionTutSeconds
        array reps "ฝัง RepResult ต่อครั้งที่ยก"
        string repSource
        float emgMvcUv
        datetime created_at
    }
    CALIBRATIONS {
        string user_id PK,FK
        float emgBaseline
        float emgMvc
        float fsrZero
        float fsrMax
        float emgRepOnPct
        float emgRepOffPct
        float emgRepPeakPct
        datetime updated_at
    }
```

## DBML สำหรับ dbdiagram.io

โครงสร้างเดียวกันในรูปแบบ DBML — คัดลอกไปวางที่ [dbdiagram.io](https://dbdiagram.io) ได้โดยตรง

```dbml
Table users {
  id string [pk]
  email string [unique]
  name string
  password_hash string
  roles string [note: 'array']
  is_active bool
  created_at datetime
}

Table refresh_tokens {
  id string [pk]
  jti string [unique]
  user_id string
  revoked bool
  created_at datetime
  expires_at datetime
}

Table telemetry_samples {
  id string [pk]
  user_id string
  session_id string
  emg object
  fsr object
  mpu object
  vitals object
  device object
  timestamp int
  received_at datetime [note: 'index ผู้ใช้ + TTL 90 วัน (ปรับได้)']
}

Table session_results {
  id string [pk]
  user_id string
  session_id string
  setNumber int
  exercise string
  weightKg float
  durationSeconds float
  totalReps int
  cleanReps int
  cheatedReps int
  formPurityPercent float
  effectiveReps int
  highTensionTutSeconds float
  reps string [note: 'array ฝัง RepResult ต่อครั้งที่ยก']
  repSource string
  emgMvcUv float
  created_at datetime
}

Table calibrations {
  user_id string [pk]
  emgBaseline float
  emgMvc float
  fsrZero float
  fsrMax float
  emgRepOnPct float
  emgRepOffPct float
  emgRepPeakPct float
  updated_at datetime
}

Ref: refresh_tokens.user_id > users.id
Ref: telemetry_samples.user_id > users.id
Ref: session_results.user_id > users.id
Ref: calibrations.user_id - users.id
```

## หมายเหตุสำหรับการแคปภาพ

1. เปิดไฟล์นี้ใน editor ที่รองรับ Mermaid หรือ Mermaid Live Editor
2. ตรวจให้พื้นหลังเป็นสีขาวและอ่านข้อความได้ครบก่อน export
3. Export เป็น PNG หรือ SVG แล้วนำไปวางในหัวข้อ 5.1/5.2 ของรายงาน

## ขอบเขตที่ไม่ได้รวมในแผนภาพนี้

`backend/app/db.py` ยังสร้าง index ให้ collection `grip_tests` (ผลการทดสอบแรงกำก่อนเริ่มฝึก) และ `subscriptions` (แพ็กเกจสมาชิก/การชำระเงินผ่าน Omise) ซึ่งเป็นฟีเจอร์ที่ไม่ได้อยู่ในหัวข้อ 5.2 ของรายงานฉบับนี้ หากต้องการให้ครอบคลุมทั้งระบบ ควรเพิ่มทั้งสอง collection นี้ในตารางและแผนภาพด้วย
