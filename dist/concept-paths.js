/* Concept introductions remain visible; optional case previews and source stay optional. */
const conceptGlossary=[
 ['CPU','中央处理器，执行程序指令'],['GPU','适合并行处理大量数值计算的处理器'],
 ['Linux','一类操作系统，负责管理程序运行及机器资源'],
 ['进程','一份正在运行的程序实例'],['线程','进程中的一条执行路径'],
 ['虚拟机','提供虚拟CPU、内存和设备，可运行客户机操作系统的计算环境'],
 ['容器','将应用进程、所需文件及相应隔离与资源约束组织起来的运行实例'],
 ['集群','由多台机器及其管理组件共同组成的系统'],
 ['配额','某个使用范围可申请或占用相应资源的总量上限'],
 ['准入','允许创建或运行之前的相应条件检查'],
 ['调谐','反复比较期望状态与实际状态并推动差异收敛的过程'],
 ['亲和性','表达工作负载倾向或必须靠近哪些节点及对象的位置规则'],
 ['拓扑','设备、机器及它们的连接和位置关系'],
 ['污点','节点声明的一类避让条件，需要相应工作负载满足容忍规则'],
 ['事务','把一组操作放进约定提交与并发规则中的处理单位'],
 ['缓存','保存可复用内容的一份中间结果，减少重复读取或计算'],
 ['向量','有顺序的一组数字'],['矩阵','按行与列组织的数字'],['张量','按一个或多个轴组织的数字'],
 ['梯度','损失对参数微小变化的变化率，用来计算更新方向'],
 ['归一化','按规定统计量与参数调整数值尺度等特征的变换'],
 ['词表','规定模型有哪些离散词元及其编号的对应表'],
 ['租约','有期限的使用或所有权约定，过期不表示旧执行者已停止'],
 ['沙箱','通过限制可访问对象与系统能力等方式约束代码的执行环境'],
 ['背压','让接收或处理能力限制向上游传递，避免无界积压的机制'],
 ['限流','限制单位时间或相应窗口内允许进入的工作量'],
 ['熔断','在相应失败条件下暂停调用并按规则探测恢复的保护机制'],
 ['API','供程序调用的接口'],['I/O','输入与输出，例如读文件和收发网络数据'],
 ['GiB','按二进制计量的容量单位，1 GiB等于2³⁰字节'],['MiB','按二进制计量的容量单位，1 MiB等于2²⁰字节'],
 ['IaaS','基础设施即服务，提供可管理的计算、网络和存储资源'],
 ['PaaS','平台即服务，在基础资源上继续托管部分应用运行环境'],
 ['FaaS','函数即服务，按调用或事件运行提交的函数'],
 ['vCPU','虚拟机可见的CPU执行单元，不直接等于独占物理核心'],
 ['Hypervisor','虚拟机监控器，管理虚拟CPU、内存和设备等对象'],
 ['内核','操作系统中直接管理执行、内存和设备等职责的核心部分'],
 ['namespace','Linux中划分一组进程所见系统对象的机制'],
 ['cgroup','Linux中对进程组做资源记账与约束的机制'],
 ['KVM','Linux提供的一组硬件辅助虚拟机执行接口与机制'],
 ['NUMA','非一致内存访问，处理器访问不同位置内存的代价可能不同'],
 ['SMT','同时多线程，一个物理核心提供多个共享执行资源的硬件线程'],
 ['EPT','扩展页表，x86平台的一类二阶段地址转换机制'],
 ['NPT','嵌套页表，x86平台的一类二阶段地址转换机制'],
 ['TLB','缓存近期地址转换结果的硬件结构'],
 ['IOMMU','管理设备访问内存时的地址转换和隔离的硬件机制'],
 ['virtio','客户机与虚拟化后端协作的一组设备接口'],
 ['VPC','虚拟私有云中的逻辑网络范围'],['CIDR','用地址和前缀长度表达网络地址范围的方法'],
 ['IP','网络层寻址协议，IP地址标识相应通信位置'],['DNS','域名系统，把名称查询成相应记录'],
 ['TCP','提供可靠、有序字节流的传输协议'],['UDP','以数据报传输数据、由应用处理相应可靠性需求的协议'],
 ['HTTP','规定一类应用请求与响应格式和语义的协议'],['TLS','为通信提供加密、完整性及相应身份校验的协议'],
 ['NAT','改写网络地址或端口的转换机制'],['MTU','相应链路或接口允许的最大传输单元大小'],
 ['TTL','生存时间，在此类缓存场景中表示记录可保留多久'],
 ['Overlay','在底层网络之上用封装等方式组织的逻辑网络'],['VXLAN','通过UDP封装承载二层逻辑网络的一种技术'],
 ['ACL','访问控制列表，按规则判断哪些访问允许或拒绝'],
 ['IOPS','每秒完成的输入输出操作数'],['SQL','向关系数据库表达查询与更新的一种语言'],
 ['MVCC','多版本并发控制，让读取按规则观察相应数据版本的机制'],
 ['WAL','先写日志，要求相应日志先于所保护的数据更新持久化的原则或机制'],
 ['redo','重做信息，用于按引擎协议重建相应数据变化'],['undo','撤销信息，用于回滚及引擎支持的历史版本读取'],
 ['binlog','MySQL的二进制日志，用于其支持的复制与恢复流程'],
 ['POSIX','一组操作系统接口规范，不表示所有存储接口都支持相同文件语义'],
 ['Kubernetes','统一管理多台机器上容器化应用的系统'],['Pod','Kubernetes中一起安排运行的一个或多个容器组成的单位'],
 ['Deployment','管理可替换服务副本和更新过程的Kubernetes工作负载对象'],
 ['ReplicaSet','维护所需数量Pod副本的Kubernetes控制对象'],
 ['StatefulSet','管理需要稳定身份等状态特征的Kubernetes工作负载对象'],
 ['DaemonSet','在符合条件的节点上安排相应Pod的Kubernetes工作负载对象'],
 ['Job','管理需要运行到完成的Kubernetes任务对象'],
 ['Service','为一组后端提供相对稳定访问入口的Kubernetes资源对象'],
 ['ConfigMap','组织普通配置数据的Kubernetes对象'],['Secret','组织需要限制访问的秘密数据的Kubernetes对象'],
 ['NetworkPolicy','表达相应Pod流量允许规则的Kubernetes对象，执行依赖网络实现'],
 ['CRI','容器运行时接口，连接节点代理与容器运行实现'],
 ['CNI','容器网络接口规范，用于把容器接入相应网络'],
 ['CSI','容器存储接口，连接编排系统与存储驱动'],
 ['PV','持久卷，描述集群中一份可用存储资源的对象'],
 ['PVC','持久卷声明，表达工作负载需要怎样的存储'],
 ['HPA','按指标调整工作负载副本数的控制器'],
 ['allocatable','节点可供Pod分配的资源预算，不等于机器标称总量'],
 ['OOM','内存不足；具体终止对象和触发机制需按运行环境核对'],
 ['RBAC','基于角色的访问控制，用角色关联权限与使用主体'],
 ['OIDC','在OAuth 2.0基础上表达身份认证信息的一层协议'],
 ['JWT','JSON Web Token，一种表达声明的令牌格式；格式本身不等于声明可信'],
 ['IaC','基础设施即代码，用可版本管理的代码描述和管理基础设施'],
 ['GitOps','以版本库中的声明为依据持续同步实际环境的管理方式'],
 ['CI','持续集成，持续检查并整合代码变更'],['CD','持续交付或持续部署，具体自动化边界需明确'],
 ['SRE','用软件工程方法管理服务可靠性的实践'],
 ['SLI','服务质量指标，把用户结果按明确口径量化'],
 ['SLO','对服务质量指标及其统计窗口设定的目标'],
 ['SLA','还包含对外约定和相应后果的服务级别协议'],
 ['RPO','恢复点目标，约束允许的数据丢失窗口'],
 ['RTO','恢复时间目标，约束恢复到约定服务状态所需时间'],
 ['RED','请求率、错误与耗时三类观察的简称'],['USE','利用率、饱和程度与错误三类资源观察的简称'],
 ['p99','在规定样本与算法下计算的99%分位数，不是最大值'],
 ['TCO','总拥有成本，计入使用、运维和相应生命周期成本'],
 ['Transformer','用注意力等结构组织序列计算的一类模型架构'],
 ['token','模型处理文本的离散单位，不必对应一个完整词'],
 ['tokenizer','把文本按规则转换成词元及编号的分词器'],
 ['Embedding','嵌入查表，把离散编号转换成数值向量'],
 ['logit','归一化之前的候选得分'],['shape','数值张量各个轴的尺寸排列'],
 ['dtype','数值的数据类型，影响精度、取值范围和每元素字节数'],
 ['Attention','注意力，按匹配权重从可见位置汇总信息的计算'],
 ['Softmax','把同一集合的得分转换成非负且总和为一的权重的变换'],
 ['FFN','前馈网络，对各位置的表示分别作相应非线性变换'],
 ['LayerNorm','按指定特征轴中心化并缩放的归一化变换'],
 ['RMSNorm','按均方根缩放、通常不做中心化的归一化变换'],
 ['RoPE','旋转位置编码，按位置旋转查询与键的成对分量'],
 ['SwiGLU','以SiLU门控一条投影、再与另一条投影逐元素相乘的前馈变体'],
 ['SiLU','把输入乘以其sigmoid值的非线性函数'],
 ['GQA','分组查询注意力，让多组查询共享较少的键和值头'],
 ['CUDA','用于NVIDIA GPU编程的一组平台与编程接口'],
 ['SM','流多处理器，GPU中承载相应线程块执行的硬件单元'],
 ['warp','线程束，GPU中一组按相应执行规则推进的线程'],
 ['HBM','高带宽内存，常用于GPU设备内存'],
 ['Roofline','结合计算能力与内存带宽建立的理想性能上界模型'],
 ['FlashAttention','通过分块和重排数据访问来实现注意力的一类算法'],
 ['rank','进程在某个通信组内的编号'],
 ['worker','承担相应工作的执行者，具体可以是进程或其他运行单元'],
 ['DDP','分布式数据并行，让模型副本处理数据并按协议同步梯度'],
 ['FSDP','完整分片的数据并行机制，管理参数等状态的收齐和分散'],
 ['ZeRO','将重复训练状态分摊保存的一组优化策略'],
 ['TP','张量并行，切分模型层内的张量与计算'],
 ['PP','流水线并行，把模型不同阶段分给不同执行者'],
 ['MoE','混合专家模型，由路由机制选择相应专家处理输入'],
 ['NCCL','主要面向GPU集合通信的一套实现库'],
 ['Gloo','支持相应设备和操作的集合通信实现'],
 ['AllReduce','先归约各参与者数值，再让每个参与者得到完整归约结果'],
 ['ReduceScatter','归约后让各参与者分别保留结果的一片'],
 ['AllGather','让每个参与者收齐各方提供的片段'],
 ['FP32','32位浮点数格式'],['FP16','16位浮点数格式'],['BF16','另一种16位浮点数格式，数值范围和精度分配不同于FP16'],
 ['INT8','8位整数表示'],['INT4','4位整数表示'],
 ['optimizer','根据梯度等信息调整参数的更新规则及其状态'],
 ['scaler','混合精度训练中保存并调整相应损失缩放倍数的状态对象'],
 ['packing','把多个序列组织到同一计算输入中的做法，边界与监督规则需要另外说明'],
 ['Prefill','预填充，处理已有输入位置并建立相应中间状态'],
 ['Decode','逐步解码，继续产生新的模型输出单位'],
 ['KV Cache','键值缓存，复用历史注意力计算中的键和值表示'],
 ['TTFT','首词元延迟，从规定起点到第一个输出词元的耗时'],
 ['TPOT','按规定公式计算的后续词元平均输出间隔'],
 ['Agent','在任务范围内组织模型与工具反复推进工作的智能体系统'],
 ['schema','规定允许字段、类型及相应结构约束的描述'],
 ['deadline','整个操作应完成的截止时间，不是每次重试重新获得的完整时长'],
 ['幂等','重复处理同一逻辑操作时仍保持约定效果的性质'],
 ['inbox','接收方随业务处理保存的已处理消息记录'],
 ['outbox','与业务变更一起提交的待发消息记录'],
 ['fencing','由受保护接收方拒绝过期执行者写入的隔离机制'],
 ['RAG','检索增强生成，先找资料，再把资料交给模型辅助回答'],
 ['BM25','综合词频、稀有程度和长度归一化的词面相关性评分方法'],
 ['RRF','倒数排名融合，按多路名次而非直接相加原始分数合并结果'],
 ['nDCG','把分级相关性按位置折扣，再相对理想排序归一化的指标'],
 ['trace','追踪，关联相应请求或任务的调用路径'],
 ['span','跨度，追踪中记录的一段有起终点及上下文的操作'],
 ['SSE','服务端发送事件，一种按文本行与事件边界组织的事件流格式'],
 ['UTF-8','一种把Unicode字符编码为字节的可变长度编码'],
 ['MCP','模型上下文协议，规定客户端与服务端交换相应工具和上下文能力的方式']
].map(([term,definition])=>({term,definition}));

const conceptGlossaryMap=new Map(conceptGlossary.map(entry=>[entry.term,entry]));
const conceptTermPattern=new RegExp(conceptGlossary.map(e=>e.term).sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
function conceptSeen(path){return new Set(path?.terms||[]);}
function conceptVisibleNeighbour(parts,index,direction){let out='';for(let i=index+direction;i>=0&&i<parts.length&&out.length<60;i+=direction){if(/^<\/?(?:p|li|h[1-6]|section)\b/i.test(parts[i]))break;if(!parts[i].startsWith('<'))out=direction>0?out+parts[i]:parts[i]+out;}return direction>0?out.slice(0,60):out.slice(-60);}
function explainFirstConceptTerms(html,seen=new Set()){
 const parts=html.split(/(<[^>]+>)/g),protectedTags=new Set(['pre','code','a','button','summary','script','style','svg','textarea','select','label','figure','h1','h2','h3','h4','h5','h6']);
 const stack=[];
 return parts.map((part,index)=>{
  if(part.startsWith('<')){const m=part.match(/^<\s*(\/?)([a-z0-9]+)/i);if(m&&protectedTags.has(m[2].toLowerCase())){const tag=m[2].toLowerCase();if(m[1]){const at=stack.lastIndexOf(tag);if(at>=0)stack.splice(at,1);}else if(!/\/\s*>$/.test(part))stack.push(tag);}return part;}
  if(stack.length)return part;
  return part.replace(conceptTermPattern,(term,at)=>{
   const before=part.slice(0,at),after=part.slice(at+term.length);
   if(/[A-Za-z0-9_]/.test(term[0])&&/[A-Za-z0-9_.-]$/.test(before)||/[A-Za-z0-9_]/.test(term.at(-1))&&/^[A-Za-z0-9_.-]/.test(after)||seen.has(term))return term;
   if(/["']$/.test(before)&&/^["']\s*:/.test(after))return term;
   if(/[\u3400-\u9fff]/.test(term)&&/^[\u3400-\u9fff]/.test(after)&&! /^(?:是|指|表示|称为|负责|用于|定义为|用来|把|会|可以|能够)/.test(after))return term;
   seen.add(term);const left=(conceptVisibleNeighbour(parts,index,-1)+before).slice(-60),right=(after+conceptVisibleNeighbour(parts,index,1)).slice(0,60);
   // Existing nearby definitions remain natural prose; never expand inside code or links.
   if(/^\s*(?:是|指|表示|称为|负责|用于|定义为)/.test(right)||/^\s*[（(][^）)]*[\u3400-\u9fff]/.test(right)||/[\u3400-\u9fff][^。；]{0,28}[（(]\s*$/.test(left))return term;
   return '<span class="first-concept-term" data-concept-term="'+trainingEscape(term)+'">'+term+'<span class="concept-term-meaning">（'+conceptGlossaryMap.get(term).definition+'）</span></span>';
  });
 }).join('');
}
function conceptPathHTML(path,kind){
 if(!path)return '';
 const steps=path.steps.map(([title,body],i)=>'<section class="concept-step"><h3><span aria-hidden="true">'+(i+1)+'</span>'+trainingEscape(title)+'</h3><p>'+trainingEscape(body)+'</p></section>').join('');
 const captions={compute:'一项服务的运行依赖。请求流与资源依赖分别标明；平台提供资源不等于已经完成业务。','model-foundations':'先沿输入到预测理解推理，再看训练怎样根据目标更新参数。示意关系，不是某个模型的完整实现。',agent:'任务、模型、运行时与工具的职责关系。工具返回结果后，仍须按任务条件验收。'};
 return '<section class="concept-path" id="concept-path" data-concept-kind="'+kind+'">'+(kind==='module'?'<p class="concept-kicker">从这里建立概念</p>':'')+'<h2>'+trainingEscape(path.title||'概念与关系')+'</h2>'+steps+(path.diagram?figure(path.diagram,path.diagramCaption||captions[Object.keys(moduleConceptPaths).find(k=>moduleConceptPaths[k]===path)]||'概念之间的关系示意。'):'')+'</section>';
}
function moduleConceptIntro(m){return conceptPathHTML(moduleConceptPaths[m.id],'module');}
function chapterConceptIntro(a){return conceptPathHTML(chapterConceptPaths[a.id],'chapter');}
function chapterQuestionPreview(a){const original=guidedIntro(a);return original?'<details class="concept-question-preview"><summary>选读：用一个问题预览本章</summary>'+original+'</details>':'';}
function conceptTOCLink(path){return '<a data-toc="concept-path" href="'+path+'#concept-path">概念起点与关系</a>';}
