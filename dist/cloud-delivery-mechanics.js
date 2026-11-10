Object.assign(sources,{
 v13TfState:['Terraform · state 的身份映射','https://developer.hashicorp.com/terraform/language/state/purpose'],
 v13TfLock:['Terraform · state locking 的范围','https://developer.hashicorp.com/terraform/language/state/locking'],
 v13TfPlan:['Terraform · normal / refresh-only / saved plan','https://developer.hashicorp.com/terraform/cli/commands/plan'],
 v13TfApply:['Terraform · 应用已保存计划','https://developer.hashicorp.com/terraform/cli/commands/apply'],
 v13TfData:['Terraform · 内建 terraform_data','https://developer.hashicorp.com/terraform/language/resources/terraform-data'],
 v13ArgoSync:['Argo CD · 自动同步、自愈与清理','https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/'],
 v13ArgoHealth:['Argo CD · 资源健康评估','https://argo-cd.readthedocs.io/en/stable/operator-manual/health/'],
 v13ArgoDiff:['Argo CD · 比较范围与忽略规则','https://argo-cd.readthedocs.io/en/stable/user-guide/diffing/'],
 v13ArgoWaves:['Argo CD · phases、hooks 与 waves','https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/'],
 v13ArgoOptions:['Argo CD · prune、权限与同步选项','https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/'],
 v13FluxSource:['Flux · GitRepository 源与 Artifact','https://fluxcd.io/flux/components/source/gitrepositories/'],
 v13FluxKustom:['Flux · Kustomization 调谐、健康与 inventory','https://fluxcd.io/flux/components/kustomize/kustomizations/']
});
const deliveryDomain=cloudKnowledgeDomain('cloud-delivery');
deliveryDomain.points.splice(4,0,['gitops','GitOps：源版本、调谐、自愈与清理','GitOps 用版本化源声明期望，由控制器持续获取、渲染、比较并协调现场。Git 修订、镜像摘要、同步状态、资源健康与业务验收分别描述一层事实。','明确字段和对象的管理权；selfHeal、prune、暂停与回退按实际控制器配置解释。',['delivery','kubernetes-basics','config-secrets']]);
Object.assign(cloudKnowledgeExplanations,{
 'artifact-contract':knowledgeSubhead('交付单位是一组兼容的输入，而不只是一个标签')+para(
 '制品摘要标识具体内容，Git 提交标识期望配置的版本，部署修订标识平台保存的某次模板，数据契约说明应用怎样读写持久状态。它们共同构成交付记录。可变镜像标签可以先解析到多平台索引，再选择目标架构的清单；实际运行记录应落到相应内容摘要和架构，才能解释同标签在不同节点的差异。',
 '构建可重复要求固定源代码、依赖解析、工具链和构建输入；部署可追溯要求知道某个环境当时采用了哪些制品与配置。一次构建产物在多个环境中提升使用，可以减少“测试了 A、线上又重建出 B”的差异。密钥和环境参数在授权运行边界注入，既要保护值，也要记录其受控版本或引用。')+
 table(['版本维度','应记录的身份','验证什么'],[['代码与制品','提交、构建输入、内容摘要、平台','跑的是经过检查的那份内容'],['运行配置','版本引用、校验摘要、生效记录','进程实际采用了预期参数'],['数据/接口契约','schema 兼容窗口、依赖版本','新旧消费者可在过渡期工作'],['身份与策略','工作负载主体、授权范围、策略版','相同动作在目标环境可获正确权限']])+
 para('版本记录应能让故障时的恢复选择具体输入：旧制品是否还保留，旧配置能否取得，当前数据能否被旧程序理解。一个 digest 可以证明拿到相同字节；它需要与可信来源、测试和运行结果连接，才支持完整的交付判断。'),
 'ci-cd':knowledgeSubhead('把构建验证、变更计划和运行验收接成可追溯链')+para(
 'CI 在提交进入共享主线前发现集成问题；交付链随后构建并发布制品、更新期望配置、推动部署和验证。各阶段的输入和产物要能关联：提交 ID → 测试记录 → 制品摘要 → 配置修订 → 现场修订 → 业务结果。失败时从首个不一致的交接点定位，能比只看流水线最后一个红灯更快找到原因。',
 '快速检查适合在变更前暴露语法、类型、单元和静态契约问题；集成与目标环境检查负责数据库版本、权限、路由和真实依赖行为。测试数据、调用身份与版本也要固定。把检查全放在发布后会增大影响范围，只检查构建又会漏掉环境与数据兼容问题。')+
 table(['阶段','固定输入/输出','通过后仍需下一步核对'],[['构建','固定源与依赖 → 制品摘要','目标架构、运行配置与依赖'],['变更计划','期望配置 + 已观察状态 → 明确计划','执行时权限、外部变化与部分失败'],['部署','计划/源修订 → API 对象和运行进程','端点、配置生效和数据版本'],['验收','代表性业务输入 → 结果与 SLI','观察窗口、用户分组与后续稳定性']])+
 para('流水线身份应只持有它负责阶段的能力。构建不必拥有生产写权，部署也不必把长期凭据写入仓库。保存检查结果和计划要按内容身份关联，避免审阅了一份计划，执行阶段却悄悄换成另一份。部署成功之后仍要记录用户结果与停止条件，使“何时算完成”具有可检查的含义。'),
 'iac':knowledgeSubhead('Terraform 同时连接配置、state 身份和真实对象')+para(
 '配置描述期望管理的资源，state 将 Terraform 资源实例地址关联到远端对象 ID，并保存必要的已知属性。provider 再读取远端对象，提供新的观察。地址、远端 ID 与显示名称是三个量：改配置地址不总是改远端名称，云上已有资源也不会因为被列出来就自动归入 state。导入、地址迁移和资源移除都需要保持归属清楚，防止两份 state 同时认为自己拥有同一个对象。')+
 figure('v13-iac-three-states','同一个受管容量字段：期望 2、state 旧值 2、现场 5。应用 refresh-only 计划只更新记录为 5；按仍为 2 的期望做正常 apply，才会要求把现场改回 2。')+
 para('正常 plan 默认读取已受管远端对象，再按配置计算创建、更新、替换和删除。只运行 plan 不执行这些资源变更。refresh-only 则计算如何把 state 与相关输出对齐到现场，审阅并 apply 该刷新计划后才提交记录；它不会替人把期望配置改成现场值。接受临时扩容为长期目标时，应修改并评审配置；若现场是误改，则按原期望修复。',
 'plan -out=change.tfplan 保存执行计划，show 用于查看，apply change.tfplan 执行文件中的计划。没有传计划文件的 apply 会重新计划。保存计划固定了当时的输入和动作，却没有锁住云端世界；状态变化可使计划失效，外部权限或 API 失败也会阻止执行。配套真实 CLI 实验会先保存 v1 计划、再把文件改成 v2，证明执行 v1 计划仍产生 v1 状态；随后制造状态变化，验证陈旧计划被拒绝。',
 'remote state 是状态的存放方式，不等于执行一定在远端。只有支持锁的 backend 才提供相应 state 锁，它协调同一状态的并发写入，不阻止控制台、另一份 state 或 HPA 改现场。state 与 plan 可能含敏感值，需要访问控制和版本恢复；输出标为 sensitive 也不意味着底层记录已自动加密或 JSON 导出会隐藏值。')+
 knowledgeCheck('refresh-only 后 state=5，为什么下一次正常计划还要改回 2？','因为配置仍声明 2。刷新接受的是新的观察，不是新的期望。明确由谁拥有这个字段，再选择将配置改为 5，或按已审阅的正常计划把受管字段恢复为 2。'),
 'controller-api':knowledgeSubhead('声明式 API 需要可重复推进的协议')+para(
 '控制器通常按当前观察计算下一步，而不是把一次事件当作必须完整执行到底的命令。一个对象可能被重复入队，watch 断线后可能重新列举，动作完成与状态写回也可能分离。因此调谐应幂等、可恢复，并把正常等待、可重试错误和无效配置区分处理。有限速率与退避减少故障时对 API 和下游的放大。',
 'spec 描述期望，status 报告观察与进度。创建外部资源时，用稳定标识关联对象身份，先查询是否已有对应效果，再推进创建或更新；超时后不随手换新名字重建。写 status 要带上对应观察代际与明确条件，遇到版本冲突则重新观察，避免过期执行者覆盖新事实。相同事件被处理两次，应仍向同一个目标收敛。')+
 table(['生命周期','所需协议','可以核对的证据'],[['创建/更新','稳定外部身份、幂等动作、并发版本检查','对象 ID、观察代际、动作与回执'],['等待依赖','可恢复条件、限速重排、超时策略','当前阻塞原因与下一检查条件'],['删除','标记删除、执行外部清理、确认后移除 finalizer','外部对象已清理或明确采用保留策略']])+
 para('finalizer 让控制器在 API 对象删除前完成必要清理。它需要配套恢复和故障处理：控制器长期不可用时，删除可能停在等待清理；直接移除 finalizer 则可能留下外部资源。CRD 提供 API 结构，Operator 把领域知识编码进这些控制协议；拥有一个 CRD 不等于已经实现了数据库主身份、备份和恢复。',
 '用<a href="/article/delivery/#native-controller-reconcile">一个实际 ReportSink 对象</a>对照状态没写回、重启后按 UID 重试，以及清理完成才移除 finalizer。'),
 'gitops':knowledgeSubhead('沿制品、源修订、现场和用户结果逐层确认')+
 figure('v13-gitops-reconcile','CI 产生制品摘要，Git 保存期望，控制器拉取并调谐；源修订、同步状态、资源健康和业务断言按不同证据验收。c42 与摘要省略号仅为示意。')+
 para('GitOps 把版本化源作为期望入口，由控制器持续拉取、渲染和比较现场。Git 提交里改了什么、构建路径实际渲染出什么、目标集群接受了什么，应逐层对应。改了未使用的 overlay、目标 namespace 错误或源引用仍旧，都可能让“有新提交”与“现场没有目标变化”同时成立。',
 'Argo CD 的 Synced 描述纳入比较的受管资源与目标之间的关系，比较会受默认值、忽略规则和资源跟踪影响；Healthy 依据资源类型或自定义检查评估健康。对象清单已经一致但新 Pod 拉不下镜像，可以 Synced 而不 Healthy；资源健康但报表用错数据版本，则业务断言仍失败。一次 sync operation 的结果也不同于当前持续状态。')+
 figure('v13-drift-prune','两个独立问题：现场字段由 2 手改成 5，selfHeal 决定相应自动修复；从源中移除一个受管 ConfigMap，prune 决定是否发起清理。图保留 Deployment，未混入全空保护。')+
 para('Argo CD 自动同步开启后，selfHeal 控制单纯现场漂移是否按策略自动修复；关闭时，下一次其他同步仍可能覆盖手工改动，所以不能把它当作永久接管现场的方式。prune 控制目标中已移除的受管对象清理，还受 allowEmpty、资源级保护、权限和 finalizer 影响。HPA 合法管理 replicas 时，应明确字段所有权和比较/同步策略，避免两个控制器反复争夺。',
 'Flux 将源获取交给 GitRepository 等对象，报告 Artifact/revision；Kustomization 在指定路径构建、应用，并按 inventory 和配置持续调谐。suspend 暂停新修订与漂移修复，恢复后要核对实际目标与已应用修订。Ready=False 可能来自获取、渲染、依赖、准入或健康阶段；失败重试不是自动回滚到旧版。Argo 的 selfHeal/prune 参数不能原样套到 Flux 对象。')+
 knowledgeCheck('Argo 显示 Synced，服务仍返回 503，先核对哪几层？','核对源修订与渲染范围，再查资源健康、Pod 与 EndpointSlice、配置和真实请求。若对象已对齐而进程未就绪，继续追执行层；若资源健康但内容错误，则追数据版本与业务验收。'),
 'release-strategy':knowledgeSubhead('发布策略控制变化范围，验收决定何时继续')+para(
 '滚动更新逐步替换副本，蓝绿保留可切换的环境，灰度把部分真实流量交给新版本，特性开关在同一部署中选择行为。副本比例、请求比例和用户分组可能完全不同：长连接、权重路由和会话保持会改变新版本实际接到的工作。观察应按版本与人群分组，同时记录请求量、错误和延迟，避免小流量样本或全站均值掩盖差异。',
 '声明发布前提、扩展步幅、观察窗口与停止条件，再逐步扩大。新版本启动失败应停在就绪阶段；逻辑错误需要代表性业务断言；共享数据库压力则可能同时拖慢新旧版本。蓝绿的流量切换也没有自动隔离共享状态，旧连接排空和后台任务仍要纳入时序。')+
 table(['机制','解决的排序问题','需要继续验证'],[['readiness / 发布预算','哪些副本有资格接流量，允许怎样替换','真实请求、容量与停止信号'],['Argo phase / wave','不同阶段和资源批次的先后','早期资源健康、依赖与重入'],['PostSync 业务检查','同步与资源健康之后检查指定行为','覆盖的发布路径、测试身份与结果版本']])+
 para('Argo 的排序先看 phase，再看 wave 等规则；早期 wave 不健康可以阻止后续推进。hook 要能重入、超时和清理，选择性同步不运行 hooks，因此一个 PostSync Job 不能被当成所有路径都会执行的强制验收。数据库迁移已提交后，后面的 hook 失败也不会自动撤销数据。应把发布控制流与持久副作用分开处理。'),
 'rollback-compatibility':knowledgeSubhead('回退是否可行，先检查当前数据还能被谁读取')+
 figure('v12-compatibility-matrix','三版应用与三种数据结构的题设矩阵：扩展、兼容过渡、验证消费者，最后收缩。勾叉来自本例能力定义，并非部署工具的默认保证。')+
 para('扩展后收缩先增加兼容结构，保留旧字段；再部署能处理过渡状态的程序，回填并校验；确认所有消费者已切换后才删除旧契约。回填应能从已确认进度继续，重复执行不产生额外效果。双写若跨系统，必须定义权威源和部分失败协议；同一代码分支里连续调用两个写入没有自动原子性。',
 'Git revert 产生一份新的期望变更，控制器再向该目标推进。它不会回到过去的数据库、撤销已经发送的消息或恢复被覆盖的外部对象。Argo 自动同步开启时的历史 rollback 也有工具约束，不能把命令名当作数据恢复协议。需要回到旧制品时，先确认制品可取、配置和接口兼容，再运行同一套业务断言；不兼容时应设计向前修复或单独恢复/补偿。',
 '供应链校验负责确认内容身份和可信构建来源，例如固定依赖、产物摘要、构建证明及适用签名验证。它降低来源和篡改风险，但通过签名验证的程序仍可能有业务缺陷。最终的交付证据应能连接可信输入、计划与执行、现场版本以及用户结果，让“可追溯”和“可恢复”都落到具体对象。')
});
deliveryDomain.refs.push('v13TfState','v13TfLock','v13TfPlan','v13TfApply','v13TfData','v13ArgoSync','v13ArgoHealth','v13ArgoDiff','v13ArgoWaves','v13ArgoOptions','v13FluxSource','v13FluxKustom');
