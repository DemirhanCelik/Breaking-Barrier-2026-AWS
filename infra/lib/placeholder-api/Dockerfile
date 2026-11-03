# Neutral placeholder image so the API Lambda deploys before the real Rails
# image exists. Replace with your Rails 7.1 app image (bundling the AWS Lambda
# Web Adapter) at deploy time. No dependencies, no downstream calls.
FROM --platform=linux/amd64 public.ecr.aws/lambda/nodejs:20

COPY app.js ${LAMBDA_TASK_ROOT}/

CMD [ "app.handler" ]
