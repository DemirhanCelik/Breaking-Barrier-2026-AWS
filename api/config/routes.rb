Rails.application.routes.draw do
  get "health", to: "session#health"

  scope :api do
    get "session", to: "session#show"

    scope :student, controller: :student do
      get "profile", action: :profile
      get "courses", action: :courses
      post "course", action: :select_course
      get "lesson", action: :lesson
      get "diagnostic", action: :diagnostic
      post "diagnostic", action: :submit_diagnostic
      post "levels/:level_id/submissions", action: :create_submission
      get "submissions/:id", action: :show_submission
      post "depth", action: :depth
      post "topic", action: :topic
      post "levels/:level_id/assistant", action: :assistant
      post "levels/:level_id/practice", action: :create_practice
      post "levels/:level_id/preview", action: :preview
      post "practice/:id/answers", action: :answer_practice
    end

    scope :teacher, controller: :teacher do
      get "class", action: :show_class
      get "paths", action: :paths
      get "students/:id", action: :show_student
      get "safety", action: :safety
      get "insights", action: :insights
      post "insights/mini-lesson", action: :mini_lesson
      get "authoring", action: :authoring
      post "authoring/drafts", action: :draft
      post "authoring/items/:id/review", action: :review
      get "assignments", action: :assignments
      post "assignments", action: :create_assignment
      post "assignments/group-focus", action: :create_group_focus
      post "assignments/:id/archive", action: :archive_assignment
    end

    # Approval queue for AI-generated content (teacher OR admin).
    scope :review, controller: :review do
      get "items", action: :items
      post "items/:id/review", action: :review
    end

    # Admin-only: a unit's concept matrix (upload -> AI proposal -> review -> save),
    # and teaching appointments (appoint a teacher to a student for a unit).
    scope :admin, controller: :admin do
      get "directory", action: :directory
      post "curriculum/extract", action: :extract_curriculum
      post "curriculum", action: :save_curriculum
      get "curriculum/:unitId", action: :show_curriculum
      get "appointments", action: :appointments
      post "appointments", action: :create_appointment
      post "appointments/remove", action: :remove_appointment
    end

    scope :demo, controller: :demo do
      get "users", action: :users
      get "fault", action: :show_fault
      post "fault", action: :update_fault
      get "units", action: :units
      post "unit", action: :update_unit
      get "routing", action: :show_routing
      post "routing", action: :update_routing
      post "reset", action: :reset
    end
  end
end
