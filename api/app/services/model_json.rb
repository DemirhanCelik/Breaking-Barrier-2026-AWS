# Extracts the JSON object from a model reply (models sometimes wrap it in prose
# or code fences).
require "json"

module ModelJson
  class Invalid < StandardError; end

  module_function

  def parse(text)
    raw = text.to_s[/\{.*\}/m] or raise Invalid, "no JSON object in model reply"
    data = JSON.parse(raw)
    raise Invalid, "expected a JSON object" unless data.is_a?(Hash)
    data
  rescue JSON::ParserError => e
    raise Invalid, "unparseable JSON: #{e.message[0, 120]}"
  end
end
