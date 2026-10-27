"""Face presence, face count and a simple head-orientation check (OpenCV + MediaPipe)."""
import threading

import cv2
import mediapipe as mp
import numpy as np

_face_mesh = None
_lock = threading.Lock()

# MediaPipe Face Mesh landmark indices.
NOSE_TIP, LEFT_EYE_OUTER, RIGHT_EYE_OUTER, CHIN = 1, 33, 263, 152

# Tunable thresholds for "reasonably front-facing".
YAW_RANGE = (0.35, 0.65)    # nose position between the outer eye corners (0.5 = centred)
PITCH_RANGE = (0.25, 0.75)  # nose position between eye line and chin


def _get_mesh():
    global _face_mesh
    if _face_mesh is None:
        _face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=4,
            refine_landmarks=False,
            min_detection_confidence=0.5,
        )
    return _face_mesh


def _is_frontal(landmarks) -> bool:
    nose, left, right, chin = (landmarks[i] for i in (NOSE_TIP, LEFT_EYE_OUTER, RIGHT_EYE_OUTER, CHIN))
    eye_span = abs(right.x - left.x)
    if eye_span < 1e-6:
        return False
    yaw = (nose.x - min(left.x, right.x)) / eye_span
    eye_y = (left.y + right.y) / 2
    face_h = chin.y - eye_y
    if face_h < 1e-6:
        return False
    pitch = (nose.y - eye_y) / face_h
    return YAW_RANGE[0] <= yaw <= YAW_RANGE[1] and PITCH_RANGE[0] <= pitch <= PITCH_RANGE[1]


def analyze(jpeg_bytes: bytes) -> dict:
    buf = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    image = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image")
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    with _lock:  # MediaPipe graph instances are not thread-safe
        result = _get_mesh().process(rgb)
    faces = result.multi_face_landmarks or []
    frontal = len(faces) == 1 and _is_frontal(faces[0].landmark)
    return {"face_count": len(faces), "frontal": bool(frontal)}
