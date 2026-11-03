# Lambda container image for the Rails API (Ruby 3.3, Amazon Linux 2023).
# Build:  docker build -t codeai-api api/
FROM public.ecr.aws/lambda/ruby:3.3 AS build
RUN dnf install -y gcc gcc-c++ make libyaml-devel && dnf clean all
WORKDIR /var/task
COPY Gemfile Gemfile.lock ./
ENV BUNDLE_PATH=vendor/bundle BUNDLE_WITHOUT=development BUNDLE_DEPLOYMENT=1
RUN bundle install --jobs 4 && rm -rf vendor/bundle/ruby/*/cache

FROM public.ecr.aws/lambda/ruby:3.3
WORKDIR /var/task
ENV RAILS_ENV=production RACK_ENV=production BUNDLE_PATH=vendor/bundle BUNDLE_WITHOUT=development \
    BUNDLE_DEPLOYMENT=1 RAILS_LOG_TO_STDOUT=1 BOOTSNAP_CACHE_DIR=/tmp
COPY --from=build /var/task/vendor ./vendor
COPY . .
RUN rm -rf log tmp && ln -s /tmp log && ln -s /tmp tmp
CMD ["app.handler"]
