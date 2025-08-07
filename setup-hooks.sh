#!/bin/bash

# Setup script to configure Git hooks for the project

echo "Setting up Git hooks..."

# Make hooks executable
chmod +x .githooks/pre-commit

# Configure Git to use the .githooks directory
git config core.hooksPath .githooks

echo "✓ Git hooks configured successfully"
echo "cargo fmt will now run automatically on every commit for Rust files in block-monitor/"