class ApplicationController < ActionController::API
  rescue_from LessonService::Error do |e|
    render json: { error: e.message }, status: e.status
  end
  rescue_from ActionController::ParameterMissing do |e|
    render json: { error: e.message }, status: :unprocessable_entity
  end
  rescue_from Db::Error do |e|
    Rails.logger.error("[db] #{e.message}")
    render json: { error: "Service temporarily unavailable" }, status: :service_unavailable
  end

  private

  def current_user
    return @current_user if defined?(@current_user)
    @current_user = Auth.authenticate(request)
  end

  def require_user!
    render json: { error: "Not signed in" }, status: :unauthorized unless current_user
  end

  # Row scoping: a student only ever loads their own record (student_id = token user).
  def require_student!
    return render(json: { error: "Not signed in" }, status: :unauthorized) unless current_user
    render json: { error: "Student endpoint" }, status: :forbidden unless current_user.student?
  end

  # Stage, score and placement are served only behind this check (FR12/FR13).
  # Teacher ONLY — admins are intentionally excluded from all student-progress
  # views (an admin never sees student progress).
  def require_teacher!
    return render(json: { error: "Not signed in" }, status: :unauthorized) unless current_user
    render json: { error: "Forbidden: teacher-scoped endpoint" }, status: :forbidden unless current_user.teacher?
  end

  # Approving AI-generated content: a teacher OR an admin may approve.
  def require_approver!
    return render(json: { error: "Not signed in" }, status: :unauthorized) unless current_user
    render json: { error: "Forbidden: approver-scoped endpoint" }, status: :forbidden unless current_user.approver?
  end

  # Uploading a unit's concept matrix: admin only.
  def require_curriculum_admin!
    return render(json: { error: "Not signed in" }, status: :unauthorized) unless current_user
    render json: { error: "Forbidden: admin-scoped endpoint" }, status: :forbidden unless current_user.admin?
  end

  def service = (@service ||= LessonService.new)
end
