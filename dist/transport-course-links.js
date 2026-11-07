/* Add late-authored chapters before the final course ordering is applied. Existing numbers stay stable. */
for(const [module,id,after] of [['network','tcp-event-loop','network-diagnosis'],['cloud-data','mysql-recovery','storage-recovery']]){
 const row=cloudModulePlan.find(r=>r[0]===module);
 if(!row[7].includes(id))row[7].push(id);
 const stage=cloudLearningStages.find(s=>s[1].includes(after));
 if(!stage[1].includes(id))stage[1].splice(stage[1].indexOf(after)+1,0,id);
}
for(const domain of cloudKnowledgeDomains)for(const point of domain.points){
 const target={'transport-timeout':'tcp-event-loop','io-model':'tcp-event-loop','database-service':'mysql-recovery','backup-restore':'mysql-recovery'}[point[0]];
 if(target&&!point[4].includes(target))point[4].push(target);
}
for(const id of ['tcp-event-loop','mysql-recovery']){
 const chapter=articles.find(a=>a.id===id);chapter.textbook=true;
}

for(const id of ['tcp-event-loop','mysql-recovery'])focusChapters.add(id);
