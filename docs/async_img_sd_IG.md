---
title: Guidance for Asynchronous Image Generation with Stable Diffusion on AWS
description: "This implementation guide provides an overview of the Guidance for Asynchronous Image Generation with Stable Diffusion on AWS,
its reference architecture and components, considerations for planning the deployment, and configuration steps for deploying the Guidance
name to Amazon Web Services (AWS).
This guide is intended for solution architects, business decision makers, DevOps engineers, data scientists, and cloud professionals who
want to implement 'Guidance for Asynchronous Image Generation with Stable Diffusion on AWS' in their environment."
published: true
sidebar: async_img_sd_sidebar
permalink: aiml/asynchronous-image-generation-with-stable-diffusion-on-aws.html
tags:
layout: page
---

---

## Overview

This guidance covers implementing a fast scaling and low cost Stable Diffusion inference technology with serverless and containers on AWS

[Stable Diffusion](https://aws.amazon.com/what-is/stable-diffusion/){:target="_blank"} is a popular open source project for generating images using Generative AI. Building a scalable and cost efficient inference solution is a common challenge AWS customers facing. This project shows how to use serverless and container services to build an end-to-end low cost and fast scaling asyncronous image generation architecture. This repo contains the sample code and CDK deployment scripts, helping you to deploy this guidance in a few steps.


### Features and benefits

The 'Guidance for Asynchronous Image Generation with Stable Diffusion on AWS' provides the following features:

- Event-driven architecture
- Autoscaling of pods based on queue length using [KEDA](https://keda.sh/){:target="_blank"}
- Automatic EKS compute Node EC2 scaling - using [Karpenter](https://karpenter.sh/){:target="_blank"}
- New inference EKS compute nodes provisioned within 2 minutes
- Up to 70% cost savings using GPU Spot instances for compute nodes
- Support for multiple community Stable Diffusion runtimes

### Use cases

Stable Diffusion represents a notable improvement in text-to-image model generation. It’s broadly available and needs significantly less processing power than many other text-to-image models. Its capabilities include text-to-image, image-to-image, graphic artwork, image editing, etc.

As a powerful text-to-image generation model, Stable Diffusion has a wide range of applications, including:

* Artistic creation: Stable Diffusion can automatically generate high-quality artworks such as paintings, illustrations, and concept art based on text descriptions, providing inspiration and assistance to artists.
* Game design: Stable Diffusion can be used to quickly create game assets such as characters, scenes, and props, accelerating prototyping and game content iteration.
* Image editing: Stable Diffusion has capabilities for image denoising, super-resolution reconstruction, style transfer, and other tasks.
* E-commerce operations: Stable Diffusion can generate visual assets like product description images, reducing operational costs and improving image production efficiency for e-commerce platforms.

This project provides an architecture and guidance for running Stable Diffusion inference tasks at scale on Amazon EKS. This project can perform the following tasks:

* Text-to-Image: Generate images based on provided prompts and configurations
* Image-to-Image: Generate images based on provided prompts, reference images, and configurations
* Single Image Super-Resolution: Upscale the resolution of an image while preserving details as much as possible
* Pipelines: Orchestrate the above tasks and custom tasks

## Architecture overview

This guidance consists of three main components:

1. Serverless task scheduling and dispatching
2. Stable Diffusion runtime on Amazon EKS and Amazon EC2 accelerated compute instances
3. Management and Maintenance components

### Task Scheduling and Dispatching

This component includes an API endpoint based on Amazon API Gateway and a task dispatching part based on Amazon SNS and Amazon SQS.

* Users send requests (model, prompt, etc.) to the API endpoint provided by Amazon API Gateway
* Requests are validated by Amazon Lambda and published to an Amazon SNS topic
* Amazon SNS publishes the requests to the corresponding SQS queue based on the runtime name specified in the request

### Stable Diffusion Runtime

This component includes the Stable Diffusion runtime on Amazon EKS, supporting elastic scaling based on requests.

For each runtime:

* During deployment, each runtime has an independent Amazon SQS queue to receive requests
* The Queue Agent receives tasks from the Amazon SQS queue and sends them to the Stable Diffusion runtime for image generation
* The generated images are stored in an Amazon S3 bucket by the Queue Agent, and a completion notification is published to an Amazon SNS topic
* When the Amazon SQS queue accumulates too many messages, KEDA scales up the runtime replicas based on the queue length, and Karpenter launches new GPU instances to host the new replicas
* When the Amazon SQS queue no longer accumulates messages, KEDA scales down the replicas, and Karpenter terminates unnecessary GPU instances to save costs

### Architecture diagram
This section provides a reference implementation architecture diagram for the components deployed with this Guidance.

<!-- {% include image.html file="async_img_sd_images/IG_Figure1.png" alt="architecture" %} -->
{% include image.html file="async_img_sd_images/stable_diffusion_architecture_diagram.jpg" alt="architecture" %}

*Figure 1: Guidance for Asynchronous Image Generation with Stable Diffusion on AWS architecture*

### Architecture steps

1. An application sends the prompt to [Amazon API Gateway](https://aws.amazon.com/api-gateway/){:target="_blank"} that acts as an endpoint for the overall Guidance, including authentication. [AWS Lambda](https://aws.amazon.com/lambda/){:target="_blank"} function validates the requests, publishes them to the designated [Amazon Simple Notification Service](https://aws.amazon.com/sns/){:target="_blank"} (Amazon SNS) topic, and immediately returns a response.
2. Amazon SNS publishes the message to [Amazon Simple Queue Service](https://aws.amazon.com/sqs/){:target="_blank"} (Amazon SQS) queues. Each message contains a Stable Diffusion runtime name attribute and will be delivered to the queues with matching SD runtime.
3. In the [Amazon Elastic Kubernetes Service](https://aws.amazon.com/eks/){:target="_blank"} (Amazon EKS) cluster, the previously deployed open source Kubernetes Event Driven Auto-Scaler (KEDA) scales up new pods to process the incoming messages from SQS model processing queues.
4. In the Amazon EKS cluster, Karpenter, an open source Kubernetes compute auto-scaler, launches new compute nodes based on GPU [Amazon Elastic Compute Cloud](https://aws.amazon.com/ec2/){:target="_blank"} (Amazon EC2) instances (such as G4, G5, and P4) to schedule pending pods. The instances use pre-cached SD Runtime images and are based on [Bottlerocket OS](https://aws.amazon.com/bottlerocket/){:target="_blank"} for fast boot. The instance can be launched with on-demand or [spot](https://aws.amazon.com/ec2/spot) pricing model.
5. Stable Diffusion Runtimes load ML model files from [Amazon Simple Storage Service](https://aws.amazon.com/efs/){:target="_blank"} (Amazon S3) via [Mountpoint for Amazon S3 CSI Driver](https://github.com/awslabs/mountpoint-s3-csi-driver){:target="_blank"} on runtime initialization or on demand.
6. Queue agents (a program created for this Guidance) receive messages from SQS model processing queues and convert them to inputs for SD Runtime APIs calls.
7. Queue agents call SD Runtime APIs, receive and decode responses, and save the generated images to Amazon S3 buckets.
8. Queue agents send notifications to the designated SNS topic from the pods and the application receives notifications from the corresponding SQS queue.

### AWS services in this Guidance

| **AWS Service** | **Description** |
| ---- | ----|
| [Amazon Simple Storage Service - S3](http://aws.amazon.com/s3/){:target="_blank"}         | Used for storing models and generated images. |
| [Amazon Virtual Private Cloud - VPC](https://aws.amazon.com/vpc/){:target="_blank"}| Core Service - network security layer |
| [Amazon Elastic Conatiner Registry - ECR](http://aws.amazon.com/ecr/){:target="_blank"}         | Used for storing container images required by the runtimes. |
| [Amazon API Gateway](http://aws.amazon.com/api-gateway/){:target="_blank"}         | Provides the API endpoint for external access. |
| [AWS Lambda](https://aws.amazon.com/lambda){:target="_blank"}| Used for request validation and routing. |
| [Amazon Simple Queue Service - SQS](https://aws.amazon.com/sqs){:target="_blank"} | Used for storing pending tasks. |
| [Amazon Simple Notification Service - SNS](https://aws.amazon.com/sns){:target="_blank"} | Used for routing tasks to different SQS queues and providing completion notifications and callbacks. |
| [Amazon Elastic Kubernetes Service - EKS](https://aws.amazon.com/eks){:target="_blank"} | Used for managing and running the Stable Diffusion runtimes. |
| [Amazon Elastic Compute Cloud - EC2](https://aws.amazon.com/ec2){:target="_blank"}  | Used for running the Stable Diffusion runtimes. |
| [Amazon CloudWatch](https://aws.amazon.com/cloudwatch){:target="_blank"}  | Used for monitoring system health, providing metrics, logs, and traces. |
| [AWS CDK](https://aws.amazon.com/cdk){:target="_blank"}   | Used for deploying and updating this guidance. |

## Cost

You are responsible for the cost of the AWS services used while running this Guidance. As of April 2024, the cost for running this
Guidance with the default settings in the US West (Oregon) is approximately for one month and generating one million images would cost approximately **$436.72 per month** (excluding free tiers).

We recommend creating a [budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html){:target="_blank"} through [AWS Cost Explorer](http://aws.amazon.com/aws-cost-management/aws-cost-explorer/){:target="_blank"} to help manage costs. Prices are subject to change. For full details, refer to the pricing webpage for each AWS service used in this Guidance.

The main services and their pricing for usage related to the number of images are listed below (per one million images):

| **AWS Service**  | **Billing Dimension** | **Quantity per 1M Images** | **Unit Price \[USD\]** | **Total \[USD\]** |
|-----------|------------|------------|------------|------------|
| Amazon EC2 | g5.2xlarge instance, Spot instance per hour  | 416.67 | \$ 0.4968 | \$ 207 |
| Amazon API Gateway | Per 1M REST API requests  | 1 | \$ 3.50 | \$ 3.50 |
| AWS Lambda | Per GB-second  | 12,500 | \$ 0.0000166667 | \$ 0.21 |
| AWS Lambda | Per 1M requests  | 1 | \$ 0.20 | \$ 0.20 |
| Amazon SNS | Per 1M requests  | 2 | \$ 0.50 | \$ 0.50 |
| Amazon SNS | Data transfer per GB  | 7.62\**  | \$ 0.09 | \$ 0.68 |
| Amazon SQS | Per 1M requests  | 2 | \$ 0.40 | \$ 0.80 |
| Amazon S3 | Per 1K PUT requests  | 2,000 | \$ 0.005 | \$ 10.00 |
| Amazon S3 | Per GB per month  | 143.05\*** | \$ 0.023 | \$ 3.29 |
| **Total, 1M images** | | | | **\$226.18** |

The fixed costs unrelated to the number of images, with the main services and their pricing listed below (per month):

| **AWS Service**  | Billing Dimension | Quantity per Month | Unit Price \[USD\] | Total \[USD\]
|-----------|------------|------------|------------|------------|
| Amazon EKS | Cluster  | 1 | \$ 72.00 | \$ 72.00 |
| Amazon EC2 | m5.large instance, On-Demand instance per hour  | 1440 | \$ 0.0960 | \$ 138.24 |
| **Total, month** | | | | **\$210.24** |

- \* Calculated based on an average request duration of 1.5 seconds and the average Spot instance pricing across all Availability Zones in the US West (Oregon) Region from January 29, 2024, to April 28, 2024.
- \*\* Calculated based on an average request size of 16 KB
- \*\*\* Calculated based on an average image size of 150 KB, stored for 1 month.

Please note that thise are estimated costs for reference only. The actual cost may vary depending on the model you use, task parameters, current Spot instance pricing, and other factors.


## Security

When you build systems on AWS infrastructure, security responsibilities are shared between you and AWS. This [shared responsibility
model](https://aws.amazon.com/compliance/shared-responsibility-model/){:target="_blank"} reduces your operational burden because AWS operates, manages, and
controls the components including host operating systems, the virtualization layer, and the physical security of the facilities in
which the services operate. For more information about AWS security, visit [AWS Cloud Security](http://aws.amazon.com/security/){:target="_blank"}.

### IAM Roles
AWS Identity and Access Management (IAM) roles allow customers to assign granular access policies and permissions to AWS services and users in the cloud.

This guidance creates separate IAM roles and grants permissions for the following components:
1. Amazon EKS cluster, including
  * Creating and operating the cluster
  * Compute Node groups
  * Nodes created by Karpenter
  * Pods running in the cluster, including
    * Karpenter
    * KEDA
    * Fluent Bit
    * Stable Diffusion runtimes
2. AWS Lambda functions
3. Amazon API Gateway

This guidance uses IAM roles for internal user access control, following the principle of least privilege, ensuring that each component can only access authorized components and maintain application workload isolation.

### Access Control

This guidance uses an API Key mechanism for external user access control, requiring users to include a valid API Key in their requests. For more information about API Keys, please refer to the [API Specification](#api-calling-rules).

### Networking

This guidance operates within an isolated VPC by default, separate from your other workloads. If you need to connect this VPC to your existing VPC or a transit gateway, you are responsible for the gateways, firewalls, and access control.

## Service Quotas

Service quotas, also referred to as limits, are the maximum number of service resources or operations for your AWS account.

### Quotas for AWS services in this Guidance

{: .note }
To view the service quotas for all AWS services in the documentation without switching pages, view the information in the [Service endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/aws-general.pdf#aws-service-information){:target="_blank"} page in the PDF instead.

Each AWS account has quotas on the number of resources that can be created in each AWS region. You can view service quotas in the AWS console using the [Service Quotas](https://console.aws.amazon.com/servicequotas/home/){:target="_blank"} tool. If a service quota can be increased, you can open a case through this tool to request an increase.

The main service quotas related to this guidance are:

| AWS Service | Quota Entry | Estimated Usage | Adjustable |
|-------------|--------------|------------------|------------|
| Amazon EC2 | [Running On-Demand G and VT instances](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-DB2E81BA){:target="_blank"} | Based on max concurrent GPU instances | [X] |
| Amazon EC2 | [All G and VT Spot Instance Requests](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-3819A6DF){:target="_blank"} | Based on max concurrent GPU instances | [X] |
| Amazon SNS | [Messages Published per Second](https://console.aws.amazon.com/servicequotas/home/services/sns/quotas/L-F8E2BA85){:target="_blank"} | Based on max concurrent requests | [X] |

Additionally, consider the following service quotas during deployment:

| AWS Service | Quota Entry | Estimated Usage | Adjustable |
|-------------|--------------|------------------|------------|
| Amazon VPC | [VPCs per Region](https://console.aws.amazon.com/servicequotas/home/services/vpc/quotas/L-F678F1CE){:target="_blank"} | 1 | [X] |
| Amazon VPC | [NAT gateways per Availability Zone](https://console.aws.amazon.com/servicequotas/home/services/vpc/quotas/L-FE5A380F){:target="_blank"} | 1 | [X] |
| Amazon EC2 | [EC2-VPC Elastic IPs](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-0263D0A3){:target="_blank"} | 1 | [X] |
| Amazon S3 | [General purpose buckets](https://console.aws.amazon.com/servicequotas/home/services/s3/quotas/L-DC2B2D3D){:target="_blank"} | 1 per queue | [X] |

## Deploy the Guidance

### Prerequisites

Please check the following considerations before deployment:

#### Deployable Regions
The services or Amazon EC2 instance types used in this guidance may not be available in all AWS regions. Launch this guidance in an AWS region that provides the required services.

**Verified Deployable Regions**

| Region Name | Verified |
|-------------|----------|
| US East (N. Virginia) | [X] |
| US West (Oregon) | [X] |

When deploying the guidance into an AWS region not in the table above, you may need to:

* Manually specify the instance type used by Karpenter as `g4dn` or other GPU instance types when deploying in regions that do not support `g5` instances.

**Deploying into AWS China Regions**

For information and procedure deploying in Amazon Web Services in China region, see [Deploying in AWS China Regions](#deploying-in-aws-china-regions)

#### IAM Permissions

Deploying this guidance requires administrator or equivalent permissions. Due to the number of components, we do not provide a minimal permissions list.

#### Choose Stable Diffusion Runtime

You need a runtime to deploy the Stable Diffusion model and provide an API access to it.

Currently, there are the following community Stable Diffusion runtimes available:

| Runtime Name | Link | Verified |
|---------------|------|----------|
| Stable Diffusion Web UI | [GitHub](https://github.com/AUTOMATIC1111/stable-diffusion-webui){:target="_blank"} | [X] |
| ComfyUI | [GitHub](https://github.com/comfyanonymous/ComfyUI){:target="_blank"} | [X] |
| InvokeAI | [GitHub](https://github.com/invoke-ai/InvokeAI){:target="_blank"} | |

You can also choose other runtimes or build your own. You need to package the runtime as a container image that can run on Amazon EKS.

You need to fully understand and comply with the license terms of the Stable Diffusion runtime you use.

{: .note-title }
> Example Runtime
>
> You can use the community-provided [example Dockerfile](https://github.com/yubingjiaocn/stable-diffusion-webui-docker){:target="_blank"} to build runtime container images for *Stable Diffusion Web UI* and *ComfyUI* runtimes. Note that these images are for technical evaluation and testing purposes only, and should not be deployed to production environments.

{: .highlight-title }
> Model Storage
>
> By default, this guidance will load models to the `/opt/ml/code/models` directory. Ensure your runtime is configured to read models from this directory.
> You need to disable mmap to achieve the highest performance.
> * For SD Web UI, set `disable_mmap_load_safetensors: true` in `config.json`
> * For ComfyUI, manually modify the source code as described in [this community issue](https://github.com/comfyanonymous/ComfyUI/issues/2288){:target="_blank"}.

{: .highlight-title }
> Notes on SD Web UI Runtime
>
> For the SD Web UI runtime, there are static runtimes (pre-load models) and dynamic runtimes (load models on-demand) depending on the model being run.
>
> * Static runtimes use models specified in `modelFilename`. The model is loaded into GPU memory at startup.
> * Dynamic runtimes need to set `dynamicModel: true`. No model needs to be specified. The runtime will load the model from Amazon S3 and perform inference based on the model used in the request.

#### Other Important Limitations

- In the current version, this guidance will automatically create a new VPC when deployed. The VPC includes:
    - CIDR `10.0.0.0/16`
    - 3 public subnets in different availability zones, with size `/19`
    - 3 private subnets in different availability zones, with size `/19`
    - 3 NAT gateways (placed in public subnets)
    - 1 Internet gateway
    - Corresponding route tables and security groups

  **Currently, those parameters of a new VPC cannot be customized**.

- In the current version, this guidance can only be deployed on a new EKS cluster with a fixed version of `1.28`. We will update the cluster version as new Amazon EKS versions are released.

### Deployment process overview

Before you launch the Guidance deployment, review the cost, architecture, security, and other considerations discussed in this guide. Follow the
step-by-step instructions in this section to configure and deploy the Guidance into your account.

We provide a one-click deployment script for quick start. Total deployment time is around 30 minutes.

### Get Source Code

Run the following command to get the source code and deployment scripts:

```bash
git clone --recursive https://github.com/aws-solutions-library-samples/guidance-for-asynchronous-inference-with-stable-diffusion-webui-on-aws
cd guidance-for-asynchronous-inference-with-stable-diffusion-webui-on-aws
```

### Quick Start

We provide a one-click deployment script for a quick start. The total deployment time is approximately 30 minutes.

#### One-Click Deployment

Run the following command to deploy with the simplest settings:

```bash
cd deploy
./deploy.sh
```

This script will:

* Install necessary runtimes and tools
* Create an S3 bucket, download the Stable Diffusion 1.5 foundation model from [HuggingFace](https://huggingface.co/runwayml/stable-diffusion-v1-5){:target="_blank"}, and place it in the bucket
* Create an EBS snapshot containing the SD Web UI image using our provided sample image
* Create a Stable Diffusion guidance with the SD Web UI runtime

{: .new-title }
> Minimal Deployment
>
> The configuration file generated by this script is the simplest configuration, containing only one runtime and without the ability to customize (such as scaling thresholds, custom models, custom images, etc.). If you need to customize the configuration, please run the following command:
>
> ```bash
> ./deploy.sh -d
> ```
>
> This parameter will cause the deployment script to only complete the pre-deployment preparation but not actually deploy. After modifying the configuration, you can run the following command to deploy:
>
> ```bash
> cdk deploy --no-rollback --require-approval never
> ```

#### Deployment Parameters

This script provides some parameters for you to customize the deployed guidance:

* `-h, --help`: Display help information
* `-n, --stack-name`: Customize the name of the deployed guidance, affecting the naming of generated resources. Default is `sdoneks`.
* `-R, --region`: The AWS Region to deploy the guidance to. Defaults to the current AWS profile region.
* `-d, --dry-run`: Only generate configuration files, do not perform deployment.
* `-b, --bucket`: Specify an existing S3 bucket name for storing models. This S3 bucket must already exist and be in the same region as the guidance.
* `-s, --snapshot`: Specify an existing EBS snapshot ID. You can build the EBS snapshot yourself following the documentation below.
* `-r, --runtime-name`: Specify the name of the deployed runtime, affecting the name used for API calls. Default is `sdruntime`.
* `-t, --runtime-type`: Specify the type of the deployed runtime, only accepting `sdwebui` and `comfyui`. Default is `sdwebui`.

### Manual Deployment

You can also deploy this guidance on AWS "manually", without using the script by following these steps:

1. [Create an Amazon S3 model storage bucket](#model-storage) and store the required models in the bucket
2. *(Optional)* [Build the container image](#image-building)
3. *(Optional)* [Store the container image in an EBS cache to accelerate startup](#image-cache-building)
4. [Deploy and launch the guidance stack](#manual-deployment)

#### Model Storage

The models required by this guidance should be stored in an S3 bucket beforehand.

**Create the Bucket**

Please follow these steps to create the bucket:

**AWS Management Console**:

* Open the [Amazon S3 console](https://console.aws.amazon.com/s3/){:target="_blank"}.
* In the left navigation pane, choose **Buckets**.
* Choose **Create Bucket**.
* In **Bucket name**, enter a name for your bucket. The name must follow [bucket naming rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html){:target="_blank"}.
* In **AWS Region**, choose the same region where you plan to deploy the guidance.
{: .warning }
To ensure model loading speed, please make sure the bucket is in the same AWS Region as your guidance deployment. If you plan to deploy multiple replicas of the guidance in multiple regions, create a separate bucket in each region.
* Choose **Create Bucket**

**AWS CLI**:

Run the following command to create the bucket. Replace `<bucket name>` with your desired bucket name and `us-east-1` with the AWS Region where you plan to deploy the guidance:
```bash
aws s3api create-bucket --bucket <bucket name> --region us-east-1
```

**Store Models**

Please store all models you need to use in the S3 bucket, following this directory structure:

```
└── /
    ├── CLIP
    ├── Codeformer
    ├── ControlNet
    ├── ESRGAN
    ├── GFPGAN
    ├── LDSR
    ├── Lora
    ├── RealESRGAN
    ├── ScuNET
    ├── Stable-diffusion
    ├── SwinIR
    ├── VAE
    ├── VAE-approx
    ├── embeddings
    └── hypernetworks
```

Place the models in their corresponding directories. The `Stable-diffusion` directory must exist and contain the Stable Diffusion model. Other directories can be omitted if there are no models.

Currently, `.safetensors` and `.ckpt` model formats are supported. If you downloaded models from [Civitai](https://civitai.com/){:target="_blank"} without an extension, please add the `.ckpt` extension.

Please follow these steps to upload the models to the S3 bucket:

**AWS Management Console**:

* Open the [Amazon S3 console](https://console.aws.amazon.com/s3/){:target="_blank"}.
* In the left navigation pane, choose **Buckets**.
* Select the bucket you created in the previous step and navigate to the desired folder.
* If the corresponding folder does not exist:
    * Choose **Create Folder**
    * In **Folder Name**, enter the folder name
    * Choose **Create folder**
    * Repeat the above steps until the folder structure matches the structure above.
* Choose **Upload**
* Choose **Add files**, and select the model files you want to upload.
* Choose **Upload**. Do not close the browser during the upload process.

**AWS CLI**:

Run the following command to upload the model files to the bucket. Replace `<model name>` with your model file name, `<folder>` with the model type, and `<bucket name>` with your desired bucket name:
```bash
aws s3 cp <model name> s3://<bucket name>/<folder>/
```
{: .note }
When uploading with the AWS CLI, there is no need to create the directory structure in advance.

{: .new }
You can use third-party tools like [s5cmd](https://github.com/peak/s5cmd){:target="_blank"} to improve upload speed.

#### Image Building

You can build the image from the source code and store it in your image repository.

{: .warning-title }
> Runtime Selection
>
> You need to provide the Stable Diffusion runtime image yourself. You can find the supported Stable Diffusion runtimes in the [Deployment Planning](#choosing-stable-diffusion-runtime) section.

{: .new-title }
> Pre-built Images
>
> For evaluation and testing purposes, you can use our pre-built images:
> ```
> SD Web UI: public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest
> ComfyUI: public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest
> Queue Agent: public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest
> ```
> Please note that these images are only for technical evaluation and testing purposes, and you are responsible for any license risks associated with using these images.

**Build the Image**

Run the following command to build the `queue-agent` image:

```bash
docker build -t queue-agent:latest src/backend/queue_agent/
```

{: .new-title }
> Sample Runtimes
>
> You can use the community-provided [sample Dockerfile](https://github.com/yubingjiaocn/stable-diffusion-webui-docker){:target="_blank"} to build the container images for *Stable Diffusion Web UI* and *ComfyUI* runtimes. Please note that these images are only for technical evaluation and testing purposes, and should not be deployed to production environments.

**Push the Image to Amazon ECR**

{: .note-title }
> Image Repository Selection
>
> We recommend using Amazon ECR as the image repository, but you can also choose other image repositories that support the [OCI standard](https://www.opencontainers.org/){:target="_blank"}, such as [Harbor](https://goharbor.io/){:target="_blank"}.

{: .highlight-title }
> First-time Push
>
> Amazon ECR requires creating the image repository before pushing.
>
> **AWS CLI**
>
> Run the following command to create:
> ```bash
> aws ecr create-repository --repository-name sd-on-eks/queue-agent
> ```
>
> **AWS Management Console**:
>
> * Open the Amazon ECR console at https://console.aws.amazon.com/ecr/.
> * Choose **Get started**.
> * For **Visibility settings**, choose **Private**.
> * For **Repository name**, enter `sd-on-eks/queue-agent`.
> * Choose **Create repository**.

Run the following commands to log in to the image repository and push the image. Replace `us-east-1` with your AWS Region and `123456789012` with your AWS account ID:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

docker tag queue-agent:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
```

**Build and Push Helm Chart**

The guidance is deployed using a Helm Chart. In general, you do not need to deeply customize the contents of the Helm Chart and can directly use our pre-built Helm Chart. You can also configure the runtime settings using the `config.yaml` file. The Helm Chart can be stored on any HTTP server accessible over the Internet or in an image repository compatible with the [OCI standard](https://www.opencontainers.org/){:target="_blank"} including Amazon ECR.

{: .warning-title }
> China Region Support
>
> Due to a [known issue](https://github.com/aws/aws-cdk/issues/28460) with the CDK framework, you cannot store the Helm Chart in an ECR image repository in the China Regions. We are actively working to resolve this issue.

**Using ECR Image Repository**

{: .highlight-title }
> First-time Push
>
> Amazon ECR requires creating the image repository before pushing.
>
> **AWS CLI**:
>
> Run the following command to create:
> ```bash
> aws ecr create-repository --repository-name sd-on-eks/charts/sd-on-eks
> ```
>
> **AWS Management Console**:
>
> * Open the Amazon ECR console at https://console.aws.amazon.com/ecr/.
> * Choose **Get started**.
> * For **Visibility settings**, choose **Private**.
> * For **Repository name**, enter `sd-on-eks/charts/sd-on-eks`.
> * Choose **Create repository**.

Run the following commands to log in to the image repository and push the Helm Chart. Replace `us-east-1` with your AWS Region and `123456789012` with your AWS account ID:

```bash
helm package src/charts/sd_on_eks
helm push sd-on-eks-<version>.tgz oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/charts/
```

After uploading, you need to modify `config.yaml` and add the following content under each runtime that needs to use the Helm Chart:

```yaml
modelsRuntime:
- name: sdruntime
  namespace: default
  type: sdwebui
  chartRepository: "oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/charts/sd-on-eks"
  chartVersion: "1.1.0" # Modify if you customized the Helm Chart version
```

**Using HTTP Server**

{: .note-title }
> Access Control
>
> Make sure the HTTP server is open to the Internet and does not have any access control (such as IP allow-listing).

Run the following command to package the Helm Chart:

```bash
helm package src/charts/sd_on_eks
```

After packaging, an output file named `sd-on-eks-<version>.tgz` will be generated. Place this file in an empty folder and run the following command:

```bash
helm repo index
```

You can place the generated compressed package and `index.yaml` on the HTTP server. Assuming the HTTP server domain is `example.com` (IP addresses are also acceptable), you need to modify `config.yaml` and add the following content under each runtime that needs to use the Helm Chart:

```yaml
modelsRuntime:
- name: sdruntime
  namespace: default
  type: sdwebui
  chartRepository: "http://example.com/"
  chartVersion: "1.0.0"  # Modify if you customized the Helm Chart version
```

#### Image Cache Building

By pre-caching the container image as an EBS snapshot, you can optimize the startup speed of compute instances. When launching new instances, the instance's data volume will have the container image cache pre-loaded, eliminating the need to pull from the image repository.

The EBS snapshot should be created before deploying the guidance. We provide a script for building the EBS snapshot.

**Using Custom Image**

If you built and pushed the image to Amazon ECR, run the following command. Replace `us-east-1` with the region where the guidance is deployed and `123456789012` with your 12-digit AWS account number:

```bash
cd utils/bottlerocket-images-cache
./snapshot.sh 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/sdwebui:latest,123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
```

**Using Pre-built Image**

If you are using the pre-built images provided by the guidance, run the following command:

```bash
cd utils/bottlerocket-images-cache
./snapshot.sh public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest,public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest,public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest
```

After the script completes, it will output the EBS snapshot ID (in the format `snap-0123456789`). You can apply this snapshot during deployment.

For more details about this script, please refer to the [GitHub repository](https://github.com/aws-samples/bottlerocket-images-cache){:target="_blank"}.

#### Manual Deployment

Follow these steps to deploy this guidance:

**Install Required Components**

Please install the following runtimes before deployment:

* [Node.js](https://nodejs.org/en){:target="_blank"} version 18 or later
* [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html){:target="_blank"}
* [AWS CDK Toolkit](https://docs.aws.amazon.com/cdk/v2/guide/cli.html){:target="_blank"}
* [git](https://git-scm.com/downloads){:target="_blank"}

**Edit Configuration File**

The configuration for this guidance is stored in the `config.yaml` file. We provide a configuration file template, and you can customize it according to your actual specificiation.

1. Set the model storage bucket (required)

    Replace `<bucket name>` in `modelBucketArn` with the name of the S3 bucket where you placed the models.

    ```yaml
    modelBucketArn: arn:aws:s3:::<bucket name>
    ```

    {: .warning-title }
    > China Regions
    >
    > If you are using an AWS China Region, make sure the partition in the ARN is `aws-cn`.
    >
    > ```yaml
    > modelBucketArn: arn:aws-cn:s3:::<bucket name>
    > ```

2. Set the Stable Diffusion runtime (required)

    You need to specify the runtime parameters. The runtime is defined in `modelsRuntime`, with the following configuration:

    ```yaml
    modelsRuntime:
    - name: "sdruntime" # Required parameter, the name of the runtime, cannot be the same as other runtimes
      namespace: "default" # Required parameter, the Kubernetes namespace where the runtime is located, not recommended to place in the same namespace as other runtimes
      type: "sdwebui" # Required parameter, the type of this runtime, currently only supports "sdwebui" and "comfyui"
      modelFilename: "v1-5-pruned-emaonly.safetensors" # (SD Web UI) The name of the model used by this runtime, cannot be the same as other runtimes
      dynamicModel: false # (SD Web UI) Whether this runtime allows dynamic model loading
    ```

    You can configure multiple runtimes in the `modelsRuntime` section.

3. Set custom image (optional)

    If you [built the image and/or Helm Chart yourself](#image-building), you need to specify the image in the corresponding runtime, with the following configuration:

    ```yaml
    modelsRuntime:
    - name: "sdruntime"
      namespace: "default"
      type: "sdwebui"
      modelFilename: "v1-5-pruned-emaonly.safetensors"
      dynamicModel: false
      chartRepository: "" # Optional parameter, if you built the Helm Chart, enter the address where the Chart is located. Include the protocol prefix (oci:// or https://)
      chartVersion: "" # Optional parameter, if you built the Helm Chart, enter the version of the Chart
      extraValues: # Add the following content
        runtime:
          inferenceApi:
            image:
              repository: <account_id>.dkr.ecr.<region>.amazonaws.com/sd-on-eks/sdwebui # Address of the Stable Diffusion runtime image
              tag: latest # Image tag
          queueAgent:
            image:
              repository: <account_id>.dkr.ecr.<region>.amazonaws.com/sd-on-eks/queue-agent # Address of the Queue Agent image
              tag: latest # Image tag
    ```

4. Set EBS snapshot-based image cache (optional)

    If you built an [EBS snapshot-based image cache](#image-cache-building), you need to specify the snapshot ID in the corresponding runtime, with the following configuration:

    ```yaml
    modelsRuntime:
    - name: "sdruntime"
      namespace: "default"
      type: "sdwebui"
      modelFilename: "v1-5-pruned-emaonly.safetensors"
      extraValues:
        karpenter: # Add the following content
          nodeTemplate:
            amiFamily: Bottlerocket
            dataVolume:
              snapshotID: snap-0123456789 # Replace with the EBS snapshot ID
    ```

5. Other detailed settings (optional)

    If you need to configure the runtime in detail, please refer to the [Configuration Options](https://github.com/aws-solutions-library-samples/guidance-for-asynchronous-inference-with-stable-diffusion-webui-on-aws/blob/main/src/charts/sd_on_eks/values.yaml).

**Start Deployment**

After completing the configuration, run the following command to deploy:

```bash
npm install
cdk deploy
```

Deployment generally takes 15-20 minutes. Since the deployment is performed on the AWS side through CloudFormation, you do not need to redeploy if the CDK CLI is accidentally closed.

**Next Steps**

After the deployment is complete, you will see the following output:

```bash
Outputs:
sdoneksStack.GetAPIKeyCommand = aws apigateway get-api-keys --query 'items[?id==`abcdefghij`].value' --include-values --output text
sdoneksStack.FrontApiEndpoint = https://abcdefghij.execute-api.us-east-1.amazonaws.com/prod/
sdoneksStack.ConfigCommand = aws eks update-kubeconfig --name sdoneksStack --region us-east-1 --role-arn arn:aws:iam::123456789012:role/sdoneksStack-sdoneksStackAccessRole
...
```

### Deploying in AWS China Regions

This guidance supports deployment in AWS China Regions.

| Region Name           | Verified |
|----------------|---------------------------------------|
| China (Ningxia)  | [x]  |

However, due to the special network environment in China, there are the following limitations:

* You need to build the container image yourself or copy the standard image to ECR in the China Region. It is not recommended to use images from ECR Public.
* Some components' Helm Charts are hosted on GitHub, and there may be issues retrieving the Helm Charts when deploying in China Regions, retries are recommended when this issue occurs.
* You cannot automatically download models from Hugging Face or GitHub, and need to manually download the models and upload them to the S3 bucket.

#### Steps for Deploying in China Regions

The steps for deploying in AWS China Regions differ from the regular deployment flow. Please follow these steps for deployment:

1. Build or transfer the container image to ECR
2. Download the models and store them in the S3 bucket
3. Create an EBS disk snapshot
4. Generate and modify the configuration file
5. Proceed with deployment

**Build or Transfer Image to ECR**

Since the default container images are stored in ECR Public, you may experience slow speeds or intermittent disconnections when pulling images or creating image caches. We recommend that you build the images yourself or transfer the existing images to your ECR image repository.

If you need to build the images yourself, please refer to the [Image Building](#image-building) documentation.

If you need to transfer the pre-built images to ECR in the China Region, you can run the following commands on an instance with Docker installed and ECR permissions:

```bash
docker pull public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest
docker pull public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest
docker pull public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest

aws ecr create-repository --repository-name sd-on-eks/sdwebui
aws ecr create-repository --repository-name sd-on-eks/comfyui
aws ecr create-repository --repository-name sd-on-eks/queue-agent

docker tag public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/sdwebui:latest
docker tag public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/comfyui:latest
docker tag public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/queue-agent:latest

aws ecr get-login-password --region cn-northwest-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn

docker push 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/sdwebui:latest
docker push 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/comfyui:latest
docker push 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/queue-agent:latest
```

We recommend that you follow the [Image Building](#image-building) documentation to place the Helm Chart in ECR or an HTTP server.

**Download Models and Store in S3 Bucket**

Since Hugging Face cannot be accessed smoothly from mainland China, please download the models from other mirror sites and upload them to the S3 bucket following the [Model Storage](#model-storage) documentation.

**Create EBS Disk Snapshot**

Please follow the [Image Cache Building](#image-cache-building) documentation to create an EBS disk snapshot to accelerate image loading.

**Generate and Modify Configuration File**

Run the following command to install the tools and generate the initial configuration file:

```bash
cd deploy
./deploy.sh -b <bucket name> -s <snapshot ID> -d
```

This command will generate a `config.yaml` template in the parent directory, but this template needs to be edited for deployment in the China Region. Please edit the file according to the comments:

```yaml
stackName: sdoneks
modelBucketArn: arn:aws-cn:s3:::${MODEL_BUCKET}  # Change aws to aws-cn in this ARN
APIGW:
  stageName: dev
  throttle:
    rateLimit: 30
    burstLimit: 50
modelsRuntime:
- name: sdruntime
  namespace: "default"
  modelFilename: "v1-5-pruned-emaonly.safetensors"
  dynamicModel: false
  # chartRepository: "http://example.com/" # If you self-hosted the Helm Chart, uncomment this line and change the value to the address of the Helm Chart (oci:// or http://), otherwise delete this line
  type: sdwebui
  extraValues:
    runtime:
      inferenceApi:
        image:
          repository: 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/sdwebui # Change this to the address of your ECR image repository
          tag: latest
      queueAgent:
        image:
          repository: 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/queue-agent # Change this to the address of your ECR image repository
          tag: latest
    karpenter:
      nodeTemplate:
        amiFamily: Bottlerocket
        dataVolume:
          snapshotID: snap-1234567890 # The EBS snapshot ID will be automatically filled in here
      provisioner:
        instanceType:
        - "g5.xlarge"
        - "g5.2xlarge"
        capacityType:
          onDemand: true
          spot: true

```

After completing the modifications, you can run the following command to re-deploy:

```bash
cdk deploy
```

### Deployment Verification

You can use the test script to verify if the guidance is deployed successfully. Run the following command to perform the test:

```bash
cd test
STACK_NAME=sdoneksStack RUNTIME_TYPE=sdwebui ./run.sh
```

If you modified the guidance stack name or runtime type, please replace `sdoneksStack` and `sdwebui` with the corresponding content.

This script will automatically find the API Gateway endpoint, retrieve the API Key, and send test requests.

* For the SD Web UI runtime, it will send text-to-image, image-to-image, and single image super-resolution requests.
* For the ComfyUI runtime, it will send a Pipeline request.

Within seconds to minutes (depending on whether image caching is enabled and the minimum number of instance replicas), you can find the generated images at the `output_location`.

## Usage Guide

### API Calling Rules

After deploying the guidance, you can send requests to the Stable Diffusion runtimes through the API endpoint provided by Amazon API Gateway.

When sending requests, please follow these rules:

#### Request Endpoint and Format

The API endpoint of the guidance can be obtained from the CloudFormation outputs:

**AWS Management Console**

* Go to the [AWS CloudFormation console](https://console.aws.amazon.com/cloudformation/home){:target="_blank"}
* Choose **Stacks**
* In the list, select **sdoneksStack** (or your custom name)
* Choose **Output**
* Record the value of the **FrontApiEndpoint** item (in the format `https://abcdefghij.execute-api.ap-southeast-1.amazonaws.com/prod/`)

**AWS CLI**

Run the following command to get the API endpoint:

```bash
aws cloudformation describe-stacks --stack-name sdoneksStack --output text --query 'Stacks[0].Outputs[?OutputKey==`FrontApiEndpoint`].OutputValue'
```

You need to append the API version to the endpoint. Currently, we support the `v1alpha1` and `v1alpha2` versions. For example, when using the `v1alpha2` version API, the request should be sent to:

```
https://abcdefghij.execute-api.ap-southeast-1.amazonaws.com/prod/v1alpha2
```

This endpoint only accepts JSON-formatted POST requests and requires the `Content-Type: application/json` request header.

#### Request Types

Different runtime types accept specific request types:

* For the SD Web UI runtime, only [text-to-image](#text-to-image-sd-web-ui), [image-to-image](#image-to-image-sd-web-ui), and [single image super-resolution](#single-image-super-resolution-sd-web-ui) requests are accepted.
* For the ComfyUI runtime, only [Pipeline](#pipeline-comfyui) requests are accepted.

Please refer to the detailed documentation for each request type for the specific Request Schema.

#### API Key

For security reasons, all requests must include an API Key. Follow these steps to obtain the API Key:

**AWS Management Console**

* Go to the [Amazon API Gateway console](https://console.aws.amazon.com/apigateway){:target="_blank"}
* Choose **API Keys**
* In the list, select the API Key with a name similar to `SdOnEK-defau-abcdefghij` (or your custom name)
* Record the value of the **API key** item

**AWS CLI**

Run the following command to get the API Key:

```bash
echo $(aws cloudformation describe-stacks --stack-name sdoneksStack --output text --query 'Stacks[0].Outputs[?OutputKey==`GetAPIKeyCommand`].OutputValue')
```

When sending requests, you need to include the `x-api-key` request header with the value set to the API Key obtained above.

{: .warning-title }
> Anonymous Requests
>
> Requests without an API Key will directly return a `401` error.

#### Throttling Rules

To protect the backend API, API Gateway will throttle excessive requests using the same API Key.

The default settings are:

* 30 requests per second
* Burst limit of 50 requests

For more details on throttling, please refer to [Throttle API requests for better throughput](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html){:target="_blank"}.

If you need to modify these settings, please modify the `APIGW` section in `config.yaml`. You can also modify the corresponding Usage Plan in API Gateway.

### Text-to-Image (SD Web UI)

{: .highlight }
This request type is only applicable to the SD Web UI runtime.

The basic usage of Stable Diffusion, where an image is generated based on the input prompt.

The content in the request will be passed directly to SD Web UI, but if there are links (HTTP or S3 URLs), the link content will be converted to base64-encoded content and filled in the corresponding fields.

#### Request schema

**v1alpha2**

```json-doc
{
  "task": {
    "metadata": {
      "id": "test-t2i", // Required, task ID
      "runtime": "sdruntime", // Required, the name of the runtime used for the task
      "tasktype": "text-to-image", // Required, task type
      "prefix": "output", // Required, the prefix (directory name) for the output file in the S3 bucket
      "context": "" // Optional, can contain any information, will be included in the callback
    },
    "content": { // Same specification as the SD Web UI text-to-image API
      "alwayson_scripts": {},
      "prompt": "A dog",
      "steps": 16,
      "width": 512,
      "height": 512
    }
  }
}
```

v1alpha1

```json-doc
{
    "alwayson_scripts": {
        "task": "text-to-image", // Required, task type
        "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors", // Required, base model name
        "id_task": "test-t2i", // Required, task ID, used when uploading result images and returning responses
        "save_dir": "outputs" // Required, the prefix (directory name) for the output file in the S3 bucket
    },
    // Same specification as the SD Web UI text-to-image API
    "prompt": "A dog",
    "steps": 16,
    "width": 512,
    "height": 512
}
```

#### Response schema

**v1alpha2**

```json-doc
{
  "id_task": "test-t2i",
  "runtime": "sdruntime",
  "output_location": "s3://outputbucket/output/test-t2i"
}
```

**v1alpha1**

```json-doc
{
  "id_task": "test-t2i",
  "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors",
  "output_location": "s3://outputbucket/output/test-t2i"
}
```

#### Model Switching

If the corresponding runtime is set to `dynamicModel: true`, you need to add the following content in the `alwayson_scripts` of the request:

```json-doc
        "content": {
          "alwayson_scripts": {
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors" //Place the model name here
          },
        }
```

Upon receiving the request, SD Web UI will unload the current model and load the corresponding model from memory or the S3 bucket. If the specified model does not exist, the request will directly return an error.

#### Image Retrieval

After the image is generated, it will be stored in the S3 bucket path specified by `output_location`. If `batch_size` or other parameters that generate multiple images are set, each image will be automatically numbered and stored.

The default storage format is lossless PNG, but if special formats (such as GIF) are involved, the system will automatically recognize and add the appropriate extension.

### Image-to-Image (SD Web UI)

{: .highlight }
This request type is only applicable to the SD Web UI runtime.

The basic usage of Stable Diffusion, where an image is generated based on the input prompt and reference image.

The content in the request will be passed directly to SD Web UI, but if there are links (HTTP or S3 URLs), the link content will be converted to base64-encoded content and filled in the corresponding fields.

#### Request Schema

**v1alpha2**

```json-doc
{
  "task": {
    "metadata": {
      "id": "test-i2i", // Required, task ID
      "runtime": "sdruntime", // Required, the name of the runtime used for the task
      "tasktype": "image-to-image", // Required, task type
      "prefix": "output", // Required, the prefix (directory name) for the output file in the S3 bucket
      "context": "" // Optional, can contain any information, will be included in the callback
    },
    "content": { // Same specification as the SD Web UI image-to-image API
      "alwayson_scripts": {},
      "prompt": "cat wizard, gandalf, lord of the rings, detailed, fantasy, cute, adorable, Pixar, Disney, 8k",
      "steps": 16,
      "width": 512,
      "height": 512,
      "init_images": ["https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png"] // Place the image link here, the image will be downloaded and base64-encoded before being placed in the request
    }
  }
}
```

**v1alpha1**

```json-doc
{
    "alwayson_scripts": {
        "task": "image-to-image", // Required, task type
        "image_link": "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png", // Required, URL of the input image
        "id_task": "test-i2i", // Required, task ID, used when uploading result images and returning responses
        "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors", // Required, base model name, associated with queue dispatching or model switching
    },
    // The following are official parameters, use the default values or pass them in directly
    "prompt": "cat wizard, gandalf, lord of the rings, detailed, fantasy, cute, adorable, Pixar, Disney, 8k",
    "steps": 16,
    "width": 512,
    "height": 512
}
```

#### Response schema

**v1alpha2**

```json-doc
{
  "id_task": "test-i2i",
  "runtime": "sdruntime",
  "output_location": "s3://outputbucket/output/test-t2i"
}
```

**v1alpha1**

```json-doc
{
  "id_task": "test-i2i",
  "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors",
  "output_location": "s3://outputbucket/output/test-t2i"
}
```

#### Model Switching

If the corresponding runtime is set to `dynamicModel: true`, you need to add the following content in the `alwayson_scripts` of the request:

```json-doc
        "content": {
          "alwayson_scripts": {
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors" //Place the model name here
          },
        }
```

Upon receiving the request, SD Web UI will unload the current model and load the corresponding model from memory or the S3 bucket. If the specified model does not exist, the request will directly return an error.

#### Image Retrieval

After the image is generated, it will be stored in the S3 bucket path specified by `output_location`. If `batch_size` or other parameters that generate multiple images are set, each image will be automatically numbered and stored.

The default storage format is lossless PNG, but if special formats (such as GIF) are involved, the system will automatically recognize and add the appropriate extension.

### Single Image Upscaling (SD Web UI)

{: .highlight }
> This request type is only applicable to the SD Web UI runtime.
>
> This request type only provides the `v1alpha2` API.

For a single image, use the super-resolution model to upscale the image.

#### Request Schema

**v1alpha2**

```json-doc
{
  "task": {
    "metadata": {
      "id": "test-extra",
      "runtime": "sdruntime",
      "tasktype": "extra-single-image",
      "prefix": "output",
      "context": ""
    },
    "content": {
      "resize_mode":0,
      "show_extras_results":false,
      "gfpgan_visibility":0,
      "codeformer_visibility":0,
      "codeformer_weight":0,
      "upscaling_resize":4,
      "upscaling_resize_w":512,
      "upscaling_resize_h":512,
      "upscaling_crop":false,
      "upscaler_1":"R-ESRGAN 4x+",
      "upscaler_2":"None",
      "extras_upscaler_2_visibility":0,
      "upscale_first":false,
      "image":"https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png"
    }
  }
}
```

#### Response schema

**v1alpha2**

```json-doc
{
  "id_task": "test-extra",
  "runtime": "sdruntime",
  "output_location": "s3://outputbucket/output/test-t2i"
}
```

#### Available Super-Resolution Models

The available super-resolution models are the same as the default models in SD Web UI:

* Lanczos
* Nearest
* 4x-UltraSharp
* ESRGAN_4X
* LDSR
* R-ESRGAN 4x+
* R-ESRGAN 4x+ Anime6B
* ScuNET GAN
* ScuNET PSNR
* SwinIR 4x

If you need more super-resolution models, you can place them in the `LDSR`, `SwinIR`, `ESRGAN`, `RealESRGAN`, `ScuNET`, etc. directories in the S3 bucket according to the model type.

After completing the above steps, you need to restart the Pod for the new models to take effect.

#### Image Retrieval

After the image is generated, it will be stored in the S3 bucket path specified by `output_location`. The default storage format is lossless PNG, but if special formats (such as GIF) are involved, the system will automatically recognize and add the appropriate extension.

### Pipeline (ComfyUI)

{: .highlight }
> This request type is only applicable to the ComfyUI runtime.
>
> This request type only provides the `v1alpha2` API.

ComfyUI provides workflow orchestration capabilities, allowing you to design workflows using various nodes in the interface and export them to a `json` file.

#### Exporting the Workflow

After designing the workflow in the interface, follow these steps to export it:

* Select the gear icon in the top-right corner of the menu panel
* Select `Enable Dev mode Options`
* Select `Save(API Format)` to save the workflow as a file

#### Request Schema

**v1alpha2**

```json-doc
{
  "task": {
    "metadata": {
      "id": "test-pipeline", // Required, task ID
      "runtime": "sdruntime", // Required, the name of the runtime used for the task
      "tasktype": "pipeline", // Required, task type
      "prefix": "output", // Required, the prefix (directory name) for the output file in the S3 bucket
      "context": "" // Optional, can contain any information, will be included in the callback
    },
    "content": {
      ... // Place the exported workflow content here
    }
  }
}
```

#### Response schema

**v1alpha2**

```json-doc
{
  "id_task": "test-pipeline",
  "runtime": "sdruntime",
  "output_location": "s3://outputbucket/output/test-pipeline"
}
```

#### Image Retrieval

After the image is generated, it will be stored in the S3 bucket path specified by `output_location`. If `batch_size` or other parameters that generate multiple images are set, each image will be automatically numbered and stored.

The default storage format is lossless PNG, but if special formats (such as GIF) are involved, the system will automatically recognize and add the appropriate extension.

### Callbacks and Notifications

The Stable Diffusion on Amazon EKS solution uses an asynchronous inference mode. When an image is generated or an error occurs, the user will be notified through Amazon SNS. User applications can subscribe to the SNS topic to receive notifications about image generation completion.

#### Adding Subscriptions

Please refer to the [Amazon SNS documentation](https://docs.aws.amazon.com/sns/latest/dg/sns-event-destinations.html){:target="_blank"} to learn about the message destination types supported by SNS.

You can find the generated SNS topic ARN in the CloudFormation outputs:

**AWS Management Console**

* Go to the [AWS CloudFormation console](https://console.aws.amazon.com/cloudformation/home){:target="_blank"}
* Choose **Stacks**
* In the list, select **sdoneksStack** (or your custom name)
* Choose **Output**
* Record the value of the **sdNotificationOutputArn** item (in the format `arn:aws:sns:us-east-1:123456789012:sdoneksStack-sdNotificationOutputCfn-abcdefgh`)

**AWS CLI**

Run the following command to get the SNS topic ARN:

```bash
aws cloudformation describe-stacks --stack-name sdoneksStack --output text --query 'Stacks[0].Outputs[?OutputKey==`sdNotificationOutputArn`].OutputValue'
```

To receive messages, you need to add your message receiver (such as an Amazon SQS queue, HTTP endpoint, etc.) as a **subscription** to this SNS topic.

**AWS Management Console**:

* In the left navigation pane, choose **Subscriptions**.
* On the **Subscriptions** page, choose **Create subscription**.
* On the **Create subscription** page under Details, do the following:
    * For **Topic ARN**, select the ARN you recorded in the previous step.
    * For **Protocol**, select the type of your receiver.
    * For **Endpoint**, enter the address of your receiver, such as an email address or the ARN of an Amazon SQS queue.
* Choose **Create subscription**

**AWS CLI**:

Please refer to [Use Amazon SNS with the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-services-sns.html#cli-subscribe-sns-topic){:target="_blank"} to add a subscription to this topic.

#### Callback Message Format

The solution will send task completion notifications to SNS in the following format, regardless of the API version used in the request:

```json-doc
{
    "id": "task_id", // Task ID
    "result": true, // true for successful completion, false for unsuccessful completion
    "image_url": [ // S3 URLs of the generated images, in the format of task ID + 4 random characters + image sequence number, all image links will be included if there are multiple images
        "s3://outputbucket/output/test-t2i/test-t2i-abcd-1.png"
    ],
    "output_url": "s3://outputbucket/output/test-t2i/test-t2i-abcd.out", // S3 URL of the task output, containing the full return from the runtime
    "context": { // Context content included in the request
        "abc": 123
    }
}
```

## Uninstall the Guidance

The deployed solution can be deleted using CloudFormation console.

{: .note }
> Permanent Deletion
>
> ** All deleted resources will be permanently removed and cannot be recovered by any means**.

### Deletion Scope

* The following resources will be **permanently deleted**:
    * Amazon EKS cluster and all worker nodes
    * SNS topics and all subscriptions
    * SQS queues
    * VPC and subnet etc.
    * IAM roles used by the solution

* The following resources will **not be deleted**:
    * S3 bucket storing output images
    * S3 bucket storing models

### Pre-Deletion Preparation

Before deleting the guidance resources, ensure the following conditions are met:

* All SQS queues have been emptied.
* No additional policies are attached to IAM roles.
* No additional resources (such as EC2 instances, ENIs, Cloud9 environments, etc.) exist within the VPC.

### Deleting the Solution

You can delete the solution using either the CDK CLI or the AWS Management Console.

**Use AWS Management Console**:

-   Navigate to the [AWS CloudFormation console](https://console.aws.amazon.com/cloudformation/home){:target="_blank"}
-   Select **Stacks**
-   In the list, select **sdoneksStack** (or another name you customized)
-   Select **Delete**, and in the pop-up dialog, choose **Delete**

**Use AWS CDK CLI**:

In the guidance's source code directory, run the following command to delete the solution:

```bash
npx cdk destroy
```

Deleting the guidance should approximately 20-30 minutes.

### Related resources

* [Stable Diffusion web UI](https://github.com/AUTOMATIC1111/stable-diffusion-webui){:target="_blank"}
* [Bottlerocket OS](https://aws.amazon.com/bottlerocket/){:target="_blank"}
* [KEDA pod autoscaler](https://keda.sh/){:target="_blank"}
* [Karpenter autoscaler](https://karpenter.sh/){:target="_blank"}

### Contributors

-   Bingjiao Yu, Soltions Architect Container Specialist
-   Daniel Zilberman, Sr. Solutions Architect Tech Solutions team
-   Harold Sun, Sr. GCR Serverless Special Solution Architect

**Acknowledge for code contributors:**
- Anbei Zhao, Sr. Solutions Architect
- Congyao Lu, Solutions Architect
- Felix Wang, Sr. Solutions Architect
- Walkley He, Manager of Container Specialist Soltions Architect
- Xi Wan, Solutions Architect

**Acknowledge for sponsors:**
- Xiaoming Fu, Solutions Architect Manager
- Zhanling Chen, AppMod Specialist Manager


## Notices

Customers are responsible for making their own independent assessment ofthe information in this document. This document: (a) is for informational purposes only, (b) represents AWS current product offerings and practices, which are subject to change without notice, and (c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided "as is" without warranties, representations, or conditions of any kind, whether express or implied. AWS responsibilities and liabilities to its customers are controlled by AWS agreements, and this document is not part of, nor does it modify, any agreement between AWS and its customers.
