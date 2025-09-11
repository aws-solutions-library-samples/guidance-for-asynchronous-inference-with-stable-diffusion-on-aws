import { Duration } from "aws-cdk-lib";
import { Rule } from "aws-cdk-lib/aws-events";
import { SqsQueue } from "aws-cdk-lib/aws-events-targets";
import { Cluster } from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
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
  version: '1.6.3',
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
      })
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

    new iam.CfnInstanceProfile(cluster, `${stackName}-karpenter-node-instance-profile`, {
      instanceProfileName: `KarpenterNodeInstanceProfile-${stackName}`,
      roles: [karpenterNodeRole.roleName],
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
    return {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowScopedEC2InstanceAccessActions",
          Effect: "Allow",
          Resource: [
            `arn:${partition}:ec2:${region}:*:instance/*`,
            `arn:${partition}:ec2:${region}:*:spot-instances-request/*`,
          ],
          Action: [
            "ec2:RunInstances",
            "ec2:TerminateInstances",
          ],
        },
        {
          Sid: "AllowScopedEC2LaunchTemplateAccessActions",
          Effect: "Allow",
          Resource: `arn:${partition}:ec2:${region}:*:launch-template/*`,
          Action: [
            "ec2:CreateLaunchTemplate",
            "ec2:CreateLaunchTemplateVersion",
            "ec2:DeleteLaunchTemplate",
            "ec2:DeleteLaunchTemplateVersions",
          ],
        },
        {
          Sid: "AllowScopedEC2InstanceActionsWithTags",
          Effect: "Allow",
          Resource: [
            `arn:${partition}:ec2:${region}:*:fleet/*`,
            `arn:${partition}:ec2:${region}:*:instance/*`,
            `arn:${partition}:ec2:${region}:*:volume/*`,
            `arn:${partition}:ec2:${region}:*:network-interface/*`,
            `arn:${partition}:ec2:${region}:*:launch-template/*`,
            `arn:${partition}:ec2:${region}:*:spot-instances-request/*`,
          ],
          Action: [
            "ec2:CreateTags",
          ],
          Condition: {
            StringEquals: {
              [`ec2:CreateAction`]: [
                "RunInstances",
                "CreateFleet",
                "CreateLaunchTemplate",
              ],
            },
          },
        },
        {
          Sid: "AllowScopedResourceCreationTagging",
          Effect: "Allow",
          Resource: [
            `arn:${partition}:ec2:${region}:*:fleet/*`,
            `arn:${partition}:ec2:${region}:*:instance/*`,
            `arn:${partition}:ec2:${region}:*:volume/*`,
            `arn:${partition}:ec2:${region}:*:network-interface/*`,
            `arn:${partition}:ec2:${region}:*:launch-template/*`,
            `arn:${partition}:ec2:${region}:*:spot-instances-request/*`,
          ],
          Action: [
            "ec2:CreateTags",
          ],
          Condition: {
            StringEquals: {
              [`ec2:CreateAction`]: [
                "RunInstances",
                "CreateFleet",
                "CreateLaunchTemplate",
              ],
            },
          },
        },
        {
          Sid: "AllowScopedDeletion",
          Effect: "Allow",
          Resource: [
            `arn:${partition}:ec2:${region}:*:instance/*`,
            `arn:${partition}:ec2:${region}:*:launch-template/*`,
          ],
          Action: [
            "ec2:TerminateInstances",
            "ec2:DeleteLaunchTemplate",
            "ec2:DeleteLaunchTemplateVersions",
          ],
          Condition: {
            StringLike: {
              [`ec2:ResourceTag/karpenter.sh/cluster`]: cluster.clusterName,
            },
          },
        },
        {
          Sid: "AllowRegionalReadActions",
          Effect: "Allow",
          Resource: "*",
          Action: [
            "ec2:DescribeAvailabilityZones",
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
      ],
    };
  }
}