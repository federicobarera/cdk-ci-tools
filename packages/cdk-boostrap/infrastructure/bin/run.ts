#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as logs from "aws-cdk-lib/aws-logs";
import * as chatbot from "aws-cdk-lib/aws-chatbot";
import * as iam from "aws-cdk-lib/aws-iam";
import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";
import { RemoteOutputs } from "cdk-remote-stack";

const app = new cdk.App();

type CreationContext = {
  scaffoldRegions: string[];
  trustedRoles: {
    account: string;
    role: string;
  }[];
  integrationTestRole?: {
    name: string;
    assumedByAccounts: string[];
    conditionalAccounts: string[];
  };
  dockerHubSecret?: {
    name: string;
    username?: string;
  };
  npmSecret?: {
    name: string;
  };
  repositories?: {
    name: string;
    client_id: string;
  };
  chatBot?: {
    name: string;
    slackWorkspaceId: string;
    slackChannelId: string;
  };
  codeStarConnection?: {
    provider: string;
    name: string;
  };
};

const createGlobalStack = (context: CreationContext) => {
  const globalStack = new cdk.Stack(app, `Pipeline-Support-Global`, {
    env: {
      region: "us-east-1",
      account: account,
    },
    stackName: `cdk-boostrap-support-global`,
  });

  if (context.chatBot !== undefined) {
    const slackChannel = new chatbot.SlackChannelConfiguration(
      globalStack,
      "SlackChannel",
      {
        slackChannelId: context.chatBot?.slackChannelId ?? "",
        slackWorkspaceId: context.chatBot?.slackWorkspaceId ?? "",
        slackChannelConfigurationName: `${context.chatBot?.name}-${account}`,
        logRetention: logs.RetentionDays.ONE_MONTH,
      }
    );

    new cdk.CfnOutput(globalStack, "SlackChannelOutput", {
      value: slackChannel.slackChannelConfigurationArn,
    });
  }

  if (context.integrationTestRole !== undefined) {
    const integrationTestRole = new iam.Role(
      globalStack,
      "IntegrationTestRole",
      {
        roleName: context.integrationTestRole.name,
        managedPolicies: [
          iam.ManagedPolicy.fromManagedPolicyArn(
            globalStack,
            "PowerUserAccessPolicy",
            "arn:aws:iam::aws:policy/PowerUserAccess"
          ),
        ],

        maxSessionDuration: cdk.Duration.hours(1), //cannot be lower than this
        assumedBy: new iam.CompositePrincipal(
          ...context.integrationTestRole.assumedByAccounts.map(
            (x) =>
              new iam.PrincipalWithConditions(new iam.AccountPrincipal(x), {
                StringEquals: {
                  "aws:PrincipalTag/source": "cdk-pipeline",
                },
              })
          )
        ),
      }
    );

    new cdk.CfnOutput(globalStack, "integrationTestRoleOutput", {
      value: integrationTestRole.roleName,
    });
  }

  if (context.codeStarConnection !== undefined) {
    const connection = new codestarconnections.CfnConnection(
      globalStack,
      "CodeStarConnection",
      {
        providerType: context.codeStarConnection.provider,
        connectionName: context.codeStarConnection.name,
      }
    );

    new cdk.CfnOutput(globalStack, "CodeStarConnectionOutput", {
      value: connection.attrConnectionArn,
    });
  }

  return globalStack;
};

const account = app.node.tryGetContext("target")?.toString();
if (!account) throw "Target context required";

const context = app.node.tryGetContext(account) as CreationContext;
const tags = {
  repository: "cdk-boostrap",
  service: "cdk-boostrap",
  product: "cdk",
  team: "platform",
};

console.log("Applying context:");
console.log(context);

const scaffoldedRegions: [string, cdk.Stack][] = context.scaffoldRegions.map(
  (region) => {
    const stack = new cdk.Stack(app, `Pipeline-Support-${region}`, {
      env: {
        region,
        account: account,
      },
      stackName: `cdk-bootstrap-support-${region}`,
    });

    const key = new kms.Key(stack, "BucketEncryptionKey", {
      alias: `cdk-bootstrap-artifacts-key-${region}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enableKeyRotation: true,
    });

    const accessLogsBucket = new s3.Bucket(stack, "AccessLogBucket", {
      bucketName: `cdk-boostrap-access-logs-${account}-${region}`,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    accessLogsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "S3ServerLoggingTarget",
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject", "s3:PutObjectAcl"],
        resources: [
          accessLogsBucket.bucketArn,
          accessLogsBucket.arnForObjects("*"),
        ],
        principals: [new iam.AccountPrincipal(account)],
      })
    );

    const artifactsBucket = new s3.Bucket(stack, "ArtifactsBucket", {
      bucketName: `cdk-bootstrap-artifacts-${account}-${region}`,
      encryptionKey: key,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: `cdk-boostrap-artifacts-${account}-${region}`,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    const codeBuildLogGroup = new logs.LogGroup(stack, "CodeBuildLogs", {
      logGroupName: "cdk-bootstrap-codebuild-logs",
      retention: logs.RetentionDays.ONE_MONTH,
    });

    if (context.dockerHubSecret) {
      const dockerHubSecret = new secretsmanager.Secret(
        stack,
        "DockerHubSecret",
        {
          description: "Contains credentials to connect to DockerHub",
          secretName: `${context.dockerHubSecret?.name}-${account}-${region}`,
          generateSecretString: {
            secretStringTemplate: JSON.stringify({
              username: context.dockerHubSecret?.username,
            }),
            generateStringKey: "secret",
          },
        }
      );

      new cdk.CfnOutput(stack, "DockerHubSecretOutput", {
        value: dockerHubSecret.secretName,
      });
    }

    if (context.npmSecret) {
      const npmSecret = new secretsmanager.Secret(stack, "NpmSecret", {
        description: "Contains an access token for npm",
        secretName: `${context.npmSecret?.name}-${account}-${region}`,
      });

      new cdk.CfnOutput(stack, "NpmSecretOutput", {
        value: npmSecret.secretName,
      });
    }

    if (context.repositories) {
      const repositorySecret = new secretsmanager.Secret(
        stack,
        "RepositorySecret",
        {
          description:
            "Contains the client credential apps to communicate with a third party repository",
          secretName: `${context.repositories.name}-${account}-${region}`,
          generateSecretString: {
            secretStringTemplate: JSON.stringify({
              client_id: !!context.repositories.client_id
                ? context.repositories.client_id
                : "[INSERT]",
            }),
            generateStringKey: "client_secret",
          },
        }
      );

      new cdk.CfnOutput(stack, "RepositorySecretOutput", {
        value: repositorySecret.secretName,
      });
    }

    for (const role of context.trustedRoles) {
      const allowedRole = new iam.ArnPrincipal(
        `arn:aws:iam::${role.account}:role/${role.role}-${region}`
      );
      artifactsBucket.grantRead(allowedRole);
      key.grantDecrypt(allowedRole);
    }

    /**
     * Outputs
     */

    new cdk.CfnOutput(stack, "ArtifactsBucketOutput", {
      value: artifactsBucket.bucketArn,
    });

    new cdk.CfnOutput(stack, "ArtifactsBucketKeyOutput", {
      value: key.keyArn,
    });

    new cdk.CfnOutput(stack, "LoggingBucketOutput", {
      value: accessLogsBucket.bucketName,
    });

    new cdk.CfnOutput(stack, "CodeBuildLogsOutput", {
      value: codeBuildLogGroup.logGroupName,
    });

    Object.keys(tags)
      .map((key) => [key, tags[key as keyof typeof tags]])
      .forEach(([key, value]) => {
        cdk.Tags.of(stack).add(key, value);
      });

    return [region, stack];
  }
);

const globalStack = createGlobalStack(context);

context.scaffoldRegions.forEach((ciRegion) => {
  const outputStack = new cdk.Stack(
    app,
    `Pipeline-Support-Outputs-${ciRegion}`,
    {
      env: {
        region: ciRegion,
        account: account,
      },
      stackName: `cdk-boostrap-support`,
    }
  );

  outputStack.addDependency(globalStack);

  const globalExports: [string | undefined, string][] = [
    [context.chatBot?.name, "SlackChannelOutput"],
    [context.integrationTestRole?.name, "integrationTestRoleOutput"],
    [context.codeStarConnection?.name, "CodeStarConnectionOutput"],
  ];

  let globalOutputs: RemoteOutputs | undefined;
  globalExports.forEach(([exportName, outputName]) => {
    if (!globalOutputs) {
      globalOutputs = new RemoteOutputs(outputStack, `Outputs-Global`, {
        stack: globalStack,
      });
    }
    if (exportName !== undefined) {
      new cdk.CfnOutput(outputStack, outputName, {
        value: outputName.startsWith("arn:")
          ? outputName
          : globalOutputs.get(outputName),
        exportName: exportName,
      });
    }
  });

  scaffoldedRegions.forEach(([region, stack]) => {
    outputStack.addDependency(stack);

    const outputs = new RemoteOutputs(outputStack, `Outputs-${region}`, {
      stack: stack,
    });

    const regionalExportsKeys: [string | undefined, string][] = [
      ["cdk-boostrap-artifacts", "ArtifactsBucketOutput"],
      ["cdk-bootstrap-artifacts-key", "ArtifactsBucketKeyOutput"],
      ["cdk-boostrap-access-logs", "LoggingBucketOutput"],
      ["cdk-bootstrap-codebuild-logs", "CodeBuildLogsOutput"],

      [context.repositories?.name, "RepositorySecretOutput"],
      [context.npmSecret?.name, "NpmSecretOutput"],
      [context.dockerHubSecret?.name, "DockerHubSecretOutput"],
    ];

    for (const exportKey of regionalExportsKeys) {
      const [exportName, exportId] = exportKey;

      if (exportName) {
        new cdk.CfnOutput(outputStack, `${exportId}-${region}`, {
          value: outputs.get(exportId),
          exportName: `${exportName}-${region}`,
        });

        if (region === ciRegion) {
          new cdk.CfnOutput(outputStack, `${exportId}`, {
            value: outputs.get(exportId),
            exportName: `${exportName}`,
          });
        }
      }
    }
  });
});
