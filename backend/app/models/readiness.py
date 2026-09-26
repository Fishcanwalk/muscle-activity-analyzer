from pydantic import BaseModel, Field


class GripTestCreate(BaseModel):
    # Peak FSR reading above that session's "no grip" point, in raw ADC counts. Raw
    # counts rather than % of the session's calibrated max squeeze, so tests from
    # different sessions (each with its own calibration) compare on the same scale.
    peakSpanAdc: float = Field(gt=0)


class GripTestResult(BaseModel):
    peakSpanAdc: float
    # Median of the user's previous tests; None on their first one.
    baselineSpanAdc: float | None = None
    # Today's peak as % of that baseline; None until there's a baseline.
    readinessPercent: int | None = None
    previousTests: int
