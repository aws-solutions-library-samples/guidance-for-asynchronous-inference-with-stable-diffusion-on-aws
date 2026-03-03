import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { aws_sns_subscriptions } from "aws-cdk-lib";
import { createNamespace }  from "../utils/namespace"

export interface SDRuntimeAddOnProps extends blueprints.addons.HelmAddOnUserProps {
  type: string,
  targetNamespace?: string,
  modelBucketArn?: string,
  outputSns?: sns.ITopic,
  inputSns?: sns.ITopic,
  outputBucket?: s3.IBucket
  sdModelCheckpoint?: string,
  dynamicModel?: boolean,
  chartRepository?: string,
  chartVersion?: string,
  extraValues?: object
}

const DEFAULT_IMAGE_REPOS: Record<string, string> = {
  sdwebui: "public.ecr.aws/bingjiao/sd-on-eks/sdwebui",
  comfyui: "public.ecr.aws/bingjiao/sd-on-eks/comfyui",
};

export const defaultProps: blueprints.addons.HelmAddOnProps & SDRuntimeAddOnProps = {
  chart: 'sd-on-eks',
  name: 'sdRuntimeAddOn',
  namespace: 'sdruntime',
  release: 'sdruntime',
  version: '1.2.0',
  repository: 'oci://public.ecr.aws/bingjiao/charts/sd-on-eks',
  values: {},
  type: "sdwebui"
}

export default class SDRuntimeAddon extends blueprints.addons.HelmAddOn {

  readonly options: SDRuntimeAddOnProps;
  readonly id: string;

  constructor(props: SDRuntimeAddOnProps, id?: string) {
    super({ ...defaultProps, ...props });
    this.options = this.props as SDRuntimeAddOnProps;
    this.id = id ? id.toLowerCase() : 'sdruntime';
  }

  @blueprints.utils.dependable(blueprints.KarpenterV1AddOn.name)
  @blueprints.utils.dependable("SharedComponentAddOn")
  @blueprints.utils.dependable("S3CSIDriverAddOn")

  deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
    const cluster = clusterInfo.cluster

    this.props.name = this.id + 'Addon'
    this.props.release = this.id
    this.props.namespace = this.options.targetNamespace?.toLowerCase() || "default";

    const ns = createNamespace(this.id+"-"+this.props.namespace+"-namespace-struct", this.props.namespace, cluster, true)

    const runtimeSA = cluster.addServiceAccount('runtimeSA' + this.id, { namespace: this.props.namespace });
    runtimeSA.node.addDependency(ns)

    if (this.options.chartRepository) {
      this.props.repository = this.options.chartRepository
    }

    if (this.options.chartVersion) {
      this.props.version = this.options.chartVersion
    }

    const modelBucket = s3.Bucket.fromBucketAttributes(cluster.stack, 'ModelBucket' + this.id, {
      bucketArn: this.options.modelBucketArn!
    });

    modelBucket.grantRead(runtimeSA);

    const inputQueue = new sqs.Queue(cluster.stack, 'InputQueue' + this.id);
    inputQueue.grantConsumeMessages(runtimeSA);

    this.options.outputBucket!.grantWrite(runtimeSA);
    this.options.outputBucket!.grantPutAcl(runtimeSA);
    this.options.outputSns!.grantPublish(runtimeSA);

    runtimeSA.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AWSXRayDaemonWriteAccess',
      ))

    const nodeRole = clusterInfo.cluster.node.findChild('karpenter-node-role') as iam.IRole

    // Resolve image repository: use extraValues override or default per runtime type
    const extraImageRepo = (this.options.extraValues as Record<string, any>)
      ?.runtime?.inferenceApi?.image?.repository;
    const imageRepo = extraImageRepo || DEFAULT_IMAGE_REPOS[this.options.type] || DEFAULT_IMAGE_REPOS.sdwebui;

    let generatedValues: Record<string, any> = {
      global: {
        awsRegion: cdk.Stack.of(cluster).region,
        stackName: cdk.Stack.of(cluster).stackName,
        runtime: this.id
      },
      runtime: {
        type: this.options.type,
        serviceAccountName: runtimeSA.serviceAccountName,
        inferenceApi: {
          image: { repository: imageRepo },
        },
        queueAgent: {
          s3Bucket: this.options.outputBucket!.bucketName,
          snsTopicArn: this.options.outputSns!.topicArn,
          sqsQueueUrl: inputQueue.queueUrl,
        },
        persistence: {
          enabled: true,
          storageClass: "-",
          s3: {
            enabled: true,
            modelBucket: modelBucket.bucketName
          }
        }
      },
      karpenter: {
        nodeTemplate: {
          iamRole: nodeRole.roleName
        }
      }
    }

    if (this.options.type === "sdwebui") {
      generatedValues.runtime.inferenceApi.modelFilename = this.options.sdModelCheckpoint;
      generatedValues.runtime.queueAgent.dynamicModel = this.options.dynamicModel;
    }

    if (this.options.type === "sdwebui" && this.options.sdModelCheckpoint) {
      // Legacy and new routing, use CFN as a workaround since L2 construct doesn't support OR
      const cfnSubscription = new sns.CfnSubscription(cluster.stack, this.id+'CfnSubscription', {
        protocol: 'sqs',
        endpoint: inputQueue.queueArn,
        topicArn: this.options.inputSns!.topicArn,
        filterPolicy: {
          "$or": [
            {
              "sd_model_checkpoint": [
                this.options.sdModelCheckpoint!
              ]
            }, {
              "runtime": [
                this.id
              ]
            }]
        },
        filterPolicyScope: "MessageAttributes"
      })

      inputQueue.addToResourcePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('sns.amazonaws.com')],
        actions: ['sqs:SendMessage'],
        resources: [inputQueue.queueArn],
        conditions: {
          'ArnEquals': {
            'aws:SourceArn': this.options.inputSns!.topicArn
          }
        }
      }))
    } else {
      // New version routing only
      this.options.inputSns!.addSubscription(new aws_sns_subscriptions.SqsSubscription(inputQueue, {
        filterPolicy: {
          runtime:
            sns.SubscriptionFilter.stringFilter({
              allowlist: [this.id]
            })
        }
      }))
    }

    const values = this.deepMerge(this.props.values ?? {}, this.options.extraValues ?? {}, generatedValues);

    const chart = this.addHelmChart(clusterInfo, values, true);

    return Promise.resolve(chart);
  }

  private deepMerge(...objects: Record<string, any>[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const obj of objects) {
      for (const key of Object.keys(obj)) {
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          result[key] = this.deepMerge(result[key] || {}, obj[key]);
        } else {
          result[key] = obj[key];
        }
      }
    }
    return result;
  }
}
