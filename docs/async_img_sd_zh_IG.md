---
title: 在AWS上快速部署基于Stable Diffusion的异步图像生成解决方案
description: "该指南介绍了如何在 AWS 上使用无服务器和容器解决方案，实施快速扩展和低成本的Stable Diffusion图像生成解决方案。该指南包含方案简介，架构，部署和使用步骤。该指南面向对图像生成感兴趣，希望部署该解决方案的解决方案架构师，DevOps工程师，云工程师等人员。"
published: true
sidebar: async_img_sd_zh_sidebar
permalink: aiml/asynchronous-image-generation-with-stable-diffusion-on-aws-zh.html
tags:
layout: page
---

---

## 简介

在 AWS 上使用无服务器和容器解决方案，实施快速扩展和低成本的Stable Diffusion图像生成解决方案

Stable Diffusion 是一个使用生成式AI技术生成图像的流行开源项目。构建可扩展、低成本的推理解决方案是 AWS 客户面临的共同挑战。本项目展示了如何使用无服务器和容器服务构建端到端低成本、快速扩展的异步图像生成架构。该代码仓库包含示例代码和实施指南（即本文档）


### 功能特性

该解决方案具有以下特性：

- 基于事件驱动架构
- 利用 KEDA 实现基于队列长度的自动扩展
- 利用 Karpenter 自动配置 EC2 实例
- 在 2 分钟内扩展新的推理节点
- 使用 GPU Spot 实例可节省高达 70% 的成本
- 支持多种社区Stable Diffusion运行时


### 使用场景

Stable Diffusion作为一种强大的文本到图像生成模型，其应用场景非常广泛,主要包括:

* 艺术创作:Stable Diffusion可以根据文本描述自动生成高质量的艺术作品,如绘画、插画、概念艺术等,为艺术家提供创作灵感和辅助；
* 游戏设计:利用Stable Diffusion可以快速创建游戏资产,如角色、场景、道具等,加速原型设计和游戏内容的迭代；
* 图像编辑:Stable Diffusion具有图像修复、增强、编辑等功能,可用于图像去噪、超分辨率重建、风格迁移等任务；
* 电商运营:利用Stable Diffusion生成商品描述图等美术资产,可以降低电商平台的运营成本,提高商品图片生产效率。

本项目提供了在Amazon EKS上大规模运行Stable Diffusion推理任务的架构和指导。本项目可以执行下列任务：

* 文生图：根据提供的提示词和配置，生成符合要求的图像
* 图生图：根据提供的提示词，参考图片和配置，生成符合要求的图像
* 超分辨率扩图：扩大图片的分辨率，而尽可能的不要丢失细节
* 流水线：以上所有任务和自定义任务的编排。


## 架构概览

### 组件

该解决方案包含3个主要组件：

* 基于无服务器架构的任务调度和分发
* 基于Amazon EKS和Amazon EC2加速计算实例的Stable Diffusion运行时
* 管理和维护组件

### 任务调度和分发

该组件包含基于Amazon API Gateway的API端点，和基于Amazon SNS，Amazon SQS的任务分发部分。

* 用户将请求（模型，Prompt等）发送至 Amazon API Gateway 提供的API端点
* 请求通过Amazon Lambda进行校验，并投送至 Amazon SNS 主题
* Amazon SNS根据请求中的运行时名称，将请求投送至对应运行时的SQS队列

### Stable Diffusion 运行时

该组件包含基于Amazon EKS的Stable Diffusion运行时，支持根据请求进行弹性伸缩。

对于每个运行时：

* 部署时，每个运行时有独立的 Amazon SQS 队列以接收请求
* Queue Agent会从 Amazon SQS 队列里接收任务，并发送给Stable Diffusion运行时生成图像
* 生成的图片由Queue Agent存储至 Amazon S3存储桶中，并将完成通知投送至 Amazon SNS 主题
* 当 Amazon SQS 队列中积压过多消息时，KEDA会根据队列内消息数量扩充运行时的副本数，同时Karpenter会启动新的GPU实例以承载新的副本。
* 当 Amazon SQS 队列中不再积压消息时，KEDA会缩减副本数，且Karpenter会关闭不需要的GPU实例以节省成本。


### 管理和维护

该解决方案提供完整的可观测性和管理组件：

* 基于CloudWatch的数值监控和日志
* 基于AWS X-Ray的全链路跟踪
* 基于AWS CDK的基础设施即代码部署方式

### 架构图
本节提供了本指南所部署组件的参考架构图。

<!-- {% include image.html file="async_img_sd_images/IG_Figure1.png" alt="architecture" %} -->
{% include image.html file="async_img_sd_zh_images/stable_diffusion_architecture_diagram.jpg" alt="architecture" %}

*Figure 1: Guidance for Asynchronous Image Generation with Stable Diffusion on AWS architecture*

### 工作流

1. 用户将请求（模型，Prompt等）发送业务应用，业务应用将请求发送至 Amazon API Gateway 提供的API端点
2. 请求通过Amazon Lambda进行校验，并投送至 Amazon SNS 主题
3. Amazon SNS根据请求中的运行时名称，基于请求过滤机制，将请求投送至对应运行时的SQS队列
4. 在EKS集群中，KEDA会根据队列内消息数量扩充运行时的副本数
5. Karpenter会启动新的GPU实例以承载新的副本，这些实例运行BottleRocket操作系统，采用Spot/On-demand混合购买方式，且通过EBS快照预载Stable Diffusion运行时的容器镜像
6. Stable Diffusion 运行时启动时会通过Mountpoint for Amazon S3 CSI Driver，直接从S3存储桶中加载模型
7. Queue Agent会从 Amazon SQS 队列里接收任务，并发送给Stable Diffusion运行时生成图像
8. 生成的图片由Queue Agent存储至 Amazon S3存储桶中，并将完成通知投送至 Amazon SNS 主题，SNS可将响应投送至SQS或其他目标中
9. 该解决方案提供完整的可观测性和管理组件，包含基于CloudWatch和ADOT的数值监控和日志，基于AWS X-Ray的全链路跟踪
10. 该解决方案通过基于AWS CDK的基础设施即代码部署方式进行部署和配置，通过IAM和API Key提供安全和访问控制

### 使用的AWS服务

| AWS 服务 | 描述  |
| ---- | ----|
| [Amazon S3](http://aws.amazon.com/s3/)         | 用于存储模型和生成的图像。|
| [Amazon ECR](http://aws.amazon.com/ecr/)         | 用于存储运行时所需的容器镜像。|
| [Amazon API Gateway](http://aws.amazon.com/api-gateway/)         | 用于提供对外访问的API接口。|
| [AWS Lambda](https://aws.amazon.com/lambda)    | 用于进行请求验证和路由。|
| [Amazon SQS](https://aws.amazon.com/sqs)       | 用于存放待处理的任务。|
| [Amazon SNS](https://aws.amazon.com/sns)       | 用于将任务路由到不同的SQS队列，以及提供处理完成后通知和回调。|
| [Amazon EKS](https://aws.amazon.com/eks)       | 用于管理和运行 Stable Diffusion 运行时。|
| [Amazon EC2](https://aws.amazon.com/ec2)       | 用于运行 Stable Diffusion 运行时。|
| [Amazon CloudWatch](https://aws.amazon.com/cloudwatch)       | 用于监控系统的运行状况，提供数值监控，日志和跟踪。|
| [AWS CDK](https://aws.amazon.com/cdk)       | 用于部署和更新该解决方案。|


## 计划部署

请在部署前检查以下所有的考虑因素：

### 可部署区域
此解决方案使用的服务，或 Amazon EC2 实例类型目前可能并非在所有 AWS 区域都可用。请在提供所需服务的 AWS 区域中启动此解决方案。

**已验证可部署的区域**

| 区域名称           | 验证通过 |
|----------------|---------------------------------------|
| 美国东部 (弗吉尼亚北部)  | :material-check-bold:{ .icon_check }  |
| 美国西部 (俄勒冈)     | :material-check-bold:{ .icon_check }  |

如您在未经验证的区域进行部署，可能需要进行以下处理，或面临以下问题：

* 在不支持`g5`实例类型的区域部署时，您需要手工指定 Karpenter 使用的实例类型为 `g4dn` 或其他 GPU 实例类型。

**在亚马逊云科技中国区域部署**

该解决方案支持在亚马逊云科技中国区域部署，但步骤与正常部署流程不同。请参见[在亚马逊云科技中国区域部署](#在亚马逊云科技中国区域部署)

## IAM 权限

部署该解决方案需要管理员或与之相当的权限。由于组件较多，我们暂不提供最小权限列表。

## 服务配额

每个AWS区域的每个AWS账户都有关于可以创建的资源数量的配额，您可以在AWS控制台中使用 [Service Quota](https://console.aws.amazon.com/servicequotas/home/) 工具了解服务配额。如该服务配额可提升，您可以通过该工具并自助式开立工单提升服务配额。

与该解决方案相关的主要服务配额为：

| AWS 服务 | 配额条目 | 预估使用量 | 是否可调整 |
|---------|---------|-----------|-----------|
| Amazon EC2  | [Running On-Demand G and VT instances](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-DB2E81BA) | 按最大并发GPU实例数量 | :material-check-bold:{ .icon_check }  |
| Amazon EC2  | [All G and VT Spot Instance Requests](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-3819A6DF) | 按最大并发GPU实例数量 | :material-check-bold:{ .icon_check }  |
| Amazon SNS  | [Messages Published per Second](https://console.aws.amazon.com/servicequotas/home/services/sns/quotas/L-F8E2BA85) | 按最大并发请求数 | :material-check-bold:{ .icon_check }  |

除此之外，部署时需要考虑以下服务配额：

| AWS 服务 | 配额条目 | 预估使用量 | 是否可调整 |
|---------|---------|-----------|-----------|
| Amazon VPC  | [VPCs per Region](https://console.aws.amazon.com/servicequotas/home/services/vpc/quotas/L-F678F1CE) | 1 | :material-check-bold:{ .icon_check }  |
| Amazon VPC  | [NAT gateways per Availability Zone](https://console.aws.amazon.com/servicequotas/home/services/vpc/quotas/L-FE5A380F) | 1 | :material-check-bold:{ .icon_check }  |
| Amazon EC2  | [EC2-VPC Elastic IPs](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/L-0263D0A3) | 1 | :material-check-bold:{ .icon_check }  |
| Amazon S3  | [General purpose buckets](https://console.aws.amazon.com/servicequotas/home/services/s3/quotas/L-DC2B2D3D) | 每个队列1个 | :material-check-bold:{ .icon_check }  |

## 选择 Stable Diffusion 运行时

您需要运行时来部署Stable Diffusion模型并提供API访问。

目前有多个社区Stable Diffusion运行时可用:

| 运行时名称           | 链接 |  验证  |
|----------------|-----------------|----------------------|
| Stable Diffusion Web UI  | [GitHub](https://github.com/AUTOMATIC1111/stable-diffusion-webui) | :material-check-bold:{ .icon_check }  |
| ComfyUI     | [GitHub](https://github.com/comfyanonymous/ComfyUI) | :material-check-bold:{ .icon_check }  |
| InvokeAI     | [GitHub](https://github.com/invoke-ai/InvokeAI) |   |

您也可以选择其他运行时，或构建自己的运行时。您需要将运行时打包为容器镜像，以便在 EKS 上运行。

您需要充分了解并遵守您所使用的 Stable Diffusion 运行时的许可证条款。

!!! example "示例运行时"

    您可以使用社区提供的[示例 Dockerfile](https://github.com/yubingjiaocn/stable-diffusion-webui-docker) 构建 *Stable Diffusion Web UI* 和 *ComfyUI* 的运行时容器镜像。请注意，该镜像仅用于技术评估和测试用途，请勿将该镜像部署至生产环境。

!!! info "模型存储"

    默认情况下，该解决方案会将模型加载至`/opt/ml/code/models`目录，请确保您的运行时被配置成从该目录读取模型。

    您需要将运行时的mmap关闭以获得最高性能。

    * 对于SD Web UI，您需要在`config.json`中设置`disable_mmap_load_safetensors: true`
    * 对于ComfyUI，您需要依照[社区Issue](https://github.com/comfyanonymous/ComfyUI/issues/2288)中的指导，手工修改源代码。

!!! info "SD Web UI运行时注意事项"

    对于SD Web UI运行时，根据运行模型的不同，运行时分为静态运行时（预加载模型）和动态运行时（按需加载模型）。

    * 静态运行时使用的模型需要在`modelFilename`中预先指定。该模型会在启动时加载到显存中。
    * 动态运行时需要指定`dynamicModel: true`。此时无需预先指定模型，运行时会根据请求中使用的模型，从Amazon S3中加载模型并进行模型推理。

## 其他重要提示和限制

- 在当前版本，该解决方案部署时会自动创建一个新的VPC。该VPC包含：
    - CIDR为`10.0.0.0/16`
    - 分布在不同可用区的3个公有子网，子网大小为`/19`
    - 分布在不同可用区的3个私有子网，子网大小为`/19`
    - 3个NAT网关（放置在公有子网）
    - 1个Internet网关
    - 对应的路由表和安全组

    目前该VPC的参数无法自定义。

- 在当前版本，该解决方案只能在新建的EKS集群上部署，且版本固定为`1.29`。我们会随着Amazon EKS版本发布更新集群版本。

### 费用预估

您需要为使用该解决方案中包含的AWS服务付费。按2024年4月价格计算，在美国西部（俄勒冈）区域运行该解决方案一个月，且生成一百万张图片的价格约为（不含免费额度） 436.72 美元。

与图像数量有关的浮动费用，主要服务价格列表如下（按每百万张图片计）：

| **AWS 服务**  | 计费维度 | 每百万张图片所需数量 | 单价 \[USD\] | 总价 \[USD\]
|-----------|------------|------------|------------|
| Amazon EC2 | g5.2xlarge 实例，Spot实例每小时费用  | 416.67 | \$ 0.4968 | \$ 207 |
| Amazon API Gateway | 每 1 百万个 REST API 请求  | 1 | \$ 3.50 | \$ 3.50 |
| AWS Lambda | 每 GB 每秒  | 12,500 | \$ 0.0000166667 | \$ 0.21
| AWS Lambda | 每 1 百万个请求  | 1 | \$ 0.20 | \$ 0.20
| Amazon SNS | 每 1 百万个请求  | 2 | \$ 0.50 | \$ 0.50
| Amazon SNS | 数据传输每 GB  | 7.62**  | \$ 0.09 | \$ 0.68
| Amazon SQS | 每 1 百万个请求  | 2 | \$ 0.40 | \$ 0.80
| Amazon S3 | 每 1 千个 PUT 请求  | 2,000 | \$ 0.005 | \$ 10.00
| Amazon S3 | 每 GB 每月  | 143.05*** | \$ 0.023 | \$ 3.29

与图像数量无关的固定费用，主要服务价格列表如下（按月计）：

| **AWS 服务**  | 计费维度 | 每月所需数量 | 单价 \[USD\] | 总价 \[USD\]
|-----------|------------|------------|------------|
| Amazon EKS | 集群  | 1 | \$ 72.00 | \$ 72.00 |
| Amazon EC2 | m5.large 实例，按需实例每小时费用  | 1440 | \$ 0.0960 | \$ 138.24 |

\* 按每个请求耗时 1.5 秒计算，单价参照 2024年1月29日 至 2024年4月28日 美国西部（俄勒冈）区域所有可用区价格之平均值
\*\* 按请求平均 16 KB 计算
\*\*\* 按图像平均 150 KB，存储 1 个月计算

请注意该估算仅为参考费用。实际的费用可能会根据您所使用的模型，任务参数，Spot实例当前定价等有所不同。

## 安全

在构建基于AWS基础设施的系统时，安全责任由您和AWS共同承担。这个[责任共担模型](https://aws.amazon.com/compliance/shared-responsibility-model/)减轻了您的运维负担，因为AWS负责操作、管理和控制组件，包括主机操作系统、虚拟化层以及服务所在设施的物理安全。有关AWS安全性的更多信息，请参阅[AWS云安全](http://aws.amazon.com/security/)。

### IAM 角色
AWS Identity and Access Management (IAM) 角色允许客户分配精细的访问策略和权限到 AWS 云上的服务和用户。

此解决方案会为以下组件创建独立的IAM角色并授予权限：
* Amazon EKS 集群，含
  * 创建和操作集群
  * 节点组
  * Karpenter创建的节点
  * 集群中运行的 Pod，含
    * Karpenter
    * KEDA
    * Fluent Bit
    * Stable Diffusion运行时
* AWS Lambda 函数
* Amazon API Gateway
* Amazon EKS

该解决方案通过IAM角色对内部用户进行访问控制，通过遵循最小权限原则，使得每个组件只能访问被授权的组件，确保工作负载之间的隔离性。

### 访问控制

该解决方案通过API Key机制对外部用户进行访问控制，用户需在请求中包含合法的API Key。关于API Key的更多信息，请参考[API规范文档](#api-调用规则)。

### 网络

该解决方案工作在独立的VPC中，默认与您的其他工作负载相隔离。如您需要将该VPC与您现有的VPC相连接，或连接到中转网关，您需要自行负责网关，防火墙和访问控制。

## 部署解决方案

在部署解决方案之前，建议您先查看本指南中有关架构图和区域支持等信息，然后按照下面的说明配置解决方案并将其部署到您的账户中。

### 快速开始

我们提供了一键部署脚本以快速开始。总部署时间约为 30 分钟。

#### 获取源代码

运行以下命令以获取源代码和部署脚本：

```bash
git clone --recursive https://github.com/aws-samples/stable-diffusion-on-eks
cd stable-diffusion-on-eks
```

#### 一键部署

运行以下命令以使用最简设置快速部署：

```bash
cd deploy
./deploy.sh
```

该脚本将：

* 安装必要的运行时和工具
* 创建S3存储桶，从[HuggingFace](https://huggingface.co/runwayml/stable-diffusion-v1-5)中下载Stable Diffusion 1.5的基础模型，放置在存储桶中
* 使用我们提供的示例镜像，创建包含SD Web UI镜像的EBS快照
* 创建一个含SD Web UI运行时的Stable Diffusion解决方案

!!! warning

    该脚本生成的配置文件仅为最简单的配置，只包含1个运行时，且无法进行自定义（如弹性伸缩阈值，自定义模型，自定义镜像等）。如需自定义配置，请运行以下命令：

    ```bash
    ./deploy.sh -d
    ```

    该参数会使得部署脚本只完成部署前准备，但不真正进行部署。您可以根据[配置项](./configuration.md)修改配置后，运行以下命令进行部署：

    ```bash
    cdk deploy --no-rollback --require-approval never
    ```


#### 部署参数

该脚本提供一些参数，以便您自定义部署的解决方案：

* `-h, --help`: 显示帮助信息
* `-n, --stack-name`: 自定义部署的解决方案名称，影响生成的资源命名。默认为`sdoneks`.
* `-R, --region`: 解决方案部署到的区域。默认为当前AWS配置文件所在区域。
* `-d, --dry-run`: 仅生成配置文件，不执行部署。
* `-b, --bucket`: 指定保存模型的现有S3桶名称，该S3桶必须已存在，且与解决方案在相同区域。您可以根据下方文档手动创建S3存储桶。
* `-s, --snapshot`: 指定现有的EBS快照ID。您可以根据下方文档自行构建EBS快照。
* `-r, --runtime-name`: 指定部署的运行时名称，影响API调用时使用的名称。默认为`sdruntime`。
* `-t, --runtime-type`: 指定部署的运行时类型，只接受`sdwebui`和`comfyui`。默认为`sdwebui`。

### 手动部署

您也可以不适用脚本，使用以下步骤手动在 AWS 上部署此解决方案。

1. [创建 Amazon S3 模型存储桶](#模型存储)，并将所需要的模型存储到桶中
2. *（可选）* [构建容器镜像](#镜像构建)
3. *（可选）* [将容器镜像存储到EBS缓存中以加速启动](#镜像缓存构建)
4. [部署并启动解决方案堆栈](#手动部署)

#### 模型存储

该解决方案所需要的模型应提前存储在S3存储桶中。

**创建存储桶**

请按以下步骤创建存储桶：

=== "AWS 管理控制台"
    * 打开 [Amazon S3 控制台](https://console.aws.amazon.com/s3/)。
    * 在左侧导航窗格中，选择 **Buckets**（桶）。
    * 选择 **Create Bucket**（创建桶）。
    * 在 **Bucket name**（桶名称）中输入存储桶的名称。名称需符合[存储桶命名规则](https://docs.aws.amazon.com/zh_cn/AmazonS3/latest/userguide/bucketnamingrules.html)。
    * 在 **AWS Region** （AWS 区域）中，选择您准备部署解决方案的相同区域。
    !!! warning "注意"
        请确保该存储桶与您的解决方案部署在同一个 AWS 区域。如您希望在多个区域部署解决方案的多个副本，请在每个区域单独创建一个存储桶。
    * 选择 **Create Bucket**（创建桶）

=== "AWS CLI"
    运行以下命令以创建存储桶。将`<bucket name>`替换为您希望的存储桶名称，`us-east-1`替换成您准备部署解决方案的 AWS 区域：
    ```bash
    aws s3api create-bucket --bucket <bucket name> --region us-east-1
    ```

**存储模型**

请将所有需要使用的模型存储在S3存储桶中，目录格式如下：

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

请将模型放入对应的目录中。其中 `Stable-diffusion` 目录必须存在且存有Stable Diffusion模型。其余目录如无模型可不创建。

目前支持 `.safetensors` 和 `.ckpt` 格式的模型。如您从[Civitai](https://civitai.com/)下载的模型不带扩展名，请添加 `.ckpt` 扩展名。

请按以下步骤将模型上传至S3存储桶中：

=== "AWS 管理控制台"
    !!! warning "注意"
        由于浏览器上传不支持断点续传，故不推荐使用管理控制台上传模型。
    * 打开 [Amazon S3 控制台](https://console.aws.amazon.com/s3/)。
    * 在左侧导航窗格中，选择 **Buckets**（桶）。
    * 选择上一步创建的存储桶，并进入所需的文件夹。
    * 如果对应的文件夹不存在：
        * 选择 **Create Folder**（创建文件夹）
        * 在 **Folder Name**（文件夹名称）中，输入文件夹名称
        * 选择 **Create folder**（创建文件夹）
        * 重复以上操作，直到文件夹符合以上目录结构。
    * 选择 **Upload**（上传）
    * 选择 **Add files** （添加文件），选择待上传的模型文件。
    * 选择 **Upload**。在上传过程中请不要关闭浏览器。


=== "AWS CLI"
    运行以下命令以将模型文件上传至存储桶。将`<model name>`替换成为您的模型文件名，`<folder>`替换为模型类型， `<bucket name>`替换为您希望的存储桶名称：
    ```bash
    aws s3 cp <model name> s3://<bucket name>/<folder>/
    ```
    !!! note "提示"
        采用AWS CLI上传时，无需预先创建目录结构。

    !!! note "提示"
        您可以使用[s5cmd](https://github.com/peak/s5cmd)等第三方工具提升上传速度。

#### 镜像构建

您可以从源代码自行构建镜像，并存储在您的镜像仓库中。

!!! danger "运行时选择"
    您需要自行提供Stable Diffusion运行时镜像。您可以从[计划部署](./considerations.md#选择-stable-diffusion-运行时)获取支持的Stable Diffusion运行时。

!!! note "预构建镜像"
    在评估和测试阶段，您可以使用我们预构建的镜像：
    ```
    SD Web UI: public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest
    ComfyUI: public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest
    Queue Agent: public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest
    ```
    请注意，该镜像仅用于技术评估和测试用途，您需要自行负责使用该镜像所带来的许可证风险。

**构建镜像**

运行下方命令以构建`queue-agent`镜像：

```bash
docker build -t queue-agent:latest src/backend/queue_agent/
```
!!! example "示例运行时"

    您可以使用社区提供的[示例 Dockerfile](https://github.com/yubingjiaocn/stable-diffusion-webui-docker) 构建 *Stable Diffusion Web UI* 和 *ComfyUI* 的运行时容器镜像。请注意，该镜像仅用于技术评估和测试用途，请勿将该镜像部署至生产环境。

**将镜像推送至Amazon ECR**

!!! note "镜像仓库选择"
    我们推荐使用Amazon ECR作为镜像仓库，但您也可以选择其他支持[OCI标准](https://www.opencontainers.org/)的镜像仓库（如Harbor）。

!!! tip "首次推送"
    Amazon ECR需要在推送前预先创建镜像仓库。
    === "AWS CLI"
        运行下列命令以创建：
        ```bash
        aws ecr create-repository --repository-name sd-on-eks/queue-agent
        ```

运行下列命令以登录到镜像仓库，并推送镜像。请将 `us-east-1` 替换成您的AWS区域，将 `123456789012` 替换为您的 AWS 账户ID:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

docker tag queue-agent:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
```

**构建并推送Helm Chart**

解决方案通过Helm Chart部署。Helm Chart可以存储在任何一个可以通过Internet访问的HTTP服务器上，也可存储在兼容[OCI标准](https://www.opencontainers.org/)的镜像仓库中。您可以将Helm Chart存储在Amazon ECR。

!!! bug "中国区域支持"
    由于CDK框架的[已知问题](https://github.com/aws/aws-cdk/issues/28460)，您无法将Helm Chart存储在中国区域的ECR镜像仓库中。我们正在积极修复此问题。

!!! note "预构建Helm Chart"
    一般情况下，您不需要对Helm Chart内容进行深度自定义。此时您可以直接使用我们预构建的Helm Chart。您可以通过`config.yaml`对运行时进行配置。

===  "使用ECR镜像仓库"
    !!! tip "首次推送"
        Amazon ECR需要在推送前预先创建镜像仓库。
        === "AWS CLI"
            运行下列命令以创建：
            ```bash
            aws ecr create-repository --repository-name sd-on-eks/charts/sd-on-eks
            ```

        === "AWS 管理控制台"
            * 打开位于 https://console.aws.amazon.com/ecr/ 的 Amazon ECR 控制台。
            * 选择**开始使用**。
            * 对于 **Visibility settings**（可见性设置），请选择 **Private**（私密）。
            * 对于 **Repository name**（存储库名称），请输入`sd-on-eks/charts/sd-on-eks`。
            * 选择**创建存储库**。

    运行下列命令以登录到镜像仓库，并推送Helm Chart。请将 `us-east-1` 替换成您的AWS区域，将 `123456789012` 替换为您的 AWS 账户ID:

    ```bash
    helm package src/charts/sd_on_eks
    helm push sd-on-eks-<version>.tgz oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/charts/
    ```

    在上传完成后，您需要修改`config.yaml`，在每个需要使用该Helm Chart的运行时下加入如下内容：

    ```yaml
    modelsRuntime:
    - name: sdruntime
      namespace: default
      type: sdwebui
      chartRepository: "oci://123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/charts/sd-on-eks"
      chartVersion: "1.1.0" # 如您自定义Helm Chart的版本，则修改
    ```

===  "使用HTTP服务器"
    !!! tip "访问控制"
        请确保该HTTP服务器向Internet开放，并不设置任何的访问控制（如IP白名单等）。

    运行下列命令以将Helm Chart打包:

    ```bash
    helm package src/charts/sd_on_eks
    ```

    打包完成后，会输出一个名为 `sd-on-eks-<version>.tgz` 的文件。将该文件放入一个空文件夹中，并运行以下命令：

    ```bash
    helm repo index
    ```

    您可以将生成的压缩包和 `index.yaml` 放入HTTP服务器中，假设该HTTP服务器域名为 `example.com` （IP地址也可），您需要修改`config.yaml`，在每个需要使用该Helm Chart的运行时下加入如下内容：

    ```yaml
    modelsRuntime:
    - name: sdruntime
      namespace: default
      type: sdwebui
      chartRepository: "http://example.com/"
      chartVersion: "1.0.0"  # 如您自定义Helm Chart的版本，则修改
    ```

#### 镜像缓存构建

通过将容器镜像预缓存为 EBS 快照，可以优化计算实例的启动速度。启动新实例时，实例的数据卷自带容器镜像缓存，从而无需从镜像仓库中再行拉取。

应在部署解决方案前创建 EBS 快照。我们提供了用于构建 EBS 快照的脚本。

===  "使用自定义镜像"
    如您自行构建镜像并推送到Amazon ECR，则运行下列命令。将 `us-east-1`替换成解决方案所在区域，将 `123456789012` 替换为您的12位AWS账号:

    ```bash
    cd utils/bottlerocket-images-cache
    ./snapshot.sh 123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/sdwebui:latest,123456789012.dkr.ecr.us-east-1.amazonaws.com/sd-on-eks/queue-agent:latest
    ```

=== "使用预构建镜像"
    如您使用解决方案自带的镜像，则运行下列命令：

    ```bash
    cd utils/bottlerocket-images-cache
    ./snapshot.sh public.ecr.aws/bingjiao/sd-on-eks/sdwebui:latest,public.ecr.aws/bingjiao/sd-on-eks/comfyui:latest,public.ecr.aws/bingjiao/sd-on-eks/queue-agent:latest
    ```

脚本运行完成后，会输出EBS快照ID（格式类似于`snap-0123456789`）。您可以在部署时应用该快照。

有关该脚本的详细信息，请参考[GitHub仓库](https://github.com/aws-samples/bottlerocket-images-cache)

#### 手动部署

根据以下步骤部署本解决方案：

**安装必要组件**

请在部署前安装以下运行时：

* [Node.js](https://nodejs.org/en) 18及以上版本
* [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
* [AWS CDK 工具包](https://docs.aws.amazon.com/cdk/v2/guide/cli.html)
* [git](https://git-scm.com/downloads)

**编辑配置文件**

本解决方案的配置存储在`config.yaml`文件中，我们提供了配置文件模板，您可以根据您的实际需求对解决方案进行自定义。

1. 设置模型存储桶（必需）

将 `modelBucketArn` 中的 `<bucket name>` 修改为放置模型的S3存储桶名称。

```yaml
modelBucketArn: arn:aws:s3:::<bucket name>
```

!!! warning "中国区域"

    如您使用亚马逊云科技中国区域, 请确保ARN中的partition为`aws-cn`.

    ```yaml
    modelBucketArn: arn:aws-cn:s3:::<bucket name>
    ```

2. 设置Stable Diffusion运行时（必需）

您需要指定运行时的参数。运行时定义在 `modelsRuntime` 中，配置如下：

```yaml
modelsRuntime:
- name: "sdruntime" # 必要参数，运行时的名称，不能和其他运行时重名
  namespace: "default" # 必要参数，运行时所在的Kubernetes命名空间，不建议和其他运行时放置在相同的命名空间。
  type: "sdwebui" # 必要参数，该运行时的类型，目前仅支持"sdwebui"和"comfyui"
  modelFilename: "v1-5-pruned-emaonly.safetensors" # （SD Web UI）该运行时使用的模型名称，不能和其他运行时重复。
  dynamicModel: false # （SD Web UI）该运行时是否允许动态加载模型。
```

您可以在 `modelsRuntime` 段配置多个运行时。

3. 设置自定义镜像（可选）

如您[自行构建了镜像和/或Helm Chart](#镜像构建)，则需要在对应的运行时中指定镜像，配置如下：

```yaml
modelsRuntime:
- name: "sdruntime"
  namespace: "default"
  type: "sdwebui"
  modelFilename: "v1-5-pruned-emaonly.safetensors"
  dynamicModel: false
  chartRepository: "" # 可选参数，如您构建了Helm Chart，则需要填入Chart所在的地址。需要包含协议前缀 (oci:// 或 https:// )
  chartVersion: "" # 可选参数，如您构建了Helm Chart，则需要填入Chart的版本
  extraValues: # 添加以下内容
    runtime:
      inferenceApi:
        image:
          repository: <account_id>.dkr.ecr.<region>.amazonaws.com/sd-on-eks/sdwebui # Stable Diffusion 运行时镜像的地址.
          tag: latest # 镜像的Tag
      queueAgent:
        image:
          repository: <account_id>.dkr.ecr.<region>.amazonaws.com/sd-on-eks/queue-agent # Queue agent镜像的地址.
          tag: latest # 镜像的Tag
```

4. 设置基于 EBS 快照的镜像缓存（可选）

如您构建了[基于EBS快照的镜像缓存](#镜像缓存构建)，则需要在对应的运行时中指定快照ID，配置如下：

```yaml
modelsRuntime:
- name: "sdruntime"
  namespace: "default"
  type: "sdwebui"
  modelFilename: "v1-5-pruned-emaonly.safetensors"
  extraValues:
    karpenter: # 添加以下内容
      nodeTemplate:
        amiFamily: Bottlerocket
        dataVolume:
          snapshotID: snap-0123456789 # 修改为EBS快照ID
```

5. 其他详细设置（可选）

如您需要对运行时进行详细配置，请参考[配置项](./configuration.md)。


**开始部署**

完成配置后，运行以下命令进行部署：

```bash
npm install
cdk deploy
```

部署一般需要 15-20 分钟。由于部署通过CloudFormation在AWS侧进行，当CDK CLI被意外关闭时，您无需重新进行部署。

**下一步**

在部署完成后，您会看到如下输出：

```bash
Outputs:
sdoneksStack.GetAPIKeyCommand = aws apigateway get-api-keys --query 'items[?id==`abcdefghij`].value' --include-values --output text
sdoneksStack.FrontApiEndpoint = https://abcdefghij.execute-api.us-east-1.amazonaws.com/prod/
sdoneksStack.ConfigCommand = aws eks update-kubeconfig --name sdoneksStack --region us-east-1 --role-arn arn:aws:iam::123456789012:role/sdoneksStack-sdoneksStackAccessRole
...
```

### 在亚马逊云科技中国区域部署

该解决方案支持在亚马逊云科技中国区域部署。

| 区域名称           | 验证通过 |
|----------------|---------------------------------------|
| 中国 (宁夏)  | :material-check-bold:{ .icon_check }  |

但由于中国的网络环境特殊，会受到如下限制：

* 需要自行构建容器镜像，或将标准镜像复制到中国区域的ECR上。不建议使用ECR Public的镜像。
* 部分组件的Helm Chart位于Github上，在中国区部署时，有几率无法获取到Helm Chart，需要重试。
* 无法自动从Hugging Face或Github上下载模型，需要手工下载模型并上传至S3存储桶。

#### 在中国区部署的步骤

在亚马逊云科技中国区部署的步骤与正常部署流程不同，应按如下方式进行部署：

1. 构建或转移镜像至ECR
2. 下载模型并存储至S3桶
3. 制作EBS磁盘快照
4. 生成并修改配置文件
5. 进行部署

**构建或转移镜像至ECR**

由于默认使用的容器镜像存储在ECR Public，您在拉取镜像或制作镜像缓存时可能面临速度缓慢，或连接中途断开等现象。我们建议您自行构建镜像，或将现有镜像转移到您的ECR镜像仓库中。

如需自行构建镜像，请参考[镜像构建](#镜像构建)文档。

如需将预构建镜像转移到中国区的ECR，您可以在一台已安装Docker，并有ECR权限的实例上，运行如下命令：

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

我们建议您按照[镜像构建](#镜像构建)文档提供的方式，将Helm Chart放置在ECR或HTTP服务器中。

**下载模型并存储至S3桶**

由于在中国大陆无法顺畅访问Hugging Face，请在其他镜像网站下载模型后，按照[模型存储](#模型存储)文档提供的方式，上传至S3存储桶中。

**制作EBS磁盘快照**

请按照[镜像缓存构建](#镜像缓存构建)文档提供的方式，创建EBS磁盘快照以加速镜像加载。

**生成并修改配置文件**

运行以下命令以安装工具并生成初始配置文件。

```bash
cd deploy
./deploy.sh -b <bucket name> -s <snapshot ID> -d
```

该命令会在上级目录下生成一个 `config.yaml` 的模板，但该模板需要进行编辑以在中国区进行部署。请按注释编辑该文件：

```yaml
stackName: sdoneks
modelBucketArn: arn:aws-cn:s3:::${MODEL_BUCKET}  # 此处ARN中aws改为aws-cn
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
  # chartRepository: "http://example.com/" # 如您自行托管Helm Chart，请去除此行注释，并将值改为Helm Chart的地址（oci://或http://），否则删除此行。
  type: sdwebui
  extraValues:
    runtime:
      inferenceApi:
        image:
          repository: 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/sdwebui # 此处改为ECR镜像仓库的地址
          tag: latest
      queueAgent:
        image:
          repository: 123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn/sd-on-eks/queue-agent # 此处改为ECR镜像仓库的地址
          tag: latest
    karpenter:
      nodeTemplate:
        amiFamily: Bottlerocket
        dataVolume:
          snapshotID: snap-1234567890 # 此处会自动填入EBS快照的ID
      provisioner:
        instanceType:
        - "g4dn.xlarge"
        - "g4dn.2xlarge"
        capacityType:
          onDemand: true
          spot: true

```

完成后，可运行部署命令进行部署：

```bash
cdk deploy
```

### 部署验证

您可以使用测试脚本验证解决方案是否部署成功。运行以下命令以进行测试：

```bash
cd test
STACK_NAME=sdoneksStack RUNTIME_TYPE=sdwebui ./run.sh
```

如您修改了解决方案堆栈名称，或运行时类型，请将`sdoneksStack`和`sdwebui`替换成对应内容。

该脚本会自动查找API Gateway端点，获取API Key，并发送测试请求。

* 对SD Web UI运行时，会发送文生图，图生图和图像超分辨率请求。
* 对ComfyUI运行时，会发送一个Pipeline请求。

在数秒至数分钟（取决于是否启用了镜像缓存，和最小实例副本数量）后，您可以在`output_location`的位置找到生成的图像。

## 使用指南

### API 调用规则

在部署解决方案后，您可以通过Amazon API Gateway的API端点，向Stable Diffusion运行时发送请求。

发送请求时，请遵循以下规则：

#### 请求端点和格式

解决方案的API端点可以从CloudFormation的输出中获取：

=== "AWS 管理控制台"

    * 进入 [AWS CloudFormation 控制台](https://console.aws.amazon.com/cloudformation/home)
    * 选择 **Stacks** （堆栈）
    * 在列表中，选择 **SdOnEKSStack** （或您自定义的名称）
    * 选择 **Output** （输出）
    * 记录 **FrontApiEndpoint** 项的值（格式为  `https://abcdefghij.execute-api.ap-southeast-1.amazonaws.com/prod/`）

=== "AWS CLI"

    运行以下命令以获取 API端点：

    ```bash
    aws cloudformation describe-stacks --stack-name SdOnEKSStack --output text --query 'Stacks[0].Outputs[?OutputKey==`FrontApiEndpoint`].OutputValue'
    ```

您需要在端点后附加API版本。目前我们支持`v1alpha1`和`v1alpha2`版本。当您使用`v1alpha2`版本API时，请求应发送至：

```
https://abcdefghij.execute-api.ap-southeast-1.amazonaws.com/prod/v1alpha2
```

该端点仅接收JSON格式的POST请求，需要包含`Content-Type: application/json`请求头。


#### 请求类型

根据运行时类型不同，每种运行时只接受特定类型的请求：

* 对于SD Web UI运行时，只接受[文生图](#文生图-sd-web-ui)，[图生图](#图生图-sd-web-ui)，和[单图像超分辨率扩大](#单图像超分辨率放大-sd-web-ui)请求。
* 对于ComfyUI运行时，只接受[Pipeline](./pipeline.md)请求。

具体请求格式请参见各类型请求的详细文档。

#### API Key

出于安全考虑，所有请求需要附加API Key。通过以下步骤获取API Key：

=== "AWS 管理控制台"

    * 进入 [Amazon API Gateway 控制台](https://console.aws.amazon.com/apigateway)
    * 选择 **API Keys**
    * 在列表中，选择名称类似于 `SdOnEK-defau-abcdefghij`（或您自定义的名称）的API Key
    * 记录 **API key** 项的值

=== "AWS CLI"

    运行以下命令以获取API Key：

    ```bash
    echo $(aws cloudformation describe-stacks --stack-name SdOnEKSStack --output text --query 'Stacks[0].Outputs[?OutputKey==`GetAPIKeyCommand`].OutputValue')
    ```

在发送请求时，需包含`x-api-key`请求头，其值为上方获取的API Key。

!!! danger "未验证的请求"
    未包含API Key的请求将会直接返回`401`错误。

#### 限流规则

为保护后端API，对使用同一个API Key发送的过多请求，API Gateway会进行限流。

默认设置为:

* 每秒30个请求
* 可突增50个请求

关于限流的原理详细信息，请参考[Throttle API requests for better throughput](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)

如您需要修改该设置，请在`config.yaml`中修改`APIGW`段的相关内容。您也可以在API Gateway中修改对应Usage Plan。

### 文生图 (SD Web UI)

!!! info
    此请求类型仅适用于SD Web UI运行时。

Stable Diffusion的最基本用法，输入Prompt，可以生成对应图像。

请求中的内容将会直接传入SD Web UI，但如有链接（HTTP或S3 URL），则会将链接内容转为base64编码后的内容填入对应项。

#### 请求格式

=== "v1alpha2"
    ```json
    {
      "task": {
        "metadata": {
          "id": "test-t2i", // 必要，任务ID
          "runtime": "sdruntime", // 必要，任务使用的运行时名称
          "tasktype": "text-to-image", // 必要，任务类型
          "prefix": "output", // 必要，输出文件在S3桶中的前缀（即目录名）
          "context": "" // 可选，可放置任何信息，会在回调中包含
        },
        "content": { // 与 SD Web UI text-to-image 接口相同规范
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
            "task": "text-to-image", // 必要，任务类型
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors", // 必要，基础模型名称，关联队列分发或模型切换
            "id_task": "test-t2i", // 必要，任务ID，在上传结果图片和返回响应时会用到
            "save_dir": "outputs" // 必要，输出文件在S3桶中的前缀（即目录名）
        },
        // 以下皆为官方参数，使用默认值或者直接传入即可
        "prompt": "A dog",
        "steps": 16,
        "width": 512,
        "height": 512
    }
    ```

#### 响应格式

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

#### 模型切换

如对应运行时设置了 `dynamicModel: true`，则需要在请求的`alwayson_scripts` 中加入如下内容：

```json
        "content": {
          "alwayson_scripts": {
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors" //此处放入模型名称
          },
        }
```

在接收到请求后，SD Web UI会卸载当前模型，并从内存/S3存储桶中加载对应的模型。如指定的模型不存在，则该请求直接返回错误。


#### 图片获取

在图像完成生成后，会存储到 `output_location` 所在的S3存储桶路径中。如设置了`batch_size`或其他生成多张图的参数，则每张图会自动编号后存入。

默认存储格式为无损PNG，但如涉及到特殊格式（如GIF等），系统会自动识别并加扩展名。

### 图生图 (SD Web UI)

!!! info
    此请求类型仅适用于SD Web UI运行时。

Stable Diffusion的基本用法，输入Prompt和参考图像，可以生成与参考图像类似的图像。

请求中的内容将会直接传入SD Web UI，但如有链接（HTTP或S3 URL），则会将链接内容转为base64编码后的内容填入对应项。

#### 请求格式

=== "v1alpha2"
    ```json
    {
      "task": {
        "metadata": {
          "id": "test-i2i", // 必要，任务ID
          "runtime": "sdruntime", // 必要，任务使用的运行时名称
          "tasktype": "image-to-image", // 必要，任务类型
          "prefix": "output", // 必要，输出文件在S3桶中的前缀（即目录名）
          "context": "" // 可选，可放置任何信息，会在回调中包含
        },
        "content": { // 与 SD Web UI image-to-image 接口相同规范
          "alwayson_scripts": {},
          "prompt": "cat wizard, gandalf, lord of the rings, detailed, fantasy, cute, adorable, Pixar, Disney, 8k",
          "steps": 16,
          "width": 512,
          "height": 512,
          "init_images": ["https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png"] // 此处放置图像链接，图像会被下载，base64编码后放入请求中
        }
      }
    }
    ```

=== "v1alpha1"
    ```json
    {
        "alwayson_scripts": {
            "task": "image-to-image", // 必要，任务类型
            "image_link": "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png", // 必要，输入图片的url
            "id_task": "test-i2i", // 必要，任务ID，在上传结果图片和返回响应时会用到
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors", // 必要，基础模型名称，关联队列分发或模型切换
        },
        // 以下皆为官方参数，使用默认值或者直接传入即可
        "prompt": "cat wizard, gandalf, lord of the rings, detailed, fantasy, cute, adorable, Pixar, Disney, 8k",
        "steps": 16,
        "width": 512,
        "height": 512
    }
    ```

#### 响应格式

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

#### 模型切换

如对应运行时设置了 `dynamicModel: true`，则需要在请求的`alwayson_scripts` 中加入如下内容：

```json
        "content": {
          "alwayson_scripts": {
            "sd_model_checkpoint": "v1-5-pruned-emaonly.safetensors" //此处放入模型名称
          },
        }
```

在接收到请求后，SD Web UI会卸载当前模型，并从内存/S3存储桶中加载对应的模型。如指定的模型不存在，则该请求直接返回错误。

#### 图片获取

在图像完成生成后，会存储到 `output_location` 所在的S3存储桶路径中。如设置了`batch_size`或其他生成多张图的参数，则每张图会自动编号后存入。

默认存储格式为无损PNG，但如涉及到特殊格式（如GIF等），系统会自动识别并加扩展名。

### 单图像超分辨率放大 (SD Web UI)

!!! info
    此请求类型仅适用于SD Web UI运行时。

    此请求类型仅提供`v1alpha2` API。

对于单个图片，使用超分辨率模型将图片放大。

#### 请求格式

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


#### 响应格式

=== "v1alpha2"
    ```json
    {
      "id_task": "test-extra",
      "runtime": "sdruntime",
      "output_location": "s3://outputbucket/output/test-t2i"
    }
    ```


#### 可使用的超分辨率模型

可使用的超分辨率模型与SD Web UI默认的模型一致：

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

如您需要更多超分辨率模型，您可以根据模型类型，将其放入S3存储桶的`LDSR`, `SwinIR`, `ESRGAN`, `RealESRGAN`, `ScuNET`等目录。

完成后，您需要重启Pod才能使新模型生效。

#### 图片获取

在图像完成生成后，会存储到 `output_location` 所在的S3存储桶路径中。默认存储格式为无损PNG，但如涉及到特殊格式（如GIF等），系统会自动识别并加扩展名。

### Pipeline (ComfyUI)

!!! info
    此请求类型仅适用于ComfyUI运行时。

    此请求类型仅提供`v1alpha2` API。

ComfyUI提供工作流编排功能，可以在界面上使用多种节点编排工作流，并导出至`json`文件。

#### 导出工作流

在界面上设计完成工作流后，进行以下操作以导出工作流：

* 选择菜单面板右上角的齿轮图标
* 选择开启 `Enable Dev mode Options`
* 选择 `Save(API Format)`，将工作流保存为文件。

#### 请求格式

=== "v1alpha2"
    ```json
    {
      "task": {
        "metadata": {
          "id": "test-pipeline", // 必要，任务ID
          "runtime": "sdruntime", // 必要，任务使用的运行时名称
          "tasktype": "pipeline", // 必要，任务类型
          "prefix": "output", // 必要，输出文件在S3桶中的前缀（即目录名）
          "context": "" // 可选，可放置任何信息，会在回调中包含
        },
        "content": {
          ... // 此处放入之前导出的工作流内容
        }
      }
    }
    ```

#### 响应格式

=== "v1alpha2"
    ```json
    {
      "id_task": "test-pipeline",
      "runtime": "sdruntime",
      "output_location": "s3://outputbucket/output/test-pipeline"
    }
    ```

#### 图片获取

在图像完成生成后，会存储到 `output_location` 所在的S3存储桶路径中。如设置了`batch_size`或其他生成多张图的参数，则每张图会自动编号后存入。

默认存储格式为无损PNG，但如涉及到特殊格式（如GIF等），系统会自动识别并加扩展名。

### 回调和通知

Stable Diffusion on Amazon EKS方案采用异步推理模式，当图片生成或报错后，会通过Amazon SNS通知用户。用户应用可以通过订阅 SNS 主题以获取图片生成完成的通知。

#### 添加订阅

请参考 [Amazon SNS文档](https://docs.aws.amazon.com/sns/latest/dg/sns-event-destinations.html) 以了解 SNS 支持的消息目标类型。

您可以从CloudFormation的输出中找到生成的 SNS 主题 ARN：

=== "AWS 管理控制台"

    * 进入 [AWS CloudFormation 控制台](https://console.aws.amazon.com/cloudformation/home)
    * 选择 **Stacks** （堆栈）
    * 在列表中，选择 **SdOnEKSStack** （或您自定义的名称）
    * 选择 **Output** （输出）
    * 记录 **sdNotificationOutputArn** 项的值（格式为  `arn:aws:sns:us-east-1:123456789012:SdOnEKSStack-sdNotificationOutputCfn-abcdefgh`）

=== "AWS CLI"

    运行以下命令以获取 SNS 主题 ARN：

    ```bash
    aws cloudformation describe-stacks --stack-name SdOnEKSStack --output text --query 'Stacks[0].Outputs[?OutputKey==`sdNotificationOutputArn`].OutputValue'
    ```

如需接收消息，您需要将您的消息接收端（如Amazon SQS队列，HTTP 终端节点等）作为**订阅**添加到该SNS主题中。

=== "AWS 管理控制台"

    * 在左侧导航窗格中，选择**Subscriptions** （订阅）。
    * 在 **Subscriptions**（订阅）页面上，选择 **Create subscription**（创建订阅）。
    * 在 **Create subscription**（创建订阅）页上的 Details（详细信息）部分中，执行以下操作：
        * 对于 **Topic ARN**（主题 ARN），选择您在上一步中记录的ARN。
        * 对于 **Protocol**（协议），选择您的接收端类型。
        * 对于 **Endpoint**（终端节点），输入您的接收端地址，例如电子邮件地址或 Amazon SQS 队列的 ARN。
    * 选择 **Create subscription**（创建订阅）

=== "AWS CLI"

    请参考[Use Amazon SNS with the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-services-sns.html#cli-subscribe-sns-topic) 添加对该主题的订阅。

#### 回调消息格式

解决方案会通过以下格式向SNS发送任务完成通知，此通知与请求时所使用的的API版本无关：

```json
{
    "id": "task_id", // 任务ID
    "result": true, // true为成功完成，false为未成功完成
    "image_url": [ // 生成图像的S3 URL，格式为 任务ID+4位随机码+图片序号，如有多张图片则所有图片链接均会附上
        "s3://outputbucket/output/test-t2i/test-t2i-abcd-1.png"
    ],
    "output_url": "s3://outputbucket/output/test-t2i/test-t2i-abcd.out", // 任务返回的S3 URL，包含运行时的完整返回
    "context": { // 请求时附带的Context内容
        "abc": 123
    }
}
```



## 删除解决方案

部署的解决方案可以使用CloudFormation删除。

!!! danger "永久删除"
    所有删除的资源将被永久删除，无法以任何手段被恢复。

### 删除范围

* 以下内容**会**被永久删除：
    * Amazon EKS 集群及所有工作节点
    * SNS 主题及所有订阅
    * SQS 队列
    * VPC
    * 解决方案使用的IAM角色

* 以下内容**不会**被删除：
    * 存储输出图像的S3存储桶
    * 存储模型的S3存储桶

### 删除前准备

在删除解决方案前，请确保解决方案满足以下条件：

* 所有SQS队列已被清空
* 所有的IAM角色没有附加额外策略
* VPC内无额外的资源（如EC2，ENI，Cloud9等）

### 删除解决方案

您可以通过CDK CLI或AWS 管理控制台删除该解决方案。

=== "AWS 管理控制台"

    * 进入 [AWS CloudFormation 控制台](https://console.aws.amazon.com/cloudformation/home)
    * 选择 **Stacks** （堆栈）
    * 在列表中，选择 **sdoneksStack** （或您自定义的名称）
    * 选择 **Delete** （删除），在弹出的对话框中选择 **Delete** （删除）

=== "AWS CDK"

    在解决方案源代码目录，运行以下命令以删除解决方案：

    ```bash
    npx cdk destroy
    ```

删除解决方案大约需要 20-30 分钟。

### 贡献者

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
