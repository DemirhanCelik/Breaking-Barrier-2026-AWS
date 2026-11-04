# Teacher-scoped, read-only attainment (FR12). Students get 403 here.
# MVP has one seeded class; with multiple classes, scope by klass.teacher_id.
class TeacherController < ApplicationController
  before_action :require_teacher!
  around_action :with_class_course

  def show_class = render(json: service.class_attainment(current_user.id))
  def show_student = render(json: service.student_trace(current_user.id, params[:id]))
  # Filter audit log + coverage (BRD M7). Outcomes only, never student text.
  def safety = render(json: service.filter_audit(current_user.id))

  # Differentiation help: who needs help now, small groups by shared gap (teacher-only).
  def insights = render(json: service.insights(current_user.id))
  def mini_lesson = render(json: InsightsService.new.mini_lesson(params.require(:checkId)))

  # AI-assisted authoring (design §7B). The teacher acts as the reviewer for the demo;
  # in production this is the Teaching & Learning role.
  def authoring
    render json: { items: authoring_service.list(status: params[:status].presence),
                   bank: authoring_service.bank_summary, practice: PracticeService.stats }
  end

  def draft
    p = params.permit(:concept, :fromStage, :sourceTitle, :sourceText, :count)
    render json: authoring_service.draft(current_user.id, concept: p[:concept], from: p[:fromStage], source_title: p[:sourceTitle],
                                                          source_text: p[:sourceText], count: p[:count] || 3), status: :created
  end

  def review
    p = params.permit(:note, edits: %i[title scenario task tip])
    render json: authoring_service.review(params[:id], current_user.id, action: params.require(:decision),
                                                                        edits: p[:edits]&.to_h || {}, note: p[:note])
  end

  # Assignments: a teacher targets a unit or a specific level at a whole class or
  # an individual student. These PRIORITIZE the adaptive engine (see Engine/
  # LessonService#advance), they do not force a fixed sequence.
  def assignments = render(json: service.list_assignments(current_user.id, status: params[:status].presence))

  def create_assignment
    p = params.permit(:scope, :targetKind, :unitId, :klassId, :studentId, :levelCode, :note)
    render json: service.create_assignment(current_user.id, scope: p[:scope], target_kind: p[:targetKind],
                                            unit_id: p[:unitId], klass_id: p[:klassId], student_id: p[:studentId],
                                            level_code: p[:levelCode], note: p[:note]), status: :created
  end

  def archive_assignment = render(json: service.archive_assignment(current_user.id, params[:id]))

  private

  def with_class_course(&action)
    Curriculum.with_unit(Curriculum.assigned_unit_id, &action)
  end

  def authoring_service = (@authoring_service ||= AuthoringService.new)
end
