# Demo-only helpers. Every action 404s unless AUTH_MODE=demo.
class DemoController < ApplicationController
  before_action { head :not_found unless Auth.demo? }

  def users
    rows = Db.query("SELECT id, display_name, role FROM app_user ORDER BY role DESC, display_name")
    render json: rows.map { |r| { id: r["id"], displayName: r["display_name"], role: r["role"] } }
  end

  def show_fault = render(json: { on: LessonService.fault_injection? })

  def update_fault
    LessonService.fault_injection = ActiveModel::Type::Boolean.new.cast(params[:on])
    render json: { on: LessonService.fault_injection? }
  end

  def reset
    DemoSeed.run!
    render json: { ok: true }
  end
end
