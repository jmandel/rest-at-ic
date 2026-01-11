#!/bin/bash
# Generate S3 ListBucket XML manifests for demo repo

REPO_DIR="${1:-demo/demo-repo}"
MANIFEST_DIR="$REPO_DIR/_manifest"

mkdir -p "$MANIFEST_DIR"

generate_manifest() {
  local type=$1
  local prefix=$2
  local output="$MANIFEST_DIR/$type.xml"
  
  echo '<?xml version="1.0" encoding="UTF-8"?>' > "$output"
  echo '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' >> "$output"
  echo "  <Name>demo-repo</Name>" >> "$output"
  echo "  <Prefix>$prefix/</Prefix>" >> "$output"
  echo "  <IsTruncated>false</IsTruncated>" >> "$output"
  
  for f in "$REPO_DIR/$prefix"/*; do
    if [ -f "$f" ]; then
      fname=$(basename "$f")
      echo "  <Contents><Key>$prefix/$fname</Key></Contents>" >> "$output"
    fi
  done
  
  echo '</ListBucketResult>' >> "$output"
  echo "Generated $output"
}

generate_manifest "keys" "keys"
generate_manifest "snapshots" "snapshots"
generate_manifest "index" "index"

echo "Done!"
