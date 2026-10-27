FROM python:3.11-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# ffmpeg: Whisper decodes browser audio through it. libgl1/libglib2.0: MediaPipe runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
# openai-whisper ships only an sdist whose setup.py imports pkg_resources, which
# setuptools >= 81 removed. Pin an older setuptools and build without isolation so
# Whisper uses it; every other dependency installs from a prebuilt wheel.
RUN pip install --no-cache-dir --upgrade "setuptools<81" wheel \
    && pip install --no-cache-dir --no-build-isolation -r requirements.txt
COPY app ./app
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
