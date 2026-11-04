# Student-scoped endpoints. Responses never include stage, score, placement,
# rubric evaluation, or peer comparison (FR13).
class StudentController < ApplicationController
  before_action :require_student!

  def lesson = render(json: service.lesson_state(student))
  def diagnostic = render(json: service.diagnostic_form(student))

  def submit_diagnostic
    answers = params.require(:answers).permit!.to_h
    render json: service.submit_diagnostic(student, answers)
  end

  def create_submission
    signals = params.fetch(:signals, {}).permit(:timeOnTaskSec, :edits, :pastes, :pastedChars).to_h
    render json: service.submit_work(student, params[:level_id], params.require(:response), signals), status: :accepted
  end

  def show_submission = render(json: service.submission(student, params[:id]))

  def depth = render(json: service.choose_depth(student, params.require(:optionId).to_s))
  def topic = render(json: service.choose_topic(student, params.require(:topic).to_s))

  # "Try it": what an AI builds from the student's prompt (formative, sandboxed).
  def preview
    render json: PreviewService.new.preview(student, params[:level_id], params.require(:prompt), topic: service.topic_for(student))
  end

  def assistant
    # X-Agent-Token: the student's Cognito access token, forwarded to the AgentCore tutor.
    render json: service.ask_assistant(student, params[:level_id], params.require(:message),
                                       agent_token: request.headers["X-Agent-Token"].to_s[0, 4096].presence)
  end

  # Formative practice (design §7A): never feeds the mastery signal.
  def create_practice = render(json: PracticeService.new.create(student, params[:level_id]), status: :created)

  def answer_practice
    render json: PracticeService.new.answer(student, params[:id], params.require(:response))
  end

  private

  def student
    @student ||= StudentRecord.find(current_user.id) || raise(LessonService::Error.new("Student not found", 404))
  end
end
