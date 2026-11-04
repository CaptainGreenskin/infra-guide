Object.assign(sources,{
 v15Rbac:['Kubernetes · RBAC、作用域与权限累加','https://kubernetes.io/docs/reference/access-authn-authz/rbac/'],
 v15Authz:['Kubernetes · 请求授权与 authorizer 组合','https://kubernetes.io/docs/reference/access-authn-authz/authorization/'],
 v15SA:['Kubernetes · ServiceAccount 与受众','https://kubernetes.io/docs/concepts/security/service-accounts/'],
 v15SAAdmin:['Kubernetes · 绑定 token 与对象状态','https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/'],
 v15SAToken:['Kubernetes · token 投射、刷新与挂载','https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/'],
 v15Multi:['Kubernetes · 多租户威胁与隔离','https://kubernetes.io/docs/concepts/security/multi-tenancy/'],
 v15PSS:['Kubernetes · Pod Security Standards','https://kubernetes.io/docs/concepts/security/pod-security-standards/'],
 v15PSA:['Kubernetes · Admission 的 enforce/audit/warn','https://kubernetes.io/docs/concepts/security/pod-security-admission/'],
 v15Audit:['Kubernetes · API 审计策略','https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/'],
 v15AwsEval:['AWS IAM · 策略求值的实际规则','https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html'],
 v15Deputy:['AWS IAM · Confused deputy 与委托边界','https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html']
});
Object.assign(cloudKnowledgeExplanations,{
 'authentication-authorization':knowledgeSubhead('把主体、委托和目标资源写成一次判定')+para(
 '认证将请求绑定到可被系统信任的主体；授权判断该主体能否在当前条件下对某个资源做某个动作。服务可以通过会话、证书或签名凭证建立身份，但判定最终仍要落到具体的 subject、action、resource 和 context。JSON 合法只说明参数形状正确；带了合法凭证也只完成身份链上的一部分。',
 '一个用户让平台导出租户 A 的报表，平台可能派工作者访问数据服务。数据服务看到的是工作者身份，并不会自动知道用户的原始委托。任务记录应固定获准的租户、动作、资源与预算，下游再核对实际资源归属。如果只凭工作者的大权限和请求里的 tenant 字段执行，攻击者可以把受托服务变成跨租户代理。')+
 figure('v15-identity-chain','身份链把“是谁”“谁委托了哪次任务”和“下游允许访问什么”分开。最后产生数据效果的服务仍要执行资源级授权。')+
 table(['决策层','必须确定的事实','典型核对'],[['认证','可信主体与凭证适用范围','签发者、签名/会话、受众、时效'],['任务委托','这次任务被允许做什么','稳定任务身份、租户、动作和目标集合'],['资源授权','实际对象是否落在允许范围','服务端对象归属、动作和当前策略'],['结果','允许或拒绝后发生了什么','业务回执、无额外写入与审计']])+
 para('不同策略系统的组合方式要分别学习。Kubernetes RBAC 的权限累加，没有通用 deny 规则；RoleBinding 的授权落在其 namespace，引用 ClusterRole 也不等于自动跨域授权。AWS IAM 则要按身份/资源策略、边界、组织策略和主体类型求值；适用的显式 Deny 可以覆盖 Allow。不能把 AWS 的优先级抄成 RBAC 规则，也不能把所有 AWS 策略简单画成同一种交集。',
 '最小权限需要正反两种结果：A 能读必要的 A 对象，也不能用同一接口读 B；只让所有请求都失败没有证明可用性。实际执行点还应读取权威资源归属，而不是接受调用方对对象归属的自报。配套实验同时检查 HTTP 决定和数据库效果，避免只测返回了 403 却漏掉提前发生的写入。'),
 'workload-identity':knowledgeSubhead('运行实例取得身份，数据权限仍由目标服务判断')+para(
 '工作负载身份让运行中的服务或任务以可审计主体访问依赖，避免把一个长期管理员密钥复制到所有实例。身份链通常包含运行平台、签发服务、凭证分发和资源服务验证。每次交接都要明确允许的主体、用途、受众与期限；“运行在可信集群里”本身不是任意数据请求的授权依据。',
 'Kubernetes ServiceAccount 是 namespace 内的工作负载主体。常见的绑定投射 token 由 kubelet 通过 TokenRequest 获取，并投射到 Pod，之后在到期前刷新。应用若把 token 永久缓存在内存里，就可能忽略文件的新版本；不需要调用 API 的工作负载可以关闭相应自动挂载。外部业务服务应使用匹配的 audience，而不是因为一枚给 kube-apiserver 的 token 能验签就接受它。')+
 table(['信息','验证目的','容易混淆之处'],[['issuer / 可信密钥','凭证由谁签发、用哪套信任验证','kid 只是候选选择，不是信任来源'],['audience','凭证签给哪个接收方','能验证签名不等于适用于本服务'],['exp 与有效期','当前是否仍在协议有效窗口','刷新文件不保证应用已经重读'],['业务策略/任务绑定','现在允许哪些动作和资源','短期凭证也可能有过大的权限']])+
 para('在线 TokenReview 和离线 JWT/JWKS 验证的失效行为不同。离线验证可以核对签名、issuer、audience 和时间，却不会自动获知 Pod 或 ServiceAccount 已删除；在线验证还会按集群规则检查绑定对象与 UID 等状态，删除期间也存在规定的时间边界。应按实际接收方测试失效，而不把 delete 请求发出的一刻当成所有会话立即撤销。',
 '部署者能创建什么工作负载也属于身份链。允许创建 Pod 或 Deployment，可能间接获得同域 Secret 或使用更强的 ServiceAccount；只检查没有 get secrets 不足以证明秘密无法取得。授权管理、绑定、提权和 impersonate 等能力需要按平台职责限制，目标服务仍要核对任务与租户。'),
 'secret-lifecycle':knowledgeSubhead('轮换签发材料、更新消费者和撤销旧能力是三件事')+para(
 'Secret 保存敏感配置，base64 是编码；在未配置静态加密的 Kubernetes 中，不能由 Secret 类型推出 etcd 中已有密文保护。传输加密保护链路，静态加密保护存储介质，业务授权限制实际使用者，三者作用不同。信封加密还会区分数据密钥与保护该密钥的上层密钥，解密权和数据访问权需要共同评估。',
 '轮换要跟踪源版本、分发版本与进程实际使用版本。普通卷投射按规则传播更新，subPath 与环境变量有不同刷新行为；修改 API 对象不等于既有进程已经采用新凭据。应让新旧版本在受控窗口兼容，核对签发、验证与消费者记录，再撤下旧能力。')+
 figure('v15-key-rotation','有条件的轮换算例：10:10 停止 K1 签发，最长旧 token 为 60 分钟，验证容差最多 5 分钟，因此兼容窗口按最迟 11:15 推导。它不是 Kubernetes 默认期限。')+
 knowledgeFormula('计划轮换的一项时间预算','旧验证材料保留上界 ≥ 最后一次旧签发 + 最长有效期 + 约定验证容差','成立还依赖所有签发端已切换、时钟/缓存受控、没有更长会话或其他认证路径。')+
 para('签名私钥用于签发，公钥用于验证。先让目标验证者具备 K2 的验证能力，再切换签发，才能让新凭证正常工作。停止 K1 签发不会让已有 K1 token 自行消失，移除一个普通 Secret 也不会收回已读数据或已完成的动作。长期 legacy token、明确绑定的 Secret 与普通密钥载体又有不同语义，需要分别核对。',
 '私钥泄露时的目标是阻断伪造，不能机械等待正常轮换窗口。可选择紧急撤信、在线策略检查或清理会话，并验证实际拒绝与可用性影响。课程只解释协议和验收条件；本地实验验证固定信任集合的切换，不把它当作托管控制面密钥轮换已经完成的证据。'),
 'tenant-isolation':knowledgeSubhead('先定义互信程度，再逐层安排隔离')+para(
 '同公司协作团队、SaaS 客户和可以提交任意镜像的外部用户，威胁模型不同。namespace 提供命名和部分 API 资源作用域，不能自动隔离共享内核、集群级对象、网络、外部数据库或控制面。为强对抗租户选择独立集群、虚拟控制面、专用资源或更强运行沙箱时，也应继续检查共享身份和数据服务。')+
 figure('v15-tenant-boundaries','隔离按身份、数据、网络、资源、执行与审计逐层落实。每层需要自己的允许路径和拒绝证据，单一 namespace 不包办这些约束。')+
 table(['层','边界与控制','最小对照'],[['数据','服务端租户/行/对象键/卷授权','A 自有对象成功，A 访问 B 失败'],['网络','实际插件实施 ingress/egress 策略','必要依赖可达，禁止路径不可达'],['资源','quota、requests/limits 与调度/运行约束','租户额度与共享资源干扰分别测量'],['执行','宿主接口、权限、沙箱/独立内核','按允许系统调用、设备与挂载检查'],['管理与审计','API 权限、配置变更与访问记录','租户不能修改另一域的身份/策略']])+
 para('网络策略需要兼容实现真正执行，源端出站与目标端入站在相应方向被隔离时都要满足允许规则。只看到 YAML 已接受，或只有一次 ping 失败，不能代替目标协议和业务请求测试。配额约束 namespace 中的消费总量，也不等于已经为它预留了独占硬件或保证数据保密。',
 'noisy neighbor 还会通过共享缓存、磁盘、连接池和控制面放大干扰。测试应同时观察租户的用户结果、资源限额和共享依赖；分开判断越权、容量争用与故障传播，才能为不同信任等级选到合适的边界。'),
 'execution-security':knowledgeSubhead('运行权限在准入、进程与宿主三处收敛')+para(
 '准入检查控制允许创建什么对象，运行时配置约束进程能做什么，宿主和沙箱架构再决定隔离强度。非 root、能力集裁剪、只读根文件系统、seccomp、挂载限制与网络出口分别减少不同攻击面；它们是可组合控制，不是一个“安全容器”开关。保留哪些系统调用、设备和写目录，应由实际业务最小需求决定。',
 'Pod Security Standards 的 Privileged、Baseline、Restricted 描述不同约束档位，执行需要 Admission 或等效机制。Pod Security Admission 的 enforce 才会在适用边界拒绝不合规 Pod，audit/warn 主要留下记录或警告。上层 Deployment 对象已被接受，也不证明后续 Pod 可以创建并运行。')+
 table(['控制点','解释什么','继续核对'],[['准入策略','字段/来源/权限是否符合部署要求','模式、版本、适用对象与绕过路径'],['进程配置','UID、capabilities、系统调用与可写路径','所需功能是否仍成功，禁止动作是否失败'],['宿主/沙箱','内核、设备、文件与网络接口的隔离','兼容性、逃逸面、凭证与数据端授权']])+
 para('普通容器通常共享宿主内核；用户态内核、轻量 VM 和专用节点有不同边界与代价。Restricted 档位不会凭空创建独立内核。评估不可信代码时，应把接口暴露、可用凭证和外部数据写权一起列出，再以目标环境证据检验，而不是仅按产品名或某个标签判断隔离完成。'),
 'audit-accountability':knowledgeSubhead('记录决定与实际效果，才能解释允许和拒绝')+para(
 '一次可追查事件至少关联主体、任务/请求 ID、动作、资源、策略版本、判定原因、结果与时间。API 审计说明控制面接受了什么，业务审计说明数据服务怎样处理资源；两者需要关联，而不是互相替代。匿名或认证失败事件也应保留适当线索，避免只有成功日志时无法解释攻击与误拒绝。',
 '日志本身也是受保护数据。不要把 bearer token、Secret 值、密码或完整敏感业务正文写进审计；路径和查询参数也要按敏感性裁剪。对审计读取、保留、完整性和时间源建立管理边界，并记录丢失与导出失败，避免把“没有看到记录”直接当作“请求没有发生”。')+
 knowledgeFormula('最小权限的正反验收','必要操作成功 ∧ 禁止操作被拒绝 ∧ 拒绝路径无未授权效果','返回码、策略决定和资源事实分别核查；已发生的效果不因后续撤权自动撤回。')+
 para('配套本地服务处理真实 HTTP 请求，用 HMAC（共享密钥消息认证码）保护一个明确受限的教学 capability，再按服务端策略与数据库行归属检查。实验包含正常读取、跨租户、同路径伪装归属、只读写入、错误受众、到期、伪造签名与策略撤销；最后检查 A 只有获准的一次写入、B 为零。它提供可重现的执行边界，不宣称实现了 JWT/OIDC 或真实集群 RBAC。')+
 knowledgeCheck('一个 RoleBinding 引用 ClusterRole，会让主体自动跨 namespace 读 Secret 吗？','该绑定的授权作用域仍是它所在的 namespace。还需检查其他绑定、authorizer 和间接权限，例如创建能挂载 Secret 的工作负载；“没有 get”也不能排除 list/watch 等路径。')
});
cloudKnowledgeDomain('cloud-security').refs.push('v15Rbac','v15Authz','v15SA','v15SAAdmin','v15SAToken','v15Multi','v15PSS','v15PSA','v15Audit','v15AwsEval','v15Deputy');
