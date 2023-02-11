import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";

export const allowSecretsFromSecretManager =
  (lambda: lambda.Function) => (secrets: Record<string, string>) => {
    lambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ],
        resources: Object.values(secrets).map(
          (secretName) =>
            `arn:aws:secretsmanager:*:${
              cdk.Stack.of(lambda).account
            }:secret:${secretName}*`
        ),
      })
    );
  };
