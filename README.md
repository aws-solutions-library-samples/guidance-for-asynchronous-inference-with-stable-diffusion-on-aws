# Guidance for asynchronous inference with Stable Diffusion-Web UI on AWS

Implementing a fast scaling and low cost Stable Diffusion inference solution with serverless and containers on AWS

Stable Diffusion is a popular open source project for generating images using Gen AI. Building a scalable and cost efficient inference solution is a common challenge AWS customers facing. This project shows how to use serverless and container services to build an end-to-end low cost and fast scaling asyncronous image generation architecture. This repo contains the sample code and CDK deployment scripts, helping you to deploy this solution in a few steps.

## Features

- Asyncronous API and Serverless Event-Driven Architecture
- Image Generation with Stable Diffusion Web UI on Amazon EKS
- Automatic queue length based scaling with KEDA
- Automatic provisioning ec2 instances with Karpenter
- Scaling up new inference nodes within 2 minutes
- Saving up to 70% with GPU spot instances

## Architecture diagram
<!-- {% include image.html file="async_img_sd_images/IG_Figure1.png" alt="architecture" %} -->
<!-- img src="./low-latency-high-bandwidth-updated-architecture.jpg" width="90%" --> 
<div align="center">
<img src="docs/en/images/stable_diffusion_architecture_diagram.jpg" width="90%">
<br/>
Figure 1: Guidance for Asynchronous Image Generation with Stable Diffusion on AWS architecture
</div>

### Architecture steps

1. Users send prompts to an application running on [AWS ECS Fargate](https://aws.amazon.com/fargate/) through an [Application Load Balancing](https://aws.amazon.com/elasticloadbalancing/application-load-balancer/) endpoint.
2. An application sends prompt to [Amazon API Gateway](https://aws.amazon.com/api-gateway/) that acts as an endpoint for the overall solution, including authentication. [AWS Lambda](https://aws.amazon.com/lambda/) function validates the requests, publishes them to the designated [Amazon Simple Notification Service](https://aws.amazon.com/sns/) (Amazon SNS) topic, and immediately returns a response.
3. Amazon SNS publishes the message to [Amazon Simple Queue Service](https://aws.amazon.com/sqs/) (Amazon SQS) queues. Each message contains a [Stable Diffusion](https://github.com/AUTOMATIC1111/stable-diffusion-webui) (SD) model name attribute and will be delivered to the queues with matching SD model names.
4. In the [Amazon Elastic Kubernetes Service](https://aws.amazon.com/eks/) (Amazon EKS) cluster, the previously deployed open source Kubernetes Event Driven Auto-Scaler (KEDA) scales up new pods to process the incoming messages from SQS model processing queues.
5. In the Amazon EKS cluster, Karpenter, an open source Kubernetes compute auto-scaler, launches new compute nodes based on GPU [Amazon Elastic Compute Cloud](https://aws.amazon.com/ec2/) (Amazon EC2) Spot instances (such as G4, G5, and P4) to schedule pending pods. The instances use pre-cached SD Runtime images and are based on [Bottlerocket OS](https://aws.amazon.com/bottlerocket/) for fast boot.
6. Stable Diffusion Runtimes load ML model files from [Amazon Elastic File System](https://aws.amazon.com/efs/) (Amazon EFS) file system upon pod initializations.
7. Queue agents (a program created for this Guidance) receive messages from SQS model processing queues and convert them to inputs for SD Runtime APIs calls.
8. Queue agents call SD Runtime APIs, receive and decode responses, and save the generated images to [Amazon Simple Storage Service](https://aws.amazon.com/s3/) (Amazon S3) buckets.
9. Queue agents send notifications to the designated SNS topic from the pods and the application receives notifications from the corresponding SQS queue.
10. An application running on [AWS Fargate](https://aws.amazon.com/fargate/) downloads the generated images from the S3 bucket and renders them to users.

### AWS services in this Guidance


| **AWS service**  | Description |
|-----------|------------|
|[Amazon Elastic Kubernetes Service - EKS](https://aws.amazon.com/eks/)|Core service -  application platform host the SD containerized workloads|
|[Amazon Virtual Private Cloud - VPC](https://aws.amazon.com/vpc/)| Core Service - network security layer |
|[Amazon Elastic Compute Cloud - EC2](https://aws.amazon.com/ec2/)| Core Service - EC2 instance power On Demand and Spot based EKS compute node groups for running container workloads|
|[Amazon Elastic Container Registry - ECR](https://aws.amazon.com/ecr/)|Core service - ECR registry is used to host the container images and Helm charts|
|[Amazon Simple Storage Service S3](https://aws.amazon.com/s3/)|Core service - Object storage for users' ETL assets from GitHub|
|[AWS Fargate](https://aws.amazon.com/fargate/)| Core service - runs containerized frontend user application | 
|[Amazon API Gateway](https://aws.amazon.com/api-gateway/)| Core service - endpoint for backend application|
|[AWS Lambda](https://aws.amazon.com/lambda/)| Core service - validates the requests, publishes them to the designated |
|[Amazon Simple Queue Service](https://aws.amazon.com/sqs/)| Core service - provides asynchronous event handling |
|[Amazon Simple Notification Service](https://aws.amazon.com/sns/)| Core service - provides model specific event processing  |
|[Amazon Elastic File System](https://aws.amazon.com/efs/)|Auxiliary service - stores ML model files |
|[Amazon CloudWatch](https://aws.amazon.com/cloudwatch/)|Auxiliary service - provides observability for core services  |
|[AWS CDK](https://aws.amazon.com/cdk/) |	Core service - Used for deploying and updating this solution|


## Plan your deployment

Include all deployment planning topics under this section, such as costs,system requirements, deployment pre-requisites, service quotas,
Region considerations, and template dependencies.

### Cost 

We recommend creating a [budget](https://alpha-docs-aws.amazon.com/awsaccountbilling/latest/aboutv2/budgets-create.html) through [AWS
Cost Explorer](http://aws.amazon.com/aws-cost-management/aws-cost-explorer/) to help manage costs. Prices are subject to change. For full details, refer to the pricing webpage for each AWS service used in this Guidance.

### Sample cost table

The following table provides a sample cost breakdown for deploying this Guidance with the default parameters in the US East (N. Virginia) region
for one month.

| AWS service  | Dimensions | Cost \[USD\] |
|-----------|------------|----|
| Amazon API Gateway | 1,000,000 REST API calls per month  | \$ 3.50month |
| Amazon Cognito | 1,000 active users per month without advanced security feature | \$ 0.00 |
| Amazon EC2 | number of active EKS compute Nodes | \$1500.00 |

## Security

Add the following boilerplate text to the beginning of this section:

When you build systems on AWS infrastructure, security responsibilities
are shared between you and AWS. This [shared responsibility
model](https://aws.amazon.com/compliance/shared-responsibility-model/)
reduces your operational burden because AWS operates, manages, and
controls the components including the host operating system, the
virtualization layer, and the physical security of the facilities in
which the services operate. For more information about AWS security,
visit [AWS Cloud Security](http://aws.amazon.com/security/).


## Service Quotas

Service quotas, also referred to as limits, are the maximum number of service resources or operations for your AWS account.

#### Quotas for AWS services in this Guidance

To view the service quotas for all AWS services in the documentation without switching pages, view the information in the [Service endpoints
and quotas](https://docs.aws.amazon.com/general/latest/gr/aws-general.pdf#aws-service-information)
page in the PDF instead.
Each AWS account has quotas on the number of resources that can be created in each AWS region. You can view service quotas in the AWS console using the [Service Quotas](https://console.aws.amazon.com/servicequotas/home/) tool. If a service quota can be increased, you can open a case through this tool to request an increase.

The main service quotas related to this solution are:

| AWS Service | Quota Entry | Estimated Usage | Adjustable |
|-------------|--------------|------------------|------------|
| Amazon EC2 | [Running On-Demand G and VT instances](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-DB2E81BA) | Based on max concurrent GPU instances | V |
| Amazon EC2 | [All G and VT Spot Instance Requests](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-3819A6DF) | Based on max concurrent GPU instances | V |
| Amazon SNS | [Messages Published per Second](https://console.aws.amazon.com/servicequotas/home/services/sns/quotas/L-F8E2BA85) | Based on max concurrent requests | V |

Additionally, consider the following service quotas during deployment:

| AWS Service | Quota Entry | Estimated Usage | Adjustable |
|-------------|--------------|------------------|------------|
| Amazon VPC | [VPCs per Region](https://console.aws.amazon.com/servicequotas/home/services/vpc/quotas/L-F678F1CE) | 1 | V |
| Amazon VPC | [NAT gateways per Availability Zone](https://console.aws.amazon.com/servicequotas/home/services/vpc/quotas/L-FE5A380F) | 1 | V |
| Amazon EC2 | [EC2-VPC Elastic IPs](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-0263D0A3) | 1 | V |
| Amazon S3 | [General purpose buckets](https://console.aws.amazon.com/servicequotas/home/services/s3/quotas/L-DC2B2D3D) | 1 per queue | V |


## Deployment Documentation

<!-- Check out our [live docs](https://aws-samples.github.io/stable-diffusion-on-eks/en/)! -->
Please see detailed Implementation Guides here *TO BE UPDATED WITH LIVE IG LINKS* :
- [English](https://implementationguides.kits.eventoutfitters.aws.dev/async-img-sd-0122/aiml/asynchronous-image-generation-with-stable-diffusion-on-aws.html)
- [Chinese](https://implementationguides.kits.eventoutfitters.aws.dev/async-img-zh-0822/aiml/asynchronous-image-generation-with-stable-diffusion-on-aws-zh.html)  

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under MIT-0 License. See the [LICENSE](LICENSE) file.
