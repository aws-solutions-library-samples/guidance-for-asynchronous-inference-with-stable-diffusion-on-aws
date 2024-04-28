---
title: Guidance for Asynchronous Image Generation with Stable Diffusion on AWS
description: "This guide introduces how to implement a scalable and cost-effective Stable Diffusion image generation solution on AWS using serverless and container solutions. The guide includes an overview, architecture, deployment, and usage steps. This guide is intended for solution architects, DevOps engineers, cloud engineers, and others interested in deploying this solution for image generation."
published: true
sidebar: async_img_sd_zh_sidebar
permalink: aiml/asynchronous-image-generation-with-stable-diffusion-on-aws-zh.html
tags:
layout: page
---

---

## Introduction

Implement a scalable and cost-effective Stable Diffusion image generation solution on AWS using serverless and container solutions.

Stable Diffusion is a popular open-source project that uses generative AI technology to generate images. Building a scalable, cost-effective inference solution is a common challenge faced by AWS customers. This project demonstrates how to build an end-to-end, low-cost, and rapidly scalable asynchronous image generation architecture using serverless and container services. This code repository includes sample code and an implementation guide (this document).

### Features

This solution has the following features:

- Event-driven architecture
- Leverages KEDA for queue-length-based auto-scaling
- Leverages Karpenter for automatic EC2 instance provisioning
- Scales new inference nodes within 2 minutes
- Saves up to 70% cost by using GPU Spot instances
- Supports multiple community Stable Diffusion runtimes

### Use Cases

As a powerful text-to-image generation model, Stable Diffusion has a wide range of applications, including:

* Artistic creation: Stable Diffusion can automatically generate high-quality artworks such as paintings, illustrations, and concept art based on text descriptions, providing inspiration and assistance to artists.
* Game design: Stable Diffusion can quickly create game assets such as characters, scenes, and props, accelerating prototype design and game content iteration.
* Image editing: Stable Diffusion has capabilities for image denoising, super-resolution reconstruction, style transfer, and other tasks.
* E-commerce operations: Stable Diffusion can generate visual assets such as product description images, reducing the operating costs of e-commerce platforms and improving the efficiency of image production.

This project provides an architecture and guidance for running Stable Diffusion inference tasks at scale on Amazon EKS. This project can perform the following tasks:

* Text-to-Image: Generate images based on provided prompts and configurations
* Image-to-Image: Generate images based on provided prompts, reference images, and configurations
* Super-Resolution Upscaling: Upscale the resolution of an image while preserving details as much as possible
* Pipelines: Orchestrate the above tasks and custom tasks

## Architecture Overview

### Components

This solution consists of three main components:

* A serverless architecture for task scheduling and dispatching
* An Amazon EKS and Amazon EC2 accelerated computing instance-based Stable Diffusion runtime
* Management and maintenance components

### Task Scheduling and Dispatching

This component includes an Amazon API Gateway API endpoint and an Amazon SNS and Amazon SQS-based task dispatching part.

* Users send requests (model, prompt, etc.) to the API endpoint provided by Amazon API Gateway
* Requests are validated by Amazon Lambda and published to an Amazon SNS topic
* Amazon SNS publishes the requests to the corresponding runtime's SQS queue based on the runtime name specified in the request

### Stable Diffusion Runtime

This component includes an Amazon EKS-based Stable Diffusion runtime that supports elastic scaling based on requests.

For each runtime:

* During deployment, each runtime has an independent Amazon SQS queue to receive requests
* The Queue Agent receives tasks from the Amazon SQS queue and sends them to the Stable Diffusion runtime to generate images
* The generated images are stored in an Amazon S3 bucket by the Queue Agent, and a completion notification is published to an Amazon SNS topic
* When the Amazon SQS queue accumulates too many messages, KEDA scales up the runtime replicas based on the number of messages in the queue, and Karpenter launches new GPU instances to host the new replicas
* When the Amazon SQS queue no longer accumulates messages, KEDA scales down the replicas, and Karpenter terminates unnecessary GPU instances to save costs

### Management and Maintenance

This solution provides comprehensive observability and management components:

* Metrics monitoring and logging based on CloudWatch
* End-to-end tracing with AWS X-Ray
* Infrastructure-as-Code deployment with AWS CDK

### Architecture Diagram
This section provides a reference architecture diagram for the components deployed by this guide.

<!-- {% include image.html file="async_img_sd_images/IG_Figure1.png" alt="architecture" %} -->
{% include image.html file="async_img_sd_zh_images/stable_diffusion_architecture_diagram.jpg" alt="architecture" %}

*Figure 1: Guidance for Asynchronous Image Generation with Stable Diffusion on AWS architecture*

### Workflow

1. Users send requests (model, prompt, etc.) to the business application, and the business application sends the requests to the API endpoint provided by Amazon API Gateway
2. Requests are validated by Amazon Lambda and published to an Amazon SNS topic
3. Amazon SNS publishes the requests to the corresponding runtime's SQS queue based on the runtime name specified in the request and the request filtering mechanism
4. In the EKS cluster, KEDA scales up the runtime replicas based on the number of messages in the queue
5. Karpenter launches new GPU instances to host the new replicas, running the BottleRocket operating system and using a mix of Spot and On-Demand purchasing options, with the Stable Diffusion runtime container images pre-loaded via EBS snapshots
6. The Stable Diffusion runtime loads models directly from the S3 bucket using the Mountpoint for Amazon S3 CSI Driver when starting up
7. The Queue Agent receives tasks from the Amazon SQS queue and sends them to the Stable Diffusion runtime to generate images
8. The generated images are stored in an Amazon S3 bucket by the Queue Agent, and a completion notification is published to an Amazon SNS topic, which can publish the response to SQS or other targets
9. This solution provides comprehensive observability and management components, including metrics monitoring and logging based on CloudWatch and ADOT, and end-to-end tracing with AWS X-Ray
10. This solution is deployed and configured using Infrastructure-as-Code with AWS CDK, and security and access control are provided through IAM and API Keys

### AWS Services Used

| AWS Service | Description |
| ---- | ----|
| [Amazon S3](http://aws.amazon.com/s3/)         | Used for storing models and generated images. |
| [Amazon ECR](http://aws.amazon.com/ecr/)         | Used for storing container images required by the runtimes. |
| [Amazon API Gateway](http://aws.amazon.com/api-gateway/)         | Used for providing the external API interface. |
| [AWS Lambda](https://aws.amazon.com/lambda)    | Used for request validation and routing. |
| [Amazon SQS](https://aws.amazon.com/sqs)       | Used for storing pending tasks. |
| [Amazon SNS](https://aws.amazon.com/sns)       | Used for routing tasks to different SQS queues and providing completion notifications and callbacks. |
| [Amazon EKS](https://aws.amazon.com/eks)       | Used for managing and running the Stable Diffusion runtime. |
| [Amazon EC2](https://aws.amazon.com/ec2)       | Used for running the Stable Diffusion runtime. |
| [Amazon CloudWatch](https://aws.amazon.com/cloudwatch)       | Used for monitoring the system's health, providing metrics monitoring, logging, and tracing. |
| [AWS CDK](https://aws.amazon.com/cdk)       | Used for deploying and updating this solution. |

## Deployment Planning

Please check the following considerations before deployment:

### Deployable Regions
The services or Amazon EC2 instance types used in this solution may not be available in all AWS Regions. Please launch this solution in an AWS Region that provides the required services.

**Verified Deployable Regions**

| Region Name           | Verified |
|----------------|---------------------------------------|
| US East (N. Virginia)  | :material-check-bold:{ .icon_check }  |
| US West (Oregon)     | :material-check-bold:{ .icon_check }  |

If you deploy in an unverified region, you may need to take the following actions or face the following issues:

* When deploying in regions that do not support the `g5` instance type, you need to manually specify the instance type used by Karpenter as `g4dn` or other GPU instance types.

**Deploying in AWS China Regions**

This solution supports deployment in AWS China Regions, but the steps differ from the normal deployment process. Please refer to [Deploying in AWS China Regions](#deploying-in-aws-china-regions).

## IAM Permissions

Deploying this solution requires administrator or equivalent permissions. Due to the number of components involved, we do not provide a minimal permissions list.

## Service Quotas

Each AWS account has quotas on the number of resources that can be created in each AWS Region. You can view your service quotas using the [Service Quota](https://console.aws.amazon.com/servicequotas/home/) tool in the AWS Management Console. If a service quota can be increased, you can open a case through the tool to request an increase.

The main service quotas related to this solution are:

| AWS Service | Quota Entry | Estimated Usage | Adjustable |
|---------|---------|-----------|-----------|
| Amazon EC2  | [Running On-Demand G and VT instances](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-DB2E81BA) | Based on the maximum concurrent GPU instances | :material-check-bold:{ .icon_check }  |
| Amazon EC2  | [All G and VT Spot Instance Requests](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-3819A6DF) | Based on the maximum concurrent GPU instances | :material-check-bold:{ .icon_check }  |
| Amazon SNS  | [Messages Published per Second](https://console.aws.amazon.com/servicequotas/home/services/sns/quotas/L-F8E2BA85) | Based on the maximum concurrent requests | :material-check-bold:{ .icon_check }  |

Additionally, you need to consider the following service quotas during deployment:

| AWS Service | Quota Entry | Estimated Usage | Adjustable |
|---------|---------|-----------|-----------|
| Amazon VPC  | [VPCs per Region](https://console.aws.amazon.com/servicequotas/home/services/vpc/quotas/L-F678F1CE) | 1 | :material-check-bold:{ .icon_check }  |
| Amazon VPC  | [NAT gateways per Availability Zone](https://console.aws.amazon.com/servicequotas/home/services/vpc/quotas/L-FE5A380F) | 1 | :material-check-bold:{ .icon_check }  |
| Amazon EC2  | [EC2-VPC Elastic IPs](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-0263D0A3) | 1 | :material-check-bold:{ .icon_check }  |
| Amazon S3  | [General purpose buckets](https://console.aws.amazon.com/servicequotas/home/services/s3/quotas/L-DC2B2D3D) | 1 per queue | :material-check-bold:{ .icon_check }  |

## Choosing a Stable Diffusion Runtime

You need a runtime to deploy the Stable Diffusion model and provide API access.

Currently, there are multiple community Stable Diffusion runtimes available:

| Runtime Name           | Link |  Verified  |
|----------------|-----------------|----------------------|
| Stable Diffusion Web UI  | [GitHub](https://github.com/AUTOMATIC1111/stable-diffusion-webui) | :material-check-bold:{ .icon_check }  |
| ComfyUI     | [GitHub](https://github.com/comfyanonymous/ComfyUI) | :material-check-bold:{ .icon_check }  |
| InvokeAI     | [GitHub](https://github.com/invoke-ai/InvokeAI) |   |

You can also choose other runtimes or build your own runtime. You need to package the runtime as a container image to run it on EKS.

You need to fully understand and comply with the license terms of the Stable Diffusion runtime you are using.

!!! example "Example Runtimes"

    You can use the community-provided [example Dockerfile](https://github.com/yubingjiaocn/stable-diffusion-webui-docker) to build the container images for the *Stable Diffusion Web UI* and *ComfyUI* runtimes. Please note that these images are only for technical evaluation and testing purposes, and should not be deployed to production environments.

!!! info "Model Storage"

    By default, this solution loads models into the `/opt/ml/code/models` directory, so please ensure that your runtime is configured to read models from this directory.

    You need to disable mmap for optimal performance.

    * For SD Web UI, you need to set `disable_mmap_load_safetensors: true` in `config.json`
    * For ComfyUI, you need to follow the guidance in the [community issue](https://github.com/comfyanonymous/ComfyUI/issues/2288) to manually modify the source code.

!!! info "SD Web UI Runtime Notes"

    For the SD Web UI runtime, there are static runtimes (pre-loaded models) and dynamic runtimes (load models on-demand) depending on the model being run.

    * Static runtimes need to specify the model in `modelFilename`. This model will be loaded into memory at startup.
    * Dynamic runtimes need to set `dynamicModel: true`. In this case, there is no need to specify the model in advance, and the runtime will load the model from Amazon S3 and perform model inference based on the model used in the request.

## Other Important Notes and Limitations

- In the current version, this solution automatically creates a new VPC during deployment. This VPC includes:
    - CIDR of `10.0.0.0/16`
    - Three public subnets spanning different Availability Zones, with a subnet size of `/19`
    - Three private subnets spanning different Availability Zones, with a subnet size of `/19`
    - Three NAT gateways (placed in public subnets)
    - One Internet Gateway
    - Corresponding route tables and security groups

    Currently, the parameters of this VPC cannot be customized.

- In the current version, this solution can only be deployed on a newly created EKS cluster, and the version is fixed at `1.29`. We will update the cluster version as new Amazon EKS versions are released.

### Cost Estimation

You will be charged for using the AWS services included in this solution. Based on the pricing as of April 2024, running this solution in the US West (Oregon) Region for one month and generating 1 million images would cost approximately (excluding free tier) **\$436.72**.

The variable costs related to the number of images, with the main service price list per 1 million images, are as follows:

| **AWS Service**  | Billing Dimension | Quantity per 1M Images | Unit Price \[USD\] | Total \[USD\]
|-----------|------------|------------|------------|
| Amazon EC2 | g5.2xlarge instance, Spot instance per hour  | 416.67 | \$ 0.4968 | \$ 207 |
| Amazon API Gateway | Per 1M REST API requests  | 1 | \$ 3.50 | \$ 3.50 |
| AWS Lambda | Per GB-second  | 12,500 | \$ 0.0000166667 | \$ 0.21
| AWS Lambda | Per 1M requests  | 1 | \$ 0.20 | \$ 0.20
| Amazon SNS | Per 1M requests  | 2 | \$ 0.50 | \$ 0.50
| Amazon SNS | Data transfer per GB  | 7.62**  | \$ 0.09 | \$ 0.68
| Amazon SQS | Per 1M requests  | 2 | \$ 0.40 | \$ 0.80
| Amazon S3 | Per 1K PUT requests  | 2,000 | \$ 0.005 | \$ 10.00
| Amazon S3 | Per GB per month  | 143.05*** | \$ 0.023 | \$ 3.29

The fixed costs unrelated to the number of images, with the main service price list per month, are as follows:

| **AWS Service**  | Billing Dimension | Quantity per Month | Unit Price \[USD\] | Total \[USD\]
|-----------|------------|------------|------------|
| Amazon EKS | Cluster  | 1 | \$ 72.00 | \$ 72.00 |
| Amazon EC2 | m5.large instance, On-Demand instance per hour  | 1440 | \$ 0.0960 | \$ 138.24 |

\* Calculated based on an average request duration of 1.5 seconds, with the unit price based on the average price across all available zones in the US West (Oregon) Region from January 29, 2024, to April 28, 2024.
\*\* Calculated based on an average request size of 16 KB.
\*\*\* Calculated based on an average image size of 150 KB, stored for 1 month.

Please note that this estimation is for reference only. The actual cost may vary depending on the model you use, task parameters, current Spot instance pricing, and other factors.

## Security

When building systems on AWS infrastructure, security responsibilities are shared between you and AWS. This [shared responsibility model](https://aws.amazon.com/compliance/shared-responsibility-model/) reduces your operational burden as AWS operates, manages, and controls the components from the host operating system and virtualization layer down to the physical security of the facilities in which the services operate. For more information about AWS security, visit [AWS Cloud Security](http://aws.amazon.com/security/).

### IAM Roles
AWS Identity and Access Management (IAM) roles allow customers to assign granular access policies and permissions to AWS cloud services and users.

This solution creates separate IAM roles and grants permissions for the following components:
* Amazon EKS cluster, including
  * Creating and operating the cluster
  * Node groups
  * Nodes created by Karpenter
  * Pods running in the cluster, including
    * Karpenter
    * KEDA
    * Fluent Bit
    * Stable Diffusion runtime
* AWS Lambda functions
* Amazon API Gateway
* Amazon EKS

This solution uses IAM roles for internal user access control, following the principle of least privilege, ensuring that each component can only access authorized components and maintaining workload isolation.

### Access Control

This solution uses an API Key mechanism for external user access control, requiring users to include a valid API Key in their requests. For more information about API Keys, please refer to the [API Specification Documentation](#api-call-rules).

### Networking

This solution operates within an isolated VPC by default, separated from your other workloads. If you need to connect this VPC to your existing VPC or a transit gateway, you are responsible for the gateway, firewall, and access control.

## Deploying the Solution

Before deploying the solution, we recommend reviewing the architecture diagram and region support information in this guide, and then following the instructions below to configure and deploy the solution to your account.

### Quick Start

We provide a one-click deployment script for a quick start. The total deployment time is approximately 30 minutes.

#### Obtain the Source Code

Run the following command to obtain the source code and deployment script:

```bash
git clone --recursive https://github.com/aws-samples/stable-diffusion-on-eks
cd stable-diffusion-on-eks
```

#### One-Click Deployment

Run the following command to quickly deploy with the simplest settings:

```bash
cd deploy
./deploy.sh
```

This script will:

* Install necessary runtimes and tools
* Create an S3 bucket, download the base Stable Diffusion 1.5 model from [HuggingFace](https://huggingface.co/runwayml/stable-diffusion-v1-5), and place it in the bucket
* Create an EBS snapshot containing the SD Web UI image using our provided example image
* Create a Stable Diffusion solution with the SD Web UI runtime

!!! warning

    The configuration file generated by this script is the simplest configuration, containing only one runtime and without the ability to customize (such as elastic scaling thresholds, custom models, custom images, etc.). If you need to customize the configuration, please run the following command:

    ```bash
    ./deploy.sh -d
    ```

    This parameter will cause the deployment script to only complete the pre-deployment preparation but not actually deploy. After modifying the configuration according to the [Configuration Options](./configuration.md), you can run the following command to deploy:

    ```bash
    cdk deploy --no-rollback --require-approval never
    ```


#### Deployment Parameters

This script provides some parameters for you to customize the deployed solution:

* `-h, --help`: Display help information
* `-n, --stack-name`: Customize the name of the deployed solution, affecting the naming of generated resources. The default is `sdoneks`.
* `-R, --region`: The region where the solution is deployed. The default is the current region in the AWS configuration profile.
* `-d, --dry-run`: Only generate the configuration file, do not perform the deployment.
* `-b, --bucket`: Specify the name of an existing S3 bucket for storing models. This S3 bucket must already exist and be in the same region as the solution.
* `-s, --snapshot`: Specify an existing EBS snapshot ID. You can build the EBS snapshot yourself according to the documentation below.
* `-r, --runtime-name`: Specify the name of the deployed runtime, affecting the name used when calling the API. The default is `sdruntime`.
* `-t, --runtime-type`: Specify the type of the deployed runtime, accepting only `sdwebui` and `comfyui`. The default is `sdwebui`.

### Manual Deployment

You can also manually deploy this solution on AWS without using the script by following these steps.

1. [Create an Amazon S3 model storage bucket](#model-storage) and store the required models in the bucket
2. *(Optional)* [Build the container image](#image-building)
3. *(Optional)* [Store the container image in an EBS cache to accelerate startup](#image-cache-building)
4. [Deploy and start the solution stack](#manual-deployment)

#### Model Storage

The models required by this solution should be stored in an S3 bucket in advance.

**Create a Bucket**

Please follow these steps to create a bucket:

=== "AWS Management Console"
    * Open the [Amazon S3 console](https://console.aws.amazon.com/s3/).
    * In the left navigation pane, choose **Buckets**.
    * Choose **Create Bucket**.
    * In **Bucket name**, enter a name for your bucket. The name must follow [bucket naming rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html).
    * In **AWS Region**, choose the same region where you plan to deploy the solution.
    !!! warning "Note"
        Please ensure that the bucket is in the same AWS Region as your solution deployment. If you want to deploy multiple copies of the solution in multiple regions, create a separate bucket in each region.
    * Choose **Create Bucket**.

=== "AWS CLI"
    Run the following command to create a bucket. Replace `<bucket name>` with your desired bucket name and `us-east-1` with the AWS Region where you plan to deploy the solution:
    ```bash
    aws s3api create-bucket --bucket <bucket name> --region us-east-1
    ```

**Store Models**

Please store all models you need to use in the S3 bucket, with the following directory structure:

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

Please place the models in the corresponding directories. The `Stable-diffusion` directory must exist and contain the Stable Diffusion model. Other directories can be omitted if there are no models.

Currently, `.safetensors` and `.ckpt` model formats are supported. If you downloaded models from [Civitai](https://civitai.com/) without an extension, please add the `.ckpt` extension.

Please follow these steps to upload the models to the S3 bucket:

=== "AWS Management Console"
    !!! warning "Note"
        Due to the lack of resume support in browser uploads, we do not recommend using the management console to upload models.
    * Open the [Amazon S3 console](https://console.aws.amazon.com/s3/).
    * In the left navigation pane, choose **Buckets**.
    * Select the bucket you created in the previous step and navigate to the desired folder.
    * If the corresponding folder does not exist:
        * Choose **Create Folder**.
        * In **Folder Name**, enter the folder name.
        * Choose **Create folder**.
        * Repeat the above steps until the folder structure matches the structure above.
    * Choose **Upload**.
    * Choose **Add files**, and select the model files you want to upload.
    * Choose **Upload**. Do not close the browser during the upload process.


=== "AWS CLI"
    Run the following command to upload the model files to the bucket. Replace `<model name>` with your model file name, `<folder>` with the model type, and `<bucket name>` with your desired bucket name:
    ```bash
    aws s3 cp <model name> s3://<bucket name>/<folder>/
    ```
    !!! note "Tip"
        When using AWS CLI for uploading, there is no need to create the directory structure in advance.

    !!! note "Tip"
        You can use third-party tools like [s5cmd](https://github.com/peak/s5cmd) to improve upload speed.

#### Image Building

You can build the image from the source code and store it in your image repository.

!!! danger "Runtime Selection"
    You need to provide the Stable Diffusion runtime image yourself. You can find supported Stable Diffusion runtimes in the [Deployment Planning](#choosing-a-stable-diffusion-runtime) section.

!!! note "Pre-built Images"
    For evaluation and testing purposes, you can use our pre-built images:
    ```
    SD Web UI: public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest
    ComfyUI: public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest
    Queue Agent: public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest
    ```
    Please note that these images are only for technical evaluation and testing purposes, and you are responsible for any license risks associated with using these images.

**Build the Image**

Run the following command to build the `queue-agent` image:

```bash
docker build -t queue-agent:latest src/backend/queue_agent/
```
!!! example "Example Runtimes"

    You can use the community-provided [example Dockerfile](https://github.com/yubingjiaocn/stable-diffusion-webui-docker) to build the container images for the *Stable Diffusion Web UI* and *ComfyUI* runtimes. Please note that these images are only for technical evaluation and testing purposes, and should not be deployed to production environments.

**Push the Image to Amazon ECR**

!!! note "Image Repository Choice"
    We recommend using Amazon ECR as the image repository, but you can also choose other repositories that support the [OCI standard](https://www.opencontainers.org/), such as Harbor.

!!! tip "First-time Push"
    Amazon ECR requires creating an image repository before pushing.
    === "AWS CLI"
        Run the following command to create the repository:
        ```bash
        aws ecr create-repository --repository-name sd-on-eks/queue-agent
        ```

Run the following commands to log in to the image repository and push the image. Replace `us-east-1` with your AWS Region and `123456789012` with your AWS account ID:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

docker tag queue-agent:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
```

**Build and Push the Helm Chart**

The solution is deployed via a Helm Chart. The Helm Chart can be stored on any HTTP server accessible over the Internet or in an image repository compatible with the [OCI standard](https://www.opencontainers.org/). You can store the Helm Chart in Amazon ECR.

!!! bug "China Region Support"
    Due to a [known issue](https://github.com/aws/aws-cdk/issues/28460) with the CDK framework, you cannot store the Helm Chart in an ECR image repository in China Regions. We are actively working on fixing this issue.

!!! note "Pre-built Helm Chart"
    In general, you do not need to deeply customize the Helm Chart content. In this case, you can directly use our pre-built Helm Chart. You can configure the runtime using the `config.yaml` file.

===  "Using ECR Image Repository"
    !!! tip "First-time Push"
        Amazon ECR requires creating an image repository before pushing.
        === "AWS CLI"
            Run the following command to create the repository:
            ```bash
            aws ecr create-repository --repository-name sd-on-eks/charts/sd-on-eks
            ```

        === "AWS Management Console"
            * Open the Amazon ECR console at https://console.aws.amazon.com/ecr/.
            * Choose **Get started**.
            * For **Visibility settings**, choose **Private**.
            * For **Repository name**, enter `sd-on-eks/charts/sd-on-eks`.
            * Choose **Create repository**.

    Run the following commands to log in to the image repository and push the Helm Chart. Replace `us-east-1` with your AWS Region and `123456789012` with your AWS account ID:

    ```bash
    helm package src/charts/sd_on_eks
    helm push sd-on-eks-<version>.tgz oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/charts/
    ```

    After the upload is complete, you need to modify `config.yaml` and add the following content under each runtime that needs to use this Helm Chart:

    ```yaml
    modelsRuntime:
    - name: sdruntime
      namespace: default
      type: sdwebui
      chartRepository: "oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/charts/sd-on-eks"
      chartVersion: "1.1.0" # Modify if you customized the Helm Chart version
    ```

===  "Using HTTP Server"
    !!! tip "Access Control"
        Please ensure that the HTTP server is open to the Internet and does not have any access control (such as IP whitelisting).

    Run the following command to package the Helm Chart:

    ```bash
    helm package src/charts/sd_on_eks
    ```

    After packaging, a file named `sd-on-eks-<version>.tgz` will be output. Place this file in an empty folder and run the following command:

    ```bash
    helm repo index
    ```

    You can place the generated package and `index.yaml` on an HTTP server. Assuming the domain name of the HTTP server is `example.com` (IP addresses are also acceptable), you need to modify `config.yaml` and add the following content under each runtime that needs to use this Helm Chart:

    ```yaml
    modelsRuntime:
    - name: sdruntime
      namespace: default
      type: sdwebui
      chartRepository: "http://example.com/"
      chartVersion: "1.0.0"  # Modify if you customized the Helm Chart version
    ```

#### Image Cache Building

By pre-caching the container image as an EBS snapshot, you can optimize the startup speed of compute instances. When launching a new instance, the instance's data volume comes with a container image cache, eliminating the need to pull from the image repository again.

You should create the EBS snapshot before deploying the solution. We provide a script for building the EBS snapshot.

===  "Using Custom Images"
    If you built and pushed the image to Amazon ECR yourself, run the following command. Replace `us-east-1` with the region where the solution is deployed and `123456789012` with your 12-digit AWS account number:

    ```bash
    cd utils/bottlerocket-images-cache
    ./snapshot.sh 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/sdwebui:latest,123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
    ```

=== "Using Pre-built Images"
    If you are using the pre-built images provided by the solution, run the following command:

    ```bash
    cd utils/bottlerocket-images-cache
    ./snapshot.sh public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest,public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest,public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest
    ```

After the script completes, it will output the EBS snapshot ID (in the format `snap-0123456789`). You can apply this snapshot during deployment.

For more information about this script, please refer to the [GitHub repository](https://github.com/aws-samples/bottlerocket-images-cache).

#### Manual Deployment

Follow these steps to deploy this solution:

**Install Required Components**

Please install the following runtimes before deployment:

* [Node.js](https://nodejs.org/en) version 18 or later
* [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
* [AWS CDK Toolkit](https://docs.aws.amazon.com/cdk/v2/guide/cli.html)
* [git](https://git-scm.com/downloads)

**Edit the Configuration File**

The configuration for this solution is stored in the `config.yaml` file. We provide a configuration file template, and you can customize the solution according to your actual needs.

1. Set the Model Storage Bucket (Required)

Modify `<bucket name>` in `modelBucketArn` to the name of the S3 bucket where you placed the models.

```yaml
modelBucketArn: arn:aws:s3:::<bucket name>
```

!!! warning "China Regions"

    If you are using an AWS China Region, ensure that the partition in the ARN is `aws-cn`.

    ```yaml
    modelBucketArn: arn:aws-cn:s3:::<bucket name>
    ```

2. Set the Stable Diffusion Runtime (Required)

You need to specify the runtime parameters. The runtime is defined in `modelsRuntime`, with the following configuration:

```yaml
modelsRuntime:
- name: "sdruntime" # Required parameter, the name of the runtime, cannot be the same as other runtimes
  namespace: "default" # Required parameter, the Kubernetes namespace where the runtime is located, it is not recommended to place it in the same namespace as other runtimes
  type: "sdwebui" # Required parameter, the type of this runtime, currently only supports "sdwebui" and "comfyui"
  modelFilename: "v1-5-pruned-emaonly.safetensors" # (SD Web UI) The name of the model used by this runtime, cannot be the same as other runtimes
  dynamicModel: false # (SD Web UI) Whether this runtime allows dynamic model loading
```

You can configure multiple runtimes in the `modelsRuntime` section.

3. Set Custom Images (Optional)

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

4. Set EBS Snapshot-based Image Cache (Optional)

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
          snapshotID: snap-0123456789 # Modify to the EBS snapshot ID
```

5. Other Detailed Settings (Optional)

If you need to configure the runtime in detail, please refer to the [Configuration Options](./configuration.md).


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

This solution supports deployment in AWS China Regions.

| Region Name           | Verified |
|----------------|---------------------------------------|
| China (Ningxia)  | :material-check-bold:{ .icon_check }  |

However, due to the special network environment in China, there are the following limitations:

* You need to build the container image yourself or copy the standard image to ECR in the China Region. It is not recommended to use images from ECR Public.
* Some component Helm Charts are hosted on GitHub, and there may be issues retrieving the Helm Charts when deploying in China Regions, requiring retries.
* You cannot automatically download models from Hugging Face or GitHub, and you need to manually download the models and upload them to the S3 bucket.

#### Steps for Deploying in China Regions

The steps for deploying in AWS China Regions differ from the normal deployment process. Please follow these steps for deployment:

1. Build or transfer the image to ECR
2. Download the models and store them in an S3 bucket
3. Create an EBS disk snapshot
4. Generate and modify the configuration file
5. Proceed with deployment

**Build or Transfer the Image to ECR**

Since the default container images are stored in ECR Public, you may experience slow speeds or connection interruptions when pulling images or creating image caches. We recommend that you build the images yourself or transfer the existing images to your ECR image repository.

If you need to build the images yourself, please refer to the [Image Building](#image-building) documentation.

If you need to transfer the pre-built images to ECR in the China Region, you can run the following commands on an instance with Docker installed and ECR permissions:

```bash
docker pull public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest
docker pull public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest
docker pull public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest

aws ecr create-repository --repository-name sd-on-eks/sdwebui
aws ecr create-repository --repository-name sd-on-eks/comfyui
aws ecr create-repository --repository-name sd-on-eks/queue-agent

docker tag public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest 123456789012.dkr.ecr.cn-northwest.amazonaws.com.cn/sd-on-eks/sdwebui:latest
docker tag public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest 123456789012.dkr.ecr.cn-northwest.amazonaws.com.cn/sd-on-eks/comfyui:latest
docker tag public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest 123456789012.dkr.ecr.cn-northwest.amazonaws.com.cn/sd-on-eks/queue-agent:latest

aws ecr get-login-password --region cn-northwest-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn

docker push 123456789012.dkr.ecr.cn-northwest.amazonaws.com.cn/sd-on-eks/sdwebui:latest
docker push 123456789012.dkr.ecr.cn-northwest.amazonaws.com.cn/sd-on-eks/comfyui:latest
docker push 123456789012.dkr.ecr.cn-northwest.amazonaws.com.cn/sd-on-eks/queue-agent:latest
```

We recommend that you follow the [Image Building](#image-building) documentation to place the Helm Chart in ECR or an HTTP server.

**Download the Models and Store Them in an S3 Bucket**

Since you cannot access Hugging Face smoothly from mainland China, please download the models from other mirror sites and upload them to the S3 bucket following the [Model Storage](#model-storage) documentation.

**Create an EBS Disk Snapshot**

Please follow the [Image Cache Building](#image-cache-building) documentation to create an EBS disk snapshot to accelerate image loading.

**Generate and Modify the Configuration File**

Run the following command to install the tools and generate the initial configuration file:

```bash
cd deploy
./deploy.sh -b <bucket name> -s <snapshot ID> -d
```

This command will generate a `config.yaml` template in the parent directory, but this template needs to be edited for deployment in China Regions. Please edit the file according to the comments:

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
        - "g4dn.xlarge"
        - "g4dn.2xlarge"
        capacityType:
          onDemand: true
          spot: true

```

After completing the modifications, you can run the deployment command to deploy:

```bash
cdk deploy
```

### Deployment Verification

You can use the test script to verify if the solution is deployed successfully. Run the following command to perform the test:

```bash
cd test
STACK_NAME=sdoneksStack RUNTIME_TYPE=sdwebui ./run.sh
```

If you have modified the solution stack name or runtime type, please replace `sdoneksStack` and `sdwebui` with the corresponding content.

This script will automatically find the API Gateway endpoint, obtain the API Key, and send test requests.

* For the SD Web UI runtime, it will send text-to-image, image-to-image, and single-image super-resolution requests.
* For the ComfyUI runtime, it will send a Pipeline request.

Within seconds to minutes (depending on whether image caching is enabled and the minimum number of instance replicas), you can find the generated images at the `output_location`.

## Usage Guide

### API Call Rules

After deploying the solution, you can send requests to the Stable Diffusion runtime through the Amazon API Gateway API endpoint.

When sending requests, please follow these rules:

#### Request Endpoint and Format

The API endpoint of the solution can be obtained from the CloudFormation output:

=== "AWS Management Console"

    * Go to the [AWS CloudFormation console](https://console.aws.amazon.com/cloudformation/home)
    * Choose **Stacks**
    * In the list, select **SdOnEKSStack** (or your custom name)
    * Choose **Output**
    * Record the value of the **FrontApiEndpoint** item (in the format `https://abcdefghij.execute-api.ap-southeast-1.amazonaws.com/prod/`)

=== "AWS CLI"

    Run the following command to obtain the API endpoint:

    ```bash
    aws cloudformation describe-stacks --stack-name SdOnEKSStack --output text --query 'Stacks[0].Outputs[?OutputKey==`FrontApiEndpoint`].OutputValue'
    ```

You need to append the API version to the endpoint. Currently, we support the `v1alpha1` and `v1alpha2` versions. When using the `v1alpha2` version API, requests should be sent to:

```
https://abcdefghij.execute-api.ap-southeast-1.amazonaws.com/prod/v1alpha2
```

This endpoint only accepts JSON-formatted POST requests and requires the `Content-Type: application/json` request header.


#### Request Types

Depending on the runtime type, each runtime only accepts specific types of requests:

* For the SD Web UI runtime, only [text-to-image](#text-to-image-sd-web-ui), [image-to-image](#image-to-image-sd-web-ui), and [single-image super-resolution upscaling](#single-image-super-resolution-upscaling-sd-web-ui) requests are accepted.
* For the ComfyUI runtime, only [Pipeline](./pipeline.md) requests are accepted.

Please refer to the detailed documentation for each request type for the specific request format.

#### API Key

For security reasons, all requests must include an API Key. Follow these steps to obtain the API Key:

=== "AWS Management Console"

    * Go to the [Amazon API Gateway console](https://console.aws.amazon.com/apigateway)
    * Choose **API Keys**
    * In the list, select the API Key with a name similar to `SdOnEK-defau-abcdefghij` (or your custom name)
    * Record the value of the **API key** item

=== "AWS CLI"

    Run the following command to obtain the API Key:

    ```bash
    echo $(aws cloudformation describe-stacks --stack-name SdOnEKSStack --output text --query 'Stacks[0].Outputs[?OutputKey==`GetAPIKeyCommand`].OutputValue')
    ```

When sending requests, you need to include the `x-api-key` request header with the value set to the API Key obtained above.

!!! danger "Unverified Requests"
    Requests without an API Key will directly return a `401` error.

#### Throttling Rules

To protect the backend API, API Gateway will throttle excessive requests sent using the same API Key.

The default settings are:

* 30 requests per second
* Burst limit of 50 requests

For detailed information about throttling principles, please refer to [Throttle API requests for better throughput](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html).

If you need to modify these settings, please modify the `APIGW` section in `config.yaml`. You can also modify the corresponding Usage Plan in API Gateway.

### Text-to-Image (SD Web UI)

!!! info
    This request type is only applicable to the SD Web UI runtime.

The most basic usage of Stable Diffusion, where an image is generated based on the input prompt.

The content in the request will be passed directly to SD Web UI, but if there are links (HTTP or S3 URLs), the link content will be converted to base64-encoded content and filled in the corresponding fields.

#### Request Format

=== "v1alpha2"
    ```json
    {
      "task": {
        "metadata": {
          "id": "test-t2i", // Required, task ID
          "runtime": "sdruntime", // Required, the name of the runtime used for the task
          "tasktype": "text-to-image", // Required, task type
          "prefix": "output", // Required, the prefix (directory name) of the output file in the S3 bucket
          "context": "" // Optional, you can place any information, which will be included in the callback
        },
        "content": { // Same specification as the SD Web UI text-to-image interface
          "alwayson_scripts": {},
          "prompt": "A dog",
          "steps": 16,
          "width": 512,
          "height": 512
        }
      }
    }
    ```

=== "v1alpha1"
    ```json
    {
        "alwayson_scripts": {
            "task": "text-to-image", // Required, task type
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors", // Required, base model name, associated with queue dispatching or model switching
            "id_task": "test-t2i", // Required, task ID, will be used when uploading result images and returning responses
            "save_dir": "outputs" // Required, the prefix (directory name) of the output file in the S3 bucket
        },
        // The following are official parameters, use the default values or pass them in directly
        "prompt": "A dog",
        "steps": 16,
        "width": 512,
        "height": 512
    }
    ```

#### Response Format

=== "v1alpha2"
    ```json
    {
      "id_task": "test-t2i",
      "runtime": "sdruntime",
      "output_location": "s3://outputbucket/output/test-t2i"
    }
    ```

=== "v1alpha1"
    ```json
    {
      "id_task": "test-t2i",
      "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors",
      "output_location": "s3://outputbucket/output/test-t2i"
    }
    ```

#### Model Switching

If the corresponding runtime is set to `dynamicModel: true`, you need to add the following content in the `alwayson_scripts` of the request:

```json
        "content": {
          "alwayson_scripts": {
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors" //Place the model name here
          },
        }
```

Upon receiving the request, SD Web UI will unload the current model and load the corresponding model from memory or the S3 bucket. If the specified model does not exist, the request will directly return an error.


#### Image Retrieval

After the image is generated, it will be stored in the S3 bucket path at `output_location`. If `batch_size` or other parameters that generate multiple images are set, each image will be automatically numbered and stored.

The default storage format is lossless PNG, but if special formats (such as GIF) are involved, the system will automatically recognize and add the extension.

### Image-to-Image (SD Web UI)

!!! info
    This request type is only applicable to the SD Web UI runtime.

The basic usage of Stable Diffusion, where an image is generated based on the input prompt and reference image.

The content in the request will be passed directly to SD Web UI, but if there are links (HTTP or S3 URLs), the link content will be converted to base64-encoded content and filled in the corresponding fields.

#### Request Format

=== "v1alpha2"
    ```json
    {
      "task": {
        "metadata": {
          "id": "test-i2i", // Required, task ID
          "runtime": "sdruntime", // Required, the name of the runtime used for the task
          "tasktype": "image-to-image", // Required, task type
          "prefix": "output", // Required, the prefix (directory name) of the output file in the S3 bucket
          "context": "" // Optional, you can place any information, which will be included in the callback
        },
        "content": { // Same specification as the SD Web UI image-to-image interface
          "alwayson_scripts": {},
          "prompt": "cat wizard, gandalf, lord of the rings, detailed, fantasy, cute, adorable, Pixar, Disney, 8k",
          "steps": 16,
          "width": 512,
          "height": 512,
          "init_images": ["https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png"] // Place the image link here, the image will be downloaded and base64-encoded before being included in the request
        }
      }
    }
    ```

=== "v1alpha1"
    ```json
    {
        "alwayson_scripts": {
            "task": "image-to-image", // Required, task type
            "image_link": "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png", // Required, URL of the input image
            "id_task": "test-i2i", // Required, task ID, will be used when uploading result images and returning responses
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors", // Required, base model name, associated with queue dispatching or model switching
        },
        // The following are official parameters, use the default values or pass them in directly
        "prompt": "cat wizard, gandalf, lord of the rings, detailed, fantasy, cute, adorable, Pixar, Disney, 8k",
        "steps": 16,
        "width": 512,
        "height": 512
    }
    ```

#### Response Format

=== "v1alpha2"
    ```json
    {
      "id_task": "test-i2i",
      "runtime": "sdruntime",
      "output_location": "s3://outputbucket/output/test-t2i"
    }
    ```

=== "v1alpha1"
    ```json
    {
      "id_task": "test-i2i",
      "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors",
      "output_location": "s3://outputbucket/output/test-t2i"
    }
    ```

#### Model Switching

If the corresponding runtime is set to `dynamicModel: true`, you need to add the following content in the `alwayson_scripts` of the request:

```json
        "content": {
          "alwayson_scripts": {
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors" //Place the model name here
          },
        }
```

Upon receiving the request, SD Web UI will unload the current model and load the corresponding model from memory or the S3 bucket. If the specified model does not exist, the request will directly return an error.

#### Image Retrieval

After the image is generated, it will be stored in the S3 bucket path at `output_location`. If `batch_size` or other parameters that generate multiple images are set, each image will be automatically numbered and stored.

The default storage format is lossless PNG, but if special formats (such as GIF) are involved, the system will automatically recognize and add the extension.

### Single-Image Super-Resolution Upscaling (SD Web UI)

!!! info
    This request type is only applicable to the SD Web UI runtime.

    This request type only provides the `v1alpha2` API.

For a single image, use the super-resolution model to upscale the image.

#### Request Format

=== "v1alpha2"
    ```json
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


#### Response Format

=== "v1alpha2"
    ```json
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

After the image is generated, it will be stored in the S3 bucket path at `output_location`. The default storage format is lossless PNG, but if special formats (such as GIF) are involved, the system will automatically recognize and add the extension.

### Pipeline (ComfyUI)

!!! info
    This request type is only applicable to the ComfyUI runtime.

    This request type only provides the `v1alpha2` API.

ComfyUI provides workflow orchestration capabilities, allowing you to design workflows using various nodes in the interface and export them to a `json` file.

#### Exporting the Workflow

After designing the workflow in the interface, follow these steps to export the workflow:

* Select the gear icon in the top-right corner of the menu panel
* Select `Enable Dev mode Options`
* Select `Save(API Format)` to save the workflow as a file

#### Request Format

=== "v1alpha2"
    ```json
    {
      "task": {
        "metadata": {
          "id": "test-pipeline", // Required, task ID
          "runtime": "sdruntime", // Required, the name of the runtime used for the task
          "tasktype": "pipeline", // Required, task type
          "prefix": "output", // Required, the prefix (directory name) of the output file in the S3 bucket
          "context": "" // Optional, you can place any information, which will be included in the callback
        },
        "content": {
          ... // Place the exported workflow content here
        }
      }
    }
    ```

#### Response Format

=== "v1alpha2"
    ```json
    {
      "id_task": "test-pipeline",
      "runtime": "sdruntime",
      "output_location": "s3://outputbucket/output/test-pipeline"
    }
    ```

#### Image Retrieval

After the image is generated, it will be stored in the S3 bucket path at `output_location`. If `batch_size` or other parameters that generate multiple images are set, each image will be automatically numbered and stored.

The default storage format is lossless PNG, but if special formats (such as GIF) are involved, the system will automatically recognize and add the extension.

### Callbacks and Notifications

The Stable Diffusion on Amazon EKS solution uses an asynchronous inference mode, and when an image is generated or an error occurs, the user will be notified through Amazon SNS. User applications can subscribe to the SNS topic to receive notifications of image generation completion.

#### Adding a Subscription

Please refer to the [Amazon SNS documentation](https://docs.aws.amazon.com/sns/latest/dg/sns-event-destinations.html) to learn about the message destination types supported by SNS.

You can find the generated SNS topic ARN from the CloudFormation output:

=== "AWS Management Console"

    * Go to the [AWS CloudFormation console](https://console.aws.amazon.com/cloudformation/home)
    * Choose **Stacks**
    * In the list, select **SdOnEKSStack** (or your custom name)
    * Choose **Output**
    * Record the value of the **sdNotificationOutputArn** item (in the format `arn:aws:sns:us-east-1:123456789012:SdOnEKSStack-sdNotificationOutputCfn-abcdefgh`)

=== "AWS CLI"

    Run the following command to obtain the SNS topic ARN:

    ```bash
    aws cloudformation describe-stacks --stack-name SdOnEKSStack --output text --query 'Stacks[0].Outputs[?OutputKey==`sdNotificationOutputArn`].OutputValue'
    ```

To receive messages, you need to add your message receiver (such as an Amazon SQS queue, HTTP endpoint, etc.) as a **subscription** to this SNS topic.

=== "AWS Management Console"

    * In the left navigation pane, choose **Subscriptions**.
    * On the **Subscriptions** page, choose **Create subscription**.
    * On the **Create subscription** page in the Details section, do the following:
        * For **Topic ARN**, choose the ARN you recorded in the previous step.
        * For **Protocol**, choose the type of your receiver.
        * For **Endpoint**, enter the address of your receiver, such as an email address or the ARN of an Amazon SQS queue.
    * Choose **Create subscription**.

=== "AWS CLI"

    Please refer to [Use Amazon SNS with the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-services-sns.html#cli-subscribe-sns-topic) to add a subscription to this topic.

#### Callback Message Format

The solution will send task completion notifications to SNS in the following format, which is independent of the API version used in the request:

```json
{
    "id": "task_id", // Task ID
    "result": true, // true for successful completion, false for unsuccessful completion
    "image_url": [ // S3 URLs of the generated images, in the format task_id+4_random_chars+image_number, if there are multiple images, all image links will be included
        "s3://outputbucket/output/test-t2i/test-t2i-abcd-1.png"
    ],
    "output_url": "s3://outputbucket/output/test-t2i/test-t2i-abcd.out", // The S3 URL of the task return, containing the complete return from the runtime
    "context": { // The Context content included in the request
        "abc": 123
    }
}
```



## Deleting the Solution

The deployed solution can be deleted using CloudFormation.

!!! danger "Permanent Deletion"
    All deleted resources will be permanently deleted and cannot be recovered by any means.

### Deletion Scope

* The following content **will** be permanently deleted:
    * Amazon EKS cluster and all worker nodes
    * SNS topics and all subscriptions
    * SQS queues
    * VPC
    * IAM roles used by the solution

* The following content **will not** be deleted:
    * S3 bucket for storing output images
    * S3 bucket for storing models

### Preparation Before Deletion

Before deleting the solution, please ensure that the solution meets the following conditions:

* All SQS queues have been emptied
* All IAM roles do not have additional policies attached
* There are no additional resources (such as EC2, ENI, Cloud9, etc.) in the VPC

### Deleting the Solution

You can delete this solution through the CDK CLI or the AWS Management Console.

=== "AWS Management Console"

    * Go to the [AWS CloudFormation console](https://console.aws.amazon.com/cloudformation/home)
    * Choose **Stacks**
    * In the list, select **sdoneksStack** (or your custom name)
    * Choose **Delete**, and in the pop-up dialog, choose **Delete**

=== "AWS CDK"

    In the solution source code directory, run the following command to delete the solution:

    ```bash
    npx cdk destroy
    ```

Deleting the solution takes approximately 20-30 minutes.

### Contributors

-   Bingjiao Yu, Container Specialist SA
-   Harold Sun, Sr. GCR Serverless SSA
-   Daniel Zilberman, Sr. SA,  Tech Solutions team


## Notices

Customers are responsible for making their own independent assessment of
the information in this document. This document: (a) is for
informational purposes only, (b) represents AWS current product
offerings and practices, which are subject to change without notice, and
(c) does not create any commitments or assurances from AWS and its
affiliates, suppliers or licensors. AWS products or services are
provided "as is" without warranties, representations, or conditions of
any kind, whether express or implied. AWS responsibilities and
liabilities to its customers are controlled by AWS agreements, and this
document is not part of, nor does it modify, any agreement between AWS
and its customers.