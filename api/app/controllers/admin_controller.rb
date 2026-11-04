# Admin-only endpoints (require_curriculum_admin!). Admins manage a unit's
# concept matrix (upload a PDF/Word doc -> AI proposes a matrix -> admin reviews
# -> save). Admins NEVER see student progress: there is deliberately no student,
# class, trace, or insights action here, and the teacher-progress endpoints are
# gated by require_teacher! which excludes admins.
class AdminController < ApplicationController
  before_action :require_curriculum_admin!

  # Upload a document and get an AI-proposed matrix back (NOT saved yet).
  def extract_curriculum
    upload = params[:file] || params[:document]
    render json: curriculum_service.extract(unit_id: params.require(:unitId), upload: upload,
                                             content_type: upload.respond_to?(:content_type) ? upload.content_type : params[:contentType],
                                             filename: upload.respond_to?(:original_filename) ? upload.original_filename : params[:filename])
  rescue AdminCurriculumService::Error => e
    render json: { error: e.message }, status: e.status
  end

  # Save the admin-reviewed matrix for a unit (create or override; one per unit).
  def save_curriculum
    p = params.permit(:unitId, :bar, :sourceName, required: [],
                      concepts: [:id, :name, :order, :csta, { descriptors: %w[0 1 2 3] }])
    render json: curriculum_service.save(unit_id: p[:unitId], created_by: current_user.id, bar: p[:bar],
                                         required: p[:required], concepts: normalize_concepts(p[:concepts]),
                                         source_name: p[:sourceName]), status: :created
  rescue AdminCurriculumService::Error => e
    render json: { error: e.message }, status: e.status
  end

  def show_curriculum = render(json: curriculum_service.current(params[:unitId]))

  # --- teaching appointments (admin-created, authoritative) ----------------

  def appointments = render(json: { appointments: TeachingAppointment.all })

  def create_appointment
    p = params.permit(:teacherId, :studentId, :unitId)
    render json: TeachingAppointment.create!(created_by: current_user.id, teacher_id: p[:teacherId],
                                             student_id: p[:studentId], unit_id: p[:unitId]), status: :created
  rescue TeachingAppointment::Error => e
    render json: { error: e.message }, status: e.status
  end

  def remove_appointment
    p = params.permit(:teacherId, :studentId, :unitId)
    render json: TeachingAppointment.remove!(teacher_id: p[:teacherId], student_id: p[:studentId], unit_id: p[:unitId])
  end

  # Directory the admin UI needs to build appointments (no student progress).
  def directory
    render json: {
      teachers: Db.query("SELECT id, display_name FROM app_user WHERE role = 'teacher' ORDER BY display_name").map { |r| { id: r["id"], name: r["display_name"] } },
      students: Db.query("SELECT id, display_name FROM app_user WHERE role = 'student' ORDER BY display_name").map { |r| { id: r["id"], name: r["display_name"] } },
      units: Curriculum.unit_ids.map { |id| { id: id, name: Curriculum.unit(id).unit["name"] } },
    }
  end

  private

  # ActionController params -> plain hashes/arrays for the service/UnitMatrix.
  def normalize_concepts(concepts)
    Array(concepts).map do |c|
      h = c.respond_to?(:to_unsafe_h) ? c.to_unsafe_h : c.to_h
      h = h.transform_keys(&:to_s)
      h["descriptors"] = (h["descriptors"] || {}).respond_to?(:to_unsafe_h) ? h["descriptors"].to_unsafe_h : (h["descriptors"] || {})
      h["descriptors"] = h["descriptors"].to_h.transform_keys(&:to_s)
      h
    end
  end

  def curriculum_service = (@curriculum_service ||= AdminCurriculumService.new)
end
