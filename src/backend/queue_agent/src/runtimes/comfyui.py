# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import logging
import time
import traceback
import urllib.parse
import urllib.request
import uuid
from typing import Optional, Dict, List, Any, Union

import websocket  # NOTE: websocket-client (https://github.com/websocket-client/websocket-client)
from aws_xray_sdk.core import xray_recorder
from modules import http_action

logger = logging.getLogger("queue-agent")

# Constants for websocket reconnection
MAX_RECONNECT_ATTEMPTS = 5
RECONNECT_DELAY = 2  # seconds

def singleton(cls):
    _instance = {}

    def inner():
        if cls not in _instance:
            _instance[cls] = cls()
        return _instance[cls]
    return inner

@singleton
class comfyuiCaller(object):

    def __init__(self):
        self.wss = websocket.WebSocket()
        self.client_id = str(uuid.uuid4())
        self.api_base_url = None
        self.connected = False

    def setUrl(self, api_base_url:str):
        self.api_base_url = api_base_url

    def wss_connect(self):
        """Connect to websocket with reconnection logic"""
        if self.connected:
            return True

        attempts = 0
        while attempts < MAX_RECONNECT_ATTEMPTS:
            try:
                logger.info(f"Connecting to websocket (attempt {attempts+1}/{MAX_RECONNECT_ATTEMPTS})")
                self.wss.connect("ws://{}/ws?clientId={}".format(self.api_base_url, self.client_id))
                self.connected = True
                logger.info("Successfully connected to websocket")
                return True
            except Exception as e:
                attempts += 1
                logger.warning(f"Failed to connect to websocket: {str(e)}")
                if attempts < MAX_RECONNECT_ATTEMPTS:
                    logger.info(f"Retrying in {RECONNECT_DELAY} seconds...")
                    time.sleep(RECONNECT_DELAY)
                else:
                    logger.error("Max reconnection attempts reached")
                    raise ConnectionError(f"Failed to connect to ComfyUI websocket after {MAX_RECONNECT_ATTEMPTS} attempts") from e

        return False

    def wss_recv(self) -> Optional[str]:
        """Receive data from websocket with reconnection logic"""
        attempts = 0
        while attempts < MAX_RECONNECT_ATTEMPTS:
            try:
                return self.wss.recv()
            except websocket.WebSocketConnectionClosedException:
                attempts += 1
                logger.warning(f"WebSocket connection closed, attempting to reconnect (attempt {attempts}/{MAX_RECONNECT_ATTEMPTS})...")
                self.connected = False

                if attempts < MAX_RECONNECT_ATTEMPTS:
                    if self.wss_connect():
                        logger.info("Reconnected successfully, retrying receive operation")
                        continue
                    else:
                        logger.warning(f"Failed to reconnect, waiting {RECONNECT_DELAY} seconds before retry...")
                        time.sleep(RECONNECT_DELAY)
                else:
                    logger.error("Max reconnection attempts reached in wss_recv")
                    return None
            except Exception as e:
                attempts += 1
                logger.error(f"Error receiving data from websocket: {str(e)}")
                self.connected = False

                if attempts < MAX_RECONNECT_ATTEMPTS:
                    logger.info(f"Waiting {RECONNECT_DELAY} seconds before retry...")
                    time.sleep(RECONNECT_DELAY)
                    if self.wss_connect():
                        logger.info("Reconnected successfully, retrying receive operation")
                        continue
                else:
                    logger.error("Max reconnection attempts reached in wss_recv")
                    return None

        return None

    def get_history(self, prompt_id):
        try:
            url = f"http://{self.api_base_url}/history/{prompt_id}"
            # Use the http_action module with built-in retry logic
            return http_action.do_invocations(url)
        except Exception as e:
            logger.error(f"Error in get_history: {str(e)}")
            return {}

    def queue_prompt(self, prompt):
        try:
            p = {"prompt": prompt, "client_id": self.client_id}
            url = f"http://{self.api_base_url}/prompt"

            # Use the http_action module with built-in retry logic
            response = http_action.do_invocations(url, p)
            return response
        except Exception as e:
            logger.error(f"Error in queue_prompt: {str(e)}")
            return None

    def get_image(self, filename, subfolder, folder_type):
        try:
            data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
            url_values = urllib.parse.urlencode(data)
            url = f"http://{self.api_base_url}/view?{url_values}"

            # Use http_action.get which returns bytes directly
            return http_action.get(url)
        except Exception as e:
            logger.error(f"Error getting image {filename}: {str(e)}")
            return b''  # Return empty bytes on error

    def track_progress(self, prompt, prompt_id):
        logger.info("Task received, prompt ID:" + prompt_id)
        node_ids = list(prompt.keys())
        finished_nodes = []
        max_errors = 5
        error_count = 0

        while True:
            try:
                out = self.wss_recv()  # Using our new method with reconnection logic
                if out is None:
                    error_count += 1
                    logger.warning(f"Failed to receive data from websocket (error {error_count}/{max_errors})")
                    if error_count >= max_errors:
                        logger.error("Too many errors receiving websocket data, aborting track_progress")
                        return False
                    time.sleep(1)
                    continue

                error_count = 0  # Reset error count on successful receive

                if isinstance(out, str):
                    try:
                        message = json.loads(out)
                        logger.debug(out)
                        if message['type'] == 'progress':
                            data = message['data']
                            current_step = data['value']
                            logger.info(f"In K-Sampler -> Step: {current_step} of: {data['max']}")
                        if message['type'] == 'execution_cached':
                            data = message['data']
                            for itm in data['nodes']:
                                if itm not in finished_nodes:
                                    finished_nodes.append(itm)
                                    logger.info(f"Progress: {len(finished_nodes)} / {len(node_ids)} tasks done")
                        if message['type'] == 'executing':
                            data = message['data']
                            if data['node'] not in finished_nodes:
                                finished_nodes.append(data['node'])
                                logger.info(f"Progress: {len(finished_nodes)} / {len(node_ids)} tasks done")

                            if data['node'] is None and data['prompt_id'] == prompt_id:
                                return True  # Execution is done successfully
                    except json.JSONDecodeError as e:
                        logger.warning(f"Error parsing websocket message: {str(e)}, skipping message")
                        continue
                    except KeyError as e:
                        logger.warning(f"Missing key in websocket message: {str(e)}, skipping message")
                        continue
                else:
                    continue
            except Exception as e:
                error_count += 1
                logger.warning(f"Unexpected error in track_progress: {str(e)} (error {error_count}/{max_errors})")
                if error_count >= max_errors:
                    logger.error("Too many errors in track_progress, aborting")
                    return False
                time.sleep(1)

        return True

    def get_images(self, prompt):
        max_retries = 3
        retry_count = 0

        while retry_count < max_retries:
            try:
                output = self.queue_prompt(prompt)
                if output is None:
                    raise RuntimeError("Failed to queue prompt - internal error")

                prompt_id = output['prompt_id']
                output_images = {}

                self.track_progress(prompt, prompt_id)

                history = self.get_history(prompt_id)[prompt_id]
                for o in history['outputs']:
                    for node_id in history['outputs']:
                        node_output = history['outputs'][node_id]
                        # image branch
                        if 'images' in node_output:
                            images_output = []
                            for image in node_output['images']:
                                image_data = self.get_image(image['filename'], image['subfolder'], image['type'])
                                images_output.append(image_data)
                            output_images[node_id] = images_output
                        # video branch
                        if 'videos' in node_output:
                            videos_output = []
                            for video in node_output['videos']:
                                video_data = self.get_image(video['filename'], video['subfolder'], video['type'])
                                videos_output.append(video_data)
                            output_images[node_id] = videos_output

                # If we got here, everything worked
                return output_images

            except websocket.WebSocketConnectionClosedException as e:
                retry_count += 1
                logger.warning(f"WebSocket connection closed during processing (attempt {retry_count}/{max_retries})")

                # Try to reconnect before retrying
                self.connected = False
                if retry_count < max_retries:
                    logger.info("Attempting to reconnect websocket...")
                    if self.wss_connect():
                        logger.info("Reconnected successfully, retrying operation")
                        time.sleep(1)  # Small delay before retry
                    else:
                        logger.error("Failed to reconnect websocket")
                else:
                    logger.error(f"Failed after {max_retries} attempts")
                    raise RuntimeError(f"Failed to process images after {max_retries} attempts") from e

            except Exception as e:
                logger.error(f"Error processing images: {str(e)}")
                retry_count += 1

                # For non-websocket errors, we might still want to try reconnecting the websocket
                if not self.connected and retry_count < max_retries:
                    logger.info("Attempting to reconnect websocket...")
                    self.wss_connect()
                    time.sleep(1)  # Small delay before retry
                else:
                    # If it's not a connection issue or we've tried enough times, re-raise
                    if retry_count >= max_retries:
                        raise

        # This should not be reached, but just in case
        raise RuntimeError(f"Failed to process images after {max_retries} attempts")

    def parse_worflow(self, prompt_data):
        logger.debug(prompt_data)
        return self.get_images(prompt_data)


def check_readiness(api_base_url: str) -> bool:
    cf = comfyuiCaller()
    cf.setUrl(api_base_url)
    logger.info("Init health check... ")
    try:
        logger.info(f"Try to connect to ComfyUI backend {api_base_url} ... ")
        if cf.wss_connect():
            logger.info(f"ComfyUI backend {api_base_url} connected.")
            return True
        else:
            logger.error(f"Failed to connect to ComfyUI backend {api_base_url}")
            return False
    except Exception as e:
        logger.error(f"Error during health check: {str(e)}")
        return False


def handler(api_base_url: str, task_id: str, payload: dict) -> dict:
    response = {
        "success": False,
        "image": [],
        "content": '{"code": 500}'
    }

    try:
        logger.info(f"Processing pipeline task with ID: {task_id}")

        # Attempt to invoke the pipeline
        try:
            images = invoke_pipeline(api_base_url, payload)

            # Process images if available
            imgOutputs = post_invocations(images)
            logger.info(f"Received {len(imgOutputs)} images")

            # Set success response
            response["success"] = True
            response["image"] = imgOutputs
            response["content"] = '{"code": 200}'
            logger.info(f"End process pipeline task with ID: {task_id}")
        except Exception as e:
            logger.error(f"Error processing pipeline: {str(e)}")
            # Keep default failure response
    except Exception as e:
        # This is a catch-all for any unexpected errors
        logger.error(f"Unexpected error in handler for task ID {task_id}: {str(e)}")
        traceback.print_exc()

    return response

def invoke_pipeline(api_base_url: str, body) -> str:
    cf = comfyuiCaller()
    cf.setUrl(api_base_url)

    # Ensure websocket connection is established before proceeding
    if not cf.wss_connect():
        raise ConnectionError(f"Failed to establish websocket connection to {api_base_url}")

    return cf.parse_worflow(body)

def post_invocations(image):
    img_bytes = []

    if len(image) > 0:
        for node_id in image:
            for image_data in image[node_id]:
                img_bytes.append(image_data)

    return img_bytes