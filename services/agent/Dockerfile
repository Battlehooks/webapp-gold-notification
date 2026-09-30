FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN mkdir -p /app/data

EXPOSE 8003
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]

# NOTE: this image is provided for consistency with the other three services
# and for quick local smoke-testing of the chat loop itself, but it is NOT
# wired into docker-compose.yml and should not be used to grant this service
# real VPS access -- see README.md's "Run in production" section for why.
