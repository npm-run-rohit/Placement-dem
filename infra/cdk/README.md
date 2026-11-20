# BimaPlacement infrastructure (AWS CDK)

AWS CDK in TypeScript, `ap-south-1`. It follows BimaKavach's other CDK service (`bk-uw2`): the same stack split,
config in `cdk.json`, placeholder secrets and Jest assertion tests. PLAN 0.6 (infrastructure) and 4.6 (monitoring).

## Stacks

| Stack | What it holds |
|---|---|
| `Placement-prod-Network` | VPC, 2 AZs. Subnets: public (ALB, NAT), app (ECS), db (isolated). One NAT gateway with a static egress IP (output `NatEgressIp`) for partner allow-lists |
| `Placement-prod-Data` | RDS Postgres 16 (Multi-AZ, TLS forced, 14-day backups, retained). ElastiCache Redis 7 for BullMQ (TLS, `noeviction`). Documents bucket (SSE-KMS with key rotation, versioned, object lock enabled, retained). Secrets: `placement-prod/db` and `placement-prod/external` |
| `Placement-prod-App` | ECS Fargate services `api` (2 tasks), `worker` (1) and `clamav` (1, at `clamav.placement.internal`), plus a one-off task for migrations. ALB with WAF for the API host. S3 + CloudFront for the web app, with `/api/*` forwarded to the API host |
| `Placement-prod-Monitoring` | SNS email alerts, 20+ alarms (each linking its runbook in `docs/runbooks/`), `placement-prod` dashboard |

**One image for three jobs.** `apps/api/Dockerfile` is built from the repo root. The API runs `node dist/main.js`,
the worker `node dist/worker.js`, and migrations `npm run db:deploy` (TypeORM migrations, then the idempotent PRD
master seed).

**App settings.** Production defaults are in `lib/app-stack.ts`. `envs.prod.appEnv` in `cdk.json` overrides any of
them, and is how the integrations go live once their contracts are agreed:

```json
"appEnv": {
  "SAHAYAK_ISSUER": "…",
  "SAHAYAK_JWKS_URL": "…",
  "SAHAYAK_API_URL": "…",
  "BIMASETU_MODE": "live",
  "BIMASETU_API_URL": "…",
  "COPYCAT_MODE": "live",
  "COPYCAT_ENDPOINT": "…",
  "MAILBOX_DRIVER": "email-layer",
  "EMAIL_LAYER_URL": "…"
}
```

**The API will not start yet.** It refuses to start in production with dev auth or an integration stand-in
(`production-checks.ts`), and
Sahayak login isn't wired up yet (HLD s11). Until the Sahayak values above are set, deploy with
`-c firstDeploy=true`, which keeps every service at 0 tasks.

## Before the first deploy

1. Fill in `envs.prod` in `cdk.json`: the AWS `account`, `apiDomain`, `appDomain` and `alertEmail`. Add either
   `hostedZoneId` + `hostedZoneName` (the certificate and DNS records are created for you) or `certificateArn` (an
   existing regional certificate for `apiDomain`). For a custom web domain, add `webCertificateArn`: an ACM
   certificate in **us-east-1**, which CloudFront requires. Without it the app is served on `*.cloudfront.net`.
   Synth refuses to run while any value is still `REPLACE_ME`.
2. Build the web app for production. It must not send the dev login header:
   ```bash
   npm run build:contracts
   NEXT_PUBLIC_AUTH_MODE=sahayak npm run build -w @bimaplacement/web
   ```
3. Bootstrap CDK once per account and region: `npx cdk bootstrap aws://<account>/ap-south-1`.

## Deploy

```bash
cd infra/cdk && npm ci
npm test                                   # assertion tests, no AWS needed
npx cdk deploy --all -c firstDeploy=true   # infrastructure with every service at 0 tasks
```

Then:

1. Set the external secrets (Secrets Manager > `placement-prod/external`). Keys: `BIMASETU_API_TOKEN`,
   `BIMASETU_WEBHOOK_SECRET`, `COPYCAT_API_KEY`, `SAHAYAK_SERVICE_TOKEN`. Leave a key empty if its integration is not
   live yet; the key itself must exist.
2. Run the migrations with the one-off task. The cluster, subnets, security group and task definition are stack
   outputs of `Placement-prod-App`:
   ```bash
   aws ecs run-task --cluster placement-prod --launch-type FARGATE \
     --task-definition <OneOffTaskDefinitionArn> \
     --network-configuration "awsvpcConfiguration={subnets=[<AppSubnetIds>],securityGroups=[<WorkerSecurityGroupId>],assignPublicIp=DISABLED}"
   ```
   Follow it in the `/placement-prod/oneoff` log group. Run it again before every deploy that adds a migration.
3. Confirm the SNS subscription email, or no alert is delivered.
4. Deploy without `firstDeploy`: `npx cdk deploy --all`.

## Decisions made here (check them)

- **Own ALB and CloudFront.** The HLD expects the API to sit behind the BimaSahayak ALB / gateway and the web app
  to be mounted by the Sahayak shell. Neither exists yet, so Placement brings its own, the same way `bk-uw2` does.
  Moving behind Sahayak later means removing the ALB and CloudFront from `app-stack.ts`.
- **Redis has no AUTH token.** It is TLS-only, reachable only from the API and worker security groups.
- **One worker task.** Repeating jobs are idempotent, but scaling on queue depth is left for later.
- **ClamAV is pulled from Docker Hub** (`clamav/clamav:1.4`). Mirror it to ECR if pull limits ever bite.
- **Object lock is on but has no default retention.** It can only be switched on when the bucket is created. The
  retention period waits for the DPDP / IRDAI decision (HLD s11 #9).
- **Integration defaults are stand-ins the API refuses in production** (`BIMASETU_MODE`, `COPYCAT_MODE` = mock;
  `MAILBOX_DRIVER=dev`, which only logs). Set the live values in `appEnv` above once the BimaSetu sender, the Copycat
  client and the email layer are in place. Mail goes through the shared email layer.
- **Not here yet:** the reporting read replica (PLAN 4.3), the AWS messaging driver (PLAN 4.8), and X-Ray / OTel
  tracing.
