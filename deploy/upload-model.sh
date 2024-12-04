#!/bin/bash

set -e

MODEL_BUCKET="$1"

AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-$(aws ec2 describe-availability-zones --output text --query 'AvailabilityZones[0].[RegionName]')}

MODEL_URL="https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0.safetensors"
MODEL_NAME="sd_xl_turbo_1.0.safetensors"

printf "Transport SDXL-Turbo model from hugging face to S3 bucket...\n"
curl -L "$MODEL_URL" | aws s3 cp - s3://${MODEL_BUCKET}/Stable-diffusion/${MODEL_NAME}

printf "Model uploaded to s3://${MODEL_BUCKET}/Stable-diffusion/${MODEL_NAME}\n"
