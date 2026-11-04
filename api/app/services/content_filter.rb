# Content filtering on student input and model output (FR11, NFR1). Fail-closed:
# if the filter itself cannot run, the content is withheld.
#
# A local PII/unsafe-term check always runs first, so obvious PII never leaves
# the API. With GUARDRAIL_ID (or BEDROCK_GUARDRAIL_ID) set, Bedrock Guardrails
# (ApplyGuardrail) runs next:
#   - any BLOCKED assessment (harmful content, prompt attack, contact details)
#     => withheld
#   - only ANONYMIZED PII (names, ages, usernames) => allowed, and `text` holds
#     the masked version. Callers must store and forward `result.text`, never
#     the original.
require "aws-sdk-bedrockruntime"

module ContentFilter
  Result = Struct.new(:ok, :message, :source, :text, keyword_init: true) do
    def ok? = ok
  end

  PII = [
    [/[\w.+-]+@[\w-]+\.[\w.]+/, "an email address"],
    [/(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, "a phone number"],
  ].freeze
  UNSAFE = /\b(kill (yourself|myself)|suicide|self[- ]harm|porn|nazi)\b/i
  UNSAFE_MESSAGE = "We can't use that message here. If something is worrying you, please talk to your teacher or another adult you trust."
  PRIVATE_MESSAGE = "It looks like your message includes personal information, like an address. Please remove it and try again."
  FAILED_MESSAGE = "We couldn't check that message just now. Please try again."

  module_function

  def check_input(text) = check(text, "INPUT")
  def check_output(text) = check(text, "OUTPUT")

  def check(text, source)
    text = text.to_s
    local = local_check(text)
    return local unless local.ok?
    guardrail_id.present? ? guardrail_check(text, source) : local
  rescue StandardError => e
    Rails.logger.error("[filter] failed closed: #{e.class}: #{e.message}")
    Result.new(ok: false, message: FAILED_MESSAGE, source: "error", text: nil)
  end

  def local_check(text)
    PII.each do |re, what|
      next unless re.match?(text)
      return Result.new(ok: false, source: "local-pii", text: nil,
                        message: "It looks like your message includes #{what}. Please remove personal information and try again.")
    end
    return Result.new(ok: false, message: UNSAFE_MESSAGE, source: "local-unsafe", text: nil) if UNSAFE.match?(text)
    Result.new(ok: true, source: "local", text: text)
  end

  def guardrail_check(text, source)
    resp = client.apply_guardrail(
      guardrail_identifier: guardrail_id,
      guardrail_version: ENV["GUARDRAIL_VERSION"].presence || ENV["BEDROCK_GUARDRAIL_VERSION"].presence || "DRAFT",
      source: source,
      content: [{ text: { text: text } }],
    )
    return Result.new(ok: true, source: "guardrail", text: text) unless resp.action == "GUARDRAIL_INTERVENED"

    assessments = resp.assessments.map(&:to_h)
    if blocked?(assessments)
      pii_only = assessments.all? { |a| a.except(:sensitive_information_policy, :invocation_metrics).values.none? { |v| blocked?(v) } }
      return Result.new(ok: false, source: "guardrail", text: nil, message: pii_only ? PRIVATE_MESSAGE : UNSAFE_MESSAGE)
    end
    # Only anonymized PII: allow the masked text.
    masked = resp.outputs.map(&:text).join
    Result.new(ok: true, source: "guardrail-masked", text: masked)
  end

  # True if any nested assessment entry has action BLOCKED.
  def blocked?(node)
    case node
    when Hash then node[:action] == "BLOCKED" || node.values.any? { |v| blocked?(v) }
    when Array then node.any? { |v| blocked?(v) }
    else false
    end
  end

  def guardrail_id = ENV["GUARDRAIL_ID"].presence || ENV["BEDROCK_GUARDRAIL_ID"]

  def client
    @client ||= Aws::BedrockRuntime::Client.new(region: ENV["BEDROCK_REGION"] || ENV["AWS_REGION"] || "us-east-1")
  end
end
