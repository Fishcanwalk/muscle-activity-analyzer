// Finds an MLX90614 whose SMBus address is no longer the factory 0x5A and writes 0x5A
// back into its EEPROM, so esp32_workout_firmware (mlx.begin(0x5A)) finds it again.
//
// Every MLX90614 also answers address 0x00 whatever its programmed address is, which is
// how an I2C scan can show 0x00 plus some odd address (e.g. 0x02) but no 0x5A.
//
// A sensor left in PWM or sleep mode doesn't talk SMBus at all; holding SCL low for
// more than 1.44 ms (the datasheet's "SMBus request") switches it back until power-off,
// so that is done before Wire starts.
//
// Usage: upload, open Serial Monitor at 115200, read the report, then send "y" to
// rewrite the address. Unplug and replug the sensor's power afterwards: the new address
// only takes effect after a power cycle.
#include <Arduino.h>
#include <Wire.h>
#include "board_config.h"

const uint8_t FACTORY_ADDR = 0x5A;
const uint8_t UNIVERSAL_ADDR = 0x00;
const uint8_t RAM_TOBJ1 = 0x07;
const uint8_t EEPROM_SMBUS_ADDR = 0x2E;

uint8_t crc8(const uint8_t *data, int len) {
  uint8_t crc = 0;
  for (int i = 0; i < len; i++) {
    crc ^= data[i];
    for (int b = 0; b < 8; b++) crc = (crc & 0x80) ? (crc << 1) ^ 0x07 : crc << 1;
  }
  return crc;
}

bool readWord(uint8_t addr, uint8_t cmd, uint16_t &value) {
  Wire.beginTransmission(addr);
  Wire.write(cmd);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(addr, (uint8_t)3) != 3) return false;
  uint8_t lo = Wire.read(), hi = Wire.read(), pec = Wire.read();
  uint8_t frame[5] = { (uint8_t)(addr << 1), cmd, (uint8_t)((addr << 1) | 1), lo, hi };
  if (crc8(frame, 5) != pec) return false;
  value = (uint16_t)hi << 8 | lo;
  return true;
}

bool writeWord(uint8_t addr, uint8_t cmd, uint16_t value) {
  uint8_t lo = value & 0xFF, hi = value >> 8;
  uint8_t frame[4] = { (uint8_t)(addr << 1), cmd, lo, hi };
  Wire.beginTransmission(addr);
  Wire.write(cmd);
  Wire.write(lo);
  Wire.write(hi);
  Wire.write(crc8(frame, 4));
  bool ok = Wire.endTransmission() == 0;
  delay(10);  // EEPROM write time
  return ok;
}

// Same read as readWord(), but prints every step so a failure can be located.
void probe(uint8_t addr) {
  Wire.beginTransmission(addr);
  Wire.write(RAM_TOBJ1);
  uint8_t err = Wire.endTransmission(false);
  size_t n = err == 0 ? Wire.requestFrom(addr, (uint8_t)3) : 0;
  uint8_t b[3] = { 0, 0, 0 };
  for (size_t i = 0; i < n && i < 3; i++) b[i] = Wire.read();
  uint8_t frame[5] = { (uint8_t)(addr << 1), RAM_TOBJ1, (uint8_t)((addr << 1) | 1), b[0], b[1] };
  Serial.printf("  probe 0x%02X: write err=%u (0=ACK 2=NACK addr 3=NACK data 5=timeout) | got %u bytes", addr, err, (unsigned)n);
  if (n == 3) {
    uint16_t raw = (uint16_t)b[1] << 8 | b[0];
    Serial.printf(" = %02X %02X pec %02X (expected %02X) -> %.2f C", b[0], b[1], b[2], crc8(frame, 5),
                  raw * 0.02f - 273.15f);
  }
  Serial.println();
}

void smbusRequest() {
  pinMode(I2C_SCL_PIN, OUTPUT);
  digitalWrite(I2C_SCL_PIN, LOW);
  delay(3);
  pinMode(I2C_SCL_PIN, INPUT_PULLUP);
  delay(1);
}

void printTemp(uint8_t addr) {
  uint16_t raw;
  if (readWord(addr, RAM_TOBJ1, raw) && raw != 0) {
    Serial.printf("  0x%02X -> object temp %.2f C\n", addr, raw * 0.02f - 273.15f);
  } else {
    Serial.printf("  0x%02X -> no valid reply\n", addr);
  }
}

uint8_t programmedAddr = 0;

void report() {
  Serial.println("\n=== MLX90614 address check ===");
  Serial.println("Raw probes:");
  probe(FACTORY_ADDR);
  probe(UNIVERSAL_ADDR);
  probe(0x02);
  Serial.println("With PEC check:");
  printTemp(FACTORY_ADDR);
  printTemp(UNIVERSAL_ADDR);

  uint16_t reg;
  if (!readWord(UNIVERSAL_ADDR, EEPROM_SMBUS_ADDR, reg)) {
    Serial.println("Could not read the address from EEPROM via 0x00 -- check the sensor's wiring.");
    return;
  }
  programmedAddr = reg & 0xFF;
  Serial.printf("EEPROM address register = 0x%04X -> programmed address 0x%02X\n", reg, programmedAddr);
  printTemp(programmedAddr);

  if (programmedAddr == FACTORY_ADDR) {
    Serial.println("Address is already 0x5A. If the firmware still can't read it, power-cycle the sensor.");
  } else {
    Serial.println("Send 'y' to write 0x5A back to EEPROM.");
  }
}

void fixAddress() {
  uint16_t reg;
  if (!readWord(UNIVERSAL_ADDR, EEPROM_SMBUS_ADDR, reg)) {
    Serial.println("Read failed, nothing written.");
    return;
  }
  uint16_t target = (reg & 0xFF00) | FACTORY_ADDR;
  Serial.printf("Writing 0x%04X (was 0x%04X)...\n", target, reg);
  // EEPROM cells must be erased (written 0) before a new value is written.
  bool erased = writeWord(UNIVERSAL_ADDR, EEPROM_SMBUS_ADDR, 0x0000);
  bool written = writeWord(UNIVERSAL_ADDR, EEPROM_SMBUS_ADDR, target);
  uint16_t check;
  if (erased && written && readWord(UNIVERSAL_ADDR, EEPROM_SMBUS_ADDR, check) && check == target) {
    Serial.println("Done. Unplug the sensor's power (or the whole board) and plug it back in,");
    Serial.println("then run 01_i2c_scanner: it should show 0x5A.");
  } else {
    Serial.println("Write did not verify. Check wiring and try again.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  smbusRequest();
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);  // MLX90614 SMBus maximum
  report();
}

void loop() {
  // The report from setup() is gone if the Serial Monitor was opened after boot.
  static unsigned long lastHintMs = 0;
  if (millis() - lastHintMs >= 5000) {
    lastHintMs = millis();
    Serial.println("Send 'r' to run the check again, 'y' to write 0x5A.");
  }

  if (!Serial.available()) return;
  char c = Serial.read();
  if (c == 'r') report();
  if (c == 'y' && programmedAddr != FACTORY_ADDR) {
    fixAddress();
    report();
  }
}
