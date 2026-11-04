Rails.application.routes.draw do
  get "health", to: "session#health"

  scope :api do
    get "session", to: "session#show"

    scope :student, controller: :student do
      get "lesson", action: :lesson
      get "diagnostic", action: :diagnostic
      post "diagnostic", action: :submit_diagnostic
      post "levels/:level_id/submissions", action: :create_submission
      get "submissions/:id", action: :show_submission
      post "depth", action: :depth
      post "levels/:level_id/assistant", action: :assistant
      post "levels/:level_id/practice", action: :create_practice
      post "practice/:id/answers", action: :answer_practice
    end

    scope :teacher, controller: :teacher do
      get "class", action: :show_class
      get "students/:id", action: :show_student
      get "safety", action: :safety
      get "authoring", action: :authoring
      post "authoring/drafts", action: :draft
      post "authoring/items/:id/review", action: :review
    end

    scope :demo, controller: :demo do
      get "users", action: :users
      get "fault", action: :show_fault
      post "fault", action: :update_fault
      post "reset", action: :reset
    end
  end
end
