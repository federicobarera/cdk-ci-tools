#!/bin/bash
set -e

if [ "${INTEGRATION_TESTS_ROLE_ARN}" -a "${REPO_NAME}" ]; then
  echo "Assuming Integration Test Role..."
  
  SESSION_NAME=$(echo "${REPO_NAME}" | sed -e 's/[^A-Za-z+=,.@-]/-/g')
  OUT=$(aws sts assume-role --role-arn ${INTEGRATION_TESTS_ROLE_ARN} --role-session-name ${SESSION_NAME});\
  export AWS_ACCESS_KEY_ID=$(echo $OUT | jq -r '.Credentials''.AccessKeyId');\
  export AWS_SECRET_ACCESS_KEY=$(echo $OUT | jq -r '.Credentials''.SecretAccessKey');\
  export AWS_SESSION_TOKEN=$(echo $OUT | jq -r '.Credentials''.SessionToken');
fi

echo "Entering integration test phase..."
echo "No actions"