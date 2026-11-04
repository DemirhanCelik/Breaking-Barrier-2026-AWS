# Runs a few independent I/O-bound calls (Bedrock, Guardrails) concurrently to
# stay inside the API's 30s Lambda timeout. Each thread runs inside the Rails
# executor, and the caller lets them autoload while it waits (no interlock
# deadlock in development). Returns results in order; re-raises the first error.
module Parallel
  module_function

  def run(*callables)
    threads = callables.map { |c| Thread.new { Rails.application.executor.wrap { c.call } } }
    ActiveSupport::Dependencies.interlock.permit_concurrent_loads { threads.map(&:value) }
  end
end
