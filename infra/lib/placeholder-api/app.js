// Neutral placeholder handler for the API Lambda.
//
// This is a stand-in so the stack deploys before the real Rails 7.1 API image
// exists. Replace this image at deploy time with your Rails app (bundling the
// AWS Lambda Web Adapter). The placeholder returns a simple 200 so smoke tests
// pass; it makes no downstream calls.
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    service: 'codeai-rails-api',
    status: 'placeholder',
    message: 'Infrastructure deployed. Replace this Lambda image with the Rails API.',
  }),
});
