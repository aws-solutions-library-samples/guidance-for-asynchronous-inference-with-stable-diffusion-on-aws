import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as blueprints from '@aws-quickstart/eks-blueprints';

/**
 * VPC resource provider with a single NAT Gateway to reduce cost.
 * Creates a VPC with public and private subnets across all AZs,
 * but uses only one NAT Gateway instead of one per AZ.
 */
export class SingleNatVpcProvider implements blueprints.ResourceProvider<ec2.IVpc> {
  constructor(private readonly primaryCidr?: string) {}

  provide(context: blueprints.ResourceContext): ec2.IVpc {
    const id = context.scope.node.id;
    return new ec2.Vpc(context.scope, id + "-vpc", {
      ...(this.primaryCidr && { ipAddresses: ec2.IpAddresses.cidr(this.primaryCidr) }),
      natGateways: 1,
    });
  }
}
