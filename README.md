# ells-assistant flow

![image](https://github.com/user-attachments/assets/16ed05cf-319f-4207-ac3a-792a7e5f8f2c)

#panduan

https://ells.sukipli.work/

#build

docker build -t ells-assistant .

#run

docker run -d --name my-container -e GOOGLE_APPLICATION_CREDENTIALS="/home/googleauth.json" -v /home/googleauth.json:/home/googleauth.json -p 3002:2024 ells-assistant
