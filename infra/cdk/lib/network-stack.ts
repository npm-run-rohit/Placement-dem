import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { type Construct } from 'constructs';

/** Two AZs; public (ALB, NAT), app (ECS tasks) and isolated db (RDS, Redis) subnets. Same layout as bk-uw2. */
export class NetworkStack extends Stack {
  public readonly vpc: ec2.IVpc;

  /** Explicit AZs: avoids the availability-zones context lookup so synth needs no AWS credentials. */
  public get availabilityZones(): string[] {
    return [`${this.region}a`, `${this.region}b`];
  }

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Static egress IP: BimaSetu / Copycat / Sahayak may allow-list our outbound calls.
    const eip = new ec2.CfnEIP(this, 'NatEip', { domain: 'vpc' });

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: ec2.NatProvider.gateway({ eipAllocationIds: [eip.attrAllocationId] }),
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'db', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    new CfnOutput(this, 'NatEgressIp', {
      value: eip.attrPublicIp,
      description: 'Static egress IP for outbound calls (partner allow-lists)',
    });
  }
}
