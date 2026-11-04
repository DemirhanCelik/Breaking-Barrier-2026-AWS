# Teacher-scoped, read-only attainment (FR12). Students get 403 here.
# MVP has one seeded class; with multiple classes, scope by klass.teacher_id.
class TeacherController < ApplicationController
  before_action :require_teacher!

  def show_class = render(json: service.class_attainment)
  def show_student = render(json: service.student_trace(params[:id]))
  # Filter audit log + coverage (BRD M7). Outcomes only, never student text.
  def safety = render(json: service.filter_audit)

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

  private

  def authoring_service = (@authoring_service ||= AuthoringService.new)
end
