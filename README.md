# Muscle Activity Analyzer

ระบบตรวจวัดและวิเคราะห์การทำงานของกล้ามเนื้อและการตอบสนองทางสรีรวิทยาแบบครบวงจร (Multi-modal Physiological & Biomechanical Monitoring System)

## 📌 สถาปัตยกรรมและการไหลของข้อมูล
`ESP32 (C++) -> Flask REST API -> MongoDB`  
`MongoDB -> Flask REST API -> Svelte Frontend (Polling 200-500ms)`

## 📖 เอกสารข้อกำหนดระบบ (Specification)
ดูรายละเอียดทั้งหมดของสถาปัตยกรรม, ผังวงจรฮาร์ดแวร์, โครงสร้างโฟลเดอร์, API Spec และ Schema ได้ที่:
👉 **[SYSTEM_SPEC.md](SYSTEM_SPEC.md)**

## 📦 การติดตั้ง Dependencies และสภาพแวดล้อม (Setup Guide)
คู่มือการติดตั้งโปรแกรม, Extension, การตั้งค่าพอร์ต USB บน Ubuntu และไลบรารีทั้งหมด:
👉 **[DEPENDENCIES.md](DEPENDENCIES.md)**
