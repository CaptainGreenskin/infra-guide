/* Connect the new worked chapters to the established system knowledge, without changing old URLs. */
for(const domain of infraKnowledgeDomains)for(const point of domain.points){
 const target={'mf-gpu':'operator-profiling','mf-roofline':'operator-profiling','mf-decoder':'moe-routing','tr-parallel':'moe-routing'}[point.id];
 if(target&&!point.articles.includes(target))point.articles.push(target);
 if(point.id==='mf-decoder')point.body+=para('前馈网络还可以扩展成混合专家（MoE）：多份专家参数由路由器按当前位置的隐藏向量选择部分分支，再加权合并。专家总参数、每个位置经过的参数和设备驻留量分别记账；路由也新增分发、容量与原位置合并问题。先理解普通前馈层，再进入MoE章的四个输入手算。');
}
for(const id of ['operator-profiling','moe-routing'])focusChapters.add(id);
