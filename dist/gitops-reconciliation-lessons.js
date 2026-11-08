/* Sync, health and user-visible version are independent observations. */
Object.assign(sources,{
 dsArgoCore:['Argo CD · Core安装与使用','https://argo-cd.readthedocs.io/en/stable/operator-manual/core/'],
 dsArgoAuto:['Argo CD · 自动同步、自愈与清理','https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/'],
 dsArgoHealth:['Argo CD · 资源健康判断','https://argo-cd.readthedocs.io/en/stable/operator-manual/health/'],
 dsArgoProject:['Argo CD · 项目中的源与目标限制','https://argo-cd.readthedocs.io/en/stable/user-guide/projects/'],
 dsConfigMap:['Kubernetes · ConfigMap注入与更新','https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/']
});
const gitopsReconcileSections=[
 ['先画出Git、控制器、集群和业务四层关系',
 para('Git保存版本化文件，每个提交标识一份确定的历史内容；提交SHA是标识该提交的一串摘要，本实验固定完整值。GitOps用这样的声明作为期望，由控制器持续读取目标系统、比较差异并推进调整；调谐就是这种“观察、比较、执行、再观察”的循环。它不是一次git push就同步执行到底的脚本。',
 'Argo CD是本章使用的GitOps工具。Application对象描述源仓库、路径、修订和目标集群/命名空间；控制器取得声明，比较并同步受管对象。Kubernetes控制器再把Deployment等声明推进成实际Pod和进程，业务请求最后才从这些进程获得结果。每层都有自己的状态与失败方式。',
 '图中Synced表示比较范围内的声明相符，Healthy表示资源健康规则通过。UID是Kubernetes为对象分配的唯一身份；名称相同的Pod重建后，UID会变化。先把这些状态放在各自层次上，下一节再解释它们为什么不能替代业务验收。')+
 figure('v49-gitops-four-facts','同一服务的四层事实：固定Git提交、集群对象、进程已读配置、HTTP实际版本。上游一致不自动证明下游已经切换。')+
 table(['对象','负责什么','本章证据'],[['Git修订','确定期望清单','三个完整提交SHA'],['Application与控制器','比较和同步受管资源','同步修订、操作结果、差异'],['Deployment / Pod','推进副本与容器生命周期','模板、Pod UID与就绪状态'],['业务服务','处理真实请求','经Service请求/version得到的JSON']])+
 para('UID是Kubernetes为对象分配的唯一身份。名称相同的Pod重建后，UID会变化；比较它可以帮助判断进程是否真的被替换。本章同时看名称、UID、配置和响应，避免仅凭“版本号字段已改”推断整条链都完成。')],
 ['Synced、Healthy与业务正确，分别证明什么',
 para('Synced表示Argo CD在其比较与管理范围内认为现场对象与目标声明一致。Healthy表示按资源健康规则，受管资源达到相应健康条件。操作Succeeded表示这次同步操作完成；这些判断都没有自动定义“用户应该看到v2”这条业务要求。',
 'Deployment可以有足够可用副本，却运行着启动时读取的旧配置。健康端点如果只返回HTTP 200，也可以在返回旧版本时仍成功。业务验收要在任务开始时另定，例如“请求/version得到version=v2”，再从实际服务路径执行，而不是让应用自行声称已经满足新目标。')+
 table(['信号','能支持的判断','还要继续核对'],[['同步修订等于目标SHA','控制器比较的是这份源','实际字段、忽略规则和受管范围'],['Synced','比较范围内声明一致','进程怎样读取配置'],['Healthy','资源健康规则通过','当前用户结果是否符合目标'],['HTTP 200且version=v2','这次路径返回预期值','覆盖范围、质量、负载与其他业务约束']])+
 para('本章只验证一个简单版本接口，不能用它替代真实服务的完整验收。实际发布还要覆盖数据兼容、权限、关键查询和性能。先把判断拆清，再安排各自探针，才能解释多个绿灯为何仍可能遗漏问题。')],
 ['自动同步、自愈和清理，是三个不同开关',
 para('自动同步让控制器在满足规则时推进新的源差异。自愈selfHeal让它对现场漂移再次同步；清理prune允许删除已经由本应用管理、却从期望中移除的对象。启用自动同步，并不等于自愈和清理都已启用；相应enabled总开关关闭时，单独填写另外两个字段也不会自动执行。',
 '实际实验的Git期望为一个副本。先关闭自愈，把现场手工扩为两个；控制器看见OutOfSync，但现场仍是两个，资源健康仍为Healthy。开启自愈后，同一Git修订下副本恢复为一个。这里改变的是执行策略，源内容没有换版。')+
 figure('v49-gitops-policy-matrix','真实策略对照：自愈关闭时保留现场2副本，开启后恢复1；清理关闭保留已移出Git的受管ConfigMap，开启后删除它，未受管对象保留。')+
 code('本实验先关闭自愈和清理，再分别开启','YAML','syncPolicy:\n  automated:\n    enabled: true\n    selfHeal: false\n    prune: false')+
 para('调谐有检测、排队与执行时序，不能承诺现场一变就瞬时恢复。自动同步也有同修订去重、失败重试等具体规则；实验通过明确刷新和状态等待取证，不把某次等待时长当作默认服务承诺。多套自动化若争改同一字段，应先界定所有权，不能只把自愈调得更频繁。')],
 ['清理依据受管关系，不是删除所有多余对象',
 para('v1源中有一份guide-retired ConfigMap。ConfigMap是Kubernetes保存非敏感键值配置的对象。v2从Git移除它；prune关闭时，同步操作可以成功，旧对象却仍在，应用仍为OutOfSync。开启清理以后，这个受管对象被删除。',
 '同一命名空间还放了一份由实验直接创建、未交给该Application管理的unmanaged ConfigMap。它在两种清理策略下都保留。清理要根据工具记录的受管身份和规则判断，不应被理解为“命名空间里凡不在这份Git里的都删掉”。',
 '删除本身还有权限、保护注解、终结器和传播等语义。终结器是要求控制器完成清理后才能最终移除对象的一组标记；空源是否允许被自动清空，也有额外配置。本例只验证两份普通ConfigMap的归属与清理，不据此承诺所有自定义资源都能立即删除或恢复。')+
 table(['v2源已移除旧配置后','prune关闭','prune开启'],[['guide-retired，原来受管','保留','删除'],['unmanaged，从未交给本应用','保留','保留'],['同步操作与整体差异','操作成功，但仍OutOfSync','本例达到Synced']])],
 ['环境变量为什么不会随ConfigMap自动改值',
 para('环境变量是一份提供给进程的启动环境。本例Pod通过configMapKeyRef把ConfigMap的version键注入BUSINESS_VERSION，Python服务从这份环境中读取版本。之后只修改ConfigMap对象，没有修改Pod模板，也没有重建进程，已有环境变量不会跟着变。',
 '这与文件投射和应用主动热重载不同。卷中的配置文件可能按相应规则更新，但应用是否重新打开、解析并切换仍需明确；环境变量路径更不能靠对象更新自动注入旧进程。排查时把“控制面对象值”“进程读入值”“请求返回值”分别拿出来。')+
 code('本实验的注入点；完整Deployment见实验包','YAML','env:\n  - name: BUSINESS_VERSION\n    valueFrom:\n      configMapKeyRef:\n        name: guide-version\n        key: version')+
 para('可选方案包括版本化配置引用、把配置摘要纳入Pod模板以触发替换，或设计应用自己的校验与热重载。本章使用最容易观察的一种：在Git中改变模板注解guide/revision，引发新Pod。这个注解只是本例的声明变化，不是Argo CD专用的魔法字段。')+
 linkTo('config-secrets','继续比较环境变量、卷文件与进程内缓存')],
 ['三个固定提交，把控制面绿灯与用户结果对上',
 para('三个Git提交使用同一路径，按顺序只增加必要变化。第一份fb18c80提供v1配置与模板；第二份872b300把配置改v2、移除旧ConfigMap，但保持模板不变；第三份703f38b再把模板注解改为v2。完整SHA保存在gitops-revisions.json，控制器状态必须对应那个完整修订。')+
 figure('v49-gitops-version-path','实际结果：第二个提交经清理后Synced/Healthy，但Pod UID与之前相同，HTTP仍v1；第三个提交更换模板后，UID变化，HTTP才为v2。')+
 table(['源修订','配置对象','Pod身份','Argo状态','真实HTTP / 目标'],[['fb18c80','v1','初始Pod','Synced / Healthy','v1 / v1，通过'],['872b300，清理完成后','v2','同一个UID','Synced / Healthy','v1 / v2，拒绝'],['703f38b','v2','新UID','Synced / Healthy','v2 / v2，通过']])+
 para('第二行不是模拟出来的告警标签：实验真正启动HTTP服务，经集群Service发请求，再读JSON的version；另从API取得Pod UID和配置。独立验收判据是version应为v2，因而明确失败。等第三行通过以后，才能在这个实验范围内说新版已生效。',
 'Pod UID变化也不能单独证明业务正确。新Pod可能注入了错误配置，服务选择器可能指向另一组后端，进程还可能缓存旧数据。本例同时核对身份、源、配置和实际响应，让每一条因果都能找到相应记录。')],
 ['回退要改变期望，再验证旧版本还能工作',
 para('实验最后把Application的目标修订改回第一份固定SHA。控制器将配置与模板恢复到v1，新Pod返回v1，并重建v1仍声明的guide-retired对象。这是改变期望修订触发的调谐，不是调用Argo CD的rollback API；自动同步开启时，后者有专门限制。',
 '源版本回去了，不表示数据库、外部写入和已清理产物也能倒流。本实验没有数据迁移，只验证这一组配置、模板和HTTP服务。真实回退要先检查旧代码所需数据结构、凭据和外部接口是否仍存在，再用同一组用户断言验收。',
 '紧急手改现场也要有归位计划。自愈开启时，控制器可能把手改恢复为Git期望；若需要暂时接管，先定义策略与权限，再把修复反映到受控声明或完成正式交接，避免两个写者互相抵消。')+
 linkTo('delivery','回到数据兼容与发布退出条件')],
 ['从源到响应，按最后成功阶段排障',
 table(['阶段','先取哪份证据','典型下一步'],[['源读取','repoURL、路径、完整修订与条件','核对访问、渲染与源内容'],['比较与同步','资源差异、操作结果、项目规则','检查字段归属、权限与同步策略'],['集群执行','模板、代次、Pod与事件','检查调度、镜像、配置和探针'],['业务生效','进程读数、Service响应及期望值','检查读取时机、路由、缓存和任务语义']])+
 para('AppProject为本实验限定源仓库、目标命名空间及允许的ConfigMap、Service和Deployment类型。它是Argo CD层面的项目规则，不替代Kubernetes执行身份的权限，也不证明业务租户隔离。本次控制器只部署在自己创建的kind集群中，结束删除该集群。',
 '记录时间线时保留“源变更”“控制器观察”“对象同步”“新Pod就绪”“首个正确业务响应”几个事件。图中的箭头表示因果与先后，不把它们画成等宽就宣称同样耗时。健康、同步和用户结果分别计量，排障才能收敛到具体边界。')],
 ['在独立kind集群重放，再读完整源码',
 para('本次实际运行Argo CD Core v3.6.1、kind v0.33.0和Kubernetes v1.35.8。Core模式运行同步所需组件，通过Kubernetes的Application等资源交互，不需要额外对外暴露管理界面。本实验读取本站公开夹具，固定三个修订；没有使用用户的私有仓库凭据。',
 '程序创建随机命名集群，每次kubectl都指定自己的临时kubeconfig与context；不会使用用户当前默认集群。所有应用资源都在guide-demo中，服务只在该集群内访问。kind仍是单机节点容器，不据此验证云生产、跨主机网络、真实CSI或高可用控制面。')+
 deliveryRun('gitops_reconcile.py','gitops-native-run','python3 -B gitops_reconcile.py --output runs/gitops-record.json')+
 deliverySource('gitops-revisions.json')+deliverySource('gitops-app/configmap.json')+deliverySource('gitops-app/deployment.json')+deliverySource('gitops-app/service.json')+
 para('先预测只改配置时UID和HTTP会不会变化，再运行。接着切换自愈与清理，逐项核对受管对象、未受管对象和实际响应。若某个等待条件失败，先读保留下来的Application状态；不要直接延长所有超时或把业务断言删掉。')]
];
articles.push({id:'gitops-reconciliation',number:'C6.3',module:'cloud-delivery',title:'GitOps调谐：从Git期望到对象、进程与业务结果',desc:'用真实Argo CD和三个固定Git修订，讲透自动同步、自愈、清理及“绿灯却仍返回旧版”的原因。',intro:'同步声明、资源健康、用户得到正确版本，是相连的三项检查。沿同一服务逐层取得事实，才能判断交付是否完成。',
 prereq:'先读Kubernetes控制面、工作负载和配置注入；本章先介绍GitOps、Application与同步关系，再进入实测。',objectives:['区分源、对象、进程与业务结果','解释自动同步、自愈和清理的作用域','按实际HTTP结果验收切换与回退'],sections:gitopsReconcileSections,
 check:['Synced、Healthy和Succeeded各在判断哪一层？','自愈开启会不会自动允许删除旧对象？','ConfigMap改了为什么UID和环境变量可能不变？','怎样独立验证新版与回退结果？'],
 exercise:['Git配置v2，Argo显示Synced/Healthy，但Pod UID没变、HTTP仍v1。应重跑同步、改业务断言，还是先找配置进入进程的方式？','先核对注入与读取时机。环境变量通常来自启动环境，只改ConfigMap不改变旧进程；按受控声明更新模板或实现明确热重载，再验证新UID、实际配置与Service响应，保留原v2断言。'],
 refs:['dsArgoCore','dsArgoAuto','dsArgoHealth','dsArgoProject','dsConfigMap'],related:['delivery','terraform-state','kubernetes-basics','config-secrets','k8s-workloads'],textbook:true,minutes:45,level:'机制 + 真实控制器 + HTTP',edition:'GitOps调谐',baseline:'Argo CD 3.6.1 / kind单机；只操作自有集群',tags:['GitOps','同步','自愈','版本验收'],updated:'2026.11.08'});
focusChapters.add('gitops-reconciliation');
