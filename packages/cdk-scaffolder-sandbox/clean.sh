#!/bin/bash

git checkout HEAD -- ./package.json 2> /dev/null
git checkout HEAD -- ./.eslintignore 2> /dev/null
git checkout HEAD -- ./.gitignore 2> /dev/null
rm -rf ./infrastructure 2> /dev/null
rm -rf ./cdk.out 2> /dev/null
rm ./package-lock.json 2> /dev/null
rm cdk.json 2> /dev/null
rm cdk.context.json 2> /dev/null
rm tsconfig.infrastructure.json 2> /dev/null
rm checkov.yaml 2> /dev/null