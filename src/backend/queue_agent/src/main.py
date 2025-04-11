# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import logging
import os
import signal
import sys
import uuid
import time
import functools

import boto3
from botocore.exceptions import EndpointConnectionError
from aws_xray_sdk.core import patch_all, xray_recorder
from aws_xray_sdk.core.models.trace_header import TraceHeader
from modules import s3_action, sns_action, sqs_action
from runtimes import comfyui, sdwebui

# Initialize logging first so we can log X-Ray initialization attempts
logging.basicConfig()
logging.getLogger().setLevel(logging.ERROR)

# Configure the queue-agent logger only once
logger = logging.getLogger("queue-agent")
logger.propagate = False
logger.setLevel(os.environ.get('LOGLEVEL', 'INFO').upper())

# Remove any existing handlers to prevent duplicate logs
if logger.handlers:
    logger.handlers.clear()

# Add a single handler
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)

# Check if X-Ray is manually disabled via environment variable
DISABLE_XRAY = os.environ.get('DISABLE_XRAY', 'false').lower() == 'true'
if DISABLE_XRAY:
    logger.info("X-Ray tracing manually disabled via DISABLE_XRAY environment variable")
    xray_enabled = False
else:
    # Try to initialize X-Ray SDK with retries, as the daemon might be starting up
    MAX_XRAY_INIT_ATTEMPTS = 5
    XRAY_RETRY_DELAY = 3  # seconds
    xray_enabled = False

    for attempt in range(MAX_XRAY_INIT_ATTEMPTS):
        try:
            logger.info(f"Attempting to initialize X-Ray SDK (attempt {attempt+1}/{MAX_XRAY_INIT_ATTEMPTS})")
            patch_all()
            xray_enabled = True
            logger.info("X-Ray SDK initialized successfully")
            break
        except EndpointConnectionError:
            logger.warning(f"Could not connect to X-Ray daemon (attempt {attempt+1}/{MAX_XRAY_INIT_ATTEMPTS})")
            if attempt < MAX_XRAY_INIT_ATTEMPTS - 1:
                logger.info(f"Retrying in {XRAY_RETRY_DELAY} seconds...")
                time.sleep(XRAY_RETRY_DELAY)
        except Exception as e:
            logger.warning(f"Error initializing X-Ray: {str(e)} (attempt {attempt+1}/{MAX_XRAY_INIT_ATTEMPTS})")
            if attempt < MAX_XRAY_INIT_ATTEMPTS - 1:
                logger.info(f"Retrying in {XRAY_RETRY_DELAY} seconds...")
                time.sleep(XRAY_RETRY_DELAY)

    if not xray_enabled:
        logger.warning("X-Ray initialization failed after all attempts. Tracing will be disabled.")

# Create a decorator for safe X-Ray instrumentation
def safe_xray_capture(name):
    """Decorator that safely applies X-Ray instrumentation if available"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if xray_enabled:
                try:
                    # Try to use X-Ray instrumentation
                    with xray_recorder.in_segment(name):
                        return func(*args, **kwargs)
                except Exception as e:
                    logger.warning(f"X-Ray instrumentation failed for {name}: {str(e)}")
                    # Fall back to non-instrumented execution
                    return func(*args, **kwargs)
            else:
                # X-Ray is disabled, just call the function directly
                return func(*args, **kwargs)
        return wrapper
    return decorator

# Get base environment variable
aws_default_region = os.getenv("AWS_DEFAULT_REGION")
sqs_queue_url = os.getenv("SQS_QUEUE_URL")
sns_topic_arn = os.getenv("SNS_TOPIC_ARN")
s3_bucket = os.getenv("S3_BUCKET")
runtime_name = os.getenv("RUNTIME_NAME", "")
api_base_url = ""

exp_callback_when_running = os.getenv("EXP_CALLBACK_WHEN_RUNNING", "")

# Check current runtime type
runtime_type = os.getenv("RUNTIME_TYPE", "").lower()

# Runtime type should be specified
if runtime_type == "":
    logger.error(f'Runtime type not specified')
    raise RuntimeError

# Init for SD Web UI
if runtime_type == "sdwebui":
    api_base_url = os.getenv("API_BASE_URL", "http://localhost:8080/sdapi/v1/")
    dynamic_sd_model_str = os.getenv("DYNAMIC_SD_MODEL", "false")
    if dynamic_sd_model_str.lower() == "false":
        dynamic_sd_model = False
    else:
        dynamic_sd_model = True

# Init for ComfyUI
if runtime_type == "comfyui":
    api_base_url = os.getenv("API_BASE_URL", "localhost:8080")
    client_id = str(uuid.uuid4())
    # Change here to ComfyUI's base URL
    # You can specify any required environment variable here

sqsRes = boto3.resource('sqs')
snsRes = boto3.resource('sns')

SQS_WAIT_TIME_SECONDS = 20

# For graceful shutdown
shutdown = False

def main():
    # Initialization:
    # 1. Environment parameters;
    # 2. AWS services resources(sqs/sns/s3);
    # 3. SD API readiness check, current checkpoint cached;
    print_env()

    queue = sqsRes.Queue(sqs_queue_url)
    topic = snsRes.Topic(sns_topic_arn)

    if runtime_type == "sdwebui":
        sdwebui.check_readiness(api_base_url, dynamic_sd_model)

    if runtime_type == "comfyui":
        comfyui.check_readiness(api_base_url)

    # main loop
    # 1. Pull msg from sqs;
    # 2. Translate parameteres;
    # 3. (opt)Switch model;
    # 4. (opt)Prepare inputs for image downloading and encoding;
    # 5. Call SD API;
    # 6. Prepare outputs for decoding, uploading and notifying;
    # 7. Delete msg;
    while True:
        if shutdown:
            logger.info('Received SIGTERM, shutting down...')
            break

        received_messages = sqs_action.receive_messages(queue, 1, SQS_WAIT_TIME_SECONDS)

        for message in received_messages:
            # Process with X-Ray if enabled, otherwise just process the message directly
            if xray_enabled:
                try:
                    with xray_recorder.in_segment(runtime_name+"-queue-agent") as segment:
                        # Retrieve x-ray trace header from SQS message
                        if "AWSTraceHeader" in message.attributes.keys():
                            traceHeaderStr = message.attributes['AWSTraceHeader']
                            sqsTraceHeader = TraceHeader.from_header_str(traceHeaderStr)
                            # Update current segment to link with SQS
                            segment.trace_id = sqsTraceHeader.root
                            segment.parent_id = sqsTraceHeader.parent
                            segment.sampled = sqsTraceHeader.sampled

                        # Process the message within the X-Ray segment
                        process_message(message, topic, s3_bucket, runtime_type, runtime_name, api_base_url, dynamic_sd_model if runtime_type == "sdwebui" else None)
                except Exception as e:
                    logger.error(f"Error with X-Ray tracing: {str(e)}. Processing message without tracing.")
                    process_message(message, topic, s3_bucket, runtime_type, runtime_name, api_base_url, dynamic_sd_model if runtime_type == "sdwebui" else None)
            else:
                # Process without X-Ray tracing
                process_message(message, topic, s3_bucket, runtime_type, runtime_name, api_base_url, dynamic_sd_model if runtime_type == "sdwebui" else None)

def process_message(message, topic, s3_bucket, runtime_type, runtime_name, api_base_url, dynamic_sd_model=None):
    """Process a single SQS message"""
    # Process received message
    try:
        payload = json.loads(json.loads(message.body)['Message'])
        metadata = payload["metadata"]
        task_id = metadata["id"]

        logger.info(f"Received task {task_id}, processing")

        if "prefix" in metadata.keys():
            if metadata["prefix"][-1] == '/':
                prefix = metadata["prefix"] + str(task_id)
            else:
                prefix = metadata["prefix"] + "/" + str(task_id)
        else:
            prefix = str(task_id)

        if "tasktype" in metadata.keys():
            tasktype = metadata["tasktype"]

        if "context" in metadata.keys():
            context = metadata["context"]
        else:
            context = {}

        body = payload["content"]
        logger.debug(body)
    except Exception as e:
        logger.error(f"Error parsing message: {e}, skipping")
        logger.debug(payload)
        sqs_action.delete_message(message)
        return

    if (exp_callback_when_running.lower() == "true"):
        sns_response = {"runtime": runtime_name,
                    'id': task_id,
                    'status': "running",
                    'context': context}

        sns_action.publish_message(topic, json.dumps(sns_response))

    # Start handling message
    response = {}

    try:
        if runtime_type == "sdwebui":
            response = sdwebui.handler(api_base_url, tasktype, task_id, body, dynamic_sd_model)

        if runtime_type == "comfyui":
            response = comfyui.handler(api_base_url, task_id, body)
    except Exception as e:
        logger.error(f"Error calling handler for task {task_id}: {str(e)}")
        response = {
            "success": False,
            "image": [],
            "content": '{"code": 500, "error": "Runtime handler failed"}'
        }

    result = []
    rand = str(uuid.uuid4())[0:4]

    if response["success"]:
        idx = 0
        if len(response["image"]) > 0:
            for i in response["image"]:
                idx += 1
                result.append(s3_action.upload_file(i, s3_bucket, prefix, str(task_id)+"-"+rand+"-"+str(idx)))

    output_url = s3_action.upload_file(response["content"], s3_bucket, prefix, str(task_id)+"-"+rand, ".out")

    if response["success"]:
        status = "completed"
    else:
        status = "failed"

    sns_response = {"runtime": runtime_name,
                    'id': task_id,
                    'result': response["success"],
                    'status': status,
                    'image_url': result,
                    'output_url': output_url,
                    'context': context}

    # Put response handler to SNS and delete message
    sns_action.publish_message(topic, json.dumps(sns_response))
    sqs_action.delete_message(message)

def print_env() -> None:
    logger.info(f'AWS_DEFAULT_REGION={aws_default_region}')
    logger.info(f'SQS_QUEUE_URL={sqs_queue_url}')
    logger.info(f'SNS_TOPIC_ARN={sns_topic_arn}')
    logger.info(f'S3_BUCKET={s3_bucket}')
    logger.info(f'RUNTIME_TYPE={runtime_type}')
    logger.info(f'RUNTIME_NAME={runtime_name}')
    logger.info(f'X-Ray Tracing: {"Disabled" if DISABLE_XRAY else "Enabled"}')
    logger.info(f'X-Ray Status: {"Active" if xray_enabled else "Inactive"}')

def signalHandler(signum, frame):
    global shutdown
    shutdown = True

if __name__ == '__main__':
    for sig in [signal.SIGINT, signal.SIGHUP, signal.SIGTERM]:
        signal.signal(sig, signalHandler)
    main()
