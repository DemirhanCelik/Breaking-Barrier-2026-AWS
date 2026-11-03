# Content filtering on student input and model output (FR11, NFR1). Fail-closed:
# if the filter itself cannot run, the content is withheld.
#
# With GUARDRAIL_ID set, uses Bedrock Guardrails (ApplyGuardrail). A local
# PII/unsafe-term check always runs first, so obvious PII never leaves the API.
require "aws-sdk-bedrockruntime"

module ContentFilter
  Result = Struct.new(:ok, :message, :source, keyword_init: true) do
    def ok? = ok
  end

  PII = [
    [/[\w.+-]+@[\w-]+\.[\w.]+/, "an email address"],
    [/(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, "a phone number"],
  ].freeze
  UNSAFE = /\b(kill (yourself|myself)|suicide|self[- ]harm|porn|nazi)\b/i
  UNSAFE_MESSAGE = "We can't use that message here. If something is worrying you, please talk to your teacher or another adult you trust."
  FAILED_MESSAGE = "We couldn't check that message just now. Please try again."

  module_function

  def check_input(text) = check(text, "INPUT")
  def check_output(text) = check(text, "OUTPUT")

  def check(text, source)
    local = local_check(text)
    return local unless local.ok?
    guardrail_id.present? ? guardrail_check(text, source) : local
  rescue StandardError => e
    Rails.logger.error("[filter] failed closed: #{e.class}: #{e.message}")
    Result.new(ok: false, message: FAILED_MESSAGE, source: "error")
  end

  def local_check(text)
    PII.each do |re, what|
      return Result.new(ok: false, source: "local-pii",
                        message: "It looks like your message includes #{what}. Please remove personal information and try again.") if re.match?(text)
    end
    return Result.new(ok: false, message: UNSAFE_MESSAGE, source: "local-unsafe") if UNSAFE.match?(text)
    Result.new(ok: true, source: "local")
  end

  def guardrail_check(text, source)
    resp = client.apply_guardrail(
      guardrail_identifier: guardrail_id,
      guardrail_version: ENV.fetch("GUARDRAIL_VERSION", "DRAFT"),
      source: source,
      content: [{ text: { text: text } }],
    )
    return Result.new(ok: true, source: "guardrail") unless resp.action == "GUARDRAIL_INTERVENED"
    Result.new(ok: false, message: UNSAFE_MESSAGE, source: "guardrail")
  end

  def guardrail_id = ENV["GUARDRAIL_ID"]

  def client
    @client ||= Aws::BedrockRuntime::Client.new(region: ENV["BEDROCK_REGION"] || ENV["AWS_REGION"] || "us-east-1")
  end
end
