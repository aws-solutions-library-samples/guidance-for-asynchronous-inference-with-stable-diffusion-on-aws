#!/bin/bash
set -e

# Configuration
ECR_REPOSITORY="oci://public.ecr.aws/bingjiao/charts"
CHARTS_DIR="src/charts"
CHART_NAME="sd_on_eks"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Helm chart packaging and pushing process...${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if Helm is installed
if ! command -v helm &> /dev/null; then
    echo "Helm is not installed. Please install it first."
    exit 1
fi

# Navigate to the project root directory
cd "$(dirname "$0")"

# Package the Helm chart
echo -e "${YELLOW}Packaging Helm chart: ${CHART_NAME}...${NC}"
helm package "${CHARTS_DIR}/${CHART_NAME}" --destination "${CHARTS_DIR}"

# Get the packaged chart file (latest if multiple versions exist)
CHART_PACKAGE=$(ls -t ${CHARTS_DIR}/sd-on-eks-*.tgz | head -1)
if [ -z "$CHART_PACKAGE" ]; then
    echo "Failed to find packaged chart. Exiting."
    exit 1
fi

CHART_VERSION=$(basename "$CHART_PACKAGE" | sed -E 's/.*-([0-9]+\.[0-9]+\.[0-9]+)\.tgz/\1/')
echo -e "${GREEN}Successfully packaged chart version: ${CHART_VERSION}${NC}"

# Login to ECR public
echo -e "${YELLOW}Logging in to Amazon ECR Public...${NC}"
aws ecr-public get-login-password --region us-east-1 | helm registry login --username AWS --password-stdin public.ecr.aws

# Push the chart to ECR
echo -e "${YELLOW}Pushing chart to ECR repository: ${ECR_REPOSITORY}...${NC}"
helm push "$CHART_PACKAGE" "$ECR_REPOSITORY"

echo -e "${GREEN}Successfully pushed chart ${CHART_NAME} version ${CHART_VERSION} to ${ECR_REPOSITORY}${NC}"