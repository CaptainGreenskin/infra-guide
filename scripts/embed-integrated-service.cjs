/* Keep the printed service program and its actual run bound to downloadable bytes. */
'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),lab=path.join(root,'dist/labs/integrated-service');
const text='const integratedServiceSource='+JSON.stringify(fs.readFileSync(path.join(lab,'integrated_service.py'),'utf8'))+';\n'+
 'const integratedServiceValidation='+JSON.stringify(JSON.parse(fs.readFileSync(path.join(lab,'validation.json'),'utf8')))+';\n';
fs.writeFileSync(path.join(root,'dist/integrated-service-data.js'),text);
