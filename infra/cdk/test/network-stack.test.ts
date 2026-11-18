import { buildStacks } from './helpers';

describe('NetworkStack', () => {
  const { network } = buildStacks();

  test('one NAT gateway with a static egress IP, public / app / db subnets in two AZs', () => {
    network.resourceCountIs('AWS::EC2::NatGateway', 1);
    network.resourceCountIs('AWS::EC2::EIP', 1);
    network.resourceCountIs('AWS::EC2::Subnet', 6);
  });
});
