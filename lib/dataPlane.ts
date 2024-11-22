import * as cdk from 'aws-cdk-lib';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import { Construct } from "constructs";
import * as eks from "aws-cdk-lib/aws-eks";
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import SDRuntimeAddon, { SDRuntimeAddOnProps } from './runtime/sdRuntime';
import { EbsThroughputTunerAddOn, EbsThroughputTunerAddOnProps } from './addons/ebsThroughputTuner'
import { s3CSIDriverAddOn, s3CSIDriverAddOnProps } from './addons/s3CSIDriver'
import { SharedComponentAddOn, SharedComponentAddOnProps } from './addons/sharedComponent';
import { SNSResourceProvider } from './resourceProvider/sns'
import { s3GWEndpointProvider } from './resourceProvider/s3GWEndpoint'
import { dcgmExporterAddOn } from './addons/dcgmExporter';

export interface dataPlaneProps {
  stackName: string,
  modelBucketArn: string;
  APIGW?: {
    stageName?: string,
    throttle?: {
      rateLimit?: number,
      burstLimit?: number
    }
  }
  modelsRuntime: {
    name: string,
    namespace: string,
    type: string,
    modelFilename?: string,
    dynamicModel?: boolean,
    chartRepository?: string,
    chartVersion?: string,
    extraValues?: {}
  }[]
}

export default class DataPlaneStack {
  constructor(scope: Construct, id: string,
    dataplaneProps: dataPlaneProps,
    props: cdk.StackProps) {

    const kedaParams: blueprints.KedaAddOnProps = {
      podSecurityContextFsGroup: 1001,
      securityContextRunAsGroup: 1001,
      securityContextRunAsUser: 1001,
      irsaRoles: ["CloudWatchFullAccess", "AmazonSQSFullAccess"]
    };

    const cloudWatchInsightsParams: blueprints.CloudWatchInsightsAddOnProps = {
      configurationValues: {
        tolerations: [
          {
            key: "runtime",
            operator: "Exists",
            effect: "NoSchedule"
          },
          {
            key: "nvidia.com/gpu",
            operator: "Exists",
            effect: "NoSchedule"
          }
        ],
        containerLogs: {
          enabled: true,
          fluentBit: {
            config: {
              service: "[SERVICE]\n    Flush        5\n    Grace       30\n    Log_Level   info",
              extraFiles: {
                "application-log.conf": "[INPUT]\n    Name             tail\n    Tag              kube.*\n    Path             /var/log/containers/*.log\n    Parser           docker\n    DB               /var/log/flb_kube.db\n    Mem_Buf_Limit    5MB\n    Skip_Long_Lines  On\n    Refresh_Interval 10\n\n[FILTER]\n    Name                kubernetes\n    Match               kube.*\n    Kube_URL            https://kubernetes.default.svc:443\n    Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt\n    Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token\n    Kube_Tag_Prefix     kube.var.log.containers.\n    Merge_Log           On\n    Merge_Log_Key      log_processed\n    K8S-Logging.Parser On\n    K8S-Logging.Exclude On\n\n[FILTER]\n    Name                grep\n    Match               kube.*\n    Exclude             $kubernetes['namespace_name'] kube-system\n\n[OUTPUT]\n    Name                cloudwatch\n    Match               kube.*\n    region              ${AWS_REGION}\n    log_group_name      /aws/containerinsights/${CLUSTER_NAME}/application\n    log_stream_prefix   ${HOST_NAME}-\n    auto_create_group   true\n    retention_in_days   7"
              }
            }
          }
        }
      }
    };

    const SharedComponentAddOnParams: SharedComponentAddOnProps = {
      inputSns: blueprints.getNamedResource("inputSNSTopic"),
      outputSns: blueprints.getNamedResource("outputSNSTopic"),
      outputBucket: blueprints.getNamedResource("outputS3Bucket"),
      apiGWProps: dataplaneProps.APIGW
    };

    const EbsThroughputModifyAddOnParams: EbsThroughputTunerAddOnProps = {
      duration: 300,
      throughput: 125,
      iops: 3000
    };

    const s3CSIDriverAddOnParams: s3CSIDriverAddOnProps = {
      s3BucketArn: dataplaneProps.modelBucketArn
    };

    const addOns: Array<blueprints.ClusterAddOn> = [
      new blueprints.addons.VpcCniAddOn(),
      new blueprints.addons.CoreDnsAddOn(),
      new blueprints.addons.KubeProxyAddOn(),
      new blueprints.addons.AwsLoadBalancerControllerAddOn(),
      new blueprints.addons.KarpenterAddOn({ interruptionHandling: true }),
      new blueprints.addons.KedaAddOn(kedaParams),
      new blueprints.addons.CloudWatchInsights(),
      new s3CSIDriverAddOn(s3CSIDriverAddOnParams),
      new SharedComponentAddOn(SharedComponentAddOnParams),
      new EbsThroughputTunerAddOn(EbsThroughputModifyAddOnParams),
    ];

// Generate SD Runtime Addon for runtime
dataplaneProps.modelsRuntime.forEach((val, idx, array) => {
  const sdRuntimeParams: SDRuntimeAddOnProps = {
    modelBucketArn: dataplaneProps.modelBucketArn,
    outputSns: blueprints.getNamedResource("outputSNSTopic") as sns.ITopic,
    inputSns: blueprints.getNamedResource("inputSNSTopic") as sns.ITopic,
    outputBucket: blueprints.getNamedResource("outputS3Bucket") as s3.IBucket,
    type: val.type.toLowerCase(),
    chartRepository: val.chartRepository,
    chartVersion: val.chartVersion,
    extraValues: val.extraValues,
    targetNamespace: val.namespace,
  };

  //Parameters for SD Web UI
  if (val.type.toLowerCase() == "sdwebui") {
    if (val.modelFilename) {
      sdRuntimeParams.sdModelCheckpoint = val.modelFilename
    }
    if (val.dynamicModel == true) {
      sdRuntimeParams.dynamicModel = true
    } else {
      sdRuntimeParams.dynamicModel = false
    }
  }

  if (val.type.toLowerCase() == "comfyui") {}

  addOns.push(new SDRuntimeAddon(sdRuntimeParams, val.name))
});

// Define initial managed node group for cluster components
const MngProps: blueprints.MngClusterProviderProps = {
  minSize: 2,
  maxSize: 2,
  desiredSize: 2,
  version: eks.KubernetesVersion.V1_31,
  instanceTypes: [new ec2.InstanceType('m7g.large')],
  amiType: eks.NodegroupAmiType.AL2023_ARM_64_STANDARD,
  enableSsmPermissions: true,
  nodeGroupTags: {
    "Name": cdk.Aws.STACK_NAME + "-ClusterComponents",
    "stack": cdk.Aws.STACK_NAME
  }
}

// Deploy EKS cluster with all add-ons
const blueprint = blueprints.EksBlueprint.builder()
  .version(eks.KubernetesVersion.V1_31)
  .addOns(...addOns)
  .resourceProvider(
    blueprints.GlobalResources.Vpc,
    new blueprints.VpcProvider())
  .resourceProvider("inputSNSTopic", new SNSResourceProvider("sdNotificationLambda"))
  .resourceProvider("outputSNSTopic", new SNSResourceProvider("sdNotificationOutput"))
  .resourceProvider("outputS3Bucket", new blueprints.CreateS3BucketProvider({
    id: 'outputS3Bucket'
  }))
  .resourceProvider("s3GWEndpoint", new s3GWEndpointProvider("s3GWEndpoint"))
  .clusterProvider(new blueprints.MngClusterProvider(MngProps))
  .build(scope, id + 'Stack', props);
/*
  // Workaround for permission denied when creating cluster
    const handler = blueprint.node.tryFindChild('@aws-cdk--aws-eks.KubectlProvider')!
      .node.tryFindChild('Handler')! as cdk.aws_lambda.Function

    (
      blueprint.node.tryFindChild('@aws-cdk--aws-eks.KubectlProvider')!
        .node.tryFindChild('Provider')!
        .node.tryFindChild('framework-onEvent')!
        .node.tryFindChild('ServiceRole')!
        .node.tryFindChild('DefaultPolicy') as cdk.aws_iam.Policy
    )
      .addStatements(new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ["lambda:GetFunctionConfiguration"],
        resources: [handler.functionArn]
      }))
 */
  // Provide static output name for cluster
    const cluster = blueprint.getClusterInfo().cluster
    const clusterNameCfnOutput = cluster.node.findChild('ClusterName') as cdk.CfnOutput;
    clusterNameCfnOutput.overrideLogicalId('ClusterName')

    const configCommandCfnOutput = cluster.node.findChild('ConfigCommand') as cdk.CfnOutput;
    configCommandCfnOutput.overrideLogicalId('ConfigCommand')

    const getTokenCommandCfnOutput = cluster.node.findChild('GetTokenCommand') as cdk.CfnOutput;
    getTokenCommandCfnOutput.overrideLogicalId('GetTokenCommand')
  }
}