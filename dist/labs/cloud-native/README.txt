Cloud Infra: local event experiment and Kubernetes teaching manifests

Local, Python 3.9+, standard library only:
  python3 verify.py
  python3 capacity.py

event_worker.py uses one SQLite database for report + inbox, in one transaction.
It does not invoke an external API. --crash-after-commit deliberately exits 23.
The replay must use the SAME event ID and intent. Different intent is rejected.
SQLite commit followed by process exit does not test machine power-loss durability.
This lab validates no actual SQS, Lambda, FC or Knative delivery behavior.

Disposable existing Kubernetes test cluster only:
  Build Dockerfile with your chosen builder, then load reports:lab into the cluster
  or push to your own registry and replace image with its resolved digest.
  kubectl apply -f reports.yaml
  kubectl -n infra-lab rollout status deployment/reports --timeout=120s
  kubectl -n infra-lab get pod,svc,hpa,pdb
  kubectl -n infra-lab get endpointslices -l kubernetes.io/service-name=reports -o yaml

Prerequisites: available image on nodes, CPU/memory headroom, suitable CNI;
HPA also needs the CPU resource metrics API (often metrics-server).
The app serves /, /healthz and /readyz; it is a teaching HTTP server.
No throughput or production hardening claim is made.

reports.yaml has Namespace, Deployment, Service, HPA and PDB.
PDB does not constrain the Deployment controller's own rolling update.
If keeping HPA, avoid repeatedly re-applying replicas during a scaling experiment.

network-policy-example.yaml is OPTIONAL and requires policy enforcement.
It allows TCP 8080 only from same-namespace Pods labeled role=client;
applying it may intentionally block other test clients. No DNS egress rule is added.

storage-example.yaml is OPTIONAL, unmounted by reports.yaml.
Replace 'standard' with an appropriate existing StorageClass. A claim with
WaitForFirstConsumer can remain Pending until a consumer is scheduled.

Kubernetes examples are offline-validated against upstream v1.34.0 OpenAPI
when schema-check.json is present; they have NOT been deployed to a cluster.
Use describe/events and the article flow to run one fault at a time.

Cleanup only after checking the test namespace contains nothing you need:
  kubectl delete -f network-policy-example.yaml --ignore-not-found
  kubectl delete -f storage-example.yaml --ignore-not-found
  kubectl delete -f reports.yaml
Deleting a claim can delete its backend volume depending on reclaim policy.
