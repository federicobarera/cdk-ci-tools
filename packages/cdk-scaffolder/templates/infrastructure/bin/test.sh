#!/bin/bash
set -e

echo "Entering test phase..."

echo "Install dependencies..."
pip3 install checkov==2.0.1155

echo "Creating reports folder..."
mkdir -p reports/

echo "Running project tests..."
npm test

echo "Running infrastructure tests..."
checkov --config-file checkov.yaml