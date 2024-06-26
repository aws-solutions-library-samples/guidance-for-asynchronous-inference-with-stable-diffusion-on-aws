import csv
import datetime
import json
import logging
import random
import os

import boto3
import gevent
from botocore.exceptions import ClientError
from dateutil import parser
from flask import send_file
from locust import HttpUser, events, run_single_user, task
from locust.runners import LocalRunner, MasterRunner
from locust.user.wait_time import between

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(process)s - %(levelname)s - %(message)s')

logger = logging.getLogger("processor")
logger.setLevel(logging.INFO)

API_ENDPOINT=os.getenv("API_ENDPOINT")
API_KEY=os.getenv("API_KEY")
OUTPUT_SQS_NAME=os.getenv("OUTPUT_SQS_NAME")

TEMPLATE=json.loads("""{
  "task": {
    "metadata": {
      "id": "test-t2i",
      "runtime": "sdruntime",
      "tasktype": "text-to-image",
      "prefix": "output",
      "context": ""
    },
    "content": {
      "alwayson_scripts": {},
      "prompt": "A dog",
      "steps": 16,
      "width": 512,
      "height": 512
    }
  }
}""")



stats = {}

sqs = boto3.resource('sqs')

@events.init.add_listener
def locust_init(environment, **kwargs):
    global stats
    stats = {}

    if isinstance(environment.runner, MasterRunner) or isinstance(environment.runner, LocalRunner):
        gevent.spawn(checker, environment)

    if environment.web_ui:
        @environment.web_ui.app.route("/result")
        def get_result():
            task_count = len(stats)
            completed_count = sum((i["complete"] == True) for i in stats.values())
            failed_count = sum((i["error"] == True) for i in stats.values())
            failure_rate = failed_count / task_count
            avg_time_usage = sum(i["time_usage"] for i in stats.values()) / task_count
            response = {
                "task_count": task_count,
                "completed_count": completed_count,
                "failed_count": failed_count,
                "failure_rate": failure_rate,
                "avg_time_usage": avg_time_usage
            }
            return json.dumps(response)

        @environment.web_ui.app.route("/dump_failed")
        def dump_failed():
            failed = dict(filter(lambda x: x[1]["error"], stats.items()))
            return json.dumps(failed)

        @environment.web_ui.app.route("/dump_all")
        def dump_all():
            data_file = open('/tmp/result.csv', 'w')
            csv_writer = csv.writer(data_file)
            count = 0
            for item in stats.values():
                if count == 0:
                    header = item.keys()
                    csv_writer.writerow(header)
                    count += 1
                item["start_time"] = int(item["start_time"])
                item["complete_time"] = int(item["complete_time"])
                csv_writer.writerow(item.values())
            data_file.close()
            return send_file('/tmp/result.csv', as_attachment=True)

def receive_messages(queue, max_number, wait_time):
    try:
        messages = queue.receive_messages(
            MaxNumberOfMessages=max_number,
            WaitTimeSeconds=wait_time,
            AttributeNames=['All'],
            MessageAttributeNames=['All']
        )
    except Exception as error:
        logger.error(f"Error receiving messages: {error}")
    else:
        return messages

def delete_message(message):
    try:
        message.delete()
    except ClientError as error:
        raise error

def checker(environment):
    global stats
    logger.info(f'Checker launched')
    queue = sqs.get_queue_by_name(QueueName=OUTPUT_SQS_NAME)
    # while not environment.runner.state in [STATE_STOPPED]:
    while True:
        received_messages = receive_messages(queue, 10, 20)
        if len(received_messages) == 0:
            logger.debug('No message received')
        else:
            for message in received_messages:
                payload = json.loads(message.body)
                msg = json.loads(payload['Message'])
                succeed = msg['result']
                task_id = msg['id']
                logger.debug(f'Received task with {task_id}')
                if task_id in stats.keys():
                    logger.debug(f'Processing {task_id}')
                    time = parser.parse(payload["Timestamp"]).now(datetime.timezone.utc).timestamp()
                    time_usage = int((time - stats[task_id]['start_time']) * 1000)
                    if succeed:
                        stats[task_id]['complete'] = True
                        stats[task_id]['error'] = False
                        stats[task_id]['complete_time'] = time
                        stats[task_id]['time_usage'] = time_usage
                    else:
                        stats[task_id]['complete'] = True
                        stats[task_id]['error'] = True
                        stats[task_id]['complete_time'] = time
                        stats[task_id]['time_usage'] = time_usage
                else:
                    logger.debug(f'Ignored {task_id}')
                delete_message(message)

@events.test_start.add_listener
def on_test_start(**kwargs):
    global stats
    stats = {}

class MyUser(HttpUser):
    host = "http://0.0.0.0:8089"
    wait_time = between(0.5, 2.0)

    @task
    def txt_to_img(self):
        random_number = str(random.randint(1, 999999999)).zfill(9)
        body = TEMPLATE.copy()
        body["task"]["metadata"]["id"] = str(random_number)
        logger.debug(f'Send request with {random_number}')
        self.client.post(API_ENDPOINT+"v1alpha2",
                         data = json.dumps(body),
                         headers={"x-api-key": API_KEY, "Content-Type": "application/json"},
                         context={"task-id": random_number})

@events.request.add_listener
def on_request(context, **kwargs):
    """
    Event handler that get triggered on every request.
    """
    global stats
    stats[context["task-id"]] = {
                  "task-id": context["task-id"],
                  "start_time": datetime.datetime.now(datetime.timezone.utc).timestamp(),
                  "complete_time": 0.0,
                  "complete": False,
                  "error": False,
                  "time_usage": 0
                }

# if launched directly, e.g. "python3 debugging.py", not "locust -f debugging.py"
if __name__ == "__main__":
    run_single_user(MyUser)