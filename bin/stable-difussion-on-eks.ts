#!/usr/bin/env node
import { App, Aspects } from 'aws-cdk-lib';
import DataPlaneStack from "../lib/dataPlane";
import { parse } from 'yaml'
import * as fs from 'fs'
import { validateConfig } from '../lib/utils/validateConfig';

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
}

let filename: string

if ("CDK_CONFIG_PATH" in process.env) {
  filename = process.env.CDK_CONFIG_PATH as string
} else {
  filename = 'config.yaml'
}

const file = fs.readFileSync(filename, 'utf8')
const props = parse(file)

if (validateConfig(props)) {
  const dataPlaneStack = new DataPlaneStack(app, props.stackName, props, {
    env: env,
    description: "Guidance for Asynchronous Image Generation with Stable Diffusion on AWS (SO9306)"
  });
} else {
  console.log("Deployment failed due to failed validation. Please check and try again.")
}