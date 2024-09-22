# ells-assistant
docker build -t ells-assistant .

docker run -d --name my-container -e GOOGLE_APPLICATION_CREDENTIALS="/home/googleauth.json" -v /home/googleauth.json:/home/googleauth.json -p 3002:3000 ells-assistant
