"""เปรียบเทียบ session ล่าสุดกับก่อนหน้าของผู้ป่วยคนเดียวกัน

เกณฑ์ "ดีขึ้น" แบ่งเป็น 2 กลุ่มโดยเจตนา แทนที่จะฟันธงคะแนนเดียวรวมทุกตัวชี้วัด:
- กลุ่มสมรรถภาพกล้ามเนื้อ (force / emg / duration): ตัดสิน "improved" / "declined" ได้ตรงไปตรงมา
- กลุ่มสัญญาณชีพ (heart rate / spo2 / skin temp): แสดง delta ไว้อ้างอิงเท่านั้น ("info_only")
  เพราะทิศทางที่ "ดี" ขึ้นกับบริบททางคลินิกที่ระบบนี้ไม่มีข้อมูลพอจะตัดสินแทนผู้เชี่ยวชาญ
"""

from app.services.session_service import list_sessions_for_patient

# metric -> (label, higher_is_better)
PERFORMANCE_METRICS = {
    "max_force_newton": ("แรงกดสูงสุด (N)", True),
    "avg_emg_rms": ("EMG RMS เฉลี่ย", True),
    "duration_seconds": ("ระยะเวลาที่ทำได้ (วินาที)", True),
}

INFO_ONLY_METRICS = {
    "avg_heart_rate": "อัตราการเต้นหัวใจเฉลี่ย (bpm)",
    "avg_spo2": "SpO2 เฉลี่ย (%)",
    "max_skin_temp_c": "อุณหภูมิผิวหนังสูงสุด (°C)",
}


def _direction(delta: float) -> str:
    if delta > 0:
        return "up"
    if delta < 0:
        return "down"
    return "flat"


def _build_metric_row(metric: str, label: str, current: dict, previous: dict, higher_is_better: bool | None) -> dict | None:
    cur_val = current.get(metric)
    prev_val = previous.get(metric)
    if cur_val is None or prev_val is None:
        return None

    delta = cur_val - prev_val
    pct_change = (delta / prev_val * 100) if prev_val else None
    direction = _direction(delta)

    if higher_is_better is None:
        verdict = "info_only"
    elif direction == "flat":
        verdict = "no_change"
    elif (direction == "up") == higher_is_better:
        verdict = "improved"
    else:
        verdict = "declined"

    return {
        "metric": metric,
        "label": label,
        "current": cur_val,
        "previous": prev_val,
        "delta": round(delta, 2),
        "pct_change": round(pct_change, 1) if pct_change is not None else None,
        "direction": direction,
        "verdict": verdict,
    }


def compare_latest_sessions(patient_id: str) -> dict:
    sessions = list_sessions_for_patient(patient_id)
    completed = [s for s in sessions if s.get("status") == "completed" and s.get("summary_metrics")]

    if len(completed) < 2:
        return {
            "patient_id": patient_id,
            "has_enough_data": False,
            "message": "ยังไม่มีข้อมูลเพียงพอเปรียบเทียบ (ต้องมีอย่างน้อย 2 session ที่เสร็จสมบูรณ์)",
            "session_count": len(completed),
        }

    latest, previous = completed[0], completed[1]
    cur_metrics = latest["summary_metrics"]
    prev_metrics = previous["summary_metrics"]

    comparison_rows = []
    for metric, (label, higher_is_better) in PERFORMANCE_METRICS.items():
        row = _build_metric_row(metric, label, cur_metrics, prev_metrics, higher_is_better)
        if row:
            comparison_rows.append(row)

    for metric, label in INFO_ONLY_METRICS.items():
        row = _build_metric_row(metric, label, cur_metrics, prev_metrics, None)
        if row:
            comparison_rows.append(row)

    improved_count = sum(1 for r in comparison_rows if r["verdict"] == "improved")
    declined_count = sum(1 for r in comparison_rows if r["verdict"] == "declined")
    total_scored = sum(1 for r in comparison_rows if r["verdict"] in ("improved", "declined", "no_change"))

    if total_scored == 0:
        summary_text = "ไม่มีตัวชี้วัดด้านสมรรถภาพกล้ามเนื้อให้เปรียบเทียบ"
    else:
        summary_text = f"ดีขึ้น {improved_count} จาก {total_scored} ตัวชี้วัดด้านสมรรถภาพกล้ามเนื้อ"

    return {
        "patient_id": patient_id,
        "has_enough_data": True,
        "latest": {
            "session_id": latest["session_id"],
            "session_name": latest["session_name"],
            "started_at": latest["started_at"],
            "summary_metrics": cur_metrics,
        },
        "previous": {
            "session_id": previous["session_id"],
            "session_name": previous["session_name"],
            "started_at": previous["started_at"],
            "summary_metrics": prev_metrics,
        },
        "comparison": comparison_rows,
        "overall": {
            "improved_count": improved_count,
            "declined_count": declined_count,
            "total_scored": total_scored,
            "summary_text": summary_text,
        },
    }
