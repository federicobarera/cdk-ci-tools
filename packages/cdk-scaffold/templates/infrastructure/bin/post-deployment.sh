#!/bin/bash
set -e

echo "Entering $ENV post deployment phase..."

if [ "$ENV" = "prod" ]; then
  git config --global user.email "platform@reachplc.com"
  git config --global user.name "Pipeline"

  REMOTE=$(git remote get-url origin)
  echo "Remote url is $REMOTE"
  echo "Creating and pushing tags..."
  git tag prod-`date +%s`
  git push --tags
fi