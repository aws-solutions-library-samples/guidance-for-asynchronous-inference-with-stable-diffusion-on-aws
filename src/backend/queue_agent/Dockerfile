FROM public.ecr.aws/docker/library/python:3.12-slim

RUN apt-get update; apt-get install libmagic1 -y; rm -rf /var/lib/apt/lists/*

RUN adduser --disabled-password --gecos '' --no-create-home app && \
    mkdir /app || true; \
    chown -R app /app
WORKDIR /app
USER app:app

COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

COPY src/ /app/

CMD python3 -u /app/main.py
