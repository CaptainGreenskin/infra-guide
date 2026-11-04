/* One maintained command for contributors and CI; no packages are installed here. */
const path=require('path'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
if(args.some(arg=>arg!=='--pages')||new Set(args).size!==args.length){console.error('Usage: node scripts/check-all.cjs [--pages]');process.exit(2);}
const checks=[
 'check-content.cjs','check-runtime.cjs','check-startup-recovery.cjs','check-site-search.cjs','check-lab-catalog.cjs','check-reader-resources.cjs',
 'check-public-pages.cjs','check-textbooks.cjs','check-cloud-course.cjs',
 'check-knowledge-resources.cjs','check-mechanism-models.cjs','check-cloud-deepening.cjs',
 'check-cloud-operations.cjs','check-ai-agent-systems.cjs','check-learning-mechanisms.cjs',
 'check-serving-consistency.cjs','check-update-and-cancel.cjs','check-storage-quant-context.cjs',
 'check-network-input-tools.cjs','check-scaling-collective-traces.cjs',
 'check-config-memory-evaluation.cjs','check-leases-placement-sandbox.cjs',
 'check-recovery-artifacts-retrieval.cjs','check-compute-transport.cjs',
 'check-training-capstone.cjs','check-storage-parallel-acceptance.cjs','check-supervision-gradients.cjs','check-sql-paths-snapshots.cjs','check-streamed-tool-calls.cjs','check-editorial-evidence.cjs'
];
const run=file=>{const result=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:root,stdio:'inherit'});if(result.error)console.error(result.error.message);if(result.status!==0)process.exit(result.status||1);};
run('render-pages.cjs');for(const file of checks)run(file);
if(args.includes('--pages')){run('build-github-pages.cjs');run('check-github-pages.cjs');}
console.log('PASS: all '+(checks.length+Number(args.includes('--pages')))+' checks completed'+(args.includes('--pages')?' including GitHub Pages paths.':'. Add --pages to check the project-site artifact.'));
