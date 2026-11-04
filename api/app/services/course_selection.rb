# A student's selected course is independent of the class assignment and peers.
module CourseSelection
  module_function

  def current_for(student_id)
    id = Db.query("SELECT selected_unit_id FROM app_user WHERE id = :id AND role = 'student'", id: student_id).first&.fetch("selected_unit_id")
    Curriculum.unit_ids.include?(id) ? id : Curriculum.assigned_unit_id
  end

  def select!(student_id, course_id)
    id = course_id.to_s
    raise LessonService::Error.new("That course is not available.", 422) unless Curriculum.selectable.any? { |c| c.id == id }
    Db.execute("UPDATE app_user SET selected_unit_id = :u WHERE id = :id AND role = 'student'", u: id, id: student_id)
    id
  end
end
