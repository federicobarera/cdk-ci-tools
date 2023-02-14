import {
  getContextFromConstruct,
  ResourceLookup,
  BasePipelineProps,
  BasePipeline,
} from "@federico.barera/cdk-ci-tools-constructs";
import {
  CrossAccountPipeline,
  CrossRegionArtifactsBucketLookup,
} from "@federico.barera/cdk-ci-tools-constructs/pipelines";

import { Construct } from "constructs";
import { ServiceStack } from "./service-stack";

export class CrossAccountPipelineStack extends BasePipeline {
  constructor(scope: Construct, id: string, props: BasePipelineProps) {
    super(scope, id, props);

    const dockerSecretName =
      this.context.tryGet<ResourceLookup>("dockerSecretName");
    const notificationsSnsArn = this.context.tryGet<ResourceLookup>(
      "notificationsSnsArn"
    );
    const chatbotArn = this.context.tryGet<ResourceLookup>("chatbotArn");
    const logsGroupName = this.context.tryGet<ResourceLookup>("logsGroupName");
    const crossRegionArtifactBuckets =
      this.context.tryGet<CrossRegionArtifactsBucketLookup>(
        "crossRegionArtifactBuckets"
      );
    const intergrationTestsRoleArn = this.context.tryGet<string>(
      "intergrationTestsRoleArn"
    );
    const codeStarConnection = this.context.tryGet("codeStarConnection");
    const repositoryType = this.context.tryGet("repositoryType");

    new CrossAccountPipeline(this, "Pipeline", {
      ...props,
      stagingAccount: getContextFromConstruct(
        this,
        "stag"
      ).getStackEnvironment(),
      productionAccount: getContextFromConstruct(
        this,
        "prod"
      ).getStackEnvironment(),
      dockerSecretName,
      notificationsSnsArn,
      chatbotArn,
      logsGroupName,
      crossRegionArtifactBuckets,
      stack: ServiceStack,
      intergrationTestsRoleArn,
      codeStarConnection,
      repositoryType,
      synthCodeBuildDefaults: {
        partialBuildSpec: {
          reports: {
            junitReports: {
              files: ["**/reports/*.xml"],
              "file-format": "JUNITXML",
            },
          },
        },
      },
      scripts: {
        build: `bash ./infrastructure/bin/build.sh`,
        test: `bash ./infrastructure/bin/test.sh`,
        postDeploy: `bash ./infrastructure/bin/post-deployment.sh`,
        integrationTests: `bash ./infrastructure/bin/integration-test.sh`,
      },
    });
  }
}
