# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import os
import logging

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sns_client = boto3.client('sns')

def lambda_handler(event, context):
    if event['httpMethod'] == 'POST':
        try:
            payload = json.loads(event['body'])["task"]
            val = validate(payload)
            if val != "success":
                return {
                    'statusCode': 400,
                    'body': 'Incorrect payload structure, ' + val
                }

            id = payload["metadata"]["id"]
            runtime = payload["metadata"]["runtime"]
            prefix = payload["metadata"]["prefix"]
            s3_output_path = f"{os.environ['S3_OUTPUT_BUCKET']}/{prefix}/{id}"

            print(event['headers'])
            print(event['queryStringParameters'])

            sns_client.publish(
                TargetArn=os.environ['SNS_TOPIC_ARN'],
                Message=json.dumps(payload),
                MessageAttributes={
                    'runtime': {
                        'DataType': 'String',
                        'StringValue': runtime
                    }
                }
            )

            return {
                'statusCode': 200,
                'body': json.dumps({
                    "id": id,
                    "runtime": runtime,
                    "output_location": f"s3://{s3_output_path}"
                })
            }

        except Exception as e:
            logger.error(f"Error processing request: {type(e).__name__}")
            return {
                'statusCode': 400,
                'body': "Invalid request format"
            }
    else:
        return {
            'statusCode': 400,
            'body': "Unsupported HTTP method"
        }


def validate(body: dict) -> str:
    # Check payload size (1MB limit)
    if len(json.dumps(body)) > 1024 * 1024:
        return "payload too large"
    
    result = "success"
    if "metadata" not in body.keys():
        result = "metadata is missing"
    else:
        if "id" not in body["metadata"].keys():
            result = "id is missing"
        if "runtime" not in body["metadata"].keys():
            result = "runtime is missing"
        if "tasktype" not in body["metadata"].keys():
            result = "tasktype is missing"
            
        # Validate id format (alphanumeric only)
        task_id = body["metadata"].get("id", "")
        if not isinstance(task_id, str) or not task_id.replace("-", "").replace("_", "").isalnum():
            result = "invalid id format"
            
        # Validate tasktype
        tasktype = body["metadata"].get("tasktype", "")
        if tasktype not in ["text-to-image", "image-to-image", "extra-single-image"]:
            result = "invalid tasktype"
            
        # Validate runtime format
        runtime = body["metadata"].get("runtime", "")
        if not isinstance(runtime, str) or not runtime.replace("-", "").replace("_", "").isalnum():
            result = "invalid runtime format"
    
    if "content" not in body.keys():
        result = "content is missing"
    
    return result