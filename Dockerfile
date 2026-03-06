# Use a slim version of Python 3.11+
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Update pip
RUN pip install --upgrade pip

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/agentic-friend-backend .

# Create secrets directory for mounted credentials
RUN mkdir -p /app/secrets

# Set PYTHONPATH
ENV PYTHONPATH=/app

# Expose the port
EXPOSE 8000
        
# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]