/* Keep the existing delivery/ACL oracle; add real lexical retrieval and transparent fusion mathematics. */
const retrievalLexical=infraReadableHTML(
 '<div class="mechanism-core" id="retrieval-lexical-foundation">'+knowledgeSubhead('中文先看索引里有哪些词，零命中未必是资料不存在')+
 para('全文检索先把文本变成可匹配的词元，再维护词到文档位置的倒排索引。查询也要走兼容的处理。分词、大小写、标识符、标点和同义词策略，决定哪些材料有机会进入候选；后面的重排无法修复一个从未召回的片段。',
 '实际FTS5实验直接用unicode61索引8条中文材料。句子“数据库备份支持恢复”里的连续汉字形成较长词元，单查“恢复”没有该独立词，实际0命中。把相邻汉字预处理为二元片段后，查询“数据库恢复”变成数据、据库、库恢、恢复，使用OR匹配，才能在本语料中找到相关段落。')+
 figure('v27-chinese-fts','真实SQLite FTS5与查询处理。汉字二元片段只是机制示例，会产生跨词片段、单字召回等问题，不能当通用中文分词器。')+
 para('生产系统按语料选择中文分词或字粒度方案，并测试产品名、错误码、版本号、英文缩写和长词。不要仅调top_k却不看索引中的实际词。实验用参数化SQL传MATCH表达式，表达式由受限词元构造；SQL参数化与全文查询语言的语法处理也是两层事。',
 'BM25综合词频、稀有程度和长度归一化：同词多次出现有递减收益，稀有词通常更有区分力，长文不会只因机会更多就必然排前。SQLite FTS5的内置BM25将结果取负，数值越小越靠前，应升序；别把另一个搜索系统“分数越大越好”的习惯直接搬来。'));

const retrievalFusion=infraReadableHTML(
 knowledgeSubhead('融合多路召回时，先分清分数与名次')+
 table(['阶段/机制','擅长或改变什么','边界'],[
 ['关键词/BM25','精确词、标识符与词频/长度关系','同义改写可能缺少词面重合'],
 ['向量召回','按选定embedding与距离寻找表示相近项','距离不是事实正确或权限合法的证明'],
 ['RRF排名融合','按多路名次合并，不要求原始分数量纲相同','丢弃分数间距；仍只处理各路已有候选'],
 ['重排','对给定候选重新评估顺序','不能找回未进入候选池的必要资料']])+
 knowledgeFormula('倒数排名融合RRF','score(d) = Σ[1 / (k + rankᵢ(d))]；本例k=60、名次从1开始','只在该路包含文档时贡献；同一路重复文档不能重复加分。原始BM25与向量分数不直接相加。')+
 para('例如a-backup在词面第1、另一排名第2，得1/61+1/62≈0.032522；a-archive在词面第3、另一路第1，得1/63+1/61≈0.032266。前者略高。这个数由名次算出，不是相关概率。k变大时头尾名次的差异相对缩小；每路候选窗口又决定哪些文档能贡献。参数应按实际任务评估，不能当成固定最优值。',
 '实验的BM25是真实执行，第二路明确写成一份固定排名，不调用embedding；这样可独立核对融合算式。权限、当前版本和正文交付的要求不因融合改变。若将不合法正文先交给任务，之后删掉排名项，已经发生的交付不能被抹掉。'));

const retrievalGraded=infraReadableHTML(
 knowledgeSubhead('命中数相同，分级相关性的排列仍会改变质量')+
 para('前面的Precision、Recall、RR把相关性视为二元标签。若材料有支持程度差别，可先约定分级标准，再看高等级是否靠前。本例人工声明a-backup=3、a-dr=2、a-plan=1、a-archive=2，其他0；等级不由本次排序反推，也不是模型评分。')+
 knowledgeFormula('本例的折扣增益','DCG@k = Σ[(2^relᵣ − 1) / log₂(r + 1)]；nDCG = DCG / 同一标签集的理想DCG','r从1开始。需要固定标签、截断、增益和无正例规则；其他定义不能混着比较。')+
 figure('v27-ranked-gains','按实际程序计算的折扣贡献。两份排序前三都命中3项，P@3=1、Recall@3=0.75、RR=1；nDCG仍由0.8786变0.9038。第二路排名与分级标签是声明输入。')+
 para('BM25前三等级[3,1,2]，RRF前三[3,2,1]。后者把等级2移到第二位，DCG从约9.13093到9.39279；理想前三[3,2,2]的DCG约10.39279，故两者nDCG都未到1。RRF没有使用标签作弊，但这个固定例子也不能证明RRF在真实任务里总更好。',
 '如果问题需要两份材料共同支持，分级排序得分仍不能代替完整证据覆盖。无正例时理想DCG为0，不能悄悄除零后塞成满分或零分；单列无答案任务的正确拒绝与错误引用。相关性、支持主张、时间版本和权限都应有各自判据。'));

const retrievalFreshness=infraReadableHTML(
 knowledgeSubhead('正文更新不等于索引同步，引用还要绑定实际读到的版本')+
 para('索引保存的是某次采集/切分/分析得到的投影。正文已到v2、索引仍v1时，搜索可能按旧词匹配，再取到新正文，形成“为什么命中”与“实际引用什么”不一致。实验真实更新正文但不更新FTS：不检查时看到正文2/索引1；核对版本后先排除，重建索引后两者均2。')+
 table(['保存与核对','目的','异常时的选择'],[
 ['文档ID/版本、片段位置、内容摘要','把候选与被引用原文绑定','版本不可取或摘要不符，重新取证/拒绝该片段'],
 ['索引版本与切分/模型配置','解释召回依据与重建变化','显示滞后、更新索引或按约定使用历史版本'],
 ['当前授权与正文交付','避免旧索引/缓存延续已撤权限','在指定边界复验，不能把缓存当永久授权'],
 ['候选/上下文/最终引用分别记录','定位哪一阶段丢失或错配证据','重排、预算、生成与引用核验分开诊断']])+
 para('本例SQL语义在LIMIT前限制A租户、current标记与索引/正文版本；不代表物理执行器从未搜索全局倒排表，也不意味着BM25的全语料统计已按租户隔离。若要求独立统计或更强侧信道隔离，还要选择相应索引与服务边界。取正文时的真实授权撤回和不当交付负例，保留在原retrieval_pipeline实战。'));

const retrievalActualPractice=infraReadableHTML(
 knowledgeSubhead('实际FTS5实战：分词、BM25、RRF与索引版本')+rarLab('chinese_fts_rrf.py')+
 knowledgeCheck('nDCG提高而Precision、Recall、RR没变，是否矛盾？','不矛盾。前三相关项数量与首个命中相同，但分级相关性的顺序变了；本例[3,1,2]变[3,2,1]。任务是否完成仍看必要证据及答案合同。')+
 para('先检查raw_vocabulary是否有“恢复”，再看二元词元、SQL过滤和BM25排序；手算a-backup的1/61+1/62，最后对照重建前后的版本。保留数据与指标定义，换分词器、切分或索引时才能做可解释比较。'));

{
 const a=articles.find(a=>a.id==='agent-retrieval'),old=a.sections.slice();
 a.sections=[old[0],old[1],['词面检索：中文分词、倒排与BM25',retrievalLexical],['混合召回：分数、名次、RRF与重排',retrievalFusion],old[2],old[3],old[4],['分级指标：DCG、nDCG与支持程度',retrievalGraded],old[5],['索引新鲜度：正文、版本与实际引用',retrievalFreshness],old[7],['真实检索实战：FTS5、融合和更新',retrievalActualPractice],old[6],old[8]];
 a.refs=nitRefs([...a.refs,'v27FTS','v27RRF']);a.minutes=75;a.updated='2026.11.05';
 a.objectives=['解释中文词元、BM25、向量、RRF与重排的职责','固定片段/版本/权限和分阶段证据指标','复现真实FTS5及原有交付oracle，定位召回、预算、权限与索引滞后'];
}
{
 const d=infraDomain('agent'),p=d.points.find(p=>p.id==='ag-retrieval');
 p.body=retrievalLexical+retrievalFusion+p.body+retrievalGraded+retrievalFreshness;
 d.refs=nitRefs([...d.refs,'v27FTS','v27RRF']);
}
const retrievalCasesBeforeRAR=infraFieldCases.agent;
infraFieldCases.agent=()=>'<h3>中文检索：先核对词元、排序与版本</h3>'+rarLab('chinese_fts_rrf.py',false)+linkTo('agent-retrieval','阅读全文检索、融合与证据交付')+retrievalCasesBeforeRAR();
