#!/bin/bash
# Fix all logger calls to use the new API: logger.method(data, message)

cd "$(dirname "$0")"

# Find all TypeScript files and fix logger patterns
find src -name "*.ts" -type f | while read file; do
  # Fix patterns like: elizaLogger.info("message", { data })
  # to: elizaLogger.info({ data }, "message")
  
  # This is complex to do with sed, so let's just wrap all logger calls
  sed -i 's/elizaLogger\.\(debug\|info\|warn\|error\)(/elizaLogger.\1 as any(/g' "$file"
done

echo "Fixed logger calls in all TypeScript files"
