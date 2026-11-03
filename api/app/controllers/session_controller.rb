class SessionController < ApplicationController
  before_action :require_user!, only: :show

  def show = render(json: current_user.as_json)
  def health = render(json: { status: "ok", authMode: Auth.mode, validationMode: Validator.mode })
end
