/* One maintained command for contributors and CI; no packages are installed here. */
const path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
if(args.some(arg=>arg!=='--pages')||new Set(args).size!==args.length){console.error('Usage: node scripts/check-all.cjs [--pages]');process.exit(2);}
const checks=[
 'check-content.cjs','check-runtime.cjs','check-article-reader.cjs','check-multinode-launch.cjs','check-release-recovery-reading.cjs','check-integrated-service.cjs','check-sre-reading.cjs','check-startup-recovery.cjs','check-site-search.cjs','check-lab-catalog.cjs','check-reader-resources.cjs',
 'check-public-pages.cjs','check-concept-paths.cjs','check-course-migration.cjs','check-body-walkthroughs.cjs','check-textbooks.cjs','check-cloud-course.cjs',
 'check-knowledge-resources.cjs','check-mechanism-models.cjs','check-cloud-deepening.cjs',
 'check-cloud-operations.cjs','check-ai-agent-systems.cjs','check-learning-mechanisms.cjs',
 'check-serving-consistency.cjs','check-update-and-cancel.cjs','check-storage-quant-context.cjs',
 'check-network-input-tools.cjs','check-scaling-collective-traces.cjs',
 'check-config-memory-evaluation.cjs','check-leases-placement-sandbox.cjs','check-field-map-layout.cjs',
 'check-recovery-artifacts-retrieval.cjs','check-compute-transport.cjs','check-qemu-vcpu.cjs',
 'check-training-capstone.cjs','check-storage-parallel-acceptance.cjs','check-supervision-gradients.cjs','check-sql-paths-snapshots.cjs','check-streamed-tool-calls.cjs','check-agent-boundaries.cjs','check-operators-routing.cjs','check-cuda-core.cjs','check-ai-engine-ring-gemm.cjs','check-transport-recovery.cjs','check-runtime-speculative-crashes.cjs','check-delivery-systems.cjs','check-learning-connections.cjs','check-field-concepts.cjs','check-causal-walkthroughs.cjs','check-system-budget-walkthroughs.cjs','check-course-reading.cjs','check-course-continuity.cjs','check-manual-sharding.cjs','check-chapter-navigation.cjs','check-cloud-proxy.cjs','check-dns-cache.cjs','check-inference-cache.cjs','check-agent-planning.cjs','check-etcd-consensus.cjs','check-mysql-replication.cjs','check-mcp-protocol.cjs','check-torch-checkpoint.cjs','check-sdpa-cache.cjs','check-langgraph-workflow.cjs','check-kubernetes-identity.cjs','check-kubernetes-service.cjs','check-concept-reading.cjs','check-static-reading.cjs','check-reading-context.cjs','check-editorial-evidence.cjs',
 'check-reading-lab-bridges.cjs','check-native-innodb-fsdp.cjs','check-reader-figures.cjs','check-native-csi-fsdp-reshard.cjs','check-prefix-attention.cjs','check-config-projection.cjs','check-native-runtime-paths.cjs',
 'check-approval-reentry.cjs','check-inference-queue.cjs',
 'check-inference-prefix.cjs','check-ragged-ring.cjs','check-otel-tail-ledger.cjs',
 'check-jetstream-redelivery.cjs','check-vllm-block-lifecycle.cjs','check-vllm-scheduler.cjs','check-vllm-cache-scope.cjs','check-mcp-http-cancellation.cjs','check-native-model-rollout.cjs','check-mcp-http-authorization.cjs','check-spiffe-workload-identity.cjs','check-redis-client-tracking.cjs','check-native-amp-window.cjs','check-qdrant-retrieval.cjs','check-python-extension-loader.cjs','check-langgraph-parallel-merge.cjs','check-prometheus-live-burn.cjs',
 'check-tls-proxy-hops.cjs','check-triton-tail-mask.cjs','check-mcp-trace-reentry.cjs',
 'check-kubernetes-pdb-rollout.cjs','check-ddp-uneven-join.cjs','check-mcp-catalog-refresh.cjs','check-int8-batch-quality.cjs','check-process-wait-accounting.cjs','check-training-useful-tokens.cjs','check-http-operation-retry.cjs','check-training-submission-preflight.cjs','check-kubernetes-gloo-job.cjs','check-bounded-worker-queue.cjs','check-warp-memory-sectors.cjs','check-incident-connection-lease.cjs','check-ddp-target-preflight.cjs','check-pd-split.cjs','check-torch-compile-graph.cjs','check-rtx-cache-case.cjs','check-postgres-pitr.cjs','check-sandbox-egress.cjs','check-capacity-placement-receipts.cjs','check-pipeline-schedules.cjs','check-alert-notification.cjs','check-dp-tp-mesh.cjs','check-workflow-version-resume.cjs','check-controller-reconcile.cjs','check-elastic-restart-step.cjs','check-agent-task-reconnect.cjs',
 'check-redis-replica-promotion.cjs','check-metal-gemm.cjs','check-model-mcp-tool-choice.cjs',
 'check-kubernetes-admission.cjs','check-native-slot-handoff.cjs','check-rag-citation-oracle.cjs',
 'check-release-artifact-trust.cjs','check-prefetch-resume-step.cjs','check-memory-withdrawal.cjs',
 'check-sqlite-shard-routing.cjs','check-async-dcp-commit.cjs','check-model-plan-revision.cjs','check-model-mcp-recovery.cjs',
 'check-dns-connection-handoff.cjs','check-tiny-decoder-handoff.cjs'
];
const run=file=>{const result=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:root,stdio:'inherit'});if(result.error)console.error(result.error.message);if(result.status!==0)process.exit(result.status||1);};
run('render-pages.cjs');for(const file of checks)run(file);
if(args.includes('--pages')){run('build-github-pages.cjs');run('check-github-pages.cjs');}
console.log('PASS: all '+(checks.length+Number(args.includes('--pages')))+' checks completed'+(args.includes('--pages')?' including GitHub Pages paths.':'. Add --pages to check the project-site artifact.'));
