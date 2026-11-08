/* Embed exactly the downloadable teaching source, not a second edited copy. */
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
fs.writeFileSync(path.join(root,'dist/manual-sharding-data.js'),'const manualShardingSource='+JSON.stringify(fs.readFileSync(path.join(root,'dist/labs/manual-sharding/shard_linear.py'),'utf8'))+';\n');
