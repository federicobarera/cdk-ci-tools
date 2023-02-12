import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import { IConstruct } from "constructs";

export class KmsRetentionAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof kms.CfnKey || node instanceof kms.CfnAlias) {
      const resource = node as cdk.CfnResource;
      resource.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    }
  }
}

export class KmsKeyRotationAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof kms.CfnKey) {
      const key = node as kms.CfnKey;
      key.enableKeyRotation = true;
    }
  }
}
