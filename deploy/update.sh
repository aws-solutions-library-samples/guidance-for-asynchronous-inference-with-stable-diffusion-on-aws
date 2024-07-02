#!/bin/bash

set -e

printf "Updating stack using current configuration... \n"
cd "${SCRIPTPATH}"/..
npm install
cdk deploy --no-rollback --require-approval never
printf "Deploy complete. \n"