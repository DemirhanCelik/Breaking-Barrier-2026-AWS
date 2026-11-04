# Authentication (design §11). AUTH_MODE:
#   cognito - Authorization: Bearer <Cognito ID token>. Role from cognito:groups
#             ("teacher" group => teacher, otherwise student). Default.
#   demo    - X-Demo-User: <seeded user id>. Synthetic users only; for local
#             development and the hackathon demo before Cognito is wired into
#             the frontend. Never enable with real student data.
require "jwt"
require "net/http"

module Auth
  User = Struct.new(:id, :display_name, :role, keyword_init: true) do
    def teacher? = role == "teacher"
    def student? = role == "student"
    def admin? = role == "admin"
    # Teacher or admin may approve AI-generated content.
    def approver? = teacher? || admin?
    def as_json(*) = { id: id, displayName: display_name, role: role }
  end

  JWKS_TTL = 3600

  module_function

  def mode = ENV.fetch("AUTH_MODE", "cognito")
  def demo? = mode == "demo"

  # Cognito group -> role. admin wins, then teacher, else student. A user in the
  # 'admin' group is an admin even if also in 'teacher' (admin is the narrower,
  # progress-blind role by policy; approval power is a superset via approver?).
  def role_for(groups)
    return "admin" if groups.include?("admin")
    return "teacher" if groups.include?("teacher")
    "student"
  end

  # Returns an Auth::User or nil.
  def authenticate(request)
    demo? ? from_demo_header(request) : from_bearer(request)
  end

  def from_demo_header(request)
    id = request.headers["X-Demo-User"].to_s
    return nil if id.empty?
    row = Db.query("SELECT id, display_name, role FROM app_user WHERE id = :id", id: id).first
    row && User.new(id: row["id"], display_name: row["display_name"], role: row["role"])
  end

  def from_bearer(request)
    token = request.headers["Authorization"].to_s[/\ABearer (.+)\z/, 1]
    return nil unless token
    claims = verify(token)
    return nil unless claims
    role = role_for(Array(claims["cognito:groups"]))
    provision(claims["sub"], role, link_id: claims["preferred_username"])
  end

  # Verifies signature, issuer, audience, expiry and token_use (ID token).
  def verify(token)
    region = ENV.fetch("COGNITO_REGION") { ENV.fetch("AWS_REGION", "us-east-1") }
    pool = ENV.fetch("COGNITO_USER_POOL_ID")
    issuer = "https://cognito-idp.#{region}.amazonaws.com/#{pool}"
    payload, = JWT.decode(token, nil, true,
                          algorithms: ["RS256"], iss: issuer, verify_iss: true,
                          aud: ENV.fetch("COGNITO_CLIENT_ID"), verify_aud: true,
                          jwks: ->(opts) { jwks(issuer, force: opts[:kid_not_found]) })
    payload["token_use"] == "id" ? payload : nil
  rescue JWT::DecodeError => e
    Rails.logger.info("[auth] rejected token: #{e.class}")
    nil
  end

  def jwks(issuer, force: false)
    @jwks = nil if force || (@jwks_at && Time.now - @jwks_at > JWKS_TTL)
    @jwks ||= begin
      @jwks_at = Time.now
      JWT::JWK::Set.new(JSON.parse(Net::HTTP.get(URI("#{issuer}/.well-known/jwks.json"))))
    end
  end

  # Maps a Cognito sub to an app user. No names or emails are copied from the
  # token (NFR2); display names are pseudonymous until a roster integration exists.
  #
  # link_id: admin-set `preferred_username` that binds a Cognito user to a
  # pre-seeded app_user row (the synthetic demo accounts). Users cannot change it:
  # the SPA client has no write access to that attribute. A row is linked only
  # while it has no cognito_sub yet, and only when the roles agree.
  def provision(sub, role, link_id: nil)
    row = Db.query("SELECT id, display_name, role FROM app_user WHERE cognito_sub = :sub", sub: sub).first
    if !row && link_id.present?
      row = Db.query(<<~SQL, id: link_id, sub: sub, role: role).first
        UPDATE app_user SET cognito_sub = :sub
        WHERE id = :id AND cognito_sub IS NULL AND role = :role
        RETURNING id, display_name, role
      SQL
    end
    unless row
      id = "u-#{sub[0, 8]}"
      name = role == "teacher" ? "Teacher #{sub[0, 4]}" : "Student #{sub[0, 4]}"
      Db.execute(<<~SQL, id: id, sub: sub, name: name, role: role)
        INSERT INTO app_user (id, cognito_sub, display_name, role) VALUES (:id, :sub, :name, :role)
        ON CONFLICT (id) DO NOTHING
      SQL
      if role == "student"
        Db.execute("INSERT INTO enrollment (student_id, klass_id) VALUES (:id, :k) ON CONFLICT DO NOTHING",
                   id: id, k: Curriculum.current.klass["id"])
      end
      row = { "id" => id, "display_name" => name, "role" => role }
    end
    # Group membership in the token is the source of truth for the role.
    User.new(id: row["id"], display_name: row["display_name"], role: role)
  end
end
