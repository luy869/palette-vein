FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir open-clip-torch pillow requests grpcio
COPY . .
EXPOSE 50051
CMD ["python", "server.py"]
