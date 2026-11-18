# ClamAV down

**Alarm:** `placement-prod-clamav-down`. No ClamAV task is running.

**Impact:**

- **Uploads:** every upload is refused. Files are scanned before storage (PLAN 4.5), and the scan fails closed.
- **Mail attachments:** inbound attachments can't be scanned, so they are dropped and the mail goes to Manual Review.

## Check

ECS console > `placement-prod-clamav`:

- **Health check failing at start:** on first boot freshclam downloads the signatures, which takes a few minutes and
  is covered by the 300 s start period. A slow mirror can take longer than that.
- **Out of memory:** clamd needs about 2-3 GB once the signatures are loaded. The task has 4 GB.
- **Image pull errors:** the image comes from Docker Hub (`clamav/clamav:1.4`). Mirror it to ECR if pulls get rate
  limited.

## Fix

Restart the service. The API and worker find it again through Cloud Map (`clamav.placement.internal`). Ask users to
re-upload anything that was refused while it was down.
