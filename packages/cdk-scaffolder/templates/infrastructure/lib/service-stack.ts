import { Construct } from "constructs";
import {
  BaseStack,
  BaseStackProps,
} from "@federico.barera/cdk-ci-tools-constructs";

export type ServiceStackProps = BaseStackProps;

export class ServiceStack extends BaseStack {
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);
  }
}
