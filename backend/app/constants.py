ROLES = [
    "Software Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Data Analyst",
    "Machine Learning Engineer",
    "HR / Behavioural",
]
DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"]

# Events reported by the browser (Page Visibility, Fullscreen, MediaDevices APIs).
BROWSER_EVENT_TYPES = ("tab_switch", "fullscreen_exit", "camera_interrupted", "mic_interrupted")

# Events produced by the computer-vision module.
FACE_EVENT_TYPES = {"absent": "face_absent", "multiple": "multiple_faces"}

EVENT_SEVERITY = {
    "tab_switch": "medium",
    "fullscreen_exit": "low",
    "camera_interrupted": "high",
    "mic_interrupted": "medium",
    "face_absent": "medium",
    "multiple_faces": "high",
}
SEVERITY_POINTS = {"low": 1, "medium": 3, "high": 5}

# Weights for Overall Interview Performance (integrity is reported separately).
SCORE_WEIGHTS = {
    "answer_quality": 0.4,
    "response_structure": 0.2,
    "speech_fluency": 0.2,
    "gaze_attention": 0.2,
}
