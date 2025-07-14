gcloud auth print-access-token | sudo docker login -u oauth2accesstoken --password-stdin https://asia-northeast3-docker.pkg.dev

echo "Building main server image for AMD64..."
docker buildx build --platform linux/amd64 \
  -t asia-northeast3-docker.pkg.dev/chapssal/shizue/main-server \
  -f Dockerfile.main \
  --push .

echo "Building worker server image for AMD64..."
docker buildx build --platform linux/amd64 \
  -t asia-northeast3-docker.pkg.dev/chapssal/shizue/worker-server \
  -f Dockerfile.worker \
  --push .

echo "Build and push completed!"
