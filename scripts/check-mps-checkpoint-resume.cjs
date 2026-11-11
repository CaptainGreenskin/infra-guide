/* Independently check the persisted evidence and one observed SGD coordinate. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'mps-checkpoint-resume';
const folder = path.join(root, 'dist', 'labs', pack);
const source = ['README.md', 'mps_resume.py', 'requirements.txt', 'tiny_decoder.py'];
const read = file => fs.readFileSync(path.join(folder,file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(source.map(name => [name,hash(read(name))]));
const handoff = JSON.parse(fs.readFileSync(path.join(root,'dist','labs','tiny-decoder-handoff','validation.json')));
const modes = ['continuous','save','resume','omit_momentum','omit_rng'];
const plans = run => run.steps.map(step => step.plan);
const close = (actual, expected) => assert(Math.abs(actual-expected) <= 1e-6, actual+' differs from '+expected);
const digest = value => assert.match(value,/^[a-f0-9]{64}$/);

function checkStage(run, mode, start, end) {
 assert.equal(run.mode, mode);
 assert.equal(run.start, start);
 assert.equal(run.next_step, end);
 assert(Number.isInteger(run.pid) && run.pid > 0);
 assert(Number.isInteger(run.device_allocated_bytes) && run.device_allocated_bytes > 0);
 assert.deepEqual(run.steps.map(step => step.step), Array.from({length:end-start},(_,index) => start+index));
 for (const state of [run.initial,run.final]) {
  for (const key of ['model_sha256','momentum_sha256','mps_rng_sha256']) digest(state[key]);
  assert(Number.isFinite(state.token_weight_1_0));
  if (state.momentum_values === 0) {
   assert.equal(state.momentum_sha256, hash(Buffer.alloc(0)));
   assert.equal(state.token_momentum_1_0,null);
  } else {
   assert.equal(state.momentum_values,664);
   assert(Number.isFinite(state.token_momentum_1_0));
  }
 }
 let weight = run.initial.token_weight_1_0, momentum = run.initial.token_momentum_1_0;
 for (const step of run.steps) {
  assert([0,1].includes(step.plan));
  assert.equal(step.logits_device,'mps:0');
  assert.equal(step.gradient_device,'mps:0');
  assert(Number.isFinite(step.loss) && step.loss > 0);
  assert(Number.isFinite(step.token_grad_1_0));
  momentum = (momentum ?? 0)*0.5+step.token_grad_1_0;
  weight -= 0.05*momentum;
  close(step.token_weight_1_0,weight);
 }
 close(run.final.token_weight_1_0,weight);
 close(run.final.token_momentum_1_0,momentum);
}

function verify(record) {
 assert.equal(record.schema,'infra-mps-checkpoint-resume-v1');
 assert.equal(record.status,'passed');
 assert.deepEqual(record.source_sha256,sourceHashes);
 const {environment,fixture,runs,comparisons_with_continuous:differences} = record;
 assert.equal(environment.platform,'Darwin arm64');
 assert.match(environment.gpu,/^Apple /);
 assert.match(environment.macos,/^\d+\.\d+/);
 assert.match(environment.python,/^3\.12\./);
 assert.equal(environment.torch,'2.5.1');
 assert.equal(environment.pytorch_enable_mps_fallback,'0');
 assert.deepEqual(fixture,{
  parameters:664, rows:handoff.fixture.rows, targets:handoff.fixture.labels, steps:6, checkpoint_next_step:3,
  optimizer:{type:'SGD',lr:0.05,momentum:0.5}, mps_seed:33,
 });
 assert.deepEqual(Object.keys(runs).sort(), [...modes].sort());
 assert.deepEqual(Object.keys(differences).sort(), ['omit_momentum','omit_rng','resume']);
 for (const [mode,start,end] of [['continuous',0,6],['save',0,3],['resume',3,6],['omit_momentum',3,6],['omit_rng',3,6]]) {
  checkStage(runs[mode],mode,start,end);
 }
 assert.equal(new Set(modes.map(mode => runs[mode].pid)).size, modes.length);
 const {continuous,save,resume,omit_momentum:withoutMomentum,omit_rng:withoutRng} = runs;
 assert.deepEqual(continuous.initial,save.initial);
 assert.equal(save.initial.momentum_values,0);
 assert.equal(continuous.checkpoint_sha256,null);
 digest(save.checkpoint_sha256);
 assert.deepEqual(save.final,resume.initial);
 assert.deepEqual(continuous.steps,[...save.steps,...resume.steps]);
 assert.deepEqual(continuous.final,resume.final);
 assert.deepEqual(differences.resume,{max_weight_abs_diff:0,max_momentum_abs_diff:0});
 for (const control of [resume,withoutMomentum,withoutRng]) {
  assert.equal(control.checkpoint_sha256,save.checkpoint_sha256);
  assert.equal(control.initial.model_sha256,resume.initial.model_sha256);
 }
 assert.equal(withoutMomentum.initial.momentum_values,0);
 assert.equal(withoutMomentum.initial.mps_rng_sha256,resume.initial.mps_rng_sha256);
 assert.deepEqual(plans(withoutMomentum),plans(resume));
 assert.equal(withoutMomentum.steps[0].loss,resume.steps[0].loss);
 assert.equal(withoutRng.initial.momentum_sha256,resume.initial.momentum_sha256);
 assert.equal(withoutRng.initial.mps_rng_sha256,save.initial.mps_rng_sha256);
 assert.notEqual(withoutRng.initial.mps_rng_sha256,resume.initial.mps_rng_sha256);
 assert.notDeepEqual(plans(withoutRng),plans(resume));
 for (const control of [withoutMomentum,withoutRng]) {
  assert.notEqual(control.final.model_sha256,resume.final.model_sha256);
  for (const key of ['max_weight_abs_diff','max_momentum_abs_diff']) {
   assert(Number.isFinite(differences[control.mode][key]) && differences[control.mode][key] > 1e-4);
  }
 }
}

const record = JSON.parse(read('validation.json'));
verify(record);
assert.equal(record.environment.gpu,'Apple M4 Pro');
assert.deepEqual(plans(record.runs.continuous),[1,0,0,0,1,1]);
assert.deepEqual(plans(record.runs.omit_rng),[1,0,0]);
close(record.comparisons_with_continuous.omit_momentum.max_weight_abs_diff,0.13231104612350464);
close(record.comparisons_with_continuous.omit_rng.max_weight_abs_diff,0.04246962070465088);
assert.deepEqual(read('tiny_decoder.py'),fs.readFileSync(path.join(root,'dist','labs','sdpa-cache','tiny_decoder.py')));
const lesson = fs.readFileSync(path.join(root,'dist','article','checkpoint-recovery','index.html'),'utf8');
const recovery = lesson.split('id="native-mps-checkpoint-resume"')[1]?.split('</details>')[0];
assert(recovery, 'missing exact recovery section');
assert(recovery.includes(JSON.stringify(plans(record.runs.continuous))));
for (const [mode, label] of [['resume','全部状态'],['omit_momentum','只省去动量'],['omit_rng','只省去 MPS 随机状态']]) {
 const diff = record.comparisons_with_continuous[mode].max_weight_abs_diff;
 const display = diff === 0 ? '0' : '约 '+diff.toFixed(5);
 const row = [label, JSON.stringify(plans(record.runs[mode])), display];
 assert(recovery.includes('<tr>'+row.map(value=>'<td>'+value+'</td>').join('')+'</tr>'), mode+': chapter row must match the real run');
}
assert(recovery.includes('/article/transformer-block/#decoder-record-recompute') &&
       recovery.includes('/labs/mps-checkpoint-resume/validation.json'));
const decoder = fs.readFileSync(path.join(root,'dist','article','transformer-block','index.html'),'utf8');
assert(decoder.split('id="decoder-record-recompute"')[1].includes('/article/checkpoint-recovery/#native-mps-checkpoint-resume'));
for (const mutate of [
 data => { data.runs.resume.initial.mps_rng_sha256=data.runs.omit_rng.initial.mps_rng_sha256; },
 data => { data.runs.omit_momentum.steps[0].plan ^= 1; },
 data => { data.runs.save.steps[0].token_grad_1_0 += 0.25; },
 data => { data.runs.resume.steps[0].gradient_device='cpu'; },
 data => { data.runs.resume.pid=data.runs.save.pid; },
]) {
 const altered = structuredClone(record);
 mutate(altered);
 assert.throws(() => verify(altered),assert.AssertionError);
}

if (process.env.MPS_CHECKPOINT_PYTHON) {
 const output = execFileSync(process.env.MPS_CHECKPOINT_PYTHON,['-B','mps_resume.py'],
  {cwd:folder,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
 verify(JSON.parse(output));
}

const archive = folder+'.zip';
const files = [...source,'validation.json'];
const entries = execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries,files.map(file => pack+'/'+file).sort());
for (const file of files) assert.deepEqual(execFileSync('unzip',['-p',archive,pack+'/'+file]),read(file),file);
console.log('PASS: five MPS processes, exact full resume, independent SGD probe arithmetic, missing-state controls and exact archive'+
 (process.env.MPS_CHECKPOINT_PYTHON ? ' with a fresh MPS replay.' : '.'));
