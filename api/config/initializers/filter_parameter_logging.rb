# Student text and tokens never go to logs.
Rails.application.config.filter_parameters += %i[response message answers token password secret]
