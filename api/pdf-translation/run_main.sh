gcloud auth print-access-token | sudo docker login -u oauth2accesstoken --password-stdin https://asia-northeast3-docker.pkg.dev

sudo docker stop shizue-main || true
sudo docker rm shizue-main || true

sudo docker pull asia-northeast3-docker.pkg.dev/chapssal/shizue/main-server

sudo docker run -d \
  --name shizue-main \
  --restart=unless-stopped \
  -p 8000:8000 \
  asia-northeast3-docker.pkg.dev/chapssal/shizue/main-server
