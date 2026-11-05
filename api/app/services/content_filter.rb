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
  OFF_TASK_MESSAGE = "That reads like instructions for an AI, so I can't take it as a question. Your latest draft is already " \
                     "shared with me, so just ask about it, like \"Is my prompt specific enough?\""

  # Fictional characters the curriculum itself uses (e.g. Jordan, the reader in
  # the magazine unit). The Guardrail sees them as people's names; masking them
  # turns lessons and hints into "{NAME} reads on the bus". Other names are
  # still masked. Keep in sync with config/curriculum/*.yml.
  CURRICULUM_NAMES = %w[jordan maya sam alex priya ana kai mia].freeze

  module_function

  # prompt_work: the text IS a prompt the student wrote for an AI (their lesson
  # work, a Try it prompt, a practice answer). Role-play and instructions such as
  # "You are a web designer..." are the skill being taught, so the Guardrail's
  # prompt-attack filter does not block them; every harmful-content filter still
  # does. Downstream model calls treat this text as data and grading is capped by
  # deterministic checks, so an injection cannot change a score.
  def check_input(text, prompt_work: false) = check(text, "INPUT", prompt_work: prompt_work)
  def check_output(text) = check(text, "OUTPUT")

  def check(text, source, prompt_work: false)
    text = text.to_s
    local = local_check(text)
    return local unless local.ok?
    guardrail_id.present? ? guardrail_check(text, source, prompt_work: prompt_work) : local
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

  def guardrail_check(text, source, prompt_work: false)
    resp = client.apply_guardrail(
      guardrail_identifier: guardrail_id,
      guardrail_version: ENV["GUARDRAIL_VERSION"].presence || ENV["BEDROCK_GUARDRAIL_VERSION"].presence || "DRAFT",
      source: source,
      content: [{ text: { text: text } }],
    )
    return Result.new(ok: true, source: "guardrail", text: text) unless resp.action == "GUARDRAIL_INTERVENED"

    assessments = resp.assessments.map(&:to_h)
    attack_only = prompt_attack_only?(assessments)
    return Result.new(ok: true, source: "guardrail-prompt-allowed", text: text) if attack_only && prompt_work
    return Result.new(ok: false, source: "guardrail-prompt-attack", text: nil, message: OFF_TASK_MESSAGE) if attack_only
    if blocked?(assessments)
      pii_only = assessments.all? { |a| a.except(:sensitive_information_policy, :invocation_metrics).values.none? { |v| blocked?(v) } }
      return Result.new(ok: false, source: "guardrail", text: nil, message: pii_only ? PRIVATE_MESSAGE : UNSAFE_MESSAGE)
    end
    # Only anonymized PII: mask it ourselves, keeping the curriculum's fictional
    # characters. Falls back to the Guardrail's own masked output if the matches
    # can't be located in the text.
    entities = pii_entities(assessments)
    to_mask = entities.reject { |e| e[:type].to_s == "NAME" && CURRICULUM_NAMES.include?(e[:match].to_s.strip.downcase) }
    return Result.new(ok: true, source: "guardrail", text: text) if to_mask.empty?

    masked = text.dup
    to_mask.sort_by { |e| -e[:match].to_s.length }.each do |e|
      m = e[:match].to_s
      next if m.empty?
      masked = masked.gsub(/(?<![\w])#{Regexp.escape(m)}(?![\w])/, "{#{e[:type]}}")
    end
    masked = resp.outputs.map(&:text).join if to_mask.any? { |e| e[:match].to_s.present? && masked.include?(e[:match].to_s) }
    Result.new(ok: true, source: "guardrail-masked", text: masked)
  end

  # Anonymized PII entities ({ type:, match: }) across all assessments.
  def pii_entities(assessments)
    assessments.flat_map do |a|
      sip = a[:sensitive_information_policy] || {}
      Array(sip[:pii_entities]).map { |e| { type: e[:type], match: e[:match] } } +
        Array(sip[:regexes]).map { |e| { type: e[:name] || "PII", match: e[:match] } }
    end
  end

  # True when the only blocked finding is the prompt-attack content filter.
  def prompt_attack_only?(assessments)
    found = false
    assessments.each do |a|
      a.each do |policy, value|
        next if policy == :invocation_metrics
        if policy == :content_policy
          Array(value[:filters]).each do |f|
            next unless f[:action] == "BLOCKED"
            return false unless f[:type] == "PROMPT_ATTACK"
            found = true
          end
        elsif blocked?(value)
          return false
        end
      end
    end
    found
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
