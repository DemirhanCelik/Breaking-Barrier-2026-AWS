# Filter audit log (BRD M7: "filtering fires on 100% of student inputs and model
# outputs before delivery", measured by this log).
#
# Every ContentFilter check made on a student-facing path writes one
# filter_event row: who, where (context), input/output, pass/blocked/error and
# which filter decided. No text is stored (NFR2), only the outcome.
#
# Coverage is proven against independent records, not against the log itself:
#   - every submission row must have an input event with ref_id = submission id
#   - every adaptive validation (which produced coaching) must have a coaching
#     output event with ref_id = submission id
#   - every assistant question that passed the input filter must have an output
#     event with the same ref_id (so no reply was delivered unchecked)
module FilterAudit
  CONTEXTS = %w[submission assistant coaching practice practice_answer preview].freeze

  module_function

  def outcome_for(result)
    return "pass" if result.ok?
    result.source == "error" ? "error" : "blocked"
  end

  # Never raises: an audit write failure must not change what the student gets
  # (the filter already decided). A missing row then shows up as a coverage gap.
  def record!(result, student_id:, context:, direction:, ref_id:)
    raise ArgumentError, "unknown filter context #{context}" unless CONTEXTS.include?(context)
    Db.execute(<<~SQL, s: student_id, unit: Curriculum.current.id, c: context, d: direction, o: outcome_for(result), src: result.source.to_s, ref: ref_id)
      INSERT INTO filter_event (student_id, unit_id, context, direction, outcome, source, ref_id)
      VALUES (:s, :unit, :c, :d, :o, :src, :ref)
    SQL
  rescue StandardError => e
    Rails.logger.error("[filter-audit] write failed: #{e.class}: #{e.message}")
  end

  # Teacher view: coverage + counts for one class.
  def report(klass_id, limit: 25)
    k = { k: klass_id, unit: Curriculum.current.id }
    in_class = "unit_id = :unit AND student_id IN (SELECT student_id FROM enrollment WHERE klass_id = :k)"

    subs = Db.query(<<~SQL, k).first
      SELECT count(*) AS required,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM filter_event f
               WHERE f.ref_id = s.id AND f.direction = 'input' AND f.context = 'submission')) AS checked
      FROM submission s WHERE s.#{in_class}
    SQL
    coaching = Db.query(<<~SQL, k).first
      SELECT count(*) AS required,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM filter_event f
               WHERE f.ref_id = v.submission_id AND f.direction = 'output' AND f.context = 'coaching')) AS checked
      FROM validation_result v
      WHERE v.mode = 'adaptive' AND v.submission_id IS NOT NULL AND v.#{in_class}
    SQL
    assistant = Db.query(<<~SQL, k).first
      SELECT count(*) AS asked,
             count(*) FILTER (WHERE i.outcome = 'pass') AS passed,
             count(*) FILTER (WHERE i.outcome = 'pass' AND EXISTS (SELECT 1 FROM filter_event o
               WHERE o.ref_id = i.ref_id AND o.direction = 'output' AND o.context = 'assistant')) AS replied_checked
      FROM filter_event i
      WHERE i.context = 'assistant' AND i.direction = 'input' AND i.#{in_class}
    SQL
    # Practice (formative): every generated item served and every practice reply
    # had an output check; every practice answer had an input check.
    practice = Db.query(<<~SQL, k).first
      SELECT
        (SELECT count(*) FROM practice_item p WHERE p.origin = 'generated' AND p.#{in_class}) AS gen,
        (SELECT count(*) FROM practice_item p WHERE p.origin = 'generated' AND p.#{in_class} AND EXISTS (SELECT 1 FROM filter_event f
           WHERE f.ref_id = p.id AND f.context = 'practice' AND f.direction = 'output' AND f.outcome = 'pass')) AS gen_checked,
        (SELECT count(*) FROM practice_attempt a WHERE a.#{in_class}) AS answers,
        (SELECT count(*) FROM practice_attempt a WHERE a.#{in_class} AND EXISTS (SELECT 1 FROM filter_event f
           WHERE f.ref_id = a.id AND f.context = 'practice_answer' AND f.direction = 'input')) AS answers_checked,
        (SELECT count(*) FROM practice_attempt a WHERE a.#{in_class} AND NOT a.withheld) AS replies,
        (SELECT count(*) FROM practice_attempt a WHERE a.#{in_class} AND NOT a.withheld AND EXISTS (SELECT 1 FROM filter_event f
           WHERE f.ref_id = a.id AND f.context = 'practice' AND f.direction = 'output')) AS replies_checked
    SQL
    totals = Db.query(<<~SQL, k)
      SELECT direction, outcome, source, count(*) AS n
      FROM filter_event WHERE #{in_class}
      GROUP BY direction, outcome, source ORDER BY direction, outcome, source
    SQL
    recent = Db.query(<<~SQL, k.merge(lim: limit))
      SELECT CAST(floor(extract(epoch FROM f.created_at) * 1000) AS bigint) AS at_ms, f.student_id, u.display_name, f.context, f.direction, f.outcome, f.source
      FROM filter_event f JOIN app_user u ON u.id = f.student_id
      WHERE f.#{in_class}
      ORDER BY f.created_at DESC, f.id DESC LIMIT :lim
    SQL

    i = ->(row, key) { row[key].to_i }
    inputs_required = i.(subs, "required") + i.(assistant, "asked") + i.(practice, "answers")
    inputs_checked = i.(subs, "checked") + i.(assistant, "asked") + i.(practice, "answers_checked")
    outputs_required = i.(coaching, "required") + i.(assistant, "passed") + i.(practice, "gen") + i.(practice, "replies")
    outputs_checked = i.(coaching, "checked") + i.(assistant, "replied_checked") + i.(practice, "gen_checked") + i.(practice, "replies_checked")
    count = ->(dir, outcome) { totals.select { |t| t["direction"] == dir && t["outcome"] == outcome }.sum { |t| t["n"].to_i } }

    {
      inputs: { required: inputs_required, checked: inputs_checked, blocked: count.("input", "blocked"), errors: count.("input", "error") },
      outputs: { required: outputs_required, checked: outputs_checked, blocked: count.("output", "blocked"), errors: count.("output", "error") },
      coverage: {
        submissions: { required: i.(subs, "required"), checked: i.(subs, "checked") },
        coaching: { required: i.(coaching, "required"), checked: i.(coaching, "checked") },
        assistantReplies: { required: i.(assistant, "passed"), checked: i.(assistant, "replied_checked") },
        practice: { required: i.(practice, "gen") + i.(practice, "answers") + i.(practice, "replies"),
                    checked: i.(practice, "gen_checked") + i.(practice, "answers_checked") + i.(practice, "replies_checked") },
      },
      bySource: totals.map { |t| { direction: t["direction"], outcome: t["outcome"], source: t["source"], count: t["n"].to_i } },
      recent: recent.map do |r|
        { at: StudentRecord.iso(r["at_ms"]),
          studentId: r["student_id"], displayName: r["display_name"], context: r["context"],
          direction: r["direction"], outcome: r["outcome"], source: r["source"] }
      end,
    }
  end
end
