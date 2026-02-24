#!/bin/bash
set -euo pipefail

# =============================================================================
# WildMail AWS Deploy Script
# =============================================================================
# Usage:
#   ./deploy.sh all                  # Deploy everything
#   ./deploy.sh processor            # Deploy email processor Lambda
#   ./deploy.sh api                  # Deploy email API Lambda
#   ./deploy.sh spa                  # Build and deploy SPA to S3
#
# Required environment variables (set in deploy.env):
#   AWS_REGION                - AWS region (e.g. ap-southeast-2)
#   PROCESSOR_FUNCTION_NAME   - Lambda function name for email processor
#   API_FUNCTION_NAME         - Lambda function name for email API
#   SPA_BUCKET                - S3 bucket for the SPA static files
#   CLOUDFRONT_DISTRIBUTION_ID - (optional) CloudFront distribution to invalidate
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config
if [ -f "$SCRIPT_DIR/deploy.env" ]; then
  source "$SCRIPT_DIR/deploy.env"
else
  echo "ERROR: deploy.env not found. Copy deploy.env.example and fill in your values."
  exit 1
fi

# Verify required vars
for var in AWS_REGION PROCESSOR_FUNCTION_NAME API_FUNCTION_NAME SPA_BUCKET; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set in deploy.env"
    exit 1
  fi
done

deploy_processor() {
  echo "==> Deploying email processor Lambda..."
  cd "$SCRIPT_DIR/wildmail-email-processor"

  # Install production dependencies
  npm ci --omit=dev

  # Package into zip
  rm -f /tmp/wildmail-processor.zip
  zip -r /tmp/wildmail-processor.zip index.mjs node_modules/ package.json

  # Deploy to Lambda
  aws lambda update-function-code \
    --function-name "$PROCESSOR_FUNCTION_NAME" \
    --zip-file fileb:///tmp/wildmail-processor.zip \
    --region "$AWS_REGION"

  echo "    Processor deployed."
  cd "$SCRIPT_DIR"
}

deploy_api() {
  echo "==> Deploying email API Lambda..."
  cd "$SCRIPT_DIR/wildmail-email-api"

  # Single file, no dependencies (uses Lambda runtime AWS SDK)
  rm -f /tmp/wildmail-api.zip
  zip /tmp/wildmail-api.zip index.mjs

  # Deploy to Lambda
  aws lambda update-function-code \
    --function-name "$API_FUNCTION_NAME" \
    --zip-file fileb:///tmp/wildmail-api.zip \
    --region "$AWS_REGION"

  echo "    API deployed."
  cd "$SCRIPT_DIR"
}

deploy_spa() {
  echo "==> Building and deploying SPA..."
  cd "$SCRIPT_DIR/wildmail-spa/no auth"

  # Install dependencies and build
  npm ci
  npm run build

  # Sync build output to S3
  aws s3 sync build/ "s3://$SPA_BUCKET" \
    --delete \
    --region "$AWS_REGION"

  # Invalidate CloudFront cache if configured
  if [ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]; then
    echo "    Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
      --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
      --paths "/*"
  fi

  echo "    SPA deployed."
  cd "$SCRIPT_DIR"
}

# Parse command
case "${1:-}" in
  processor)
    deploy_processor
    ;;
  api)
    deploy_api
    ;;
  spa)
    deploy_spa
    ;;
  all)
    deploy_processor
    deploy_api
    deploy_spa
    ;;
  *)
    echo "Usage: $0 {processor|api|spa|all}"
    exit 1
    ;;
esac

echo "==> Done."
