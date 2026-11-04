// Cloud uses its own C0–C7 numbering; article URLs are stable across the reorganisation.
const cloudModulePlan = [
 ['foundation','C0','系统前置 · 按需补齐','SYSTEM PREREQUISITES','已有基础可跳过。沿进程、内存、并发与分布式失败语义定位自己的缺口。',['Linux','内存','并发','失败语义'],['分清运行、等待与节流','解释内存记账和锁等待','定义超时后的未知状态'],['linux-resource','virtual-memory-oom','concurrency-pools','distributed-systems']],
 ['compute','C1','云计算模型与计算弹性','CLOUD COMPUTE','先建立 IaaS、容器与托管服务的责任地图，再按工作量计算资源和伸缩延迟。',['虚拟化','容量','故障域','弹性'],['画出服务与平台责任边界','计算有效容量与资源预算','解释扩容时序和故障域'],['cloud-overview','cloud-compute','elasticity']],
 ['network','C2','云网络与请求路径','CLOUD NETWORKING','从 VPC、路由、入口与返回方向，走到 TCP、DNS 和分层取证。',['VPC','路由','TCP / DNS','排障'],['画出一次请求的往返路径','区分解析、连接与应用等待','用探测排除一个具体假设'],['vpc-network','network-diagnosis']],
 ['cloud-data','C3','云存储、数据库与缓存','CLOUD DATA SYSTEMS','按持久化语义选存储，用索引、事务和缓存时序解释数据可见性，再证明恢复。',['对象 / 块 / 文件','SQL','缓存','恢复'],['比较访问与提交语义','解释索引、锁和缓存竞态','核对恢复点与消费者结果'],['training-storage','database-index-locks','cache-consistency','storage-recovery']],
 ['native','C4','容器与 Kubernetes 编排','CONTAINERS AND KUBERNETES','沿容器、控制面、工作负载、调度、网络、卷、配置和伸缩完整展开。',['容器 / CRI','控制器 / 调度','CNI / CSI','HPA'],['追踪声明到进程与可用端点','定位网络、卷与探针故障','复算伸缩建议与容量空窗'],['container-runtime','kubernetes-basics','k8s-workloads','scheduling-resources','k8s-networking','k8s-storage','config-secrets','k8s-autoscaling']],
 ['serverless','C5','Serverless 与事件驱动','SERVERLESS AND EVENTS','从执行环境走到投递、幂等、失败留存、并发和成本；与长期运行容器比较取舍。',['FaaS','事件 / 队列','幂等','成本'],['区分受理、执行与业务提交','按触发器解释重试与失败去向','计算平均并发和账单用量'],['serverless-execution']],
 ['cloud-delivery','C6','交付、身份与安全边界','DELIVERY AND IDENTITY','把产物、配置、数据契约、工作负载身份和回退条件作为同一次交付。',['CI / CD','IAM','最小权限','回退'],['交付可复现版本','在执行边界检查授权','说明回退覆盖与遗漏的状态'],['delivery','iam-security']],
 ['sre','C7','SRE、可观测与故障恢复','RELIABILITY ENGINEERING','用 SLO 表达用户目标，以指标、日志和追踪排除假设，再用演练检验恢复。',['SLO','可观测','事故','容灾'],['计算错误预算与消耗率','按证据形成故障时间线','验证恢复目标和剩余容量'],['slo','observability','incident','resilience']]
];
const oldCloudNumbers = new Map(articles.filter(a=>['foundation','compute','network','native','sre'].includes(a.module)).map(a=>[a.number,a.id]));
for(const [id,n,name,en,desc,tags,outcomes,ids] of cloudModulePlan){
 let m=modules.find(item=>item.id===id);
 if(!m){m={id,icon:id==='serverless'?'flask':id==='cloud-data'?'layers':'server'};modules.push(m);}
 Object.assign(m,{n,name,en,desc,tags,outcomes,track:'cloud'});
 ids.forEach((articleId,index)=>{const a=articleByIdForCloud(articleId);a.module=id;a.number=n+'.'+(index+1);});
}
function articleByIdForCloud(id){const a=articles.find(a=>a.id===id);if(!a)throw new Error('Unknown Cloud chapter '+id);return a;}
trackDefinitions.cloud.modules=cloudModulePlan.map(row=>row[0]);
trackDefinitions.cloud.story='计算与网络 → 数据 → 容器编排 → 事件平台 → 交付与可靠性。';
const cloudModuleOrder=new Map(cloudModulePlan.map((row,index)=>[row[0],index]));
modules.sort((a,b)=>a.track==='cloud'&&b.track==='cloud'?cloudModuleOrder.get(a.id)-cloudModuleOrder.get(b.id):a.track==='cloud'?-1:b.track==='cloud'?1:0);
for(const a of articles){
 a.prereq=a.prereq.replace(/\b[1-5]\.\d+\b/g,number=>oldCloudNumbers.has(number)?articleByIdForCloud(oldCloudNumbers.get(number)).number:number);
 for(const section of a.sections){section[1]=section[1].replace(/(href="#\/article\/([^"?]+)"[^>]*>)([^<]*)/g,(match,prefix,target,label)=>{
  const destination=articles.find(item=>item.id===target);if(!destination||!cloudModuleOrder.has(destination.module))return match;
  return prefix+label.replace(/\b[1-5]\.\d+\b/g,destination.number);
 });}
}
articles.sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
const cloudLearningStages=[
 ['先读总览，按需补系统前置',['cloud-overview','linux-resource','virtual-memory-oom','concurrency-pools','distributed-systems']],
 ['云资源、网络和数据',['cloud-compute','elasticity','vpc-network','network-diagnosis','training-storage','database-index-locks','cache-consistency','storage-recovery']],
 ['容器到 Kubernetes 运行路径',['container-runtime','kubernetes-basics','k8s-workloads','scheduling-resources']],
 ['服务网络、持久化与弹性',['k8s-networking','k8s-storage','config-secrets','k8s-autoscaling']],
 ['事件平台、交付与身份',['serverless-execution','delivery','iam-security']],
 ['可靠性与完整验收',['slo','observability','incident','resilience','cloud-service-lab']]
];
function cloudCourseEntry(){return '<section class="cloud-course-entry"><h2>先看全貌，再走平台主干</h2><p>先读 C1.1 总览；C0 用于补前置。主线按 C1 → C7 学习，已有基础可直接进入 C4 容器编排。共 28 章，C4 分八篇展开，Serverless 独立为 C5。</p><ol>'+cloudModulePlan.map(([id,n,name,,,,,ids])=>'<li><span>'+n+'</span><a href="/module/'+id+'/">'+name+'<small>'+ids.length+' 章 →</small></a></li>').join('')+'</ol><p class="path-links"><a href="/interview/experiences/">对照公开面试题，定位薄弱项 →</a><a href="/roadmap/?track=cloud">查看逐阶段阅读顺序 →</a></p></section>';}
