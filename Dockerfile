# Use a slim version of Python 3.11+
FROM python:3.12-slim

# Set working directory to a standard name
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# update the Pip
RUN pip install --upgrade pip

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# set the current app directory to current directory
COPY backend/agentic-friend-backend .

# EXPLICITLY set PYTHONPATH to the current directory
ENV PYTHONPATH=/app

# Expose the port
EXPOSE 8000

# Run using the absolute module path
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]