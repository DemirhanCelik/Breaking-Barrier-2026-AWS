# Model abstraction (design §10, NFR3). Validation and coaching depend only on
# `ModelClient.default.complete(...)`; swapping models is configuration:
#   BEDROCK_MODEL_ID           primary model or inference profile
#   BEDROCK_FALLBACK_MODEL_ID  used when the primary errors or throttles (NFR6)
#   BEDROCK_REGION             defaults to AWS_REGION
require "aws-sdk-bedrockruntime"

class ModelClient
  class Unavailable < StandardError; end

  Result = Struct.new(:text, :model_id, :input_tokens, :output_tokens, :latency_ms, keyword_init: true) do
    def meta = { modelId: model_id, inputTokens: input_tokens, outputTokens: output_tokens, latencyMs: latency_ms }
  end

  DEFAULT_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0".freeze
  DEFAULT_FALLBACK = "us.amazon.nova-lite-v1:0".freeze

  def self.default
    @default ||= new(
      model_id: ENV.fetch("BEDROCK_MODEL_ID", DEFAULT_MODEL),
      fallback_model_id: ENV.fetch("BEDROCK_FALLBACK_MODEL_ID", DEFAULT_FALLBACK),
      region: ENV["BEDROCK_REGION"] || ENV["AWS_REGION"] || "us-east-1",
    )
  end

  def initialize(model_id:, fallback_model_id: nil, region:, client: nil)
    @model_id = model_id
    @fallback_model_id = fallback_model_id.presence
    @client = client || Aws::BedrockRuntime::Client.new(region: region, retry_limit: 2,
                                                       http_read_timeout: 20)
  end

  # Single-turn completion. Raises Unavailable if every configured model fails.
  def complete(system:, prompt:, max_tokens: 600, temperature: 0.0)
    errors = []
    [@model_id, @fallback_model_id].compact.uniq.each do |mid|
      return call(mid, system, prompt, max_tokens, temperature)
    rescue Aws::BedrockRuntime::Errors::ServiceError, Seahorse::Client::NetworkingError => e
      Rails.logger.warn("[model] #{mid} failed: #{e.class.name.split('::').last}: #{e.message}")
      errors << "#{mid}: #{e.class.name.split('::').last}"
    end
    raise Unavailable, errors.join("; ")
  end

  private

  def call(model_id, system, prompt, max_tokens, temperature)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    resp = @client.converse(
      model_id: model_id,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inference_config: { max_tokens: max_tokens, temperature: temperature },
    )
    text = resp.output.message.content.filter_map(&:text).join
    Result.new(
      text: text, model_id: model_id,
      input_tokens: resp.usage&.input_tokens, output_tokens: resp.usage&.output_tokens,
      latency_ms: ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round,
    )
  end
end
