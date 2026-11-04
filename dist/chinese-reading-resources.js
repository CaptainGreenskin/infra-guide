/* Primary Chinese entry points checked on 2026-11-05; archive years remain explicit. */
learningResources.unshift({id:'d2l-zh',track:'ai',provider:'李沐 / D2L 原作者',title:'《动手学深度学习》与 2021 中文课程',url:'https://zh.d2l.ai/',language:'中文',format:'在线书 / 归档课程录像',video:true,access:'原作者书与课程目录公开，课程页提供 B 站回放入口；本轮核对目录与链接，没有逐段试看。历史框架 API 与环境需另查。',first:'自动求导 → softmax 与损失 → Attention。多 GPU 部分先看切分与通信，实际 DDP 再回本站固定版本实验。',prereq:'基础 Python、向量与矩阵乘法。',gate:'手算一次交叉熵梯度，解释有效标签、参数更新与数据分片各负责什么。',chapters:['transformer-model','tokenization-embedding','attention-mechanics','transformer-block','autograd-training','gpu-execution','distributed-training'],checked:'2026-11-05'});
learningResources.push({id:'aliyun-dlc-contract',track:'ai',provider:'阿里云 PAI 官方文档',title:'PAI-DLC：训练作业的环境与资源契约',url:'https://help.aliyun.com/zh/pai/create-a-training-task',language:'中文',format:'产品文档 / 配置对照',video:false,access:'阅读公开；创建任务需要账号、权限和计费资源。本站未执行 DLC 云任务，示例镜像与 SDK 需按目标环境核对。',first:'先读镜像、代码与数据挂载，再对照任务角色/副本、环境变量、网络和日志。把平台字段映射回自己的训练程序。',prereq:'能运行本机两进程 DDP，了解容器、数据版本与检查点。',gate:'指出哪些状态由平台管理、哪些仍由训练代码保存；写出成员失败后重做与恢复的边界。',chapters:['training-platform','gpu-scheduling','kubernetes-training','multinode-lab','training-storage'],checked:'2026-11-05'});
{
 const r=learningResources.find(r=>r.id==='hf-agents');
 r.url='https://huggingface.co/learn/agents-course/zh-CN/unit1/introduction';r.originalUrl='https://huggingface.co/learn/agents-course/en/unit1/introduction';
 r.language='中文图文 / 英文导览';r.title='AI Agents Course：简中入门单元';
 r.first='第 1 单元：智能体、工具、动作与观察。先画调用与反馈，再阅读首个 Agent 示例。';
 r.access='已核对第 1 单元的简中正文与目录。部署 Space 等练习需账号，推理按所选服务配额；课程导览回放为英文。';r.checked='2026-11-05';
 const w=learningResources.find(r=>r.id==='aws-reliability');
 w.originalUrl=w.url;w.url='https://docs.aws.amazon.com/zh_cn/wellarchitected/latest/reliability-pillar/welcome.html';w.language='中文译文';w.title='Well-Architected：可靠性支柱（官方中文）';w.access='官方中文正文公开，可对照英文原文；阅读不需购买资源，产品语义以 AWS 为范围。';w.checked='2026-11-05';
}
resourceVideoLinks['d2l-zh']='https://c.d2l.ai/zh-v2/';

sources.cnAliStorage=['阿里云 · NAS、OSS 与 EBS 对照','https://help.aliyun.com/zh/nas/product-overview/comparison-of-nas-oss-and-ebs/'];
sources.cnTencentStorage=['腾讯云 · CFS、COS 与 CBS 对照','https://cloud.tencent.com/document/product/582/133057'];
function domesticStorageMapHTML(){return '<h3>从通用接口识别国内云产品</h3>'+para('云盘、NAS、OSS/COS 先归到接口层，再分析具体契约。遇到一个产品名，先说明应用通过什么操作读写、谁组织共享数据，然后核对版本与恢复。')+
 table(['通用接口','阿里云示例','腾讯云示例','AWS 示例'],[['块设备','云盘 / EBS','云硬盘 CBS','Amazon EBS'],['共享文件系统','文件存储 NAS','文件存储 CFS','Amazon EFS'],['对象 API','对象存储 OSS','对象存储 COS','Amazon S3']])+
 para('接口类别相同，协议细节仍要逐项核对。迁移时保持样本身份、数据版本与完整性验收，重新检查挂载方式、锁/缓存、多写者和快照的具体保证。表格只用于识别接口与产品名，没有按厂商给性能排位。')+
 '<p class="evidence-note">产品名与接口对照：<a href="'+sources.cnAliStorage[1]+'" target="_blank" rel="noopener">阿里云官方说明 ↗</a> · <a href="'+sources.cnTencentStorage[1]+'" target="_blank" rel="noopener">腾讯云官方说明 ↗</a>。核对日 2026-11-05。</p>';}
{
 const a=articles.find(a=>a.id==='training-storage'),mapping=domesticStorageMapHTML();
 a.sections[2][1]+=infraReadableHTML(mapping);a.refs.push('cnAliStorage','cnTencentStorage');
 cloudKnowledgeExplanations['storage-model']+=infraReadableHTML(mapping);
}
