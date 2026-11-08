/* Configuration, remembered state and actual files are different objects. */
Object.assign(sources,{
 dsTfState:['Terraform · 状态的用途','https://developer.hashicorp.com/terraform/language/state/purpose'],
 dsTfLocal:['Terraform · local backend','https://developer.hashicorp.com/terraform/language/backend/local'],
 dsTfLock:['Terraform · 状态锁','https://developer.hashicorp.com/terraform/language/state/locking'],
 dsTfRefresh:['Terraform · 刷新状态','https://developer.hashicorp.com/terraform/tutorials/state/refresh'],
 dsTfWorkspace:['Terraform · CLI工作空间','https://developer.hashicorp.com/terraform/cli/workspaces'],
 dsTfFile:['HashiCorp local 2.5.3 · local_file契约','https://registry.terraform.io/providers/hashicorp/local/2.5.3/docs/resources/file']
});
function deliverySource(file){return '<details class="full-code"><summary>展开完整源码 · '+file+'</summary>'+code(file,file.endsWith('.py')?'PYTHON':file.endsWith('.json')?'JSON':'DOCKERFILE',deliveryNativeFiles[file])+'</details>';}
function deliveryRun(file,anchor,command){return '<h3 id="'+anchor+'" class="walkthrough-run">运行 '+file+'</h3>'+code('解压完整包，在文件目录执行','BASH',command)+'<p><a href="/labs/delivery-systems.zip" download>下载完整实验包 ↓</a> · <a href="/labs/delivery-systems/'+file+'" download>下载源码 ↓</a> · <a href="/labs/delivery-systems/validation.json">核对实际结果与源码摘要 →</a></p>'+deliverySource(file);}
const terraformStateSections=[
 ['先分清配置、状态记录与实际资源',
 para('基础设施即代码（IaC）用可版本化的配置描述期望资源，再由工具比较并执行变化。Terraform是其中一种工具。配置表达“想要什么”，状态记录（state）保存“哪些配置地址对应哪些受管对象及上次记住的属性”，实际资源则是工具之外真正存在的文件、虚拟机或其他对象。三者不能互相代替。',
 '提供程序（provider）是一种适配插件，负责把资源类型翻译成目标系统的读取和修改。后端（backend）负责状态存放及相应锁定等能力。本章使用官方local提供程序管理本地文件，使用local后端保存状态；二者名字都有local，职责却不同：一个操作文件资源，另一个管理Terraform自身的状态。',
 '资源地址是配置内部的名字，例如local_file.managed；实际身份由提供程序定义。本例文件的路径与内容在真实文件系统中，状态还保存该资源的标识和属性。云实例通常有平台分配的ID，不能把本章按内容校验文件的规则推广为所有云资源的身份规则。',
 '下面用plan命令生成计划，列出准备执行的变化；用apply命令执行相应变化。refresh-only意为“只刷新记录”的模式：更新状态对实际对象的认识。先看图中哪份事实变化，后文再逐步解释这些命令的具体条件。')+
 figure('v49-tf-three-objects','同一条实验路径：配置希望alpha，状态原记alpha，人工把实际文件改成outside。是否刷新、是否应用，决定接下来改变哪一份事实。')+
 table(['对象','本章保存什么','在哪里核对'],[['配置','路径managed.txt、期望内容alpha','main.tf.json及变量'],['状态','local_file.managed的绑定和属性','terraform state pull'],['实际资源','文件当前字节','直接读managed.txt并计算摘要'],['计划','本次观察与准备执行的变化','plan及其JSON表示']])],
 ['计划先读取，执行才兑现变更',
 para('plan生成执行计划：加载配置和状态，通过提供程序读取实际对象，在内存中更新观察，再比较需要做的动作。apply按计划执行并持久化相应状态。看到计划写“没有变化”，必须先问这份计划用了哪些输入、是否刷新、观察的是哪个工作空间。',
 '普通计划会进行隐式刷新，但计划中的观察不等于状态已经持久提交。refresh-only是一种只对齐记录的模式：更新Terraform对实际资源的认识，不把资源强行改回配置。正常apply则可能修改实际对象。这两条路径对应不同目的：承认已发生的外部变化，或按配置修复漂移。')+
 code('与实验等价的HCL核心；完整程序还固定版本与测试屏障','HCL','variable "content" {\n  type    = string\n  default = "alpha"\n}\nresource "local_file" "managed" {\n  filename        = "${path.module}/managed.txt"\n  content         = var.content\n  file_permission = "0600"\n}')+
 para('漂移是实际对象偏离受管期望或既有观察。发现漂移后，先确认变化是否有意、配置是否应接纳，再决定刷新、修改配置或修复实际对象。刷新不是回滚，修复也不是无害读取；一份可能覆盖外部编辑的计划需要在执行前读懂。')],
 ['状态锁保护的是哪一份共同记录',
 para('两个人同时应用同一个状态，都可能基于旧观察决定修改。支持锁定的后端会让相关操作先取得状态锁，再推进计划和执行，避免多个写者同时更新同一份账本。本章的local后端使用操作系统锁；.terraform.tfstate.lock.info记录锁的相关信息，不是只凭这个文件是否存在来实现互斥。',
 '实际实验先启动一个apply。它已经创建alpha文件，又在一个受控执行钩子中暂停，仍持有状态锁；第二个进程执行plan并把锁等待设为0，退出码为1，报告无法取得锁。确认第一个仍在运行后才放行，首个apply成功结束；之后同配置的无变化计划返回0。')+
 figure('v49-tf-lock-lanes','真实两个Terraform进程：第一个在受控钩子中保持apply，第二个被同一local状态锁拒绝。释放后正常结束，不删除锁文件或绕过锁。')+
 para('屏障是实验把执行停在确定位置、等待父进程放行的控制点。程序用内建terraform_data资源上的local-exec执行钩子放置屏障，只为稳定复现并发窗口，不代表创建普通云资源必须使用这类钩子。',
 '状态锁没有锁住所有真实资源。人工改文件、另一个状态管理同一路径，都可以绕过这份账本。远端后端是否支持锁、锁的寿命与恢复方式要查具体实现；遇到占用时先核实持有者与操作状态，不能把强制解锁活跃写者当成常规提速。')],
 ['一次关闭刷新，怎样得到误导性的绿灯',
 para('初次应用后，配置alpha、状态alpha、实际文件alpha一致。程序直接把文件改成outside，随后执行plan -refresh=false。这个选项跳过重新读取实际资源，计划仍按缓存认识比较，返回“无变化”的退出码0；独立读文件却得到outside。',
 '这不是退出码失效，而是检查范围改变了。它证明“在本次采用的输入下，没有准备执行变化”，不证明当前世界已经满足期望。流水线若为了省读取把刷新关掉，又把绿灯解释为环境无漂移，就把未观察的事实当成了已验证事实。')+
 table(['时点','配置','状态中内容','真实文件','判定'],[['首次应用完成','alpha','alpha','alpha','三者一致'],['外部编辑后','alpha','alpha','outside','出现漂移'],['不刷新就计划','alpha','alpha','outside','退出0，但实物不符合期望']])+
 para('同样的边界存在于云API缓存、读权限受限或某些未受管字段中：比较逻辑只覆盖它实际读取和管理的范围。排查时保留提供程序版本、刷新选项、计划源和独立资源读数，不要只保存一行“0 changes”。')],
 ['只刷新状态，为什么文件仍然没有恢复',
 para('本例接着生成refresh-only计划。local提供程序2.5.3按自己的文件身份校验规则判断原受管内容已不存在，计划的resource_drift中出现local_file.managed的delete。这个delete描述状态观察中的资源绑定变化，不表示此次刷新会删除磁盘上的outside文件。',
 '应用这份刷新计划后，真实文件仍为outside，状态中则不再有local_file.managed。再做正常计划，Terraform根据配置提出create；执行以后，实际内容恢复alpha，状态重新记录对应资源。只看词语“delete/create”却不说明它在哪一层，会把状态修正与实际文件操作混为一谈。')+
 table(['动作','改变的对象','实际结果'],[['apply refresh-only计划','持久化新的状态认识','文件仍outside，旧绑定从state移除'],['正常plan','生成需要的资源动作','提出创建local_file.managed'],['apply修复计划','执行提供程序操作并记录','文件alpha，状态重新有受管项']])+
 para('这条结论限定于本次local_file行为。其他提供程序可能把外部编辑表现为字段变化、替换或其他动作。学习重点是沿配置、状态、实物分别取证，而不是背下“漂移一定delete”。完整记录同时保存资源动作和直接读取的文件内容。')],
 ['工作空间分开了状态，为什么仍会互相覆盖',
 para('CLI工作空间（workspace）为同一配置选择不同的状态。本章创建blue和green：它们有不同lineage，也就是状态历史的身份标识。但配置里的文件路径没有包含工作空间名，因此两份状态都指向ROOT/managed.txt。',
 'blue按alpha应用，green再按beta应用，真实文件变成beta；blue仍记着alpha。切回blue执行不刷新的计划，仍返回0；允许刷新时，计划发现差异并返回2。状态独立没有阻止两套配置争夺同一实际目标。')+
 figure('v49-tf-workspace-collision','真实两份状态的lineage不同，目标路径却相同。green写入beta后，blue的缓存计划仍可无变化；重新观察才能发现冲突。')+
 para('工作空间不是云账号、网络或权限边界。环境隔离还需资源命名、目标账号与执行身份等规则，并防止两份状态无意管理同一资源。若确需转交所有权，应设计状态迁移或导入流程、验证原管理者退出；简单复制状态或换个工作空间名，不能自动建立排他归属。')],
 ['把计划、状态和交付流程连起来',
 para('一份可审阅的变更至少回答：配置来自哪个Git修订，变量与提供程序版本是什么，计划是否基于当前资源读取，执行时针对哪个后端与工作空间，执行后实际对象是否符合任务目标。状态与保存计划还可能携带敏感属性，应按其内容控制读取与留存，不能因为代码仓库公开就顺手公开状态。',
 '保存计划固定的是本次准备执行的内容，之后修改配置不等于旧计划自动升级；另一执行推进状态后，旧计划也可能陈旧。现有交付章用真实Terraform CLI单独验证这些顺序。把它与本章的锁和刷新连起来，才能解释多人流水线为什么既要审查计划，又要管理状态和执行资格。',
 'Terraform可以被自动化流程定期运行，GitOps控制器则持续比较其管理对象。两者都需要明确谁拥有哪类字段；让一个控制器把副本数改为2、另一套配置持续改回3，会形成相互修复。工具名称不决定所有权，声明范围和运行规则才决定。')+
 linkTo('delivery','对照保存计划、发布兼容与回退')+linkTo('gitops-reconciliation','继续看真实GitOps调谐')],
 ['运行实验，分别读取三份事实',
 para('本轮在Linux CI使用Terraform 1.13.0与官方local提供程序2.5.3实际执行。程序只在自己创建的临时目录中初始化、生成文件和状态，使用专用CLI配置，不读取或修改用户业务目录；结束时清理。它没有创建云实例，也没有验证远端后端或高可用锁服务。',
 '先准备官方Terraform CLI，再运行完整程序。程序固定工具与提供程序版本，首次init需要联网下载插件；Docker和Kubernetes不是这一项实验的前提。报告保留锁拒绝、状态快照序号serial与历史身份lineage、刷新差异和真实文件内容，源码摘要与公共CI提交绑定。')+
 deliveryRun('terraform_state.py','terraform-state-run','python3 -B terraform_state.py --output runs/terraform-record.json')+
 para('先预测三个结果再运行：关闭刷新能否发现outside？只刷新能否改回alpha？工作空间换名能否让同一文件自然隔离？每题都要指出你依据的是配置、状态还是实物，再用报告和直接文件读数核对。')]
];
articles.push({id:'terraform-state',number:'C6.2',module:'cloud-delivery',title:'Terraform状态与漂移：配置、锁、刷新和资源归属',
 desc:'先分清配置、状态与实物，再用真实local_file、并发状态锁和工作空间冲突解释计划为何可能误导。',intro:'同一个“没有变化”，可能来自真实一致，也可能来自没有重新观察。把每份记录能证明什么写清，再决定是否执行。',
 prereq:'先读交付章与文件/进程基础；本章逐步介绍IaC、提供程序、后端和工作空间，不要求已有Terraform项目。',objectives:['区分配置、状态、计划与实际对象','解释状态锁、刷新和修复的不同作用','核对两份状态是否争夺同一资源'],
 sections:terraformStateSections,check:['local提供程序与local后端分别负责什么？','状态锁挡住了谁，又没有挡住谁？','refresh-only的delete会删除本例磁盘文件吗？','工作空间不同为何仍可能覆盖同一路径？'],
 exercise:['blue记alpha，green把共同文件改为beta；blue的关闭刷新计划返回0。能否据此宣布blue环境符合期望？下一步怎样取证？','不能。它未重新观察实际文件。直接读出beta，核对共同路径与两份状态，再做正常刷新计划；先决定真实归属与期望，避免两套状态交替覆盖。'],
 refs:['dsTfState','dsTfLocal','dsTfLock','dsTfRefresh','dsTfWorkspace','dsTfFile'],related:['delivery','gitops-reconciliation','concurrency-pools','iam-security'],textbook:true,minutes:40,level:'机制 + 真实CLI + 文件对照',edition:'IaC状态',baseline:'Terraform 1.13.0 + local 2.5.3；只操作自有临时文件',tags:['IaC','状态锁','漂移','工作空间'],updated:'2026.11.08'});
focusChapters.add('terraform-state');
