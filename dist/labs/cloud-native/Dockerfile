# Teaching baseline; record the resolved base digest for reproducible publication.
FROM python:3.12.8-slim
WORKDIR /app
COPY app.py /app/app.py
USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["python", "-u", "/app/app.py"]
