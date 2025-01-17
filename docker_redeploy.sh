#!/bin/bash

docker stop -t 600 email
docker wait email
docker rm email
docker build -t hcdp_email_api .
docker run --restart on-failure --name=email -d -p 443:443 \
-v /mnt/netapp/ikewai/annotated/HCDP:/data \
-v /home/ikewai/hcdp_email_api/logs:/logs \
-v /home/ikewai/hcdp_email_api/api/certs/live/cistore.its.hawaii.edu/fullchain.pem:/usr/src/app/cert.pem \
-v /home/ikewai/hcdp_email_api/api/certs/live/cistore.its.hawaii.edu/privkey.pem:/usr/src/app/key.pem \
hcdp_email_api