# Bit tutor agent for Amazon Bedrock AgentCore Runtime (ARM64 / Graviton only).
# Build context is the repo root so the agent ships the same curriculum YAML as the API.
#   docker buildx build --platform linux/arm64 -f agent/Dockerfile -t codeai-bit-agent --load .
FROM --platform=linux/arm64 python:3.12.4-slim AS builder
WORKDIR /app
COPY agent/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM --platform=linux/arm64 python:3.12.4-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY agent/main.py .
COPY api/config/curriculum/*.yml ./curriculum/
RUN useradd --create-home --uid 1000 bit
USER bit
ENV PYTHONUNBUFFERED=1 \
    AGENT_OBSERVABILITY_ENABLED=true \
    OTEL_PYTHON_DISTRO=aws_distro \
    OTEL_PYTHON_CONFIGURATOR=aws_configurator \
    OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
    OTEL_TRACES_EXPORTER=otlp \
    OTEL_EXPORTER_OTLP_LOGS_HEADERS="x-aws-log-group=bedrock-agentcore/runtimes,x-aws-log-stream=runtime-logs,x-aws-metric-namespace=bedrock-agentcore"
EXPOSE 8080
# ADOT auto-instrumentation: traces for the request, each model call, and each tool call.
CMD ["opentelemetry-instrument", "python", "main.py"]
