# CLAUDE.md - Project Guide for AI Assistants

## Project Overview

Guidance for Asynchronous Image Generation with Stable Diffusion on AWS. A fast-scaling, low-cost Stable Diffusion inference solution using serverless and container services on AWS. Deploys an EKS cluster with GPU auto-scaling (Karpenter) and event-driven pod scaling (KEDA) for asynchronous image generation.

## Tech Stack

- AWS CDK (TypeScript) with EKS Blueprints v1.17.4
- EKS Kubernetes v1.35
- Karpenter v1 (stable CRDs: NodePool, EC2NodeClass)
- KEDA for queue-based pod autoscaling
- Bottlerocket OS on GPU nodes
- SOCI Parallel Pull for fast container image loading
- NVMe instance store for kubelet/containerd storage

## Directory Structure

```
bin/                         # CDK app entry point
  stable-difussion-on-eks.ts # Main app, loads config.yaml and creates DataPlaneStack
lib/                         # CDK infrastructure code
  dataPlane.ts               # Main stack - EKS Blueprint builder with all add-ons
  addons/
    dcgmExporter.ts          # NVIDIA GPU metrics (Helm addon)
    ebsThroughputTuner.ts    # EBS throughput tuning via Lambda + Step Functions
    s3CSIDriver.ts           # S3 Mountpoint CSI driver (Helm addon)
    sharedComponent.ts       # API Gateway, Lambda parsers, SNS, X-Ray
  resourceProvider/
    s3GWEndpoint.ts          # S3 Gateway VPC endpoint
    sns.ts                   # SNS topic provider
    vpc.ts                   # Custom VPC provider (single NAT gateway for cost savings)
  runtime/
    sdRuntime.ts             # SD runtime Helm addon (sdwebui/comfyui)
  utils/
    namespace.ts             # K8s namespace creation helper
    validateConfig.ts        # Config validation (stub)
src/
  charts/sd_on_eks/          # Helm chart for SD runtime
    templates/
      nodeclass.yaml         # Karpenter EC2NodeClass (v1 API)
      nodepool.yaml          # Karpenter NodePool (v1 API)
      deployment-sdwebui.yaml
      deployment-comfyui.yaml
      aws-sqs-queue-scaledobject.yaml  # KEDA ScaledObject
      persistentvolume-s3.yaml
      persistentvolumeclaim.yaml
      keda-trigger-auth-aws-credentials.yaml
    values.yaml              # Default Helm values
    Chart.yaml               # Chart metadata (v1.2.0)
  frontend/input_function/   # Lambda functions for API Gateway
    v1alpha1/                # v1alpha1 API parser
    v1alpha2/                # v1alpha2 API parser
  backend/                   # Backend application code
  tools/
    ebs_throughput_tuner/    # Python Lambda for EBS tuning
deploy/
  deploy.sh                  # One-click deployment script
  config.yaml.template       # Config template for deploy.sh
  install-tools.sh           # Tool installation helper
config.yaml                  # Deployment configuration
config.schema.yaml           # YAML schema validation
```

## Key Commands

```bash
npm install                  # Install dependencies
npx cdk synth -q             # Synthesize CloudFormation template
npx cdk deploy --no-rollback --require-approval never  # Deploy stack
./deploy/deploy.sh           # One-click deployment (creates bucket, snapshot, deploys)
./deploy/deploy.sh --no-snapshot  # Deploy without EBS snapshot (uses SOCI instead)
```

## Configuration

- `config.yaml` is the main config file (override with `CDK_CONFIG_PATH` env var).
- `clusterComponents` configures the managed node group instance type and count.
- `modelsRuntime[]` array defines SD runtimes (sdwebui/comfyui).
- `extraValues` in each runtime maps directly to Helm chart values.
- GPU node config flows: config.yaml -> CDK -> Helm values -> Karpenter NodePool/EC2NodeClass.
- ARM vs x86 AMI type is auto-detected from instance type (Graviton pattern: digit followed by 'g').

## EKS Blueprint Add-ons

Built-in: VpcCniAddOn, CoreDnsAddOn, KubeProxyAddOn, AwsLoadBalancerControllerAddOn, KarpenterV1AddOn, KedaAddOn, CloudWatchInsights, S3CSIDriverAddOn.

Custom: SharedComponentAddOn, EbsThroughputTunerAddOn, dcgmExporterAddOn, SDRuntimeAddon.

## Dependencies

- `@aws-quickstart/eks-blueprints`: 1.17.4
- `aws-cdk-lib`: 2.215.0
- `aws-cdk` (CLI): 2.1029.2
- `typescript`: ~5.7.0

## Key Patterns

- Custom add-ons implement `ClusterAddOn` interface or extend `HelmAddOn`.
- `@blueprints.utils.dependable` decorator for add-on ordering.
- Resource providers implement `ResourceProvider<T>` for shared resources (VPC, SNS, S3).
- `blueprints.getNamedResource()` for cross-addon resource sharing.

## GPU Node Defaults

- Bottlerocket OS with SOCI Parallel Pull enabled.
- NVMe instance store in RAID0 for kubelet/containerd/SOCI storage.
- IMDSv2 enforced (httpTokens: required).
- EBS snapshot optional (SOCI + instance store is the default fast-start method).
