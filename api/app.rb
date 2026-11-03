# AWS Lambda entrypoint (handler: app.handler). API Gateway HTTP API events are
# served by Rails through Lamby. Direct invocations with {"codeai_task": "..."}
# run maintenance tasks, e.g.:
#   aws lambda invoke --function-name codeai-api --payload '{"codeai_task":"db:schema"}' out.json
require_relative "config/environment"

ALLOWED_TASKS = %w[db:schema db:seed db:setup].freeze

def handler(event:, context:)
  if event.is_a?(Hash) && event.key?("codeai_task")
    task = event["codeai_task"]
    return { ok: false, error: "Task not allowed" } unless ALLOWED_TASKS.include?(task)
    Rails.application.load_tasks unless Rake::Task.task_defined?(task)
    Rake::Task[task].reenable
    Rake::Task[task].invoke
    return { ok: true, task: task }
  end
  Lamby.cmd(event: event, context: context)
end
