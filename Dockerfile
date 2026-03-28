# CUDA runtime on Ubuntu 22.04
FROM nvidia/cuda:12.6.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Step 1: Python 3.12 + system deps
RUN apt-get update && apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y \
    python3.12 \
    python3.12-dev \
    python3.12-venv \
    build-essential \
    libsndfile1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Step 2: Bootstrap pip for Python 3.12
RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python3.12

# Step 3: Set python3.12 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1

# Step 4: Upgrade pip
RUN python -m pip install --upgrade pip

# Step 5: Install torch with CUDA 12.6 FIRST
RUN pip install torch==2.7.0 --index-url https://download.pytorch.org/whl/cu126

# Step 6: Install remaining dependencies
COPY requirements.txt .
RUN grep -iv "^torch" requirements.txt | pip install --no-cache-dir -r /dev/stdin

# Step 7: Pre-download both models at build time
#         Zero download delay on first request
RUN python -c "\
from faster_whisper import WhisperModel; \
WhisperModel('base.en', device='cpu', compute_type='int8'); \
print('[Model] faster-whisper base.en ready'); \
from transformers import pipeline; \
pipeline('text-to-speech', model='facebook/mms-tts-eng'); \
print('[Model] facebook/mms-tts-eng ready'); \
"

# Step 8: Copy application code
COPY backend/agentic-friend-backend .

RUN mkdir -p /app/secrets
RUN mkdir -p /app/logs

ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]