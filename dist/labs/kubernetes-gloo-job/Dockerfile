FROM docker.io/library/python:3.12.8-slim@sha256:2199a62885a12290dc9c5be3ca0681d367576ab7bf037da120e564723292a2f0
RUN python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1+cpu
ENV PYTHONUNBUFFERED=1
COPY rank_step.py /rank_step.py
