namespace :db do
  desc "Create or update tables (idempotent)"
  task schema: :environment do
    sql = Rails.root.join("db/schema.sql").read
    # The Data API runs one statement per call; split on semicolons at line ends.
    sql.split(/;\s*$/).map(&:strip).reject { |s| s.empty? || s.lines.all? { |l| l.strip.start_with?("--") || l.strip.empty? } }.each do |stmt|
      Db.execute(stmt)
    end
    # Migration files are one complete statement each (including DO blocks).
    Dir[Rails.root.join("db/migrations/*.sql")].sort.each { |file| Db.execute(File.read(file)) }
    puts "Schema applied."
  end

  desc "Load synthetic demo users and seeded progress (wipes existing rows)"
  task seed: :environment do
    DemoSeed.run!
    puts "Seeded #{DemoSeed::STUDENTS.size} students and 1 teacher."
  end

  desc "Seed a new empty demo database without replacing existing users or work"
  task seed_if_empty: :environment do
    if Db.query("SELECT count(*) AS n FROM app_user").first["n"].to_i.zero?
      DemoSeed.run!
      puts "Initialized the empty demo database."
    else
      puts "Existing users found; preserved all course progress."
    end
  end

  desc "Apply schema and initialize demo users only when the database is empty"
  task initialize: %i[schema seed_if_empty]

  desc "schema + seed (explicitly replaces all demo work)"
  task setup: %i[schema seed]
end
