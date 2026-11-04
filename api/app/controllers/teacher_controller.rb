# Teacher-scoped, read-only attainment (FR12). Students get 403 here.
# MVP has one seeded class; with multiple classes, scope by klass.teacher_id.
class TeacherController < ApplicationController
  before_action :require_teacher!

  def show_class = render(json: service.class_attainment)
  def show_student = render(json: service.student_trace(params[:id]))
  # Filter audit log + coverage (BRD M7). Outcomes only, never student text.
  def safety = render(json: service.filter_audit)
end
