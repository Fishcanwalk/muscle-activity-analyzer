# บทที่ 6 โครงสร้างและการทำงานของโค้ด

## 6.1 แผนผัง codebase และหน้าที่ของเฟิร์มแวร์ เว็บ และ API

```text
test-sensor/arduino/
├── uno_emg_fsr_link/              # Uno: ADC + Timer1 + UART
└── esp32_workout_firmware/        # ESP32: FreeRTOS + I2C + Wi-Fi + HTTP

frontend/src/
├── routes/api/                    # endpoint รับ telemetry, SSE, recording, calibration
├── lib/server/telemetryStore.ts   # สถานะสดและการส่งต่อ backend
└── lib/workout/                   # state ของ workout, telemetry, camera, recording

backend/app/
├── routers/                       # auth, telemetry, sessions, calibration, users
├── models/                        # schema ข้อมูล
├── db.py                          # MongoDB และ index
└── security.py                    # JWT และ password
```

ผังนี้เป็นสรุปหน้าที่ของส่วนประกอบหลัก ไม่ได้รวมไฟล์ที่อยู่นอกขอบเขตแหล่งข้อมูลของรายงาน

telemetry ที่ส่งต่อกันในผังนี้มีโครงสร้างหลักเป็นกลุ่ม `emg`, `fsr`, `mpu`, `vitals`, `device`, `timestamp` และอาจมี `buttons` โดย backend schema อนุญาตฟิลด์เพิ่มเติมเพื่อให้รองรับข้อมูลจากอุปกรณ์ได้ยืดหยุ่น

## 6.2 Arduino Uno: Timer1, ADC Interrupt, Watchdog และ UART

### 6.2.1 ภาพรวมการทำงาน

**การจับเวลารอบ sampling:** ใช้ Timer1 ในโหมด CTC โดยตั้ง prescaler 64 และค่า OCR1A ให้เกิด interrupt ที่ความถี่ 100 Hz หรือทุก 10 ms ทุกครั้งที่เกิด `TIMER1_COMPA_vect` ระบบจะตั้งบิต 0 ของตัวแปร `eventFlags` เพื่อให้ loop เริ่มรอบอ่านข้อมูลใหม่ ทำให้รอบ sampling สม่ำเสมอ

**การอ่านค่า ADC ด้วย interrupt:** ในแต่ละรอบ Uno อ่านค่า 2 ช่อง คือ EMG ที่ขา A0 และ FSR ที่ขา A1 โดยสั่งให้ ADC เริ่มแปลงค่าแล้วไม่ต้องรอ เมื่อแปลงค่าเสร็จ ADC จะเรียก interrupt ให้เก็บค่าไว้ แล้วเริ่มอ่านช่องถัดไปต่อทันที เมื่ออ่านครบทั้ง 2 ช่อง โปรแกรมหลักจะนำค่าไปใช้ ส่วนค่า FSR ต้องกลับด้านก่อน เพราะเซนเซอร์ให้ค่าสูงตอนไม่มีแรงกด

**การประหยัดพลังงาน:** ช่วงที่รอ Timer1 หรือรอ ADC แปลงค่า CPU ไม่มีงานต้องทำ ระบบจึงให้ CPU พักด้วย `SLEEP_MODE_IDLE` และเมื่อเกิด interrupt จาก Timer1 หรือ ADC CPU จะตื่นขึ้นมาทำงานต่อ

**การป้องกันระบบค้าง:** ใช้ Watchdog Timer ของ Uno โดยตั้ง timeout ไว้ 2 วินาทีผ่านฟังก์ชันที่เขียนขึ้นเองระดับ register (`WDT__enable()`) ซึ่งให้ผลเหมือนฟังก์ชันสำเร็จรูปของไลบรารี AVR และเรียก `wdt_reset()` ทุกครั้งที่อ่านข้อมูลครบหนึ่งรอบ หากรอบการอ่านค้างนานเกิน 2 วินาที ระบบจะรีสตาร์ทบอร์ดโดยอัตโนมัติ

**การส่งข้อมูลไปยัง ESP32:** แปลงค่า ADC 10-bit (0-1023) เป็นช่วง 0-4095 ด้วย `map()` ให้ตรงกับช่วงค่าที่ ESP32 และ backend ใช้ แล้วส่งผ่าน `Serial` ที่ขา 0/1 ด้วยความเร็ว 9600 baud ในรูปแบบ `emg,fsr` บรรทัดละหนึ่งรอบ

### 6.2.2 โค้ดและการทำงานของโค้ด

โค้ดในหัวข้อนี้ยกมาจากไฟล์ `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino` โดยตรง บรรทัดที่ละไว้แสดงด้วย `// ...`

ATmega328P บน Arduino Uno มี RAM เพียง 2 KB ไม่พอสำหรับรัน FreeRTOS แบบฝั่ง ESP32 เฟิร์มแวร์ของ Uno จึงใช้กลไกของชิป AVR โดยตรงแทน แต่ยังคงใช้แนวคิดเดียวกัน คือใช้ hardware timer กำหนดจังหวะ ใช้ interrupt แทนการวนรอ ใช้ watchdog ป้องกันระบบค้าง และให้ CPU พักระหว่างรอ

#### 6.2.2.1 การเริ่มต้นระบบใน `setup()`

เมื่อเปิดเครื่อง `setup()` จะเตรียมส่วนต่าง ๆ ตามลำดับ โดยจัดการ watchdog ก่อน แล้วเปิดช่องทางส่งข้อมูล ตั้งค่า timer และ ADC จากนั้นเลือกโหมดพัก และเปิด watchdog เป็นขั้นสุดท้าย

```cpp
void setup() {
  MCUSR = 0;
  wdt_disable();

  Serial.begin(9600);
  setupSampleTimer();
  ADMUX = (1 << REFS0) | ADC_CHANNEL_EMG;
  ADCSRA = (1 << ADEN) | (1 << ADIE) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0);
  DIDR0 |= (1 << ADC0D) | (1 << ADC1D);

  set_sleep_mode(SLEEP_MODE_IDLE);

  WDT__enable(wdt_timeout_2sec);
}
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 68–81](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L68-L81)

ขั้นแรกระบบปิด watchdog ไว้ก่อนชั่วคราว เหตุผลอธิบายไว้ในหัวข้อ 6.2.2.5 ต่อมาจึงเปิด `Serial` ที่ความเร็ว 9600 baud เพื่อใช้ส่งข้อมูลไปยัง ESP32 แล้วตั้งค่า Timer1 (หัวข้อ 6.2.2.2) จากนั้นตั้งค่า ADC ต่อทันทีในบรรทัดถัดมา (หัวข้อ 6.2.2.3) โดยไม่ได้แยกเป็นฟังก์ชันต่างหาก ไฟล์นี้ไม่ได้รวม `board_config.h` เหมือนก่อนหน้านี้อีกต่อไป จึงไม่มีการเรียก `setupBoardAdc()` และประกาศ `ADC_MAX_VAL` (10-bit, ค่า 1023) ไว้เองในไฟล์แทนการดึงจากเฮดเดอร์ที่ใช้ร่วมกับบอร์ดอื่น

หลังจากนั้นระบบเลือกโหมดพักของ CPU ไว้ล่วงหน้า (หัวข้อ 6.2.2.4) และเปิด watchdog เป็นขั้นสุดท้าย เพราะเมื่อเปิดแล้วระบบต้องเริ่มรีเซ็ต watchdog เป็นระยะ ถ้าเปิดไว้ตั้งแต่ต้น ช่วงที่ยังตั้งค่าไม่เสร็จอาจทำให้บอร์ดถูกรีสตาร์ทโดยไม่จำเป็น

#### 6.2.2.2 การจับเวลารอบ sampling ด้วย Timer1

Uno ต้องอ่านค่าเซนเซอร์ให้ตรงทุก 10 ms (100 Hz) เท่ากับฝั่ง ESP32 ถ้าใช้ `delay()` หรือคอยเทียบเวลาจาก `millis()` CPU จะต้องตื่นอยู่ตลอดและรอบจะคลาดตามเวลาที่ใช้ทำงานในแต่ละรอบ ระบบจึงใช้ Timer1 ซึ่งเป็นวงจรนับเวลาในชิป และนับต่อไปได้เองแม้ CPU จะพักอยู่

```cpp
#define TIMER1_OCR1A_VALUE ((F_CPU / 64UL / SAMPLE_RATE_HZ) - 1)

void setupSampleTimer() {
  cli();
  TCCR1A = 0;
  TCCR1B = 0;
  TCNT1 = 0;
  OCR1A = TIMER1_OCR1A_VALUE;
  TCCR1B |= (1 << WGM12);
  TCCR1B |= (1 << CS11) | (1 << CS10);
  TIMSK1 |= (1 << OCIE1A);
  sei();
}

ISR(TIMER1_COMPA_vect) {
  eventFlags |= (1 << 0);
}
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 18–34](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L18-L34)

ชิปทำงานที่ 16 MHz ซึ่งเร็วเกินกว่าจะนำมานับตรง ๆ จึงหารความถี่ด้วย 64 (prescaler) ก่อน timer จึงนับขึ้นหนึ่งครั้งทุก 4 µs เมื่อนับครบ 2,500 ครั้งก็จะได้ 10 ms พอดี ค่าที่ตั้งไว้คือ 2,499 เพราะ timer เริ่มนับจาก 0

timer ทำงานในโหมด CTC เมื่อนับถึงค่าที่ตั้งไว้ จะเกิด interrupt แล้วกลับไปเริ่มนับจาก 0 ใหม่เองทันที รอบถัดไปจึงเริ่มตรงเวลาเสมอ โดยไม่ต้องมีโปรแกรมมาตั้งค่าใหม่ ระหว่างตั้งค่า timer ระบบปิด interrupt ไว้ชั่วคราว (`cli()` / `sei()`) เพื่อไม่ให้ interrupt เกิดขึ้นขณะที่ตั้งค่ายังไม่ครบ

เมื่อเกิด interrupt ฟังก์ชันที่รับ interrupt ทำเพียงอย่างเดียว คือ "ยกธง" บอกโปรแกรมหลักว่าถึงรอบแล้ว ส่วนงานอ่านค่าจริงจะทำใน `loop()` เพราะงานใน interrupt ต้องสั้นที่สุด ธงที่ใช้สื่อสารระหว่าง interrupt กับโปรแกรมหลักเก็บรวมไว้ในตัวแปรเดียว แต่ละบิตแทนเหตุการณ์หนึ่งอย่าง

```cpp
volatile uint8_t eventFlags = 0;
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 6](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L6)

โค้ดนี้ไม่ได้ตั้งชื่อบิตแต่ละตัวไว้เป็นค่าคงที่ แต่ใช้ตัวเลขบิตตรง ๆ คือ บิต 0 (`1 << 0`) หมายถึง timer ครบรอบ บิต 1 (`1 << 1`) หมายถึง EMG แปลงค่าเสร็จ และบิต 2 (`1 << 2`) หมายถึง FSR แปลงค่าเสร็จ interrupt เป็นฝ่ายยกธงด้วยการ OR บิตที่เกี่ยวข้องเข้าไปในตัวแปร และ `loop()` เป็นฝ่ายเอาธงลงด้วยการ AND กับส่วนกลับบิตนั้นเมื่อจัดการเหตุการณ์นั้นเสร็จแล้ว ตัวแปรนี้ประกาศเป็น `volatile` เพื่อบอกคอมไพเลอร์ว่าค่าอาจถูกเปลี่ยนจาก interrupt ได้ทุกเมื่อ โปรแกรมจึงต้องอ่านค่าจริงจากหน่วยความจำทุกครั้ง ไม่ใช้ค่าเก่าที่จำไว้

#### 6.2.2.3 การอ่านค่า ADC ด้วย Interrupt

ถ้าใช้ `analogRead()` CPU ต้องรอ ADC แปลงค่าจนเสร็จ ซึ่งใช้เวลาประมาณ 104 µs ต่อช่อง โดยตลอดเวลานั้น CPU ต้องตื่นอยู่และทำอย่างอื่นไม่ได้ ระบบจึงใช้วิธีสั่งให้ ADC เริ่มแปลงค่าแล้วปล่อยไว้ เมื่อแปลงเสร็จ ADC จะแจ้งกลับมาเองด้วย interrupt

```cpp
ADMUX = (1 << REFS0) | ADC_CHANNEL_EMG;
ADCSRA = (1 << ADEN) | (1 << ADIE) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0);
DIDR0 |= (1 << ADC0D) | (1 << ADC1D);
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 74–76](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L74-L76)

```cpp
ISR(ADC_vect) {
  int value = ADC;
  if (currentAdcChannel == ADC_CHANNEL_EMG) {
    emgRawIsr = value;
    eventFlags |= (1 << 1);
    currentAdcChannel = ADC_CHANNEL_FSR;
    ADMUX = (ADMUX & 0xF0) | (ADC_CHANNEL_FSR & 0x0F);
    ADCSRA |= (1 << ADSC);
  } else {
    fsrRawIsr = value;
    eventFlags |= (1 << 2);
  }
}
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 37–49](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L37-L49)

- ตอนตั้งค่า ADC ระบบใช้แรงดัน 5 V ของบอร์ดเป็นแรงดันอ้างอิง ค่าที่อ่านได้จึงอยู่ในช่วง 0–1023 ตามแรงดัน 0–5 V และเปิดให้ ADC แจ้ง interrupt เมื่อแปลงค่าเสร็จ ส่วนสัญญาณนาฬิกาของ ADC ลดลงเหลือประมาณ 125 kHz ซึ่งอยู่ในช่วงที่ ADC แปลงค่าได้แม่นยำ
- ขา A0 และ A1 ใช้อ่านสัญญาณแอนะล็อกเท่านั้น ระบบจึงปิดวงจรอ่านค่าดิจิทัลของสองขานี้ไว้ เพื่อลดสัญญาณรบกวนและลดการใช้ไฟ
- ADC มีตัวเดียว แต่ต้องอ่าน 2 ช่อง ระบบจึงอ่านต่อกันเป็นทอด ๆ เริ่มจาก EMG ที่ขา A0 เมื่อแปลงเสร็จ interrupt จะเก็บค่าไว้ ยกธงบิต 1 ว่า EMG พร้อมแล้ว แล้วเปลี่ยนช่องที่จะอ่านเป็น FSR ด้วยการเขียน `ADMUX` ใหม่ และสั่งเริ่มแปลงค่าอีกครั้งด้วยการตั้งบิต `ADSC` ตรง ๆ ในบรรทัดถัดมา เมื่อ FSR แปลงเสร็จก็จะยกธงบิต 2 ว่า FSR พร้อมแล้ว ธงนี้หมายความว่าได้ค่าครบทั้งสองช่องของรอบนั้นแล้ว
- interrupt ต้องรู้ว่าค่าที่เพิ่งแปลงเสร็จเป็นของช่องใด ระบบจึงจดช่องที่กำลังอ่านไว้ในตัวแปร `currentAdcChannel` ทุกครั้งที่เปลี่ยนช่อง
- โค้ดนี้ไม่มีฟังก์ชันช่วยรวมการตั้งช่องกับการสั่งเริ่มแปลงค่าไว้ด้วยกัน (เช่น `startAdcConversion()`) การเขียน `currentAdcChannel`, `ADMUX` และบิต `ADSC` จึงเกิดขึ้นตรง ๆ ทั้งใน ISR นี้ และใน `loop()` (หัวข้อ 6.2.2.4) แยกกันคนละที่ ทำให้เห็นการเข้าถึง register ระดับล่างชัดเจนขึ้น แต่ต้องเขียนโค้ดชุดเดียวกันซ้ำสองจุด

#### 6.2.2.4 รอบการทำงานใน `loop()` และการประหยัดพลังงาน

`loop()` เป็นตัวกำหนดลำดับงานในแต่ละรอบ ช่วงที่ต้องรอ timer หรือรอ ADC แปลงค่า CPU จะพักอยู่ตลอด และตื่นขึ้นมาเฉพาะเมื่อมีงานต้องทำ

```cpp
void loop() {
  sleep_mode();

  if (!(eventFlags & (1 << 0))) return;
  eventFlags &= ~(1 << 0);

  currentAdcChannel = ADC_CHANNEL_EMG;
  ADMUX = (ADMUX & 0xF0) | (ADC_CHANNEL_EMG & 0x0F);
  ADCSRA |= (1 << ADSC);

  while (!(eventFlags & (1 << 2))) sleep_mode();
  eventFlags &= ~((1 << 1) | (1 << 2));

  cli();
  int emgRaw = emgRawIsr;
  int fsrRaw = fsrRawIsr;
  sei();
  // ...
}
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 83–99](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L83-L99)

1. ต้นรอบ CPU จะพักจนกว่าจะมี interrupt ใดก็ตามเกิดขึ้น
2. เมื่อตื่นขึ้น โปรแกรมจะตรวจก่อนว่าบิตของ timer (บิต 0) ถูกยกหรือไม่ เพราะ interrupt อื่นก็ปลุก CPU ได้เช่นกัน ถ้ายังไม่ถึงรอบก็กลับไปพักต่อ ถ้าถึงรอบแล้วจึงเอาบิตลงและเริ่มทำงาน
3. โปรแกรมตั้งช่อง ADC เป็น EMG และสั่งเริ่มแปลงค่าเองตรง ๆ (เขียน `currentAdcChannel`, `ADMUX` และบิต `ADSC`) แล้วพักรอต่อ ระหว่างนั้น interrupt ของ ADC จะอ่าน EMG แล้วต่อด้วย FSR เอง (หัวข้อ 6.2.2.3) CPU จะตื่นขึ้นมาตรวจทุกครั้งที่มี interrupt จนกว่าจะเห็นบิต FSR (บิต 2) พร้อมแล้ว
4. เมื่อได้ค่าครบ โปรแกรมคัดลอกค่าจากตัวแปรที่ interrupt เขียนไว้มาใช้ ระหว่างคัดลอกจะปิด interrupt ไว้ชั่วครู่ เพราะ Uno เป็นชิป 8 บิต การอ่านค่า 16 บิตต้องทำเป็น 2 ครั้ง ถ้า interrupt แทรกเข้ามาเปลี่ยนค่าระหว่างสองครั้งนั้น ค่าที่ได้จะผิด

โหมดพักที่เลือกไว้ใน `setup()` คือ `SLEEP_MODE_IDLE` ซึ่งเป็นโหมดที่ตื้นที่สุด โหมดนี้หยุดเฉพาะ CPU แต่ Timer1, ADC และ Serial ยังทำงานต่อได้และปลุก CPU ได้ ระบบไม่เลือกโหมดที่ลึกกว่านี้ เพราะโหมดเหล่านั้นจะหยุด timer และ ADC ซึ่งเฟิร์มแวร์ต้องใช้ ข้อดีอีกข้อของการพักขณะ ADC แปลงค่าคือสัญญาณรบกวนจากวงจรดิจิทัลลดลง ค่าที่อ่านได้จึงนิ่งขึ้น

#### 6.2.2.5 การป้องกันระบบค้างด้วย Watchdog Timer

watchdog ของ Uno ทำงานแบบเดียวกับฝั่ง ESP32 คือเป็นตัวจับเวลาที่โปรแกรมต้องรีเซ็ตเป็นระยะ ถ้าไม่ถูกรีเซ็ตจนหมดเวลา แสดงว่าโปรแกรมค้าง ชิปจะรีสตาร์ทตัวเอง

```cpp
MCUSR = 0;
wdt_disable();
// ...
WDT__enable(wdt_timeout_2sec);
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 69–70, 80](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L68-L81)

ต้น `setup()` ระบบล้างบันทึกสาเหตุการรีเซ็ตครั้งก่อน และปิด watchdog ไว้ก่อน เพราะถ้าบอร์ดเพิ่งถูกรีสตาร์ทจาก watchdog ชิปจะยังจำสถานะนั้นไว้ และ bootloader รุ่นเก่าบางรุ่นไม่ได้ล้างสถานะนี้ให้ ถ้าไม่จัดการเอง watchdog อาจทำงานต่อระหว่างที่บอร์ดกำลังเริ่มระบบ และรีสตาร์ทบอร์ดวนซ้ำไม่จบ

ต่างจากฝั่ง ESP32 ที่เรียกใช้ watchdog ผ่านฟังก์ชันสำเร็จรูปของไลบรารี โค้ดฝั่ง Uno เขียนฟังก์ชันเปิด watchdog เองชื่อ `WDT__enable()` ซึ่งเขียนค่าลง register ของชิปโดยตรง แทนการเรียก `wdt_enable(WDTO_2S)` ของไลบรารี AVR

```cpp
#define wdt_timeout_2sec 7

void WDT__enable(uint8_t timeout_v) {
  unsigned char bakSREG;
  uint8_t prescaler;
  prescaler = timeout_v & 0x07;
  prescaler |= (1 << WDE);
  if (timeout_v > 7) {
    prescaler |= (1 << WDP3);
  }
  bakSREG = SREG;
  cli();
  wdt_reset();
  WDTCSR |= ((1 << WDCE) | (1 << WDE));
  WDTCSR = prescaler;
  SREG = bakSREG;
}
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 17, 52–66](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L52-L66)

1. คำนวณค่า prescaler จากค่าที่ส่งเข้ามา (`timeout_v & 0x07`) แล้วตั้งบิต `WDE` (Watchdog Enable) เพิ่มเข้าไป ถ้าค่าที่ส่งมากกว่า 7 จะตั้งบิต `WDP3` เพิ่มด้วย สำหรับ timeout ที่นานกว่า 2 วินาที ค่าคงที่ `wdt_timeout_2sec` ที่ประกาศไว้เท่ากับ 7 ซึ่งตรงกับค่า `WDTO_2S` ของไลบรารี AVR พอดี ผลลัพธ์คือ timeout 2 วินาทีเท่าเดิม
2. เก็บค่า `SREG` (สถานะ interrupt) ไว้ก่อน แล้วปิด interrupt ชั่วคราวด้วย `cli()` เพราะการตั้งค่า watchdog ต้องทำติดกันโดยไม่ให้ interrupt แทรก
3. รีเซ็ต watchdog หนึ่งครั้งก่อนตั้งค่าใหม่ เพื่อไม่ให้ timeout เดิมหมดเวลาพอดีตอนกำลังตั้งค่า
4. เขียน `WDTCSR` สองครั้งตามลำดับที่ชิป AVR กำหนด ครั้งแรกตั้งบิต `WDCE` และ `WDE` เพื่อปลดล็อกการเปลี่ยนค่า (ชิปกำหนดว่าไบต์นี้ต้องเขียนสองครั้งภายใน 4 clock cycle มิฉะนั้นการเปลี่ยนค่าจะไม่มีผล) ครั้งที่สองจึงเขียนค่า prescaler ที่คำนวณไว้ลงไปจริง
5. คืนค่า `SREG` เดิม เพื่อให้สถานะ interrupt กลับมาเหมือนก่อนเรียกฟังก์ชัน

เมื่อตั้งค่าส่วนอื่นเสร็จ ระบบจึงเรียก `WDT__enable(wdt_timeout_2sec)` ซึ่งให้ผลเหมือนกับ `wdt_enable(WDTO_2S)` ทุกประการ แล้วรีเซ็ต watchdog หนึ่งครั้งที่ท้าย `loop()` ทุกครั้งที่อ่านและส่งข้อมูลครบหนึ่งรอบ

```cpp
wdt_reset();
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 109](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L109)

ปกติหนึ่งรอบใช้เวลาประมาณ 10 ms เวลา 2 วินาทีจึงเผื่อไว้มาก watchdog จะทำงานเฉพาะเมื่อมีปัญหาจริง เช่น ADC ไม่แจ้งว่าแปลงเสร็จจนโปรแกรมรอธงอยู่ตลอดไป หรือ timer หยุดทำงาน

#### 6.2.2.6 การแปลงค่าและส่งข้อมูลไปยัง ESP32

ก่อนส่งข้อมูล Uno ต้องปรับค่าให้อยู่ในรูปแบบที่ ESP32 และ backend ใช้

```cpp
int fsrInverted = ADC_MAX_VAL - fsrRaw;
int emgScaled = map(emgRaw, 0, ADC_MAX_VAL, 0, 4095);
int fsrScaled = map(fsrInverted, 0, ADC_MAX_VAL, 0, 4095);

Serial.print(emgScaled);
Serial.print(',');
Serial.println(fsrScaled);
```

ดูโค้ดต้นฉบับ: [`uno_emg_fsr_link.ino` บรรทัด 101–107](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/main/test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino#L101-L107)

- วงจร FSR ให้ค่าสูงเมื่อไม่มีแรงกด และค่าจะลดลงเมื่อกดแรงขึ้น ซึ่งกลับด้านกับความหมายที่ต้องการ ระบบจึงกลับค่าก่อน ให้ค่ามากหมายถึงแรงกดมาก
- ADC ของ Uno ให้ค่า 10 บิต (0–1023) แต่ฝั่ง ESP32 และ backend ออกแบบไว้สำหรับค่า 12 บิต (0–4095) ระบบจึงขยายช่วงค่าให้ตรงกัน เพื่อให้ส่วนอื่นของระบบใช้ค่าได้โดยไม่ต้องรู้ว่าข้อมูลมาจากบอร์ดใด
- ค่าทั้งสองถูกส่งออกเป็นข้อความหนึ่งบรรทัดต่อหนึ่งรอบ คั่นด้วยเครื่องหมายจุลภาค เช่น `2048,1820` ตามด้วยตัวขึ้นบรรทัดใหม่ ฝั่ง ESP32 ใช้ตัวขึ้นบรรทัดใหม่นี้เป็นจุดแบ่งข้อความแต่ละรอบ (หัวข้อ 6.3.2.4)

ข้อมูลถูกส่งผ่าน `Serial` ที่ขา 0/1 ซึ่งเป็นขาเดียวกับที่ใช้ต่อ USB จึงไม่ควรต่อ USB และ ESP32 พร้อมกัน นอกจากนี้ Uno ทำงานที่ 5 V แต่ขาของ ESP32 รับได้เพียง 3.3 V สายที่ส่งจาก Uno ไป ESP32 จึงต้องผ่านวงจรแบ่งแรงดันก่อน (ดู `PINS.md`)

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 2 เป็นรูปประกอบหัวข้อนี้

## 6.3 ESP32: FreeRTOS, Hardware Timer, GPIO Interrupt, Watchdog, I2C และการส่งข้อมูล

### 6.3.1 ภาพรวมการทำงาน

**การแบ่งงานเป็น Task:** ESP32 แบ่งงานออกเป็น 4 Task ที่ทำงานพร้อมกัน ได้แก่

- `SensorTask`: อ่านข้อมูลเซนเซอร์ถี่ที่สุดเพื่อให้ได้ข้อมูลต่อเนื่อง
- `NetworkTask`: ส่งข้อมูลผ่าน HTTP ไปยังเว็บไซต์ทุก 250 ms
- `LcdTask`: อัปเดตข้อมูลบนจอ LCD ทุก 200 ms
- `ControlTask`: รับเหตุการณ์จากปุ่มกดและจัดการสถานะการฝึก

**การจับเวลารอบ sampling:** ใช้ Timer สร้างสัญญาณที่ความถี่ 100 Hz ทุกครั้งที่ timer ทำงาน ระบบจะให้ semaphore เพื่อปลุก SensorTask ให้อ่านข้อมูลหนึ่งรอบ ทำให้รอบ sampling สม่ำเสมอ

**การรับสัญญาณจากปุ่ม:** ปุ่ม A และปุ่ม B ทำงานแบบ interrupt เมื่อกดปุ่มจะใช้ตัวจับเวลาระดับไมโครวินาทีทำ debounce 250 ms แล้วส่งค่าเข้าคิวของ ControlTask สำหรับดึงค่ามาเปลี่ยนสถานะการฝึก และส่งสถานะใหม่ไปยังเว็บไซต์ในรอบถัดไป นอกจากนี้ ปุ่ม A ยังใช้ปลุก ESP32 ให้ตื่นจาก Sleep Mode

**การป้องกันระบบค้าง:** ใช้ Watchdog Timer ของ ESP32 โดยตั้ง timeout ไว้ 8 วินาที และลงทะเบียน task หลักทุกตัวไว้กับ watchdog แต่ละ task จะเรียก `esp_task_wdt_reset()` ทุกรอบการทำงาน หาก task ใดไม่ตอบสนองนานเกิน 8 วินาที ระบบจะรีสตาร์ทบอร์ดโดยอัตโนมัติ

**การใช้ I2C bus ร่วมกัน:** เซนเซอร์ MPU, MAX30102, MLX90614 และจอ LCD ต่ออยู่บน I2C bus เดียวกัน เนื่องจาก bus นี้สื่อสารได้ทีละอุปกรณ์ จึงใช้ mutex ควบคุมไม่ให้หลาย task เข้าใช้ bus พร้อมกัน ซึ่งช่วยป้องกันข้อมูลชนกันและ bus ค้าง

**การรับข้อมูลจาก Arduino Uno:** ESP32 รับค่า EMG และ FSR จาก Arduino Uno ผ่าน `Serial2` ที่ขา GPIO16/17 ด้วยความเร็ว 9600 baud

**การส่งข้อมูลขึ้นเว็บไซต์:** NetworkTask นำค่าจาก Arduino Uno มารวมกับข้อมูลจากเซนเซอร์อื่นเป็น JSON ทุก 250 ms แล้วใช้ API เพื่อส่งค่าไปยังเว็บไซต์

**การประหยัดพลังงาน:** เมื่อไม่มีการใช้งานนานครบ 5 นาที ESP32 จะเข้าสู่ Light Sleep และตื่นขึ้นมาทำงานต่อเมื่อกดปุ่ม A

### 6.3.2 โค้ดและการทำงานของโค้ด

โค้ดในหัวข้อนี้ยกมาจากไฟล์ `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino` โดยตรง บรรทัดที่ละไว้แสดงด้วย `// ...`

#### 6.3.2.1 การเริ่มต้นระบบใน `setup()`

เมื่อเปิดเครื่อง ESP32 ต้องเตรียมส่วนต่าง ๆ ให้พร้อมก่อนเริ่มทำงานจริง โดยเปิดช่องทางสื่อสารก่อน แสดงข้อความบนจอ แล้วจึงเริ่มเซนเซอร์ทีละตัว

```cpp
Serial2.begin(UNO_LINK_BAUD, SERIAL_8N1, UNO_LINK_RX_PIN, UNO_LINK_TX_PIN);
Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
Wire.setClock(100000);

lcd.init();
lcd.backlight();
lcd.setCursor(0, 0);
lcd.print("Booting...");

for (int attempt = 0; attempt < 5 && !statusMpu; attempt++) {
  if (attempt > 0) delay(100);
  statusMpu = mpuBegin();
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 875–887](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L875-L887)

ESP32 ใช้ช่องทางสื่อสาร 2 ช่อง ช่องแรกคือ UART สำหรับรับค่า EMG และ FSR จาก Arduino Uno (ขา GPIO16/17 ความเร็ว 9600 baud) ช่องที่สองคือ I2C bus (ขา SDA = GPIO21, SCL = GPIO22 ความเร็ว 100 kHz) ซึ่งเซนเซอร์ทั้งสามตัวและจอ LCD ใช้ร่วมกัน เมื่อเปิด I2C แล้ว จอ LCD จะขึ้นข้อความ `Booting...` ให้ผู้ใช้รู้ว่าเครื่องกำลังเริ่มระบบ

ตอนเพิ่งจ่ายไฟ เซนเซอร์บน I2C อาจยังไม่พร้อมตอบสนองทันที การสั่งเริ่มต้นเพียงครั้งเดียวจึงอาจล้มเหลวทั้งที่เซนเซอร์ไม่ได้เสีย เฟิร์มแวร์จึงลองเริ่มต้นเซนเซอร์แต่ละตัว (MPU, MAX30102, MLX90614) ซ้ำได้หลายครั้ง โดยเว้นช่วงให้เซนเซอร์ตั้งตัวครั้งละประมาณ 100 ms และหยุดลองทันทีที่เซนเซอร์ตอบกลับ หากลองครบ 5 ครั้งแล้วยังไม่สำเร็จ ระบบจะถือว่าเซนเซอร์ตัวนั้นใช้งานไม่ได้

ระบบจะจำไว้ว่าเซนเซอร์ตัวใดพร้อมใช้งาน และในขั้นตอนอ่านค่า (หัวข้อ 6.3.2.5) จะอ่านเฉพาะเซนเซอร์ที่พร้อมเท่านั้น ดังนั้นถ้าเซนเซอร์ตัวใดหลุดหรือต่อสายไม่แน่น ระบบทั้งหมดจะไม่ค้าง ส่วนอื่นยังทำงานได้ตามปกติ เพียงแต่ค่าที่มาจากเซนเซอร์ตัวนั้นจะคงเป็น 0

จากนั้นจึงเชื่อมต่อ Wi-Fi และสร้างเครื่องมือของ FreeRTOS ที่ task ต่าง ๆ ใช้ประสานงานกัน เครื่องมือเหล่านี้ต้องสร้างไว้ก่อนสร้าง task เพราะ task เริ่มทำงานทันทีที่ถูกสร้างและต้องใช้เครื่องมือเหล่านี้ตั้งแต่รอบแรก

```cpp
stateMutex = xSemaphoreCreateMutex();
i2cMutex = xSemaphoreCreateMutex();
sampleTickSemaphore = xSemaphoreCreateBinary();
emgQueue = xQueueCreate(EMG_QUEUE_LEN, sizeof(int));
buttonEventQueue = xQueueCreate(8, sizeof(uint8_t));
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 926–930](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L926-L930)

เครื่องมือเหล่านี้แบ่งเป็น 2 กลุ่ม กลุ่มแรกคือ mutex ใช้เป็น "กุญแจ" ของสิ่งที่หลาย task ใช้ร่วมกัน task ที่ถือกุญแจอยู่เท่านั้นจึงจะเข้าใช้ได้ ส่วนกลุ่มที่สองคือ semaphore และ queue ใช้ส่งสัญญาณหรือส่งข้อมูลจากส่วนหนึ่งของโปรแกรมไปยังอีกส่วน

| เครื่องมือ    | ชนิด          | ใช้ทำอะไร                                                                                                                   |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `stateMutex`          | Mutex             | กุญแจของข้อมูลกลาง`SharedState` ไม่ให้ task หนึ่งอ่านขณะที่อีก task กำลังเขียน |
| `i2cMutex`            | Mutex             | กุญแจของ I2C bus ให้ใช้ได้ทีละ task                                                                             |
| `sampleTickSemaphore` | Binary semaphore  | สัญญาณจาก hardware timer ที่ปลุก SensorTask ทุก 10 ms                                                             |
| `emgQueue`            | Queue 64 ช่อง | ที่พักค่า EMG ทุกตัวอย่าง รอ NetworkTask มาเก็บไปส่งเป็นชุด                                  |
| `buttonEventQueue`    | Queue 8 ช่อง  | ส่งหมายเลขปุ่มที่ถูกกดจาก interrupt ไปให้ ControlTask                                                  |

#### 6.3.2.2 การแบ่งงานเป็น Task

งานของ ESP32 แต่ละอย่างมีจังหวะเวลาต่างกัน การอ่านเซนเซอร์ต้องตรงทุก 10 ms แต่การส่ง HTTP อาจต้องรอเซิร์ฟเวอร์ตอบนานหลายร้อยมิลลิวินาที ถ้าเขียนทุกอย่างรวมไว้ในลูปเดียว การรอเครือข่ายจะทำให้การอ่านเซนเซอร์ช้าตามไปด้วย จึงแยกงานออกเป็น 4 task ที่มีลูปของตัวเอง และให้ FreeRTOS สลับเวลา CPU ให้แต่ละ task ตามความสำคัญ

```cpp
xTaskCreatePinnedToCore(sensorTask, "SensorTask", 4096, nullptr, 3, &sensorTaskHandle, 1);
xTaskCreatePinnedToCore(networkTask, "NetworkTask", 8192, nullptr, 2, &networkTaskHandle, 0);
xTaskCreatePinnedToCore(lcdTask, "LcdTask", 2560, nullptr, 1, &lcdTaskHandle, 1);
xTaskCreatePinnedToCore(controlTask, "ControlTask", 2560, nullptr, 2, &controlTaskHandle, 1);
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 953–956](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L953-L956)

| Task            | Stack (byte) | Priority         | Core | หน้าที่                                                                  |
| --------------- | ------------ | ---------------- | ---- | ------------------------------------------------------------------------------- |
| `SensorTask`  | 4096         | 3 (สูงสุด) | 1    | อ่านเซนเซอร์ทุก 10 ms ตาม hardware timer                      |
| `NetworkTask` | 8192         | 2                | 0    | สร้าง JSON และส่ง HTTP POST ทุก 250 ms                            |
| `LcdTask`     | 2560         | 1 (ต่ำสุด) | 1    | อัปเดตจอ LCD ทุก 200 ms                                              |
| `ControlTask` | 2560         | 2                | 1    | รับเหตุการณ์ปุ่ม ควบคุม buzzer และเข้า light sleep |

SensorTask ได้ priority สูงสุด เมื่อถึงรอบอ่านเซนเซอร์ FreeRTOS จะหยุด task อื่นบน core เดียวกันไว้ก่อนแล้วให้ SensorTask ทำงานทันที ส่วน LcdTask ได้ priority ต่ำสุด เพราะถ้าจออัปเดตช้าไปเล็กน้อยผู้ใช้ก็แทบไม่สังเกตเห็น

ESP32 มี CPU 2 core ระบบจึงแยก NetworkTask ไปไว้ที่ core 0 ซึ่งเป็น core เดียวกับที่ Wi-Fi ทำงาน ส่วน task อื่นอยู่ที่ core 1 ทำให้ขณะที่ NetworkTask รอเซิร์ฟเวอร์ตอบ การอ่านเซนเซอร์บนอีก core ยังเดินต่อได้ตามปกติ NetworkTask ได้ stack มากที่สุดเพราะต้องเก็บข้อความ JSON ทั้งก้อนไว้ในหน่วยความจำระหว่างสร้าง

เมื่อสร้าง task ครบแล้ว งานทั้งหมดจะอยู่ใน task ทั้งสี่ `loop()` ของ Arduino จึงไม่เหลืองานให้ทำ และลบตัวเองทิ้งเพื่อคืนหน่วยความจำ

```cpp
void loop() {
  vTaskDelete(NULL);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 966–968](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L966-L968)

#### 6.3.2.3 การจับเวลารอบ sampling ด้วย Hardware Timer

ถ้าใช้ `delay(10)` คั่นระหว่างรอบ เวลาแต่ละรอบจะเท่ากับ 10 ms บวกเวลาที่ใช้อ่านเซนเซอร์ ซึ่งไม่คงที่ รอบ sampling จึงคลาดเคลื่อนไปเรื่อย ๆ ระบบจึงใช้ hardware timer ซึ่งเป็นวงจรนับเวลาที่แยกจาก CPU และนับต่อไปได้ตรงเวลาไม่ว่า CPU จะทำอะไรอยู่

```cpp
sampleTimer = timerBegin(1000000);
timerAttachInterrupt(sampleTimer, &onSampleTimer);
timerAlarm(sampleTimer, SAMPLE_INTERVAL_MS * 1000, (SAMPLE_TIMER_CONFIG_MASK & TIMER_CFG_AUTORELOAD) != 0, 0);
timerStart(sampleTimer);
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 948–951](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L948-L951)

timer นับขึ้นหนึ่งครั้งทุก 1 µs เมื่อนับครบ 10,000 ครั้งหรือ 10 ms จะเกิด interrupt แล้วเริ่มนับใหม่เองโดยอัตโนมัติ จึงได้สัญญาณสม่ำเสมอที่ 100 Hz

เมื่อเกิด interrupt CPU จะหยุดงานที่ทำอยู่ชั่วคราวเพื่อไปทำฟังก์ชันด้านล่าง ฟังก์ชันนี้ไม่ได้อ่านเซนเซอร์เอง ทำเพียงส่งสัญญาณบอก SensorTask ว่าถึงรอบแล้ว เพราะงานใน interrupt ต้องสั้นที่สุด ส่วนการอ่านเซนเซอร์ผ่าน I2C ใช้เวลานานและต้องรอ mutex ซึ่งทำใน interrupt ไม่ได้

```cpp
void IRAM_ATTR onSampleTimer() {
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xSemaphoreGiveFromISR(sampleTickSemaphore, &xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 237–241](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L237-L241)

ฟังก์ชันนี้ถูกวางไว้ใน RAM ภายใน (`IRAM_ATTR`) เพื่อให้เริ่มทำงานได้ทันทีโดยไม่ต้องรออ่านโค้ดจาก flash และหลังจากส่งสัญญาณแล้ว ถ้า SensorTask สำคัญกว่างานที่ถูกขัดจังหวะไว้ ระบบจะสลับไปทำ SensorTask ทันทีเมื่อออกจาก interrupt โดยไม่ต้องรอให้งานเดิมทำจนเสร็จ

ฝั่ง SensorTask จะหยุดรอสัญญาณนี้ที่ต้นลูปทุกรอบ

```cpp
void sensorTask(void *pvParameters) {
  lastMpuMicros = micros();

  for (;;) {
    xSemaphoreTake(sampleTickSemaphore, portMAX_DELAY);
    esp_task_wdt_reset();

    unsigned long now = millis();

    pollUnoLink();
    // ...
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 571–580](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L571-L580)

ระหว่างรอ SensorTask ไม่ใช้ CPU เลย CPU จึงว่างไปทำ task อื่นได้ เมื่อได้รับสัญญาณ SensorTask จะรายงานตัวกับ watchdog (หัวข้อ 6.3.2.7) อ่านเซนเซอร์หนึ่งรอบ แล้ววนกลับมารอสัญญาณครั้งถัดไป รอบการอ่านจึงตรงทุก 10 ms ตามจังหวะของ hardware timer

#### 6.3.2.4 การรับข้อมูลจาก Arduino Uno ผ่าน UART

Arduino Uno ส่งค่า EMG และ FSR มาเป็นข้อความบรรทัดละหนึ่งรอบในรูปแบบ `emg,fsr` เช่น `2048,1820` แต่ UART ส่งข้อมูลมาทีละตัวอักษร และในแต่ละรอบที่ SensorTask ตรวจ ข้อความหนึ่งบรรทัดอาจมาถึงไม่ครบ ฟังก์ชัน `pollUnoLink()` จึงสะสมตัวอักษรไว้จนครบบรรทัดก่อน แล้วจึงแปลงเป็นตัวเลข

```cpp
void pollUnoLink() {
  static char lineBuf[32];
  static uint8_t lineLen = 0;

  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\n') {
      lineBuf[lineLen] = '\0';
      int emg, fsr;
      if (sscanf(lineBuf, "%d,%d", &emg, &fsr) == 2) {
        unoEmgVal = emg;
        unoFsrForce = fsr;
        lastUnoRxMs = millis();
      }
      lineLen = 0;
    } else if (c != '\r' && lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    }
  }

  bool unoLinkOk = (millis() - lastUnoRxMs) < 500;
  // ...
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 266–291](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L266-L291)

1. ทุกรอบ ฟังก์ชันจะรับตัวอักษรที่มาถึงแล้วทั้งหมด นำไปต่อท้ายข้อความที่สะสมไว้ ถ้าข้อความยาวผิดปกติเกิน 32 ตัวอักษรจะไม่เก็บเพิ่ม เพื่อไม่ให้ข้อมูลล้นพื้นที่ที่เตรียมไว้
2. เมื่อเจอตัวขึ้นบรรทัดใหม่ แสดงว่าได้ข้อความครบหนึ่งรอบแล้ว จึงแยกข้อความตรงเครื่องหมายจุลภาคออกเป็นตัวเลข 2 ค่า
3. ถ้าแยกได้ครบทั้ง 2 ค่า จะเก็บเป็นค่าล่าสุดของ EMG และ FSR พร้อมจดเวลาที่รับได้ แต่ถ้าบรรทัดเสีย เช่น มีตัวอักษรหายระหว่างทาง จะทิ้งบรรทัดนั้นไปทั้งบรรทัด ระบบจึงไม่นำค่าที่ผิดไปใช้
4. ข้อความที่มายังไม่ครบบรรทัดจะถูกเก็บไว้ข้ามรอบ แล้วนำมาต่อกับตัวอักษรที่มาถึงในรอบถัดไป
5. ปกติ Uno ส่งข้อมูลมาทุก 10 ms ถ้าไม่ได้รับข้อมูลเลยนานเกิน 500 ms ระบบจะถือว่าการเชื่อมต่อกับ Uno ขาด และแจ้งทาง Serial Monitor

ค่า EMG ต้องส่งขึ้นเว็บให้ครบทุกตัวอย่าง เพื่อให้หน้าเว็บวาดกราฟสัญญาณกล้ามเนื้อได้ต่อเนื่อง แต่ SensorTask ได้ค่าใหม่ทุก 10 ms ขณะที่ NetworkTask ส่งข้อมูลทุก 250 ms จึงต้องมีที่พักข้อมูลระหว่างกัน SensorTask จะใส่ค่า EMG ลง `emgQueue` ทุกรอบ แล้ว NetworkTask มาเก็บออกไปส่งทีเดียวทั้งชุด

```cpp
if (xQueueSend(emgQueue, &emgVal, 0) != pdTRUE) {
  int discarded;
  xQueueReceive(emgQueue, &discarded, 0);
  xQueueSend(emgQueue, &emgVal, 0);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 587–591](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L587-L591)

queue มี 64 ช่อง พอเก็บข้อมูลได้ประมาณ 640 ms ถ้าเครือข่ายช้าจน NetworkTask มาเก็บไม่ทันและ queue เต็ม ระบบจะทิ้งค่าที่เก่าที่สุดหนึ่งค่าเพื่อเปิดที่ให้ค่าใหม่ โดย SensorTask ไม่ต้องหยุดรอ ข้อมูลที่ส่งขึ้นเว็บจึงเป็นช่วงล่าสุดเสมอ

#### 6.3.2.5 การใช้ I2C bus ร่วมกันด้วย Mutex

เซนเซอร์ MPU, MAX30102, MLX90614 และจอ LCD ต่ออยู่บน I2C bus สายเดียวกัน และ bus นี้สื่อสารได้ทีละอุปกรณ์ ถ้า SensorTask กำลังอ่านเซนเซอร์อยู่แล้ว LcdTask เข้ามาเขียนจอพร้อมกัน สัญญาณบนสายจะชนกัน ทำให้ได้ข้อมูลผิดหรือ bus ค้าง ระบบจึงใช้ `i2cMutex` เป็นกุญแจของ bus task ใดจะใช้ bus ต้องขอกุญแจก่อน และคืนเมื่อใช้เสร็จ

ในหนึ่งรอบ SensorTask ขอกุญแจเพียงครั้งเดียว อ่านเซนเซอร์ทุกตัวที่ต้องอ่านให้เสร็จ แล้วจึงคืนกุญแจ

```cpp
if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
  if (statusMpu) updateMpu(now);

  if (statusMax) {
    max30102.check();

    while (max30102.available()) {
      long irValue = max30102.getFIFOIR();
      long redValue = max30102.getFIFORed();
      // ...
      max30102.nextSample();
    }
  }

  if (statusMlx && now - lastMlxReadMs >= MLX_READ_INTERVAL_MS) {
    lastMlxReadMs = now;
    float t = mlx.readObjectTempC();
    if (!isnan(t)) {
      skinTemp = t;
      deltaTemp = skinTemp - skinTempBaseline;
    }
  }

  xSemaphoreGive(i2cMutex);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 594–638](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L594-L638)

- ถ้ารอกุญแจเกิน 20 ms แล้วยังไม่ได้ เช่น LcdTask กำลังเขียนจออยู่ SensorTask จะข้ามการอ่าน I2C ในรอบนั้นไปเลย เพื่อไม่ให้รอบ sampling ถัดไปเลื่อนออกไป
- อ่านเฉพาะเซนเซอร์ที่เริ่มต้นสำเร็จตอนเปิดเครื่อง (หัวข้อ 6.3.2.1) เซนเซอร์ที่ใช้งานไม่ได้จะถูกข้ามไป
- เซนเซอร์แต่ละตัวถูกอ่านในความถี่ที่ต่างกันตามลักษณะของข้อมูล MPU ถูกอ่านทุกรอบ (10 ms) เพราะความเร็วการเคลื่อนไหวเปลี่ยนเร็ว ส่วน MAX30102 เก็บค่าที่วัดได้ไว้ในหน่วยความจำของตัวเองอยู่แล้ว ทุกรอบระบบจึงดึงค่าที่ค้างอยู่ออกมาจนหมดเพื่อนำไปคำนวณ HR และ SpO2 ส่วน MLX90614 ถูกอ่านเพียงทุก 250 ms เพราะอุณหภูมิผิวเปลี่ยนช้า การอ่านถี่กว่านี้ไม่ได้ข้อมูลเพิ่มแต่เสียเวลาบน bus

การอ่านค่าจาก MPU ในระดับล่างใช้ไลบรารี `Wire` โดยตรง ตัวอย่างเช่นฟังก์ชันอ่านค่าจาก register หนึ่งไบต์

```cpp
uint8_t mpuReadReg(uint8_t reg) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1);
  return Wire.available() ? Wire.read() : 0xFF;
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 293–299](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L293-L299)

การอ่านค่าผ่าน I2C ทำเป็น 2 จังหวะ จังหวะแรก ESP32 บอก MPU (address `0x68`) ว่าต้องการอ่าน register ใด จังหวะที่สองจึงขอข้อมูลกลับมา ระหว่างสองจังหวะนี้ ESP32 ยังไม่ปล่อย bus (repeated start) เพื่อไม่ให้อุปกรณ์อื่นแทรกเข้ามากลางคัน ถ้า MPU ไม่ตอบกลับ ฟังก์ชันจะคืนค่า `0xFF` แทน โปรแกรมจึงไม่ค้างรอ

ค่าที่อ่านได้ยังอยู่ในตัวแปรของ SensorTask เอง ถ้าต้องการให้ task อื่นเห็น ต้องนำไปไว้ในข้อมูลกลาง `SharedState` การเขียนลง `SharedState` ต้องถือกุญแจ `stateMutex` ด้วย เพราะถ้า NetworkTask อ่านข้อมูลขณะที่ SensorTask เขียนไปได้เพียงครึ่งเดียว ค่าที่ได้จะเป็นค่าจากคนละรอบปนกัน

```cpp
if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
  shared.fsrLatest = fsrVal;
  shared.fsrStability = stability;
  shared.velocity = velocity;
  if (velocity > shared.peakVelocity) shared.peakVelocity = velocity;
  shared.beatAvg = beatAvg;
  shared.spo2Estimate = spo2Estimate;
  shared.skinTemp = skinTemp;
  shared.deltaTemp = deltaTemp;
  xSemaphoreGive(stateMutex);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 640–650](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L640-L650)

นอกจากค่าล่าสุดแล้ว SensorTask ยังเก็บความเร็วสูงสุดที่เจอไว้ด้วย เพราะ NetworkTask ส่งข้อมูลทุก 250 ms ถ้าส่งเฉพาะค่าล่าสุด จังหวะที่ยกน้ำหนักเร็วที่สุดอาจเกิดขึ้นระหว่างรอบส่งแล้วหายไปโดยไม่ถูกส่ง

#### 6.3.2.6 การรับสัญญาณจากปุ่มด้วย GPIO Interrupt

ปุ่ม A (GPIO32) และปุ่ม B (GPIO33) ทำงานแบบ interrupt CPU จึงไม่ต้องคอยวนตรวจสถานะปุ่มตลอดเวลา เมื่อผู้ใช้กดปุ่ม ฮาร์ดแวร์จะแจ้ง CPU เอง ใน `setup()` ตั้งค่าขาของปุ่มทั้งสองพร้อมกัน

```cpp
gpio_config_t buttonIoConf = {};
buttonIoConf.pin_bit_mask = BUTTON_PIN_BIT_MASK;
buttonIoConf.mode = GPIO_MODE_INPUT;
buttonIoConf.pull_up_en = GPIO_PULLUP_ENABLE;
buttonIoConf.pull_down_en = GPIO_PULLDOWN_DISABLE;
buttonIoConf.intr_type = GPIO_INTR_NEGEDGE;
gpio_config(&buttonIoConf);

gpio_install_isr_service(0);
gpio_isr_handler_add((gpio_num_t)BUTTON_A_PIN, buttonA_isr, nullptr);
gpio_isr_handler_add((gpio_num_t)BUTTON_B_PIN, buttonB_isr, nullptr);
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 936–946](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L936-L946)

ขาของปุ่มเปิดตัวต้านทาน pull-up ภายในไว้ ขณะที่ไม่ได้กด ขาจึงเป็น HIGH และเมื่อกดปุ่ม ขาจะเปลี่ยนเป็น LOW ระบบตั้งให้เกิด interrupt ตอนสัญญาณเปลี่ยนจาก HIGH เป็น LOW ซึ่งก็คือจังหวะที่เริ่มกดปุ่ม แต่ละปุ่มมีฟังก์ชันรับ interrupt ของตัวเอง

ปุ่มแบบกลไกมีปัญหาอย่างหนึ่ง เมื่อกดหนึ่งครั้ง หน้าสัมผัสจะเด้งกระทบกันหลายครั้งในเวลาสั้น ๆ ทำให้เกิด interrupt ซ้อนกันหลายครั้ง ฟังก์ชันรับ interrupt จึงต้องกรองสัญญาณเด้งเหล่านี้ออก (debounce)

```cpp
void IRAM_ATTR buttonA_isr(void *arg) {
  int64_t now = esp_timer_get_time();
  if (now - lastButtonAIsrUs < (int64_t)BUTTON_DEBOUNCE_US) return;
  lastButtonAIsrUs = now;
  uint8_t id = 0;
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xQueueSendFromISR(buttonEventQueue, &id, &xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 246–254](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L246-L254)

ทุกครั้งที่เกิด interrupt ฟังก์ชันจะดูเวลาปัจจุบันแบบละเอียดระดับไมโครวินาที ถ้าห่างจากครั้งก่อนไม่ถึง 250 ms จะถือว่าเป็นสัญญาณเด้งและไม่สนใจ ถ้าห่างพอจะถือว่าเป็นการกดครั้งใหม่ แล้วส่งหมายเลขปุ่ม (A = 0, B = 1) เข้าคิวให้ ControlTask ฟังก์ชันนี้ไม่ได้เปลี่ยนสถานะการฝึกเอง เพราะการเปลี่ยนสถานะต้องรอกุญแจ `stateMutex` ซึ่งไม่ควรทำใน interrupt จึงส่งต่อให้ ControlTask จัดการแทน

ControlTask รับหมายเลขปุ่มจากคิว แล้วตรวจสอบอีกชั้นก่อนเปลี่ยนสถานะการฝึก

```cpp
uint8_t buttonId;
if (xQueueReceive(buttonEventQueue, &buttonId, pdMS_TO_TICKS(100)) == pdTRUE && buttonId < 2) {
  vTaskDelay(pdMS_TO_TICKS(BUTTON_SETTLE_MS));
  bool isRealPress = buttonArmed[buttonId] && gpio_get_level(buttonPins[buttonId]) == 0;
  if (isRealPress) buttonArmed[buttonId] = false;

  unsigned long pressNow = millis();
  if (isRealPress && xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    if (buttonId == 0) {
      shared.setActive = !shared.setActive;
      if (shared.setActive) {
        shared.setStartMs = pressNow;
        shared.setCount++;
      } else {
        shared.restStartMs = pressNow;
      }
      shared.buttonAEventPending = true;
    } else {
      shared.setActive = false;
      shared.restStartMs = pressNow;
      shared.setCount = 0;
      shared.buttonBEventPending = true;
    }
    shared.lastActivityMs = pressNow;
    xSemaphoreGive(stateMutex);
  }
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 787–813](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L787-L813)

1. ControlTask รอ 30 ms ให้สัญญาณนิ่งก่อน แล้วอ่านสถานะปุ่มอีกครั้ง ถ้าปุ่มยังถูกกดอยู่จึงนับว่าเป็นการกดจริง ขั้นนี้ช่วยกรองสัญญาณรบกวนที่ทำให้เกิด interrupt ทั้งที่ผู้ใช้ไม่ได้กด
2. ถ้าผู้ใช้กดปุ่มค้างไว้ ระบบจะนับเพียงครั้งเดียว และต้องปล่อยปุ่มก่อนจึงจะนับการกดครั้งถัดไปได้
3. ปุ่ม A ใช้สลับระหว่างเริ่มเซตกับพักเซต ทุกครั้งที่เริ่มเซตใหม่ จำนวนเซตจะเพิ่มขึ้นหนึ่ง และระบบจะจดเวลาเริ่มเซตหรือเวลาเริ่มพักไว้ ส่วนปุ่ม B ใช้หยุดการฝึกและรีเซ็ตจำนวนเซตกลับเป็น 0
4. ระบบทำเครื่องหมายไว้ว่ามีการกดปุ่มที่ยังไม่ได้แจ้งเว็บไซต์ NetworkTask จะเห็นเครื่องหมายนี้และส่งเหตุการณ์ไปในรอบถัดไป พร้อมกันนั้นระบบจะบันทึกเวลาที่มีการใช้งานล่าสุดไว้ สำหรับตัดสินใจว่าจะเข้า Sleep Mode เมื่อใด

นอกจากนี้ ControlTask ยังรับหน้าที่ควบคุม buzzer ตามค่า FSR และตรวจเวลาที่ไม่มีการใช้งานเพื่อเข้า Sleep Mode (หัวข้อ 6.3.2.9)

#### 6.3.2.7 การป้องกันระบบค้างด้วย Watchdog Timer

watchdog เป็นตัวจับเวลาที่โปรแกรมต้องคอยรีเซ็ตเป็นระยะ ถ้าไม่มีการรีเซ็ตจนหมดเวลา แปลว่าโปรแกรมค้างอยู่ที่ใดที่หนึ่ง watchdog จะสั่งรีสตาร์ทบอร์ดให้กลับมาทำงานใหม่เอง ระบบตั้งเวลาไว้ 8 วินาที

```cpp
void initWatchdog() {
  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = (uint32_t)(WATCHDOG_TIMEOUT_S * 1000),
    .idle_core_mask = 0,
    .trigger_panic = true,
  };
  if (esp_task_wdt_init(&twdt_config) != ESP_OK) {
    esp_task_wdt_reconfigure(&twdt_config);
  }
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 520–529](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L520-L529)

เมื่อหมดเวลา watchdog จะทำให้ระบบ panic และรีสตาร์ทบอร์ด watchdog ตัวนี้เฝ้าเฉพาะ task ที่ระบบลงทะเบียนไว้เอง ไม่ได้เฝ้า task พื้นฐานของระบบ นอกจากนี้ ESP32 Arduino core อาจเปิด watchdog ไว้ก่อนแล้วตั้งแต่บูต ถ้าเปิดซ้ำไม่สำเร็จ ระบบจะเปลี่ยนค่าของ watchdog ที่เปิดอยู่ให้เป็นค่าที่ต้องการแทน

หลังสร้าง task ครบ `setup()` จะลงทะเบียน task หลักทุกตัวไว้กับ watchdog

```cpp
esp_task_wdt_add(sensorTaskHandle);
esp_task_wdt_add(networkTaskHandle);
esp_task_wdt_add(lcdTaskHandle);
esp_task_wdt_add(controlTaskHandle);
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 958–961](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L958-L961)

watchdog ติดตามแยกเป็นราย task ทุก task ที่ลงทะเบียนต้องรายงานตัวภายใน 8 วินาที ถ้า task ใดค้าง แม้จะเป็นเพียงตัวเดียวและ task อื่นยังทำงานปกติ บอร์ดก็จะถูกรีสตาร์ท แต่ละ task จึงรายงานตัวที่ต้นลูปทุกรอบ ส่วน NetworkTask รายงานตัวอีกครั้งหลังส่ง HTTP เสร็จ เพราะรอบที่เครือข่ายช้าอาจใช้เวลารอนานหลายวินาที

#### 6.3.2.8 การส่งข้อมูลขึ้นเว็บไซต์ใน NetworkTask

NetworkTask นำค่าจาก Arduino Uno มารวมกับข้อมูลจากเซนเซอร์อื่นเป็น JSON ทุก 250 ms แล้วส่งไปยัง API `POST /api/telemetry` ของเว็บไซต์ ก่อนเริ่มส่ง ระบบเตรียมตัวส่ง HTTP ไว้หนึ่งครั้ง

```cpp
void setupHttpClient() {
  http.end();
  http.begin(httpClient, serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setReuse(true);
  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_READ_TIMEOUT_MS);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 213–220](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L213-L220)

การเปิดการเชื่อมต่อกับเซิร์ฟเวอร์ใหม่ทุกครั้งใช้เวลา ระบบจึงเปิดการเชื่อมต่อไว้ครั้งเดียวแล้วใช้ซ้ำทุกรอบ (keep-alive) และจำกัดเวลารอไว้ คือรอเชื่อมต่อได้ไม่เกิน 1.5 วินาที และรอคำตอบได้ไม่เกิน 3 วินาที เวลารอรวมจึงสั้นกว่า 8 วินาทีของ watchdog แม้เครือข่ายจะช้า บอร์ดก็จะไม่ถูกรีสตาร์ท

ในแต่ละรอบ NetworkTask เริ่มจากการรวบรวมค่า EMG

```cpp
for (;;) {
  vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(SEND_INTERVAL_MS));
  esp_task_wdt_reset();

  if (WiFi.status() != WL_CONNECTED) continue;

  if (consecutiveFailures >= HTTP_MAX_CONSECUTIVE_FAILURES && (int32_t)(xTaskGetTickCount() - retryAfter) < 0) {
    continue;
  }

  char emgArray[400];
  int pos = snprintf(emgArray, sizeof(emgArray), "[");
  int sentBatchSize = 0;
  int sample;
  while (xQueueReceive(emgQueue, &sample, 0) == pdTRUE) {
    pos += snprintf(emgArray + pos, sizeof(emgArray) - pos, "%s%d", sentBatchSize == 0 ? "" : ",", sample);
    sentBatchSize++;
    if (pos >= (int)sizeof(emgArray) - 8) break;
  }
  snprintf(emgArray + pos, sizeof(emgArray) - pos, "]");
  // ...
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 671–690](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L671-L690)

1. NetworkTask ตื่นขึ้นทุก 250 ms โดยนับจากเวลาที่ตื่นครั้งก่อน ไม่ได้นับจากเวลาที่ทำงานเสร็จ รอบที่ใช้เวลาประมวลผลนานจึงไม่ทำให้รอบถัดไปเลื่อนออกไป
2. ก่อนส่งจะตรวจว่าพร้อมส่งหรือไม่ ถ้า Wi-Fi ยังไม่เชื่อมต่อจะข้ามรอบนี้ไป และถ้าส่งไม่สำเร็จติดกันครบ 3 ครั้ง จะพักการส่งไว้ 1 วินาทีก่อนลองใหม่ (backoff)
3. ดึงค่า EMG ที่สะสมอยู่ในคิวออกมาทั้งหมด แล้วเรียงต่อกันเป็นรายการ เช่น `[512,530,498,...]` ที่ 100 Hz ในรอบ 250 ms จะได้ประมาณ 25 ค่า ถ้ารายการยาวจนเกือบเต็มพื้นที่ 400 ตัวอักษรที่เตรียมไว้ จะหยุดดึงก่อน

จากนั้นคัดลอกข้อมูลกลางทั้งหมดออกมา แล้วประกอบเป็นข้อความ JSON

```cpp
SharedState snap;
bool sentButtonA = false, sentButtonB = false;
if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
  snap = shared;
  shared.peakVelocity = shared.velocity;
  sentButtonA = shared.buttonAEventPending;
  sentButtonB = shared.buttonBEventPending;
  shared.buttonAEventPending = false;
  shared.buttonBEventPending = false;
  xSemaphoreGive(stateMutex);
}

char payload[768];
snprintf(payload, sizeof(payload),
         "{\"board\":\"esp32\","
         "\"emg\":{\"raw\":%s},"
         "\"fsr\":{\"force\":%d,\"stability\":%.1f},"
         "\"mpu\":{\"velocity\":%.3f,\"peakVelocity\":%.3f},"
         "\"vitals\":{\"hr\":%d,\"spo2\":%.1f,\"skinTemp\":%.2f,\"deltaTemp\":%.2f},"
         "\"buttons\":{\"a\":%s,\"b\":%s}}",
         emgArray, snap.fsrLatest, snap.fsrStability,
         snap.velocity, snap.peakVelocity,
         snap.beatAvg, snap.spo2Estimate, snap.skinTemp, snap.deltaTemp,
         sentButtonA ? "true" : "false", sentButtonB ? "true" : "false");
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 692–715](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L692-L715)

- NetworkTask ถือกุญแจ `stateMutex` เพียงช่วงสั้น ๆ ที่คัดลอกข้อมูลออกมาเท่านั้น แล้วจึงคืนกุญแจก่อนสร้าง JSON ซึ่งใช้เวลานานกว่า SensorTask จึงไม่ต้องรอกุญแจนาน
- หลังคัดลอก ความเร็วสูงสุดจะถูกตั้งกลับเป็นความเร็วปัจจุบัน เพื่อเริ่มจับค่าสูงสุดของรอบถัดไปใหม่ ค่าที่ส่งจึงเป็นความเร็วสูงสุดของแต่ละช่วง 250 ms
- เครื่องหมายการกดปุ่มจะถูกล้างทันทีหลังคัดลอก เพื่อไม่ให้ส่งเหตุการณ์กดปุ่มเดิมซ้ำในรอบถัดไป
- ข้อความ JSON ถูกสร้างลงในพื้นที่ขนาดคงที่ 768 ไบต์ที่เตรียมไว้ โดยไม่ใช้ไลบรารี JSON ระบบจึงไม่ต้องขอหน่วยความจำเพิ่มระหว่างทำงาน ซึ่งช่วยป้องกันหน่วยความจำไม่พอเมื่อเครื่องเปิดใช้งานนาน ๆ

ตัวอย่าง payload ที่ได้

```json
{"board":"esp32","emg":{"raw":[512,530,498]},"fsr":{"force":1820,"stability":92.5},"mpu":{"velocity":0.215,"peakVelocity":0.340},"vitals":{"hr":88,"spo2":97.5,"skinTemp":33.10,"deltaTemp":0.45},"buttons":{"a":false,"b":false}}
```

สุดท้ายจึงส่งข้อมูลและจัดการผลลัพธ์

```cpp
int code = http.POST(payload);
esp_task_wdt_reset();
// ...
if (code > 0) {
  consecutiveFailures = 0;
  applyServerReply(http.getString());
  // ...
} else {
  if (consecutiveFailures < 255) consecutiveFailures++;
  // ...
  setupHttpClient();

  if (consecutiveFailures >= HTTP_MAX_CONSECUTIVE_FAILURES) {
    retryAfter = xTaskGetTickCount() + pdMS_TO_TICKS(HTTP_BACKOFF_MS);
    // ...
  }

  if (sentButtonA || sentButtonB) {
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      shared.buttonAEventPending |= sentButtonA;
      shared.buttonBEventPending |= sentButtonB;
      xSemaphoreGive(stateMutex);
    }
  }
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 718–751](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L718-L751)

- ถ้าส่งสำเร็จ ตัวนับความผิดพลาดจะกลับเป็น 0 และระบบจะอ่านคำตอบจากเซิร์ฟเวอร์ ซึ่งมีค่า calibration ของ FSR (`fsrZero`, `fsrMax`) และคำสั่งทดสอบ buzzer (`beep`) ที่ผู้ใช้ตั้งไว้จากหน้าเว็บ ช่องทางนี้ทำให้หน้าเว็บส่งคำสั่งกลับมายังอุปกรณ์ได้โดยไม่ต้องเปิดการเชื่อมต่อแยก
- ถ้าส่งไม่สำเร็จ ระบบจะเตรียมตัวส่ง HTTP ใหม่เผื่อการเชื่อมต่อเดิมเสีย และเมื่อผิดพลาดติดกันครบ 3 ครั้งจะพักการส่ง 1 วินาที เพื่อไม่ให้ส่งซ้ำถี่ ๆ ขณะที่เซิร์ฟเวอร์ติดต่อไม่ได้
- ถ้ารอบที่ส่งไม่สำเร็จมีเหตุการณ์กดปุ่มอยู่ด้วย ระบบจะทำเครื่องหมายไว้ใหม่ให้ส่งอีกครั้งในรอบถัดไป ข้อมูลเซนเซอร์ที่หายไปหนึ่งรอบไม่ส่งผลมากนักเพราะรอบถัดไปก็มีค่าใหม่มาแทน แต่การกดปุ่มเปลี่ยนสถานะการฝึก จึงต้องไม่หายไประหว่างที่เครือข่ายมีปัญหา

#### 6.3.2.9 การประหยัดพลังงานด้วย Light Sleep

ControlTask คอยตรวจว่าอุปกรณ์ถูกทิ้งไว้โดยไม่มีการใช้งานนานเท่าใด ถ้าอยู่ในสถานะที่ยังไม่เริ่มฝึก (ยังไม่เริ่มเซตแรก หรือกดปุ่ม B รีเซ็ตแล้ว) และไม่มีการกดปุ่มเลยนานครบ 5 นาที ระบบจะพาอุปกรณ์เข้าสู่ Light Sleep

```cpp
void enterLightSleepUntilWake() {
  // ...
  WiFi.disconnect(true);

  esp_task_wdt_delete(sensorTaskHandle);
  esp_task_wdt_delete(networkTaskHandle);
  esp_task_wdt_delete(lcdTaskHandle);
  esp_task_wdt_delete(controlTaskHandle);
  esp_task_wdt_deinit();

  if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_EXT0) {
    esp_sleep_enable_ext0_wakeup((gpio_num_t)BUTTON_A_PIN, 0  );
  }
  if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_TIMER) {
    esp_sleep_enable_timer_wakeup(IDLE_WAKE_KEEPALIVE_US);
  }

  esp_light_sleep_start();

  // ...
  initWatchdog();
  esp_task_wdt_add(sensorTaskHandle);
  esp_task_wdt_add(networkTaskHandle);
  esp_task_wdt_add(lcdTaskHandle);
  esp_task_wdt_add(controlTaskHandle);

  connectWiFi();
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 531–569](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L531-L569)

1. จอ LCD ขึ้นข้อความ `SLEEPING...` ให้ผู้ใช้รู้ว่าเครื่องกำลังจะพัก แล้วระบบตัดการเชื่อมต่อ Wi-Fi ซึ่งเป็นส่วนที่กินไฟมาก
2. ระบบปิด watchdog ก่อน เพราะระหว่างที่ CPU หลับ ไม่มี task ใดรายงานตัวกับ watchdog ได้ ถ้าไม่ปิดไว้ watchdog จะเข้าใจว่า task ค้างและรีสตาร์ทบอร์ดทันทีที่ตื่น
3. ระบบตั้งเหตุการณ์ที่จะปลุกเครื่องไว้ 2 แบบ แบบแรกคือการกดปุ่ม A ส่วนแบบที่สองคือ timer ที่ปลุกเครื่องเมื่อหลับครบ 5 วินาที
4. จากนั้น CPU จะหยุดทำงานจนกว่าจะถูกปลุก ระหว่างนี้ข้อมูลในหน่วยความจำยังอยู่ครบ เมื่อตื่นขึ้นมา โปรแกรมจึงทำงานต่อจากจุดเดิมได้ทันทีโดยไม่ต้องบูตใหม่
5. หลังตื่น ระบบเปิด watchdog และลงทะเบียน task ใหม่ แล้วเชื่อมต่อ Wi-Fi อีกครั้ง จากนั้นจึงเริ่มนับเวลาไม่มีการใช้งานใหม่ ต้องไม่มีการใช้งานอีก 5 นาทีจึงจะเข้า sleep รอบถัดไป

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 3 เป็นรูปประกอบหัวข้อนี้

## 6.4 เว็บและเซิร์ฟเวอร์: รับ telemetry, กระจาย SSE, เริ่ม/หยุดบันทึก, ส่งต่อ FastAPI และเก็บ MongoDB

Frontend route `POST /api/telemetry` รับ JSON จาก ESP32 แล้วเรียก `serverTelemetry.ingestFullTelemetry()` ส่วน `GET /api/telemetry/stream` ส่ง initial state และ event แบบ `telemetry` หรือ `button` ผ่าน SSE ให้ browser

`telemetryStore` เก็บ raw buffer และสถานะล่าสุด คำนวณ EMG/FSR ที่ใช้แสดงผล และเรียก `forwardToBackend()` เพื่อส่งข้อมูลไป FastAPI ด้วย service token ฝั่ง backend มี `POST /v1/telemetry` สำหรับ machine-to-machine และ `GET /v1/telemetry` สำหรับ history ของผู้ใช้ที่ login แล้ว

การเริ่ม/หยุดบันทึกใช้ `POST /api/recording` โดย frontend ตรวจสอบผู้ใช้ผ่าน FastAPI client และมี recording slot เดียวต่อ hardware rig ส่วน calibration proxy เรียก `GET/POST /v1/calibration` แล้ว mirror ค่ากลับเข้า in-memory store

FastAPI สร้าง index ตอนเริ่มแอปและใช้ Motor เชื่อม MongoDB การสร้าง session result เขียนลง `session_results` ขณะที่ telemetry เขียนลง `telemetry_samples`

## 6.5 เส้นทางข้อมูลแบบครบวงจรและตัวอย่างโค้ดสำคัญ

เส้นทางข้อมูลหนึ่งรอบเริ่มจาก `ISR(TIMER1_COMPA_vect)` ของ Uno ตั้ง flag → ADC interrupt อ่าน A0/A1 → `Serial.print()` ส่งข้อความ → ESP32 `pollUnoLink()` parse บรรทัด → `SensorTask` อัปเดต `SharedState` → `NetworkTask` สร้าง JSON → `http.POST(payload)` → frontend `ingestFullTelemetry()` → SSE และ `forwardToBackend()` → FastAPI insert MongoDB

ตัวอย่างจุดสำคัญที่ควรนำไปแสดงในรายงานฉบับเต็ม:

- การตั้ง Timer1 และ ADC ISR ใน `uno_emg_fsr_link.ino`
- การ parse `emg,fsr` และการอ่าน I2C ใน `esp32_workout_firmware.ino`
- การสร้าง telemetry payload ใน NetworkTask
- การ broadcast event ใน `frontend/src/routes/api/telemetry/stream/+server.ts`
- การ insert ใน `backend/app/routers/telemetry.py`

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 1 เป็นรูปสรุปเส้นทางข้อมูล และ Flowchart 2-3 เป็นรายละเอียดฝั่งไมโครคอนโทรลเลอร์

แหล่งข้อมูล: โครงสร้างไฟล์ใน `backend/`, `frontend/` และ `test-sensor/arduino/`, `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino`, `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino`, `test-sensor/arduino/esp32_workout_firmware/board_config.h`, `PINS.md`, `TROUBLESHOOTING.md`, `frontend/src/routes/api/telemetry/`, `frontend/src/routes/api/recording/+server.ts`, `frontend/src/routes/api/calibration/+server.ts`, `frontend/src/lib/server/telemetryStore.ts`, `backend/app/`, `README.md`
