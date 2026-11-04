# Calls the Bit tutor agent on Amazon Bedrock AgentCore Runtime (agent/).
#
# The runtime's inbound auth is a Cognito JWT authorizer, so the API forwards
# the signed-in student's own access token: the agent acts on behalf of that
# student, and a request without a valid token never reaches it.
#
# Configured by BIT_AGENT_ARN; without it (or without a token) Coach uses the
# direct Bedrock path. Content filtering stays in the API (LessonService), on
# the student's message and on the agent's reply.
require "net/http"
require "json"
require "digest"
require "erb"

class BitAgentClient
  class Error < StandardError; end

  TIMEOUT = 15 # seconds; the API Lambda has 30s in total

  def self.configured? = ENV["BIT_AGENT_ARN"].present?

  def initialize(arn: ENV["BIT_AGENT_ARN"], region: ENV["AWS_REGION"] || "us-east-1")
    @arn = arn
    @region = region
  end

  # Returns { reply:, tools_used: }. Raises Error on any failure.
  def ask(token:, student_id:, level_code:, message:, draft:)
    uri = URI("https://bedrock-agentcore.#{@region}.amazonaws.com/runtimes/#{ERB::Util.url_encode(@arn)}/invocations?qualifier=DEFAULT")
    req = Net::HTTP::Post.new(uri)
    req["Authorization"] = "Bearer #{token}"
    req["Content-Type"] = "application/json"
    # One session per student and step (AgentCore needs >= 33 characters).
    req["X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"] = "bit-#{Digest::SHA256.hexdigest("#{Curriculum.current.id}:#{student_id}:#{level_code}")[0, 40]}"
    req.body = JSON.generate(prompt: message, level: level_code, draft: draft.to_s[0, 2000], unit: Curriculum.current.id)
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: TIMEOUT) { |http| http.request(req) }
    raise Error, "AgentCore HTTP #{res.code}: #{res.body.to_s[0, 160]}" unless res.is_a?(Net::HTTPSuccess)

    data = JSON.parse(res.body)
    reply = data["reply"].to_s.strip
    raise Error, "empty reply" if reply.empty?
    { reply: reply, tools_used: Array(data["toolsUsed"]) }
  rescue JSON::ParserError, Net::OpenTimeout, Net::ReadTimeout, SocketError, SystemCallError, OpenSSL::SSL::SSLError => e
    raise Error, "#{e.class}: #{e.message[0, 120]}"
  end
end
