/* Embed the exact downloadable supervisor and actual record, not an edited excerpt. */
'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),lab=path.join(root,'dist/labs/multinode-launch');
const names={'multinodeLaunchSource':'verify_launch.py','multinodeLaunchWorkerSource':'launch_worker.py'};
let text=Object.entries(names).map(([name,file])=>'const '+name+'='+JSON.stringify(fs.readFileSync(path.join(lab,file),'utf8'))+';\n').join('');
text+='const multinodeLaunchValidation='+JSON.stringify(JSON.parse(fs.readFileSync(path.join(lab,'validation.json'),'utf8')))+';\n';
fs.writeFileSync(path.join(root,'dist/multinode-launch-data.js'),text);
