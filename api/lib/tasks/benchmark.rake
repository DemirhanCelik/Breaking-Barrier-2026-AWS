# M5: agreement between the engine's stage signal and human raters.
#   VALIDATION_MODE=probes bundle exec rake benchmark:run   # probes only
#   VALIDATION_MODE=model  bundle exec rake benchmark:run   # probes + Bedrock rubric eval
# BRD target: >= 80% exact-stage OR >= 90% within +/-1 (threshold to be ratified by T&L).
namespace :benchmark do
  desc "Score benchmark/submissions.yml and report agreement with human raters"
  task run: :environment do
    # The benchmark items were written for the original demo unit.
    Thread.current[:codeai_unit] = ENV.fetch("BENCHMARK_UNIT", "ai_generated_design")
    cur = Curriculum.current
    items = YAML.safe_load_file(Rails.root.join("benchmark/submissions.yml")).fetch("items")
    validator = Validator.new(cache: {})
    rows = items.map do |it|
      level = cur.level(it["level"])
      stages = Engine.zero_vector.merge(it["concept"] => it["from"])
      outcome = validator.evaluate(level, stages, it["text"])
      r = outcome.results.find { |x| x.concept_id == it["concept"] } or raise "#{it['id']}: level does not target #{it['concept']} from #{it['from']}"
      target = r.target_stage
      { id: it["id"], level: level.code, concept: it["concept"], human: it["human"], engine: r.observed_stage,
        human_pass: it["human"] >= target, engine_pass: r.passed }
    rescue Validator::Unavailable => e
      { id: it["id"], level: it["level"], concept: it["concept"], human: it["human"], engine: nil, error: e.message }
    end

    scored = rows.reject { |r| r[:engine].nil? }
    exact = scored.count { |r| r[:engine] == r[:human] }
    within1 = scored.count { |r| (r[:engine] - r[:human]).abs <= 1 }
    pass_agree = scored.count { |r| r[:engine_pass] == r[:human_pass] }
    pct = ->(n) { scored.empty? ? 0.0 : (100.0 * n / scored.size).round(1) }

    puts format("%-4s %-4s %-3s %5s %6s  %s", "id", "lvl", "c", "human", "engine", "")
    rows.each do |r|
      mark = r[:engine].nil? ? "ERROR #{r[:error]}" : (r[:engine] == r[:human] ? "" : (r[:engine] > r[:human] ? "over" : "under"))
      puts format("%-4s %-4s %-3s %5s %6s  %s", r[:id], r[:level], r[:concept], r[:human], r[:engine].inspect, mark)
    end
    puts
    puts "Mode: #{Validator.mode}. Scored #{scored.size}/#{rows.size}."
    puts "Exact-stage agreement:   #{exact}/#{scored.size} (#{pct.(exact)}%)  target >= 80%"
    puts "Within +/-1 agreement:   #{within1}/#{scored.size} (#{pct.(within1)}%)  target >= 90%"
    puts "Pass/fail agreement:     #{pass_agree}/#{scored.size} (#{pct.(pass_agree)}%)"
    gate = pct.(exact) >= 80 || pct.(within1) >= 90
    puts "M5 gate (provisional):   #{gate ? 'MET' : 'NOT MET'} on a synthetic set; T&L must ratify with real ratings."

    out = Rails.root.join("benchmark/results")
    FileUtils.mkdir_p(out)
    File.write(out.join("#{Time.now.utc.strftime('%Y%m%dT%H%M%SZ')}-#{Validator.mode}.json"),
               JSON.pretty_generate({ mode: Validator.mode, exact: pct.(exact), within1: pct.(within1), rows: rows }))
  end
end
