/* Model release is a byte/structure/semantic/quality/service contract, not a weights filename. */
const artifactObjects=infraReadableHTML(
 '<div class="mechanism-core" id="model-bundle-contract">'+knowledgeSubhead('先区分训练恢复包、推理版本束和可变生产入口')+
 table(['对象','服务谁','典型成员'],[
 ['训练检查点','从指定更新继续训练','权重、optimizer、scaler、随机状态、数据进度与训练配置'],
 ['推理版本束','按确定输入输出协议提供服务','权重/分片清单、模型结构、tokenizer、特殊token、模板、生成/数值配置与引擎依赖'],
 ['生产别名或路由','选择当前使用哪份已验证产物','指向不可变版本的可变引用，另有发布代际与分流策略']])+
 para('请求经过文本预处理、模板、tokenizer得到ID，再由模型权重生成数值，解码和输出协议决定交付。权重、词表、模板或停止条件任何一项变化，都可能改变行为。交付对象应是一份完整版本束，不是model=latest或一个权重路径。请求日志记录当时解析出的不可变版本，不能只保留事后已经指向别处的production别名。',
 '清单写成员名、大小、摘要、模型/协议版本、加载器和运行库约束；部署记录再关联镜像摘要、硬件、精度与并行配置。先上传并验证全部不可变成员，再发布对外引用。多个文件各自上传成功，没有自动组成一次对外原子切换。')+'</div>');

const artifactEvidence=infraReadableHTML(
 knowledgeSubhead('完整性、可加载、语义和服务能力是不同门禁')+
 table(['门禁','回答什么','典型反例'],[
 ['字节完整','内容是否与清单一致','缺分片、错文件、摘要不符'],
 ['结构/加载兼容','目标引擎能否按声明解释张量和配置','shape/dtype、算子、并行分片不兼容'],
 ['输入输出语义','同一ID、模板和格式是否仍代表约定含义','词表ID交换、特殊token或工具格式变化'],
 ['任务质量','代表性任务及关键切片是否合格','总分上升，重要类别退化'],
 ['服务能力','目标负载下延迟、错误、容量与资源是否达标','冷加载、长输入或KV容量问题']])+
 para('摘要校验回答“是不是这份字节”，不回答发布者是否可信，也不判断模型有用。若攻击者能改清单及成员，重新写摘要不难，因此产物来源、签名验证与受信发布链另有职责。Safetensors以张量格式取代通用pickle加载，并不替代来源信任、资源大小限制或模型语义评估。',
 '加载器应对已核对的不可变内容工作。本例先读小文件、验证大小和摘要，再直接从这些字节读取张量，不在校验后重新打开可变路径。大型模型不能照搬整包读入RAM，应按引擎、分片和不可变暂存设计流式校验/加载，并在目标机器测量加载峰值和启动耗时。'));

const artifactSemantics=infraReadableHTML(
 knowledgeSubhead('形状相同，词表与权重行仍可能配错')+
 para('下面r17/r18/r19只属于配套小模型。固定语义合同是A输出1、B输出2、未知输入0。r17词表A=0、B=1，embedding三行[1,2,0]；r18只把词表A/B交换，张量形状、文件摘要和加载都通过，输出却变A=2、B=1。语义门禁必须拒绝它。')+
 figure('v27-bundle-semantics','实际PyTorch/Safetensors小模型。r19把词表与对应权重行一起更新，重新满足合同；固定A/B标签不是LLM效果评估。')+
 para('r19将词表交换，并把权重三行变[2,1,0]，再次得到A=1、B=2。r17、r19各自都正确，但将r19权重和r17词表混装仍错误。这就是请求要固定完整束的原因：不是每个成员分别合法就可以任意组合。语言模型的词表、特殊token、聊天模板、位置配置与工具格式也需要相应的语义回归。',
 '结构最小请求可先抓出加载错误；语义回归核对输入变成哪些ID、特殊边界与输出结构；开放任务质量再用版本化数据和评分器。eval()切换部分算子的评估模式，不会把参数变成不可修改对象；生产发布必须禁止在途请求依赖的对象被偷偷原地改写。'));

const artifactPointer=infraReadableHTML(
 knowledgeSubhead('对外只切已验证引用，条件更新拒绝迟到发布者')+
 para('发布器读取当前r17、代际1和清单摘要，准备好r19并通过门禁后，以这些旧值作为条件切换到r19、代际2。若期间别人已经更新，旧发布器不能继续覆盖。发布请求超时，也应先查询当前指针和发布事件，区分未提交、已提交及竞争更新。')+
 figure('v27-publication-pointer','实际SQLite条件更新：r17/1→r19/2→r17/3。小模型门禁、迟到发布者、残缺回退与有效回退分别验证。')+
 para('条件中保留代际可以防止“值又变回r17”的旧请求误以为从未发布过。回退是一次新的发布，旧业务版本可回到r17，发布代际仍前进到3。清单摘要也绑定具体内容，避免同一名字指向另一份文件。',
 '控制面指针更新不等于所有副本已经加载，也不意味着旧流立即停止。请求开始时捕获完整模型束与缓存语义，流式请求继续使用该束直至按协议结束；新请求按新路由入场。按实际版本分别记录加载、Ready、请求和排空，不能混用另一版本的KV或前缀缓存，除非有明确且验证过的兼容保证。'));

const artifactQuality=infraReadableHTML(
 knowledgeSubhead('质量门禁保护关键任务，不能只看总体平均')+
 para('下面S/X是独立手算题，与小模型r17/r18无关。1000题中普通900、关键100。基线S通过855+95=950题，总体95%；候选X通过882+80=962题，总体96.2%。但关键切片从95%降到80%，若预先门槛90%，X应在离线阶段被拦下。')+
 table(['固定手算集','普通900题','关键100题','总体1000题'],[
 ['基线S','855/900=95%','95/100=95%','950/1000=95%'],
 ['候选X','882/900=98%','80/100=80%','962/1000=96.2%']])+
 para('冻结题集版本、评分器、样本来源、预算和关键门槛，再运行比较。少量题的波动、同题配对、重复试次和评分器错误应另行处理；不把一次全对或一个总体百分比当成普遍能力。高后果错误也不能靠其他简单题的成功抵消。')+
 linkTo('agent-evaluation','复习评分器校准、小样本区间与同题配对'));

const artifactCanary=infraReadableHTML(
 knowledgeSubhead('灰度按实际服务版本比较，混合绿色可能掩盖候选失败')+
 para('再换成已经通过自己离线门禁的独立候选Y。一次固定教学窗口里，Y有1000请求、失败8，错误率0.8%；稳定版19000请求、失败38，错误率0.2%。混合为46/20000=0.23%。若Y的门槛0.5%，混合绿色不能放行。路由配置5%是目标，分母仍应使用实际到达并按既定规则归属的请求。')+
 table(['手算分组','请求数','失败数','错误率'],[['候选Y','1000','8','0.8%'],['稳定版','19000','38','0.2%'],['混合','20000','46','0.23%']])+
 para('按分流组（cohort）对齐输入长度、任务类型、输出预算、缓存冷热、硬件和观察窗口。比较TTFT、输出间隔和失败时保留超时与未完成请求，不能只看已经顺利结束的流。质量、服务和成本分别评估，再按预先协议放量或停止。',
 '影子流量若会调用外部工具，必须隔离副作用；复制真实请求并允许两边写入，会把一次业务变两次。模型发布的效果门禁不能替Agent的授权、工具结果和任务恢复作证。模型服务版本应与Agent提示、工具schema、策略及任务状态关联，形成能复查的完整链。'));

const artifactRollback=infraReadableHTML(
 knowledgeSubhead('可回退要保留旧产物、可运行环境和容量')+
 para('有一个r17标签，不证明回退可用。旧词表或权重分片被清理、目标引擎不能加载、依赖镜像丢失、所需硬件没有容量，都能让紧急回切变成等待。实验专门复制一份残缺r17：缺tokenizer时先拒绝加载，路由留在r19；使用完整旧束时才切到r17/代际3。',
 '真实回退按新请求实际命中旧完整束、输出合格及服务质量恢复验收，保留旧流排空记录。回退不会撤回用户已经读到的回答，也不会取消已提交的外部效果；后者靠任务身份、接收方回执和对账处理。产物保留、兼容窗口和恢复容量应在上线前验证。'));

const artifactPractice=infraReadableHTML(
 knowledgeSubhead('实战：实际张量包、语义门禁与条件切换')+rarLab('artifact_bundle.py')+
 '<details class="full-code"><summary>展开实际requirements-model.txt</summary>'+code('requirements-model.txt','TEXT',recoveryArtifactsRetrievalFiles['requirements-model.txt'])+'</details>'+
 knowledgeCheck('r17与r19各自通过，混用两者成员为什么仍失败？','词表ID和对应权重行是一份语义映射。各自完整通过只证明原组合；r19权重与r17词表会把A/B含义交换。请求固定完整清单，不能逐文件追可变latest。')+
 para('本例证明小模型的字节、结构、固定语义与本地指针机制。目标引擎的算子/精度/并行兼容、真实任务质量、GPU加载峰值和线上灰度仍需按相应环境验证。')+
 linkTo('model-serving','继续验证引擎加载、KV与实际请求路径'));

{
 const a=articles.find(a=>a.id==='ai-lifecycle');
 a.sections=[['发布对象：检查点、版本束与生产入口',artifactObjects],['验收层次：完整、结构、语义与服务',artifactEvidence],['词表与权重：同形状的语义反例',artifactSemantics],['发布协议：固定请求与条件切换',artifactPointer],['离线门禁：关键切片与固定比较协议',artifactQuality],['灰度与Agent交接：实际版本、流量和副作用',artifactCanary],['回退验收：完整旧束、运行环境与容量',artifactRollback],['实际CPU实战：张量包与发布指针',artifactPractice]];
 a.refs=nitRefs([...a.refs,'v27SafeTensor']);a.minutes=60;a.updated='2026.11.05';
 a.objectives=['定义完整推理版本束并分层验收','解释同形状语义错误、不可变引用和条件切换','运行实际张量包门禁，并设计质量/灰度/回退验收'];
}
{
 const d=infraDomain('platform');
 d.points.find(p=>p.id==='sv-contract').body+=artifactObjects+artifactEvidence+artifactSemantics;
 d.points.find(p=>p.id==='sv-release').body=artifactPointer+artifactQuality+artifactCanary+artifactRollback;
 d.refs=nitRefs([...d.refs,'v27SafeTensor']);
}
const artifactCasesBeforeRAR=infraFieldCases.platform;
infraFieldCases.platform=()=>'<h3>模型交付：语义正确的完整版本束</h3>'+rarLab('artifact_bundle.py',false)+linkTo('ai-lifecycle','阅读发布门禁、灰度和回退')+artifactCasesBeforeRAR();
