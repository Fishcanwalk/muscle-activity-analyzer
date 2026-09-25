# Flowchart สำหรับรายงาน

ไฟล์นี้อธิบายการทำงานจาก source code ในสองโฟลเดอร์ต่อไปนี้:

- `test-sensor/arduino/uno_emg_fsr_link/`
- `test-sensor/arduino/esp32_workout_firmware/`

Mermaid ทุกชุดตั้งใจออกแบบเป็นแนวตั้ง อ่านจากบนลงล่าง ใช้พื้นหลังสีขาว เส้นสีดำ และรูปแบบ node เรียบง่าย เพื่อให้แคปภาพไปใส่ในรายงานได้ง่าย โดยไม่ฝังรูปภาพลงในเอกสาร Word

## Flowchart 1: ภาพรวมการส่งข้อมูลจาก Uno ไป Backend

ตำแหน่งแนะนำในรายงาน: ข้อ 3.2 และ 7.5

```mermaid
%%{init: {"theme":"base", "themeVariables": {"background":"#ffffff", "primaryColor":"#ffffff", "primaryTextColor":"#000000", "primaryBorderColor":"#222222", "lineColor":"#222222", "secondaryColor":"#ffffff", "tertiaryColor":"#ffffff", "fontFamily":"Arial"}}}%%
flowchart TD
    Start([เริ่มระบบ])
    Uno[Arduino Uno]
    ReadAnalog[/อ่าน sEMG และ FSR<br/>ด้วย ADC ที่ A0 และ A1/]
    Scale[กลับด้านค่า FSR<br/>และแปลง 10-bit เป็น 12-bit]
    UART[/ส่งข้อมูล emg,fsr<br/>ผ่าน UART 9600 baud/]
    ESP[ESP32]
    ReadI2C[/อ่าน MPU6050 หรือ MPU6500<br/>MAX30102 และ MLX90614 ผ่าน I2C/]
    Inputs[รับสถานะปุ่ม A/B<br/>และควบคุม LCD กับ buzzer]
    Telemetry[รวมข้อมูลและสร้าง<br/>JSON]
    HTTP[/HTTP POST ทุก 250 ms<br/>ไปยัง API/]
    Web[Frontend SvelteKit<br/>รับค่าจาก API และส่ง SSE ไปหน้า Dashboard]
    Backend[Backend FastAPI<br/>ตรวจสอบและบันทึกข้อมูล]
    Mongo[(MongoDB)]
    Browser([Browser Dashboard])

    Start --> Uno
    Uno --> ReadAnalog
    ReadAnalog --> Scale
    Scale --> UART
    UART --> ESP
    ESP --> ReadI2C
    ESP --> Inputs
    ReadI2C --> Telemetry
    Inputs --> Telemetry
    ESP --> Telemetry
    Telemetry --> HTTP
    HTTP --> Web
    Web --> Backend
    Backend --> Mongo
    Web -->|SSE| Browser

    classDef base fill:#ffffff,stroke:#222222,stroke-width:1.5px,color:#000000;
    classDef startend fill:#ffffff,stroke:#222222,stroke-width:2px,color:#000000;
    classDef io fill:#ffffff,stroke:#222222,stroke-width:1.5px,color:#000000;
    class Start,Browser startend;
    class ReadAnalog,UART,ReadI2C,HTTP io;
    class Uno,Scale,ESP,Inputs,Telemetry,Web,Backend,Mongo base;
```

## Flowchart 2: Uno Timer, Interrupt, ADC และ UART

ตำแหน่งแนะนำในรายงาน: ข้อ 7.2

```mermaid
%%{init: {"theme":"base", "themeVariables": {"background":"#ffffff", "primaryColor":"#ffffff", "primaryTextColor":"#000000", "primaryBorderColor":"#222222", "lineColor":"#222222", "secondaryColor":"#ffffff", "tertiaryColor":"#ffffff", "fontFamily":"Arial"}}}%%
flowchart TD
    Start([เริ่มต้น])
    Setup[ตั้งค่า Timer1, ADC, UART<br/>และ watchdog 2 วินาที]
    Idle[/CPU หลับแบบ SLEEP_MODE_IDLE<br/>ระหว่างรอ interrupt/]
    TimerISR[Timer1 Compare Match ISR<br/>ทุก 10 ms ตั้ง FLAG_TIMER_TICK]
    StartEMG[เริ่ม ADC ช่อง A0<br/>สำหรับ sEMG]
    ADCEMG[ADC Complete ISR<br/>เก็บค่า EMG และเริ่มอ่าน A1]
    StartFSR[เริ่ม ADC ช่อง A1<br/>สำหรับ FSR]
    ADCFSR[ADC Complete ISR<br/>เก็บค่า FSR และตั้ง FLAG_FSR_READY]
    Ready{อ่าน ADC ครบ<br/>ทั้ง EMG และ FSR แล้วหรือยัง?}
    Wait[/ยังไม่ครบ: กลับไป sleep<br/>รอ ADC interrupt/]
    Scale[กลับด้าน FSR<br/>และ scale 10-bit เป็น 12-bit]
    UART[/Serial ส่ง emg,fsr<br/>ที่ 9600 baud/]
    Feed[wdt_reset<br/>จบรอบการอ่าน]

    Start --> Setup
    Setup --> Idle
    Idle --> TimerISR
    TimerISR --> StartEMG
    StartEMG --> ADCEMG
    ADCEMG --> StartFSR
    StartFSR --> ADCFSR
    ADCFSR --> Ready
    Ready -->|ยังไม่ครบ| Wait
    Wait --> Idle
    Ready -->|ครบแล้ว| Scale
    Scale --> UART
    UART --> Feed
    Feed --> Idle

    classDef base fill:#ffffff,stroke:#222222,stroke-width:1.5px,color:#000000;
    classDef startend fill:#ffffff,stroke:#222222,stroke-width:2px,color:#000000;
    classDef io fill:#ffffff,stroke:#222222,stroke-width:1.5px,color:#000000;
    classDef decision fill:#ffffff,stroke:#222222,stroke-width:1.5px,color:#000000;
    class Start startend;
    class Idle,Wait,UART io;
    class Ready decision;
    class Setup,TimerISR,StartEMG,ADCEMG,StartFSR,ADCFSR,Scale,Feed base;
```

## Flowchart 3: ESP32 Task, I2C, UART, Interrupt และ API

ตำแหน่งแนะนำในรายงาน: ข้อ 7.3

```mermaid
%%{init: {"theme":"base", "themeVariables": {"background":"#ffffff", "primaryColor":"#ffffff", "primaryTextColor":"#000000", "primaryBorderColor":"#222222", "lineColor":"#222222", "secondaryColor":"#ffffff", "tertiaryColor":"#ffffff", "fontFamily":"Arial"}}}%%
flowchart TD
    Start([เริ่มต้น ESP32])
    Init[ตั้งค่า Serial2, I2C, LCD<br/>Wi-Fi ปุ่ม และ watchdog]
    Tasks[สร้าง 4 FreeRTOS tasks<br/>SensorTask, NetworkTask,<br/>LcdTask และ ControlTask]
    Timer[Hardware timer<br/>ปลุก SensorTask ทุก 10 ms]
    Sensor[SensorTask<br/>อ่านข้อมูลตามรอบเวลา]
    UART[อ่าน emg,fsr<br/>จาก Uno ผ่าน UART]
    I2C[อ่าน MPU, MAX30102<br/>และ MLX90614 ผ่าน I2C]
    State[อัปเดต SharedState<br/>และส่ง EMG เข้า queue]
    Network[NetworkTask<br/>ทำงานทุก 250 ms]
    JSON[สร้าง JSON telemetry<br/>จากข้อมูลล่าสุด]
    POST[/HTTPClient.POST<br/>ไปยัง telemetry API/]
    ButtonISR[GPIO button ISR<br/>ตรวจ A/B และ debounce]
    ButtonQueue[buttonEventQueue]
    Control[ControlTask<br/>อัปเดตสถานะการฝึกและ buzzer]
    LCD[LcdTask<br/>อ่าน SharedState และแสดงผล LCD]
    Watchdog[รีเซ็ต watchdog<br/>ของ task ที่ทำงานปกติ]
    Idle{ไม่มีการใช้งาน<br/>ต่อเนื่อง 5 นาทีหรือไม่?}
    Sleep[เข้าสู่ light sleep]
    Wake[ปลุกด้วย Button A<br/>หรือ timer keepalive]

    Start --> Init
    Init --> Tasks
    Tasks --> Timer
    Timer --> Sensor
    Sensor --> UART
    Sensor --> I2C
    UART --> State
    I2C --> State
    State --> Network
    Network --> JSON
    JSON --> POST
    POST --> Timer

    ButtonISR --> ButtonQueue
    ButtonQueue --> Control
    Control --> State
    State --> LCD
    Control --> LCD
    Sensor --> Watchdog
    Network --> Watchdog
    LCD --> Watchdog
    Control --> Watchdog
    Watchdog --> Idle
    Idle -->|ไม่ใช่| Timer
    Idle -->|ใช่| Sleep
    Sleep --> Wake
    Wake --> Init

    classDef base fill:#ffffff,stroke:#222222,stroke-width:1.5px,color:#000000;
    classDef startend fill:#ffffff,stroke:#222222,stroke-width:2px,color:#000000;
    classDef io fill:#ffffff,stroke:#222222,stroke-width:1.5px,color:#000000;
    classDef decision fill:#ffffff,stroke:#222222,stroke-width:1.5px,color:#000000;
    class Start startend;
    class POST io;
    class Idle decision;
    class Init,Tasks,Timer,Sensor,UART,I2C,State,Network,JSON,ButtonISR,ButtonQueue,Control,LCD,Watchdog,Sleep,Wake base;
```

## หมายเหตุสำหรับการแคปภาพ

1. เปิดไฟล์นี้ใน editor ที่รองรับ Mermaid หรือ Mermaid Live Editor
2. Render Flowchart 1, 2 และ 3 แยกกัน
3. ตรวจให้พื้นหลังเป็นสีขาวและอ่านข้อความได้ครบก่อน export
4. Export เป็น PNG หรือ SVG
5. นำภาพไปวางตามตำแหน่งที่ระบุในรายงาน
