from pydantic import BaseModel, ConfigDict


class EmgState(BaseModel):
    model_config = ConfigDict(extra="allow")

    raw: float | None = None
    rawBuffer: list[float] | None = None
    rms: float | None = None
    peak: float | None = None
    mvcPercent: float | None = None
    isHighTension: bool | None = None
    timestamp: int | None = None


class FsrState(BaseModel):
    model_config = ConfigDict(extra="allow")

    gripForce: float | None = None
    gripStability: float | None = None
    isStable: bool | None = None


class MpuState(BaseModel):
    model_config = ConfigDict(extra="allow")

    pitch: float | None = None
    roll: float | None = None
    velocity: float | None = None
    ax: float | None = None
    ay: float | None = None
    az: float | None = None


class VitalsState(BaseModel):
    model_config = ConfigDict(extra="allow")

    hr: float | None = None
    spo2: float | None = None
    skinTemp: float | None = None
    deltaTemp: float | None = None


class DeviceState(BaseModel):
    model_config = ConfigDict(extra="allow")

    board: str | None = None
    connected: bool | None = None
    lastSeen: int | None = None
    packetCount: int | None = None
    rateHz: int | None = None


class TelemetryIngest(BaseModel):
    model_config = ConfigDict(extra="allow")

    emg: EmgState | None = None
    fsr: FsrState | None = None
    mpu: MpuState | None = None
    vitals: VitalsState | None = None
    device: DeviceState | None = None
    timestamp: int | None = None
    user_id: str | None = None
    session_id: str | None = None
