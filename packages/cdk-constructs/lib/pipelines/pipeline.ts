import * as cdk from "aws-cdk-lib";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as codePipeline from "aws-cdk-lib/aws-codepipeline";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as notifications from "aws-cdk-lib/aws-codestarnotifications";
import * as chatbot from "aws-cdk-lib/aws-chatbot";
import * as sns from "aws-cdk-lib/aws-sns";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { isMainBranch, nonUndefined, map, mapOr } from "../common/utils";
import {
  ContextualConstructProps,
  NamingConstruct,
  NewableBaseStack,
  StackName,
} from "../common/constructs";
import {
  CodeBuildLoggingAspect,
  CodeBuildTagAspect,
  SkipCheckovRuleAspect,
} from "../aspects/codebuild";
import { ResourceLookup } from "../common/context";
import { Construct } from "constructs";

export type CrossRegionArtifactsBucketLookup = {
  [region: string]: {
    bucketArn: ResourceLookup;
    keyArn: ResourceLookup;
  };
};

/**
 * This type is necessary as injected partialBuildSpec do cause build time issues
 */
type CodeBuildOptions = Omit<
  cdk.pipelines.CodeBuildOptions,
  "partialBuildSpec"
> & {
  partialBuildSpec?: Record<string, any>;
};

export type CrossAccountPipelineProps = Omit<
  ContextualConstructProps,
  "name"
> & {
  stagingAccount: cdk.Environment;
  productionAccount: cdk.Environment;
  notificationsSnsArn?: ResourceLookup;
  chatbotArn?: ResourceLookup;
  notificationTypes?: PipelineNotificationType[];
  dockerSecretName?: ResourceLookup;
  logsGroupName?: ResourceLookup;
  stack: NewableBaseStack;
  scripts?: {
    build?: string;
    test?: string;
    postDeploy?: string;
    integrationTests?: string;
  };
  synthCodeBuildDefaults?: CodeBuildOptions;
  codeBuildDefaults?: CodeBuildOptions;
  assetPublishingCodeBuildDefaults?: CodeBuildOptions;
  crossRegionArtifactBuckets?: CrossRegionArtifactsBucketLookup;
  intergrationTestsRoleArn?: iam.Role["roleArn"];
  codeStarConnection?: ResourceLookup;
  repositoryType?: string;
};

/**
 * https://docs.aws.amazon.com/dtconsole/latest/userguide/concepts.html
 */
export enum PipelineNotificationType {
  ACTION_EXECUTION_SUCCEEDED = "codepipeline-pipeline-action-execution-succeeded",
  ACTION_EXECUTION_FAILED = "codepipeline-pipeline-action-execution-failed",
  ACTION_EXECUTION_CANCELED = "codepipeline-pipeline-action-execution-canceled",
  ACTION_EXECUTION_STARTED = "codepipeline-pipeline-action-execution-started",

  STAGE_EXECUTION_STARTED = "codepipeline-pipeline-stage-execution-started",
  STAGE_EXECUTION_SUCCEEDED = "codepipeline-pipeline-stage-execution-succeeded",
  STAGE_EXECUTION_RESUMED = "codepipeline-pipeline-stage-execution-resumed",
  STAGE_EXECUTION_CANCELED = "codepipeline-pipeline-stage-execution-canceled",
  STAGE_EXECUTION_FAILED = "codepipeline-pipeline-stage-execution-failed",

  PIPELINE_EXECUTION_FAILED = "codepipeline-pipeline-pipeline-execution-failed",
  PIPELINE_EXECUTION_CANCELED = "codepipeline-pipeline-pipeline-execution-canceled",
  PIPELINE_EXECUTION_STARTED = "codepipeline-pipeline-pipeline-execution-started",
  PIPELINE_EXECUTION_RESUMED = "codepipeline-pipeline-pipeline-execution-resumed",
  PIPELINE_EXECUTION_SUCCEEDED = "codepipeline-pipeline-pipeline-execution-succeeded",
  PIPELINE_EXECUTION_SUPERSEDED = "codepipeline-pipeline-pipeline-execution-superseded",

  MANUAL_APPROVAL_FAILED = "codepipeline-pipeline-manual-approval-failed",
  MANUAL_APPROVAL_NEEDED = "codepipeline-pipeline-manual-approval-needed",
  MANUAL_APPROVAL_SUCCEEDED = "codepipeline-pipeline-manual-approval-succeeded",
}

export class CrossAccountPipeline extends NamingConstruct {
  private getArtifactsBuckets() {
    return this.props.crossRegionArtifactBuckets !== undefined
      ? Object.keys(this.props.crossRegionArtifactBuckets)
          .map((region: keyof CrossRegionArtifactsBucketLookup) => [
            region,
            s3.Bucket.fromBucketAttributes(this, `ArtifactBucket-${region}`, {
              bucketArn: this.resolveLookup(
                this.props.crossRegionArtifactBuckets![region].bucketArn
              ),
              encryptionKey: kms.Key.fromKeyArn(
                this,
                `ArtifactsKey-${region}`,
                this.resolveLookup(
                  this.props.crossRegionArtifactBuckets![region].keyArn
                )
              ),
            }),
          ])
          .reduce(
            (acc, [key, bucket]) => ({
              ...acc,
              [key as string]: bucket as s3.IBucket,
            }),
            {}
          )
      : undefined;
  }

  private getDockerSecrets() {
    if (!this.props.dockerSecretName) return undefined;

    const dockerHubSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "DockerSecrets",
      this.resolveLookup(this.props.dockerSecretName)
    );

    return [
      pipelines.DockerCredential.dockerHub(dockerHubSecret),
      pipelines.DockerCredential.customRegistry(
        "https://index.docker.io/v1/",
        dockerHubSecret
      ),
    ];
  }

  private createCodeBuildEnv(opt: {
    codeCommitRepo: codecommit.IRepository | undefined;
    env?: Record<string, string>;
    script: [string, string];
    props: CrossAccountPipelineProps;
  }) {
    return new pipelines.CodeBuildStep(opt.script[1], {
      commands: [opt.script[0]],
      env: {
        INTEGRATION_TESTS_ROLE_ARN: opt.props.intergrationTestsRoleArn ?? "",
        REPO_NAME: opt.props.tags.repository,
        ...opt.env,
      },
      buildEnvironment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      partialBuildSpec: codebuild.BuildSpec.fromObject({
        env: {
          "git-credential-helper": "yes",
        },
      }),
      rolePolicyStatements: map((repo: codecommit.IRepository) => [
        new iam.PolicyStatement({
          actions: ["codecommit:*"],
          resources: [repo.repositoryArn],
        }),
      ])(opt.codeCommitRepo),
    });
  }

  private toNativeBuildSpec = (
    opt?: CodeBuildOptions
  ): pipelines.CodeBuildOptions | undefined => {
    if (!opt) return undefined;

    const { partialBuildSpec, ...others } = opt;
    return {
      ...others,
      partialBuildSpec: !!partialBuildSpec
        ? codebuild.BuildSpec.fromObject(partialBuildSpec)
        : undefined,
    };
  };

  public pipeline: pipelines.CodePipeline;

  constructor(
    scope: Construct,
    id: string,
    protected props: CrossAccountPipelineProps
  ) {
    super(scope, id, {
      name: cdk.Stack.of(scope).stackName,
    });

    const { branch, stagingAccount, productionAccount, tags } = props;

    let source: pipelines.CodePipelineSource;
    let codeCommitRepo: codecommit.IRepository | undefined;

    if (
      props.repositoryType != "codecommit" &&
      props.codeStarConnection !== undefined
    ) {
      source = pipelines.CodePipelineSource.connection(
        tags.repository,
        branch,
        {
          triggerOnPush: true,
          connectionArn: this.resolveLookup(props.codeStarConnection),
          codeBuildCloneOutput: true,
        }
      );
    } else {
      codeCommitRepo = codecommit.Repository.fromRepositoryName(
        this,
        "SourceRepository",
        tags.repository
      );
      source = pipelines.CodePipelineSource.codeCommit(codeCommitRepo, branch, {
        codeBuildCloneOutput: true,
      });
    }

    const synth = new pipelines.ShellStep("Synth", {
      input: source,
      env: {
        INTEGRATION_TESTS_ROLE_ARN: props.intergrationTestsRoleArn ?? "",
        REPO_NAME: tags.repository,
      },
      commands: [
        props.scripts?.build,
        `npx cdk synth --context branch=${branch} --verbose`,
        props.scripts?.test,
      ].filter((x) => x !== undefined) as string[],
    });

    const corePipeline = new codePipeline.Pipeline(this, "CodePipeline", {
      crossRegionReplicationBuckets: this.getArtifactsBuckets(),
      restartExecutionOnUpdate: true,
      pipelineName: cdk.Stack.of(this).stackName,
      crossAccountKeys: stagingAccount?.account !== productionAccount?.account,
    });

    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      synth,
      codePipeline: corePipeline,
      dockerCredentials: this.getDockerSecrets(),
      assetPublishingCodeBuildDefaults: this.toNativeBuildSpec(
        props.assetPublishingCodeBuildDefaults
      ),
      synthCodeBuildDefaults: this.toNativeBuildSpec(
        props.synthCodeBuildDefaults
      ),
      codeBuildDefaults: this.toNativeBuildSpec({
        ...props.codeBuildDefaults,
        rolePolicy: [
          ...mapOr(
            (statements: iam.PolicyStatement[]) => statements,
            () => []
          )(props.codeBuildDefaults?.rolePolicy),
          ...mapOr(
            (integrationRoleArn: string) => [
              new iam.PolicyStatement({
                actions: ["sts:AssumeRole"],
                resources: [integrationRoleArn],
              }),
            ],
            () => []
          )(props?.intergrationTestsRoleArn),
        ],
      }),
      dockerEnabledForSynth: true,
    });

    pipeline.addStage(
      new ServiceDeploymentStage(this, "Staging", {
        ...props,
        environment: "stag",
        env: stagingAccount,
      }),
      {
        post: [
          [props.scripts?.integrationTests, "Integration Tests Staging"],
          [props.scripts?.postDeploy, "Post Deployment Staging"],
        ]
          .filter((x): x is [string, string] => x[0] !== undefined)
          .map((x) =>
            this.createCodeBuildEnv({
              codeCommitRepo: codeCommitRepo,
              env: {
                ENV: "stag",
              },
              props: this.props,
              script: x,
            })
          ),
      }
    );

    if (isMainBranch(branch)) {
      pipeline.addWave("Approval", {
        pre: [
          new pipelines.ManualApprovalStep("Approve Promotion", {
            comment: "Promote to production",
          }),
        ],
      });

      pipeline.addStage(
        new ServiceDeploymentStage(this, "Production", {
          ...props,
          environment: "prod",
          env: productionAccount,
        }),
        {
          post: [[props.scripts?.postDeploy, "Post Deployment Prod"]]
            .filter((x): x is [string, string] => x[0] !== undefined)
            .map((x) =>
              this.createCodeBuildEnv({
                codeCommitRepo: codeCommitRepo,
                env: {
                  ENV: "prod",
                },
                props: this.props,
                script: x,
              })
            ),
        }
      );
    }

    pipeline.buildPipeline();

    if (
      props.notificationsSnsArn !== undefined ||
      props.chatbotArn !== undefined
    ) {
      new notifications.NotificationRule(this, "Notification", {
        detailType: notifications.DetailType.BASIC,
        notificationRuleName: this.name("notifications"),
        events: (
          props.notificationTypes ?? [
            PipelineNotificationType.PIPELINE_EXECUTION_STARTED,
            PipelineNotificationType.PIPELINE_EXECUTION_FAILED,
            PipelineNotificationType.PIPELINE_EXECUTION_SUCCEEDED,
            PipelineNotificationType.MANUAL_APPROVAL_SUCCEEDED,
          ]
        ).map((x) => x.toString()),
        source: pipeline.pipeline,
        targets: [
          map((v: ResourceLookup) =>
            chatbot.SlackChannelConfiguration.fromSlackChannelConfigurationArn(
              this,
              "SlackTarget",
              this.resolveLookup(v)
            )
          )(props.chatbotArn),
          map((v: ResourceLookup) =>
            sns.Topic.fromTopicArn(
              this,
              "NotificationTopic",
              this.resolveLookup(v)
            )
          )(props.notificationsSnsArn),
        ].filter(nonUndefined),
      });
    }

    if (props.logsGroupName) {
      cdk.Aspects.of(this).add(
        new CodeBuildLoggingAspect(this.resolveLookup(props.logsGroupName))
      );
    }

    cdk.Aspects.of(this).add(
      new SkipCheckovRuleAspect([
        {
          code: "CKV_AWS_111",
          reasonDescription: "Pipeline CodeBuild Policies are autogenerated",
        },
      ])
    );

    cdk.Aspects.of(this).add(
      new CodeBuildTagAspect([["source", "cdk-pipeline"]])
    );

    this.pipeline = pipeline;
  }
}

type ServiceDeploymentStageProps = cdk.StageProps &
  Omit<ContextualConstructProps, "name"> & {
    stack: NewableBaseStack;
  };

class ServiceDeploymentStage extends cdk.Stage {
  constructor(
    scope: Construct,
    id: string,
    props: ServiceDeploymentStageProps
  ) {
    super(scope, id, props);

    new props.stack(this, "ServiceStack", {
      tags: props.tags,
      environment: props.environment,
      branch: props.branch,

      env: props.env,
      stackName: StackName.GENERATE_FROM_PROPS,
    });
  }
}

export default CrossAccountPipeline;
