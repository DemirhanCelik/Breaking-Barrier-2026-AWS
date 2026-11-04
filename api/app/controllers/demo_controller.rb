# Demo-only helpers.
#   AUTH_MODE=demo: open (synthetic data only), as before.
#   AUTH_MODE=cognito: 404 unless DEMO_CONTROLS=true, and then teacher-only.
#     The user list stays demo-mode-only; Cognito sign-in never needs it.
class DemoController < ApplicationController
  before_action :allow_demo!

  private def allow_demo!
    return if Auth.demo?
    return head(:not_found) unless ENV["DEMO_CONTROLS"] == "true" && action_name != "users"
    require_teacher!
  end

  def users
    rows = Db.query("SELECT id, display_name, role FROM app_user ORDER BY role DESC, display_name")
    render json: rows.map { |r| { id: r["id"], displayName: r["display_name"], role: r["role"] } }
  end

  def show_fault = render(json: { on: LessonService.fault_injection? })

  def update_fault
    LessonService.fault_injection = ActiveModel::Type::Boolean.new.cast(params[:on])
    render json: { on: LessonService.fault_injection? }
  end

  # AI-advised vs rules-only routing, for a live side-by-side.
  def show_routing = render(json: { mode: LessonService.routing_mode, available: Validator.mode != "probes" })

  def update_routing
    LessonService.routing_mode = params.require(:mode).to_s
    show_routing
  end

  def reset
    DemoSeed.run!
    render json: { ok: true }
  end
end
