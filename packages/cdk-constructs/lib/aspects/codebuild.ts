import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { IConstruct } from "constructs";
import { skipCheckovRules } from "../common/utils";

export class CodeBuildLoggingAspect implements cdk.IAspect {
  constructor(public groupName: string) {}

  visit(node: IConstruct): void {
    if (node instanceof codebuild.Project) {
      const proj = node as codebuild.Project;

      proj.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: [
            `arn:aws:logs:*:*:log-group:${this.groupName}`,
            `arn:aws:logs:*:*:log-group:${this.groupName}:*`,
          ],
          actions: ["logs:*"],
        })
      );
    }

    if (node instanceof codebuild.CfnProject) {
      const proj = node as codebuild.CfnProject;

      proj.logsConfig = {
        cloudWatchLogs: {
          groupName: this.groupName,
          status: "ENABLED",
        },
      };
    }
  }
}

export class SkipCheckovRuleAspect implements cdk.IAspect {
  constructor(public rules: { code: string; reasonDescription: string }[]) {}

  visit(node: IConstruct): void {
    if (node instanceof iam.Policy) {
      skipCheckovRules({ rules: this.rules, resource: node });
    }
  }
}

export class CodeBuildTagAspect implements cdk.IAspect {
  constructor(public tags: [string, string][]) {}

  visit(node: IConstruct): void {
    if (node instanceof codebuild.Project) {
      const proj = node as codebuild.Project;

      this.tags.forEach(([key, value]) => {
        cdk.Tags.of(proj.role!).add(key, value);
      });
    }
  }
}
