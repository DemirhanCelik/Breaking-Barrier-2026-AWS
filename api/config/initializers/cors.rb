# Browser origins allowed to call the API, comma-separated.
# API Gateway may also answer preflight; keep both lists in sync.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*ENV.fetch("ALLOWED_ORIGINS", "http://localhost:5173").split(",").map(&:strip))
    resource "/api/*",
             headers: %w[Authorization Content-Type X-Demo-User X-Agent-Token],
             methods: %i[get post options],
             max_age: 3600
  end
end
