namespace :db do
  desc "Create or update tables (idempotent)"
  task schema: :environment do
    sql = Rails.root.join("db/schema.sql").read
    # The Data API runs one statement per call; split on semicolons at line ends.
    sql.split(/;\s*$/).map(&:strip).reject { |s| s.empty? || s.lines.all? { |l| l.strip.start_with?("--") || l.strip.empty? } }.each do |stmt|
      Db.execute(stmt)
    end
    puts "Schema applied."
  end

  desc "Load synthetic demo users and seeded progress (wipes existing rows)"
  task seed: :environment do
    DemoSeed.run!
    puts "Seeded #{DemoSeed::STUDENTS.size} students and 1 teacher."
  end

  desc "schema + seed"
  task setup: %i[schema seed]
end
