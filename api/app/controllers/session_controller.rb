class SessionController < ApplicationController
  before_action :require_user!, only: :show

  def show = render(json: current_user.as_json)
  # /health?db=1 also runs a trivial query: CI and demo prep use it to resume a
  # paused Aurora cluster (Db retries while it resumes). Db::Error -> 503.
  def health
    Db.query("SELECT 1 AS ok") if params[:db].present?
    render json: { status: "ok", authMode: Auth.mode, validationMode: Validator.mode, db: params[:db].present? ? "ok" : nil }.compact
  end
end
