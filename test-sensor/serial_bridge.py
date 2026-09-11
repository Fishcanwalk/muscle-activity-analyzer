#!/usr/bin/env python3
"""
Hardware Serial Bridge & Telemetry Ingestion Client
Reads real sEMG and sensor telemetry from Microcontroller (ESP32, ESP8266, Arduino Uno)
over USB Serial and streams data in real-time to the Cyberpump API endpoints.

Usage:
  # With physical hardware connected:
  python3 test-sensor/serial_bridge.py --port /dev/ttyACM0 --baud 115200

  # Test / Simulated hardware mode (No physical USB needed):
  python3 test-sensor/serial_bridge.py --mock --rate 50
"""

import sys
import time
import json
import re
import argparse
import urllib.request
import urllib.error
import math
import random

API_EMG_URL = "http://localhost:5174/api/emg"
API_TELEMETRY_URL = "http://localhost:5174/api/telemetry"

def post_json(url, data):
    try:
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception as e:
        return False

def parse_serial_line(line):
    """
    Parses output from test-sensor scripts:
    Format A: Raw:120, RMS:180.5, PeakToPeak:240, Volt:0.85V
    Format B: JSON {"emg": ..., "fsr": ...}
    Format C: Plain numbers
    """
    line = line.strip()
    if not line:
        return None

    # Try JSON
    if line.startswith("{") and line.endswith("}"):
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            pass

    # Try Key-Value regex (Raw:%d, RMS:%.1f, PeakToPeak:%d, Volt:%.2fV)
    match = re.search(r"Raw:(\d+).*?RMS:([\d.]+).*?PeakToPeak:(\d+)", line)
    if match:
        raw = int(match.group(1))
        rms = float(match.group(2))
        p2p = int(match.group(3))
        return {
            "board": "arduino_uno",
            "emg": {
                "raw": raw,
                "rms": rms,
                "peak": p2p,
                "mvcPercent": min(100, int((rms / 550.0) * 100))
            }
        }

    return None

def run_mock(rate_hz=50):
    print(f"[*] Starting MOCK Hardware Stream at {rate_hz} Hz -> {API_EMG_URL}")
    print("[*] Simulating muscle contraction cycles (Rest -> Peak Contraction -> Rest)...")
    
    interval = 1.0 / rate_hz
    t = 0.0
    packet_count = 0
    success_count = 0

    try:
        while True:
            t += interval
            # Simulate 3-second rep cycle
            cycle = (math.sin(t * 1.8) + 1) / 2.0
            raw_noise = (random.random() - 0.5) * 30.0
            
            # EMG: 25µV at rest, up to 480µV at peak contraction
            rms = 25.0 + cycle * 440.0 + (random.random() - 0.5) * 20.0
            raw = int(rms * math.sin(t * 60.0) + raw_noise)
            mvc = min(100, int((rms / 550.0) * 100))

            packet = {
                "raw": raw,
                "rms": round(rms, 1),
                "peak": int(rms * 1.25),
                "mvcPercent": mvc,
                "board": "esp32_mock_serial",
                "timestamp": int(time.time() * 1000)
            }

            if post_json(API_EMG_URL, packet):
                success_count += 1
            packet_count += 1

            if packet_count % rate_hz == 0:
                print(f"  [STREAM] Packets: {packet_count} | RMS: {rms:.1f} µV | MVC: {mvc}% | Sent OK: {success_count}")

            time.sleep(interval)
    except KeyboardInterrupt:
        print(f"\n[*] Stopped. Total packets sent: {packet_count}")

def run_serial(port, baud):
    try:
        import serial
    except ImportError:
        print("[!] Error: 'pyserial' not installed. Please run: pip install pyserial")
        sys.exit(1)

    print(f"[*] Connecting to {port} @ {baud} baud...")
    try:
        ser = serial.Serial(port, baud, timeout=1)
        time.sleep(2)
        print(f"[*] Connected to {port}! Reading serial data...")

        while True:
            line = ser.readline().decode("utf-8", errors="ignore")
            parsed = parse_serial_line(line)
            if parsed:
                if "emg" in parsed:
                    post_json(API_EMG_URL, parsed["emg"])
                else:
                    post_json(API_TELEMETRY_URL, parsed)
    except Exception as e:
        print(f"[!] Serial error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cyberpump Hardware Serial Bridge")
    parser.add_argument("--port", default="/dev/ttyACM0", help="Serial port (e.g. /dev/ttyACM0, /dev/ttyUSB0, COM3)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--mock", action="store_true", help="Run simulated hardware stream without physical board")
    parser.add_argument("--rate", type=int, default=50, help="Mock stream rate in Hz (default: 50)")

    args = parser.parse_args()

    if args.mock:
        run_mock(args.rate)
    else:
        run_serial(args.port, args.baud)
