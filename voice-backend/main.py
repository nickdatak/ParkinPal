"""
ParkinPal Voice Analysis Backend
FastAPI + Whisper (word boundaries) + Parselmouth (acoustic analysis)
"""

import base64
import tempfile
from pathlib import Path

import numpy as np
import parselmouth
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Whisper model - faster-whisper uses CTranslate2, fits in 512MB on Render free tier (openai-whisper used 512MB+)
_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _whisper_model


app = FastAPI(title="ParkinPal Voice Analysis")


@app.on_event("startup")
async def load_whisper_at_startup():
    """Pre-load Whisper at startup. faster-whisper tiny+int8 fits in 512MB (Render free tier limit)."""
    global _whisper_model
    from faster_whisper import WhisperModel
    _whisper_model = WhisperModel("tiny", device="cpu", compute_type="int8")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

TARGET_PHRASE_WORDS = ["the", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog"]


class AnalyzeRequest(BaseModel):
    audio: str  # base64-encoded WAV


def decode_audio(base64_audio: str) -> Path:
    """Decode base64 to WAV file and return path."""
    try:
        audio_bytes = base64.b64decode(base64_audio)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {e}")

    if len(audio_bytes) < 44:  # WAV header is 44 bytes
        raise HTTPException(status_code=400, detail="Audio data too short")

    # Validate WAV header
    if audio_bytes[:4] != b"RIFF" or audio_bytes[8:12] != b"WAVE":
        raise HTTPException(status_code=400, detail="Invalid WAV format")

    fd, path = tempfile.mkstemp(suffix=".wav")
    try:
        with open(fd, "wb") as f:
            f.write(audio_bytes)
        return Path(path)
    except Exception:
        Path(path).unlink(missing_ok=True)
        raise


def words_from_faster_whisper(segments, duration: float) -> list[dict]:
    """Extract word-level boundaries from faster-whisper segments."""
    words = []
    for segment in segments:
        for w in (segment.words or []):
            word = (w.word or "").strip().lower().rstrip(".,!?;:")
            if word:
                words.append({"word": word, "start": float(w.start), "end": float(w.end)})
    if not words:
        for segment in segments:
            text = (segment.text or "").strip().lower().split()
            s_start, s_end = float(segment.start), float(segment.end)
            if not text:
                continue
            step = (s_end - s_start) / len(text)
            for i, part in enumerate(text):
                w = part.rstrip(".,!?;:")
                if w:
                    words.append({
                        "word": w,
                        "start": s_start + i * step,
                        "end": s_start + (i + 1) * step,
                    })
    return words


def analyze_vot(sound: parselmouth.Sound, words: list[dict]) -> dict:
    """Voice Onset Time for /k/ in quick, /b/ in brown, /p/ in jumps."""
    vot_results = {}
    targets = {"quick", "brown", "jumps"}

    pitch = sound.to_pitch(time_step=0.01)
    intensity = sound.to_intensity(50)

    for word_info in words:
        w = word_info["word"]
        if w not in targets:
            continue
        start, end = word_info["start"], word_info["end"]
        duration = end - start
        if duration < 0.05:
            continue

        # Search window: first 40% of word for plosive
        search_end = start + min(0.15, duration * 0.4)

        # Find burst: peak in intensity in first part
        step = 0.005
        burst_time = start
        max_int = -100
        t = start
        while t < search_end:
            try:
                v = intensity.get_value(t)
                if v is not None and not (isinstance(v, float) and np.isnan(v)) and v > max_int:
                    max_int = v
                    burst_time = t
            except Exception:
                pass
            t += step

        # Find voicing onset: first voiced frame
        voicing_time = end
        t = burst_time
        while t < end:
            try:
                f0 = pitch.get_value_at_time(t)
                if f0 is not None and not (isinstance(f0, float) and np.isnan(f0)) and f0 > 0:
                    voicing_time = t
                    break
            except Exception:
                pass
            t += 0.01

        vot_ms = max(0, (voicing_time - burst_time) * 1000)
        vot_results[w] = round(vot_ms)

    return vot_results


def analyze_transition_stability(sound: parselmouth.Sound, words: list[dict]) -> float:
    """Phonetic transition stability between fox and jumps."""
    fox_end = None
    jumps_start = None
    for w in words:
        if w["word"] == "fox":
            fox_end = w["end"]
        elif w["word"] == "jumps" and fox_end is not None:
            jumps_start = w["start"]
            break

    if fox_end is None or jumps_start is None or jumps_start <= fox_end:
        return 0.5  # Neutral fallback

    # Extract formant trajectory in transition
    formant = sound.to_formant_burg(time_step=0.005)
    times = []
    f1_vals = []
    f2_vals = []
    t = fox_end
    while t <= jumps_start:
        try:
            f1 = formant.get_value_at_time(1, t)
            f2 = formant.get_value_at_time(2, t)
            if f1 and f2 and not np.isnan(f1) and not np.isnan(f2):
                times.append(t)
                f1_vals.append(f1)
                f2_vals.append(f2)
        except Exception:
            pass
        t += 0.005

    if len(times) < 3:
        return 0.5

    # Slope of formant change = transition sharpness; steeper = more stable
    duration = times[-1] - times[0]
    if duration < 0.02:
        return 0.5
    f1_slope = abs(f1_vals[-1] - f1_vals[0]) / duration
    f2_slope = abs(f2_vals[-1] - f2_vals[0]) / duration
    stability = min(1.0, (f1_slope + f2_slope) / 20000)  # Normalize to 0-1
    return round(stability, 3)


def analyze_prosodic_decay(sound: parselmouth.Sound, words: list[dict]) -> dict:
    """Prosodic decay: first 3 vs last 3 words."""
    if len(words) < 6:
        return {"amplitudeDecay": 0, "rateDecay": 0}

    first3 = words[:3]
    last3 = words[-3:]

    intensity = sound.to_intensity(50)

    def seg_metrics(seg_words):
        if not seg_words:
            return 0, 0
        t_start = seg_words[0]["start"]
        t_end = seg_words[-1]["end"]
        duration = t_end - t_start
        try:
            avg_db = intensity.get_average(t_start, t_end)
            if np.isnan(avg_db):
                avg_db = 0
        except Exception:
            avg_db = 0
        rate = len(seg_words) / duration if duration > 0 else 0
        return avg_db, rate

    amp1, rate1 = seg_metrics(first3)
    amp2, rate2 = seg_metrics(last3)

    amplitude_decay = (amp1 - amp2) / amp1 if amp1 > 0 else 0
    rate_decay = (rate1 - rate2) / rate1 if rate1 > 0 else 0

    return {
        "amplitudeDecay": round(max(0, amplitude_decay), 3),
        "rateDecay": round(max(0, rate_decay), 3),
    }


def analyze_vowel_space(sound: parselmouth.Sound, words: list[dict]) -> dict:
    """F1/F2 for vowels in fox and lazy."""
    result = {}
    formant = sound.to_formant_burg(time_step=0.01)

    for target in ["fox", "lazy"]:
        for w in words:
            if w["word"] == target:
                start, end = w["start"], w["end"]
                mid = (start + end) / 2
                try:
                    f1 = formant.get_value_at_time(1, mid)
                    f2 = formant.get_value_at_time(2, mid)
                    if f1 and f2 and not np.isnan(f1) and not np.isnan(f2):
                        result[f"{target}_F1"] = round(f1)
                        result[f"{target}_F2"] = round(f2)
                except Exception:
                    pass
                break

    return result


def analyze_amplitude_jitter(sound: parselmouth.Sound) -> float:
    """Rhythmic variability in amplitude envelope."""
    intensity = sound.to_intensity(50)
    duration = sound.duration
    step = 0.02
    values = []
    t = 0.0
    while t < duration:
        try:
            v = intensity.get_value(t)
            if v and not np.isnan(v):
                values.append(v)
        except Exception:
            pass
        t += step

    if len(values) < 5:
        return 0.0

    diffs = [abs(values[i + 1] - values[i]) for i in range(len(values) - 1)]
    mean_val = np.mean(values)
    jitter = np.std(diffs) / mean_val if mean_val > 0 else 0
    return round(float(jitter), 4)


def compute_score(metrics: dict, duration: float) -> float:
    """Combine metrics into 0-10 score (lower = better)."""
    score = 0.0

    vot = metrics.get("vot", {})
    vot_avg = np.mean(list(vot.values())) if vot else 50
    if vot_avg > 80:
        score += 2.5
    elif vot_avg > 60:
        score += 1.5
    elif vot_avg > 45:
        score += 0.5

    stab = metrics.get("transitionStability", 0.5)
    if stab < 0.3:
        score += 2
    elif stab < 0.5:
        score += 1

    decay = metrics.get("prosodicDecay", {})
    amp_decay = decay.get("amplitudeDecay", 0)
    if amp_decay > 0.25:
        score += 2
    elif amp_decay > 0.15:
        score += 1

    jitter = metrics.get("amplitudeJitter", 0)
    if jitter > 0.06:
        score += 2
    elif jitter > 0.04:
        score += 1

    duration_ratio = duration / 4.0 if duration > 0 else 1
    if duration_ratio < 0.5 or duration_ratio > 2:
        score += 1

    return round(min(10, max(0, score)), 1)


@app.post("/analyze")
def analyze(request: AnalyzeRequest):
    audio_path = None
    try:
        audio_path = decode_audio(request.audio)
        sound = parselmouth.Sound(str(audio_path))
        duration = sound.duration

        if duration < 1.0:
            raise HTTPException(status_code=400, detail="Recording too short (min 1 second)")

        model = get_whisper_model()
        segments, _ = model.transcribe(str(audio_path), word_timestamps=True)
        segments = list(segments)
        words = words_from_faster_whisper(segments, duration)

        metrics = {
            "vot": analyze_vot(sound, words),
            "transitionStability": analyze_transition_stability(sound, words),
            "prosodicDecay": analyze_prosodic_decay(sound, words),
            "vowelSpace": analyze_vowel_space(sound, words),
            "amplitudeJitter": analyze_amplitude_jitter(sound),
        }

        score = compute_score(metrics, duration)

        return {
            "score": score,
            "duration": round(duration, 1),
            "metrics": metrics,
            "wordBoundaries": words,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


@app.get("/health")
def health():
    return {"status": "ok"}
