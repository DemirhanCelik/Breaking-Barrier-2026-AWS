# Approval queue for AI-generated content (practice items). Reachable by a
# teacher OR an admin (require_approver!). Reuses AuthoringService, which owns
# the content_item queue, so approvals here behave exactly like the teacher
# authoring review. This is the human gate that lets AI-generated practice reach
# students. No student-progress data is exposed here.
class ReviewController < ApplicationController
  before_action :require_approver!

  # Pending/approved/rejected items; defaults to pending (the queue to act on).
  def items
    render json: { items: authoring_service.list(status: params[:status].presence || "pending") }
  end

  def review
    p = params.permit(:note, edits: %i[title scenario task tip])
    render json: authoring_service.review(params[:id], current_user.id, action: params.require(:decision),
                                                                        edits: p[:edits]&.to_h || {}, note: p[:note])
  end

  private

  def authoring_service = (@authoring_service ||= AuthoringService.new)
end
