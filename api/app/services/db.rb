# Thin SQL layer with two drivers, chosen by DB_DRIVER:
#   pg       - direct Postgres connection (local development, DATABASE_URL)
#   data_api - Aurora PostgreSQL through the RDS Data API (Lambda; no VPC/NAT)
#
# There is no maintained ActiveRecord adapter for the Data API on Rails 7, so
# the app uses plain parameterized SQL. Write SQL with :named params; never
# interpolate values into SQL strings.
#
#   Db.query("SELECT * FROM app_user WHERE id = :id", id: "s-hithesh")
#   Db.json(hash) -> pass as CAST(:x AS jsonb)
require "json"
require "monitor"

module Db
  class Error < StandardError; end

  PARAM = /(?<!:):([a-z_][a-z0-9_]*)/

  module_function

  def query(sql, params = {})
    driver.query(sql, params.transform_keys(&:to_s))
  end

  def execute(sql, params = {})
    query(sql, params)
    nil
  end

  def json(value)
    JSON.generate(value)
  end

  def driver
    @driver ||= build_driver
  end

  def reset!
    @driver = nil
  end

  def build_driver
    case ENV.fetch("DB_DRIVER", "pg")
    when "data_api" then DataApiDriver.new
    when "pg" then PgDriver.new
    else raise Error, "Unknown DB_DRIVER #{ENV['DB_DRIVER'].inspect}"
    end
  end

  class PgDriver
    def initialize
      require "pg"
      @url = ENV.fetch("DATABASE_URL", "postgres://codeai:codeai@localhost:5432/codeai")
      # One shared connection, used by one request at a time: a PG connection must not
      # run concurrent queries (local Puma serves several requests at once).
      @lock = Monitor.new
    end

    def query(sql, params)
      names = []
      pg_sql = sql.gsub(PARAM) do
        name = Regexp.last_match(1)
        raise Error, "Missing SQL param :#{name}" unless params.key?(name)
        names << name unless names.include?(name)
        "$#{names.index(name) + 1}"
      end
      values = names.map { |n| encode(params[n]) }
      @lock.synchronize do
        result = connection.exec_params(pg_sql, values)
        types = result.fields.each_with_index.to_h { |f, i| [f, result.ftype(i)] }
        result.map { |row| row.to_h { |k, v| [k, decode(v, types[k])] } }
      end
    rescue PG::ConnectionBad, PG::UnableToSend
      @conn = nil
      raise
    rescue PG::Error => e
      raise Error, e.message
    end

    private

    def connection
      @conn ||= PG.connect(@url)
    end

    def encode(v)
      case v
      when true then "t"
      when false then "f"
      else v
      end
    end

    # 16 bool, 20/21/23 ints, 114/3802 json/jsonb
    def decode(v, oid)
      return nil if v.nil?
      case oid
      when 16 then v == "t"
      when 20, 21, 23 then v.to_i
      when 114, 3802 then JSON.parse(v)
      else v
      end
    end
  end

  class DataApiDriver
    def initialize
      require "aws-sdk-rdsdataservice"
      @client = Aws::RDSDataService::Client.new
      @cluster_arn = ENV.fetch("DB_CLUSTER_ARN")
      @secret_arn = ENV.fetch("DB_SECRET_ARN")
      @database = ENV.fetch("DB_NAME", "codeai")
    end

    def query(sql, params)
      used = sql.scan(PARAM).flatten.uniq
      missing = used - params.keys
      raise Error, "Missing SQL param(s) #{missing.join(', ')}" if missing.any?
      resp = with_resume_retry do
        @client.execute_statement(
          resource_arn: @cluster_arn,
          secret_arn: @secret_arn,
          database: @database,
          sql: sql,
          parameters: used.map { |n| { name: n, value: field(params[n]) } },
          format_records_as: "JSON",
        )
      end
      resp.formatted_records ? JSON.parse(resp.formatted_records).map { |r| decode_row(r) } : []
    rescue Aws::RDSDataService::Errors::ServiceError => e
      raise Error, "#{e.class.name.split('::').last}: #{e.message}"
    end

    private

    def field(v)
      case v
      when nil then { is_null: true }
      when true, false then { boolean_value: v }
      when Integer then { long_value: v }
      when Float then { double_value: v }
      else { string_value: v.to_s }
      end
    end

    # The Data API returns jsonb columns as strings. By convention every jsonb
    # column name ends in `_json`, so only those are parsed (student text that
    # happens to look like JSON stays a string).
    def decode_row(row)
      row.to_h { |k, v| [k, k.end_with?("_json") && v.is_a?(String) ? JSON.parse(v) : v] }
    end

    # Aurora Serverless v2 at 0 ACU auto-pauses; the first call while it resumes
    # fails with DatabaseResumingException. Retry for up to ~30s.
    def with_resume_retry
      attempts = 0
      begin
        yield
      rescue Aws::RDSDataService::Errors::DatabaseResumingException
        attempts += 1
        raise if attempts > 6
        sleep 5
        retry
      end
    end
  end
end
