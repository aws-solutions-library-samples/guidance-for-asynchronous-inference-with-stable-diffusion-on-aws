import { Duration, CustomResource, RemovalPolicy } from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import { Rule } from "aws-cdk-lib/aws-events";
import { SqsQueue } from "aws-cdk-lib/aws-events-targets";
import { Cluster } from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as blueprints from '@aws-quickstart/eks-blueprints';

export interface KarpenterAddOnProps extends blueprints.addons.HelmAddOnUserProps {
  interruptionHandling?: boolean;
  helmChartTimeout?: Duration;
}

export const defaultProps: blueprints.addons.HelmAddOnProps & KarpenterAddOnProps = {
  chart: 'karpenter',
  name: 'KarpenterAddOn',
  namespace: 'kube-system',
  release: 'karpenter',
  version: '1.9.0',
  repository: 'oci://public.ecr.aws/karpenter/karpenter',
  interruptionHandling: true,
  values: {}
}

export class KarpenterAddOn extends blueprints.addons.HelmAddOn {

  readonly options: KarpenterAddOnProps;

  constructor(props?: KarpenterAddOnProps) {
    super({ ...defaultProps, ...props });
    this.options = this.props as KarpenterAddOnProps;
  }

  deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
    const cluster = clusterInfo.cluster as Cluster;
    const endpoint = cluster.clusterEndpoint;
    const name = cluster.clusterName;
    const partition = cluster.stack.partition;
    const stackName = cluster.stack.stackName;
    const region = cluster.stack.region;

    let values = this.options.values ?? {};

    const interruption = this.options.interruptionHandling || false;

    // Set up the node role and instance profile
    const [karpenterNodeRole] = this.setUpNodeRole(cluster, stackName);

    // Create the controller policy
    let karpenterPolicyDocument = iam.PolicyDocument.fromJson(
      this.getKarpenterControllerPolicy(cluster, partition, region)
    );

    karpenterPolicyDocument.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: [`${karpenterNodeRole.roleArn}`],
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:CreateInstanceProfile",
          "iam:DeleteInstanceProfile",
          "iam:GetInstanceProfile",
          "iam:ListInstanceProfiles",
          "iam:TagInstanceProfile",
          "iam:AddRoleToInstanceProfile",
          "iam:RemoveRoleFromInstanceProfile",
        ],
        resources: [`*`],
      }),
    );

    // Support for Native spot interruption
    if (interruption) {
      const interruptionQueueStatement = this.createInterruptionQueue(cluster, stackName);
      karpenterPolicyDocument.addStatements(interruptionQueueStatement);
    }

    // Create Namespace
    const ns = blueprints.utils.createNamespace(this.options.namespace!, cluster, true, true);

    // Always use Pod Identity
    const sa = blueprints.utils.podIdentityAssociation(
      cluster,
      this.options.release!,
      this.options.namespace!,
      karpenterPolicyDocument
    );
    sa.node.addDependency(ns);

    // Create global helm values
    let globalSettings = { clusterName: name, clusterEndpoint: endpoint };
    globalSettings = Object.assign(globalSettings, { interruptionQueue: interruption ? stackName : "" });

    const settingsValues = { settings: Object.assign(globalSettings, values?.settings ?? {}) };
    const saValues = {
      serviceAccount: { create: true, name: this.options.release!, annotations: {} },
    };

    values = Object.assign(values, settingsValues, saValues);

    // Install HelmChart
    const helmChartTimeout = this.options.helmChartTimeout || Duration.minutes(5);
    const chart = this.addHelmChart(clusterInfo, values, false, true, helmChartTimeout);

    chart.node.addDependency(sa);

    if (clusterInfo.nodeGroups) {
      clusterInfo.nodeGroups.forEach((n) => chart.node.addDependency(n));
    }

    return Promise.resolve(chart);
  }

  private setUpNodeRole(cluster: Cluster, stackName: string): [iam.IRole] {
    const karpenterNodeRole = new iam.Role(cluster, `${stackName}-karpenter-node-role`, {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryReadOnly"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    // CDK-managed instance profile for Karpenter nodes.
    // Using instanceProfile field instead of role field in EC2NodeClass ensures the
    // instance profile is part of the CloudFormation stack lifecycle, avoiding
    // orphaned instance profiles that block stack deletion.
    const instanceProfile = new iam.CfnInstanceProfile(cluster, `${stackName}-karpenter-instance-profile`, {
      roles: [karpenterNodeRole.roleName],
      instanceProfileName: `${stackName}-karpenter-node-profile`,
    });

    // Terminate Karpenter-launched instances and clean up instance profiles on stack deletion.
    // Karpenter tags all instances it launches, so we can find and terminate them.
    const cleanupFn = new lambda.Function(cluster, `${stackName}-karpenter-cleanup-fn`, {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      timeout: Duration.minutes(5),
      code: lambda.Code.fromInline(`
import boto3, json, time
import cfnresponse

def handler(event, context):
    if event['RequestType'] != 'Delete':
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
        return
    try:
        ec2 = boto3.client('ec2')
        cluster_name = event['ResourceProperties']['ClusterName']
        instance_profile = event['ResourceProperties']['InstanceProfileName']
        # Find and terminate Karpenter-launched instances
        resp = ec2.describe_instances(Filters=[
            {'Name': 'tag:karpenter.sh/nodepool', 'Values': ['*']},
            {'Name': f'tag:kubernetes.io/cluster/{cluster_name}', 'Values': ['owned']},
            {'Name': 'instance-state-name', 'Values': ['running', 'pending', 'stopping']},
        ])
        ids = [i['InstanceId'] for r in resp['Reservations'] for i in r['Instances']]
        if ids:
            print(f'Terminating {len(ids)} Karpenter instances: {ids}')
            ec2.terminate_instances(InstanceIds=ids)
            waiter = ec2.get_waiter('instance_terminated')
            waiter.wait(InstanceIds=ids, WaiterConfig={'Delay': 10, 'MaxAttempts': 30})
        # Clean up instance profile
        iam_client = boto3.client('iam')
        try:
            ip = iam_client.get_instance_profile(InstanceProfileName=instance_profile)
            for role in ip['InstanceProfile']['Roles']:
                iam_client.remove_role_from_instance_profile(
                    InstanceProfileName=instance_profile, RoleName=role['RoleName'])
        except iam_client.exceptions.NoSuchEntityException:
            pass
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
    except Exception as e:
        print(f'Cleanup error (non-fatal): {e}')
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
`),
    });
    cleanupFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ec2:DescribeInstances', 'ec2:TerminateInstances'],
      resources: ['*'],
    }));
    cleanupFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:GetInstanceProfile', 'iam:RemoveRoleFromInstanceProfile'],
      resources: [`arn:*:iam::*:instance-profile/${stackName}-karpenter-node-profile`],
    }));

    const cleanupProvider = new cr.Provider(cluster, `${stackName}-karpenter-cleanup-provider`, {
      onEventHandler: cleanupFn,
    });
    const cleanup = new CustomResource(cluster, `${stackName}-karpenter-cleanup`, {
      serviceToken: cleanupProvider.serviceToken,
      removalPolicy: RemovalPolicy.DESTROY,
      properties: {
        ClusterName: cluster.clusterName,
        InstanceProfileName: `${stackName}-karpenter-node-profile`,
      },
    });
    // Ensure cleanup runs before role and instance profile are deleted
    karpenterNodeRole.node.addDependency(cleanup);
    instanceProfile.node.addDependency(cleanup);

    // Register node role as EKS access entry for API-based auth (GenericClusterProviderV2)
    new cr.AwsCustomResource(cluster, `${stackName}-karpenter-access-entry`, {
      onCreate: {
        service: 'EKS',
        action: 'createAccessEntry',
        parameters: {
          clusterName: cluster.clusterName,
          principalArn: karpenterNodeRole.roleArn,
          type: 'EC2_LINUX',
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${stackName}-karpenter-access-entry`),
      },
      onDelete: {
        service: 'EKS',
        action: 'deleteAccessEntry',
        parameters: {
          clusterName: cluster.clusterName,
          principalArn: karpenterNodeRole.roleArn,
        },
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['eks:CreateAccessEntry', 'eks:DeleteAccessEntry'],
          resources: [
            `arn:*:eks:*:*:cluster/${cluster.clusterName}`,
            `arn:*:eks:*:*:access-entry/${cluster.clusterName}/*`,
          ],
        }),
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [karpenterNodeRole.roleArn],
        }),
      ]),
    });

    return [karpenterNodeRole];
  }

  private createInterruptionQueue(cluster: Cluster, stackName: string): iam.PolicyStatement {
    const queue = new sqs.Queue(cluster, `${stackName}-interruption-queue`, {
      queueName: stackName,
      retentionPeriod: Duration.seconds(300),
    });

    const eventRule = new Rule(cluster, `${stackName}-scheduled-change-rule`, {
      eventPattern: {
        source: ["aws.ec2"],
        detailType: ["EC2 Spot Instance Interruption Warning", "EC2 Instance Rebalance Recommendation"],
      },
    });

    const rebalanceRule = new Rule(cluster, `${stackName}-rebalance-rule`, {
      eventPattern: {
        source: ["aws.ec2"],
        detailType: ["EC2 Instance Rebalance Recommendation"],
      },
    });

    const stateChangeRule = new Rule(cluster, `${stackName}-state-change-rule`, {
      eventPattern: {
        source: ["aws.ec2"],
        detailType: ["EC2 Instance State-change Notification"],
      },
    });

    eventRule.addTarget(new SqsQueue(queue));
    rebalanceRule.addTarget(new SqsQueue(queue));
    stateChangeRule.addTarget(new SqsQueue(queue));

    return new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl",
        "sqs:ReceiveMessage",
      ],
      resources: [queue.queueArn],
    });
  }

  private getKarpenterControllerPolicy(cluster: Cluster, partition: string, region: string): any {
    // Based on the official Karpenter v1 controller policy
    // https://karpenter.sh/docs/getting-started/getting-started-with-karpenter/
    return {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowEC2InstanceActions",
          Effect: "Allow",
          Resource: [
            `arn:${partition}:ec2:${region}::image/*`,
            `arn:${partition}:ec2:${region}:*:instance/*`,
            `arn:${partition}:ec2:${region}:*:spot-instances-request/*`,
            `arn:${partition}:ec2:${region}:*:security-group/*`,
            `arn:${partition}:ec2:${region}:*:subnet/*`,
            `arn:${partition}:ec2:${region}:*:launch-template/*`,
            `arn:${partition}:ec2:${region}:*:fleet/*`,
            `arn:${partition}:ec2:${region}:*:volume/*`,
            `arn:${partition}:ec2:${region}:*:network-interface/*`,
          ],
          Action: [
            "ec2:RunInstances",
            "ec2:CreateFleet",
            "ec2:CreateLaunchTemplate",
            "ec2:CreateTags",
            "ec2:TerminateInstances",
            "ec2:DeleteLaunchTemplate",
          ],
        },
        {
          Sid: "AllowRegionalReadActions",
          Effect: "Allow",
          Resource: "*",
          Action: [
            "ec2:DescribeAvailabilityZones",
            "ec2:DescribeCapacityReservations",
            "ec2:DescribeImages",
            "ec2:DescribeInstances",
            "ec2:DescribeInstanceTypeOfferings",
            "ec2:DescribeInstanceTypes",
            "ec2:DescribeLaunchTemplates",
            "ec2:DescribeLaunchTemplateVersions",
            "ec2:DescribeSecurityGroups",
            "ec2:DescribeSpotPriceHistory",
            "ec2:DescribeSubnets",
          ],
        },
        {
          Sid: "AllowSSMReadActions",
          Effect: "Allow",
          Resource: `arn:${partition}:ssm:${region}:*:parameter/aws/service/*`,
          Action: [
            "ssm:GetParameter",
          ],
        },
        {
          Sid: "AllowPricingReadActions",
          Effect: "Allow",
          Resource: "*",
          Action: [
            "pricing:GetProducts",
          ],
        },
        {
          Sid: "AllowEKSReadActions",
          Effect: "Allow",
          Resource: `arn:${partition}:eks:${region}:*:cluster/${cluster.clusterName}`,
          Action: [
            "eks:DescribeCluster",
          ],
        },
      ],
    };
  }
}