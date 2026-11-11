/* Follow the task before opening its independent mechanism fixtures.
   Published section identities and every original code/figure/link stay in place. */
(()=>{
 if(typeof articles==='undefined')return;
 const p=(...items)=>items.map(text=>'<p>'+text+'</p>').join('');
 const h=(id,title)=>'<h3 id="'+id+'">'+title+'</h3>';
 const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const fold=(title,body)=>'<details class="progressive-detail"><summary>'+title+'</summary>'+body+'</details>';
 const matches=(body,re)=>[...body.matchAll(re)].map(m=>m[0]);
 const pres=body=>matches(body,/<pre\b[^>]*>[\s\S]*?<\/pre>/g);
 const codes=body=>matches(body,/<div class="code-block">[\s\S]*?<\/pre><\/div>/g);
 const figures=body=>matches(body,/<figure\b[\s\S]*?<\/figure>/g);
 const hrefs=body=>matches(body,/\bhref=["'][^"']+["']/g);
 const ids=body=>[...body.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 const links=body=>matches(body.replace(/<figure\b[\s\S]*?<\/figure>/g,'').replace(/<div class="code-block">[\s\S]*?<\/pre><\/div>/g,''),/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/g);
 const linkRow=items=>items.length?'<p class="practice-links">'+items.join(' · ')+'</p>':'';
 const anchors=body=>matches(body,/<span\b[^>]*class="legacy-subsection-anchor"[^>]*><\/span>/g).join('');
 function same(label,before,after){if(JSON.stringify(before)!==JSON.stringify(after))throw Error('V69 Agent reading changed '+label);}
 function finish(a,before,bodies){
  if(bodies.length!==before.length)throw Error('V69 Agent section count changed: '+a.id);
  bodies.forEach((body,index)=>{
   same(a.id+' section '+(index+1)+' source bytes/order',pres(before[index]),pres(body));
   same(a.id+' section '+(index+1)+' figure bytes/order',figures(before[index]),figures(body));
   same(a.id+' section '+(index+1)+' URL bytes/order',hrefs(before[index]),hrefs(body));
   same(a.id+' section '+(index+1)+' published IDs',ids(before[index]).sort(),ids(body).sort());
   if(!body||body===before[index])throw Error('V69 Agent section was not revised: '+a.id+' '+(index+1));
  });
  same(a.id+' global source order',pres(before.join('')),pres(bodies.join('')));
  bodies.forEach((body,index)=>a.sections[index][1]=body);
  a.updated='2026.11.09';
 }

 {
  const a=articles.find(x=>x.id==='agent-retrieval');
  if(!a)throw Error('V69 missing Agent retrieval chapter');
  const expected=['检索、上下文与最终主张是怎样连接的','片段、版本与来源：先保留能追回原文的身份','词面检索：中文分词、倒排与BM25','混合召回：分数、名次、RRF与重排','召回范围、候选数量与证据齐备要分开','完整词元预算：正文、模板与输出预留一起算','排序指标与任务证据：换一道排障题核对','分级指标：DCG、nDCG与支持程度','授权复检：可信装配器与模型输入之间还有一道边界','版本推进与索引滞后：旧值27不能悄悄变成新证据','引用要同时满足定位、支持与读取资格','真实检索实战：FTS5、融合和更新','跑通从过滤到证据交付的链路','前五名指标程序的源码与结果','实战：完整BPE预算、版本复检与实际提示交付'];
  same('retrieval section identities',a.sections.map(s=>s[0]),expected);
  const old=a.sections.map(s=>s[1]),f=old.map(figures),c=old.map(codes),l=old.map(links);
  same('retrieval code inventory',c.map(x=>x.length),[0,0,0,0,0,0,0,0,0,0,0,2,3,1,2]);
  const body=[
   p('检索帮助任务从资料中找出可用的证据。来源是保存事实的业务系统或原始材料；文档是其中可定位的内容对象；片段是为寻找和引用而切出的内容单位。索引把片段整理成便于查询的数据结构，检索器据此给出候选。候选还要经过正文读取、证据选择和输入装配，才进入模型本次实际收到的上下文。',
   '固定一项费用任务：用户要本月总额及依据。租户A的a-1/v1保存基础费用10，a-2/v2保存本月调整27；应回答10+27=37，并分别引用这两个版本。旧调整a-2/v1=99、另一租户的999以及只有27的输入，都不满足任务。检索增强生成RAG把取回的材料加入模型输入，使回答可以依据这些材料形成。')+
   table(['推进位置','正常费用任务留下的对象','下一步依赖'],[
    ['提出查询','寻找本月基础与调整费用','查询范围来自可信任务身份'],
    ['取得候选','a-1/v1、a-2/v2的身份和排序','取正文时继续核对读取资格与版本'],
    ['读取并选择证据','10、27及其月份、单位和来源','两类费用都齐备，才能计算本月总额'],
    ['装配并发送','任务要求、来源身份、正文与输出约定','整份输入满足窗口，接收端取得对应内容'],
    ['形成并验收主张','37与两个可定位的引用','核对算式、适用范围、来源和实际保存结果']
   ])+f[0][0]+p('这条路径区分了“找到相关项”“取得适用正文”“完整送入输入”和“回答获得支持”。本章本地HTTP实验实际验证到输入送达：接收端是提示收集器，37是从来源独立算出的参考值。模型生成与回答正确率需要另行执行和验收。'),

   p('同一份资料会更新，因此候选需要携带文档ID、版本和片段位置。文档ID回答是哪份资料，版本回答是哪次内容，位置回答支持结论的原文在哪里。a-2/v1=99与a-2/v2=27属于同一文档的不同版本；本任务要求当前本月资料，二者不能互换。',
   '切分要保留一项事实成立所需的条件。“本月调整费用27元”包含项目、时间、金额与单位；只留下27，后续即使算术正确，也无法说明它能否用于本月总额。否定、例外和适用对象同样随事实保留。相邻片段可以重叠，但两段重复文字仍属于同一个来源。')+
   table(['身份或校验项','费用任务中的作用'],[
    ['a-1/v1、a-2/v2','在候选、正文、输入清单和最终引用中关联同一份材料'],
    ['片段位置','定位支持基础10或调整27的具体范围'],
    ['SHA-256内容摘要','按规定字节编码计算内容指纹，核对取回内容是否匹配'],
    ['当前指针与读取资格','分别确定适用版本和当前主体能否取得正文']
   ])+p('摘要相符支持内容一致；它不签发读取资格，也不决定版本是否适用于任务。后续每次跨过索引、正文、装配与发送边界，都要能沿这些身份找到实际使用的资料。'),

   anchors(old[2])+p('词面检索按文字匹配候选。分析器把文档切成检索词元，倒排索引保存某词元出现在哪些文档或位置；查询用兼容的分析规则处理，才能匹配这些索引项。费用查询中的项目名、月份或编号可以成为检索条件，但“金额是多少”最终仍要由取回正文回答。',
   '本章实验使用SQLite数据库的全文检索扩展FTS5。匹配到多份资料后，BM25依据词频、词的稀有程度和文档长度评分：同一词反复出现的收益逐渐减小，稀有词区分力较强，长度归一化减少长文档仅凭篇幅占优。FTS5将BM25结果取负，因此程序按较小值排在前面。排序只处理已命中的候选。')+
   fold('中文索引对照：为什么资料在库里却没有命中',p('chinese_fts_rrf.py使用独立的8条中文材料。unicode61分析器未给“数据库备份支持恢复”生成单独的“恢复”词元，查“恢复”得到0项。换成相邻汉字二元片段后，“数据库恢复”形成“数据、据库、库恢、恢复”，以OR连接可匹配任意一项。')+f[2][0]+p('这个分析器会产生跨词片段；产品名、错误码、版本、缩写与单字查询仍须用实际语料检查。程序先去重词元、为每项加引号，再把MATCH表达式作为SQL参数。SQL参数化和FTS查询语法各有边界。查询在LIMIT之前限制租户、当前状态与索引版本；共享索引仍提供BM25的底层语料统计。')),

   anchors(old[3])+p('同义表达可能没有相同字面，向量召回为此提供另一种候选来源：嵌入模型embedding把查询与片段编码成向量，再按约定距离寻找接近项。词面路适合精确术语与编号，向量路可能覆盖改写。两路分数具有不同定义，融合前要选择明确的比较方法。',
   '倒数排名融合RRF使用名次而非原始分数。某项在一路排第r名，就贡献1/(k+r)；将各路贡献相加。本例k=60、名次从1开始，未出现的一路贡献0，同一路同一对象先去重。融合以后，重排器还可在这份候选池内重新比较任务相关性；未被召回的材料不会凭重排出现。')+
   fold('独立八文档题：手算名次融合',table(['文档','词面名次','声明第二路名次','RRF'],[
    ['a-backup','1','2','1/61+1/62≈0.032522'],
    ['a-archive','3','1','1/63+1/61≈0.032266']
   ])+p('a-backup略高。k越大，不同名次的贡献差距相对越小；每路保留的候选深度也会影响参与者。第12节实际运行FTS5/BM25，第二路固定为[a-archive,a-backup,a-plan]，未调用嵌入模型；融合分数也不是相关概率。费用任务的规则重排另见第13节，其规则依据材料类别，不读取标准答案集合。')),

   anchors(old[4])+p('费用任务需要基础项和调整项各一份。top_k只规定一轮最多保留多少候选，并不表达这两类证据是否齐全。先限定当前主体可搜索的资料与适用版本，再选择前k项；取得候选后，仍检查它们能否覆盖任务所需事实。',
   '访问控制列表ACL记录谁可以读取对象。实验从可信会话和资源记录取得主体、租户与资格；文档里的“允许访问”只是正文。取正文时，资源服务按实际对象再次执行资格与版本检查，读取后才交付允许字段。')+
   table(['阶段','费用任务的检查对象','不足时停在哪里'],[
    ['候选','a-1/v1与a-2/v2都被找到','检查范围、索引和候选深度'],
    ['正文','取得获准的同版内容','拒绝错租户、旧版或已撤权的读取'],
    ['证据装配','基础、调整及适用条件全部保留','缺一类就报告证据不足'],
    ['发送与回答','收到对应输入；37由两个引用支持','分别核对输入送达和主张成立']
   ])+p('可信检索服务先处理候选元数据，与把正文交给任务是两个时点。全局top2再过滤可能没有剩余项；先把越权正文放进任务缓冲区再删除，则已经发生交付。第13节用delivery表记录实际进入任务的正文，使最终答案和执行过程都可独立检查。'),

   p('上下文装配器把任务要求、来源身份、所选正文和输出约定序列化成模型输入。模型分词器把文本编码为词元编号；计数取决于编码器与完整输入形状，不能用汉字数、字符数或UTF-8字节数替代。BPE字节对编码通过逐步合并字节或子词片段形成词元。',
   'context_budget.py固定分词库tiktoken 0.12.0与cl100k_base编码，对自行定义的完整字符串计数。两份费用正文分开编码共36词元，加入系统要求、任务、来源ID/版本/SHA-256、正文与JSON格式后为237。每加入一整段材料，都重新编码整份候选输入。')+
   table(['窗口账项','本例数值'],[
    ['完整输入','237'],['输出预留','96'],['合计','237+96=333'],['声明窗口与剩余','512；512−333=179']
   ])+f[5][0]+p('512是教学窗口，237对应这份字符串模板；真实聊天封装或后端改变时要重新计数。总预算收紧到259后，输入上限为163，只容下排在前面的a-2/v2。两份资料虽都召回，输入只留下调整27；程序检查缺少基础项后停止，HTTP新增请求为0。')+
   fold('词元边界与证据边界',p('整体编码可能在分段连接处发生合并，因此分段计数之和未必等于整段计数。“中国🙂恢复”取前2词元会截断表情字节，默认解码得到“中国�”；退回严格可解码边界得到“中国”。')+f[5][1]+p('字符完整以后，还要检查事实的条件是否完整。程序用encode_ordinary把来源里的类似结束标记按普通文字编码；这验证分词行为，恶意文字是否影响真实模型仍需模型实验。')),

   p('排序评估先把问题、候选单位和标准证据固定下来，再问前k项覆盖多少。Precision@k是前k项中的相关项数除以k；Recall@k是命中的标准证据数除以标准证据总数；倒数排名RR取首个相关项位置的倒数，没有命中则为0。多个查询的RR按既定口径平均才是MRR。',
   '费用任务需要基础与调整两类证据；下面独立的排障题R27则要求判断“今天变慢是否由昨天配置更新引起”。其标准集合为E1延迟时间线、E2配置变更时间、E3适用版本的连接池说明。固定前5项互不重复，直接计算：')+
   table(['排序','命中数','Precision@5','Recall@5','RR'],[
    ['old、E1、note、E2、other','2','2/5','2/3','1/2'],
    ['E1、old、note、other、extra','1','1/5','1/3','1']
   ])+p('第二种排序把首个相关项提前，却丢掉另一项必要证据。RR与覆盖率因此可以反向变化。真实评估还要规定返回不足k项、重复片段和部分支持的处理方式；无答案题的标准集合为空，应单列检验证据不足行为。比较版本也需固定按查询等权或按证据数量加权的口径。'),

   anchors(old[7])+p('二元相关性只区分相关与不相关；分级标签还表达支持程度。折扣累积增益DCG把第r名的等级g变成(2^g−1)/log₂(r+1)，累加前k名；理想DCG由同一标签集按最佳顺序排列得到。nDCG是实际值与理想值之比，衡量这份排序接近声明理想排序的程度。')+
   fold('独立八文档题：相关项数量相同，等级顺序仍不同',p('本题预先声明a-backup=3、a-dr=2、a-plan=1、a-archive=2，其他为0。标签只交给评价程序，不作为检索输入。')+f[7][0]+table(['前三项等级','DCG@3','nDCG@3'],[
    ['BM25：[3,1,2]','约9.13093','约0.8786'],
    ['RRF：[3,2,1]','约9.39279','约0.9038'],
    ['理想：[3,2,2]','约10.39279','1']
   ])+p('两份实际前三都命中3个相关项，标准集合有4项，故Precision@3=1、Recall@3=0.75、RR=1保持不变；把等级2前移仍可提高nDCG。这组指标描述声明语料的排序，并不代替费用任务的证据齐备检查。标准集合无正例时，理想DCG为0，应单列无答案任务。')),

   p('索引返回候选编号，来源库保存当前的读取资格。来源服务先核对资格，再读取对应正文。装配器把获准的正文拼成模型输入，发送前再核对资格。若材料从缓存取出，缓存键也要区分租户、主体或权限范围、来源和版本，发送前同样检查当前资格。'),

   p('费用任务要求当前版本。a-2/v2的27已被装配后，来源新增v3=30并推进current指针，发送前检查便应识别source_version_changed，停止发送旧包。要完成更新后的任务，重新查询并取得a-1/v1和a-2/v3，再按10+30=40核对证据。历史快照型任务可以采用另一规则，但需固定任务时间与历史读取资格。',
   '正文更新和索引更新分别发生。正文已为v3、索引还为v2时，当前版本条件会排除旧候选，只剩基础项；把v3实际加入索引后，两类材料才重新齐备。内容摘要与旧v2相符，只能确认拿到旧内容，不能把它提升为当前证据。')+
   table(['观察','下一步'],[
    ['正文v3、索引v2','推进索引并重新检索，保留证据不足状态'],
    ['候选v2、实际正文v3','重新关联身份并装配'],
    ['新索引返回v3','重算完整输入与当前参考40'],
    ['旧内容仍在缓存','重新检查当前资格和任务版本规则']
   ])+p('第12节另用a-backup从正文1更新到2，观察相同的索引滞后关系；它使用自己的八文档输入。两项记录各自核对文档名与版本。'),

   p('引用把一个主张连接到能够支持它的具体材料。费用答案37应把基础10指向a-1/v1，把本月调整27指向a-2/v2及相应片段。可定位、实际支持主张、查看者有权读取，是三个分别需要检查的条件。只有“费用说明”标题，还无法核对这条算式。',
   '结论的范围随证据保留。材料若只允许本月加27，回答就不能扩大成以后每月都加；单位、否定和例外也要保留。来自同一资料的重叠片段仍是一份来源。证据不齐时，应说明缺少哪一类材料。',
   '引用历史结论时固定当时版本。旧链接若直接跳到当前新正文，读者就无法复查旧判断；应在资格允许时提供明确历史视图，失去资格则显示不可访问。验收时依次查候选、正文、实际输入与答案，首次出现差异的位置就是继续定位的起点。')+linkRow(l[10]),

   anchors(old[11])+p('chinese_fts_rrf.py集中验证中文匹配、名次融合和分级评价。独立语料有8条文档，实际BM25表与声明的第二路排名参与RRF，预先给定等级只用于评价。正常结果先由同一套分析器和查询得到，再改变正文版本观察旧索引。')+c[11][0]+
   table(['执行环节','应核对的程序对象与结果'],[
    ['分析与匹配','raw_vocabulary无独立“恢复”；二元query_terms为数据/据库/库恢/恢复'],
    ['词面排序','search限定租户、current和版本，得到a-backup、a-plan、a-archive、a-dr'],
    ['融合与评价','rrf得到a-backup、a-archive、a-plan、a-dr；nDCG约0.8786→0.9038'],
    ['更新','正文1→2时排除旧索引；重建后正文2/索引2']
   ])+p('手算a-backup的1/61+1/62并核对rrf_results，再查stale_index_without_check与after_reindex。这里执行了FTS5/BM25；第二路排名、相关性等级和二元分析器都具有明确的教学输入范围。')+fold('完整chinese_fts_rrf.py',c[11][1])+linkRow(l[11]),

   p('retrieval_pipeline.py把费用任务缩成五文档SQLite输入，逐项隔离候选范围、规则重排、装配和正文交付。固定分数从高到低为B/b-secret/v1=999（0.99）、旧a-2/v1=99（0.98）、当前手册a-note（0.95）、基础a-1/v1=10（0.90）、调整a-2/v2=27（0.85）。每份占8个教学预算单位，预算16或12用于控制能装下几份材料。')+c[12][0]+p('全局top2再过滤得到空表；先过滤再top2得到a-note与a-1。规则重排在三个合法候选内优先base与adjustment，选到两份费用。GOLD标准集合只用于独立评分，执行阶段不读取它。')+
   table(['只改变的条件','排序、正文与判定'],[
    ['post_filter','合法候选0，正文交付0，证据不足'],
    ['pre_filter','a-note、a-1；Precision@2=Recall@2=RR=1/2，仍缺调整项'],
    ['rule_rerank、预算16','排序与上下文Recall均1；总额37、两个来源，合格'],
    ['rule_rerank、预算12','排序Recall为1，实际只交付a-1，上下文Recall为1/2，证据不足'],
    ['unsafe_post_filter','过滤前已交付B与旧版正文，即使最后拒绝也不合格'],
    ['revoked_before_fetch','候选之后撤权，正文交付0，denied']
   ])+p('grade重新查询delivery表，核对越权或过期交付、实际答案37和两个版本引用。这个程序读取真实SQLite正文并生成确定性算术答案；固定分数、材料类别规则和8单位预算不代表嵌入模型、学习型重排器或模型词元。')+fold('完整retrieval_pipeline.py',c[12][1])+linkRow(l[12])+fold('独立R27排障题：前五名指标的计算源码',c[12][2]),

   p('agent-retrieval.py核对第7节的指标算式，输入是固定标准集合{E1,E2,E3}与两个互不重复的前五名列表。Fraction保存精确分子分母；程序输出应与手算逐项相同：')+
   table(['声明排序','Precision@5、Recall@5、RR'],[
    ['old、E1、note、E2、other','(2/5, 2/3, 1/2)'],
    ['E1、old、note、other、extra','(1/5, 1/3, 1)']
   ])+p('返回项数5、标准证据数3与首个相关项的位置，分别决定三个分母。此程序没有建立索引或执行召回；它验证固定列表的计算实现，检索服务质量还需在声明任务集上实际运行。')+linkRow(l[13])+fold('指标程序的实际输出',c[13][0]),

   anchors(old[14])+p('context_budget.py沿费用任务执行完整输入交付。setup建立来源、current指针、资格与FTS5索引；retrieve取得候选，fetch读取同版正文，render序列化任务与来源，pack用固定BPE编码器逐段检查整份输入，recheck复核资格和版本，最后通过HTTP交给回环收集器。按实验包README准备固定依赖；tiktoken首次取得cl100k_base词表需要网络，后续可以使用缓存。')+c[14][0]+linkRow(l[14].slice(0,3))+
   table(['场景','核对的结果','新增HTTP请求'],[
    ['正常a-1/v1、a-2/v2','正文单计36，完整输入237，预留96，总333≤512；参考37','1'],
    ['总预算259','输入上限163，只保留a-2/v2，insufficient_evidence','0'],
    ['取回后撤资格','authorization_changed','0'],
    ['取回后来源升v3','source_version_changed','0'],
    ['旧索引→加入v3','仅基础项→两类齐备，当前参考40','0，仅检查新证据'],
    ['伪造跨租户/旧版候选','b-1/v1、a-2/v1在fetch被拒','0'],
    ['截“中国🙂恢复”前2词元','默认中国�；严格有效前缀中国','未发送']
   ])+p('正常候选顺序为a-2/v2、a-1/v1。收集器重算收到的完整字符串词元数，检查窗口和来源清单，返回提示SHA-256；发送方再核对这份回执。整次实验实际收到一份正常请求，两个版本及输入摘要相符。')+
   fold('完整context_budget.py',c[14][1])+p('这份回执确认哪份输入交给了收集器；工具效果回执确认外部动作提交了什么；任务验收检查实际答案及引用。三类记录分别保存输入交付、业务效果和任务结果，各自保留对象与身份。实验运行了FTS5、固定编码器和本地HTTP，没有调用生成模型；预发送复检与远端交付之间的在途规则仍需另定。')+linkRow(l[14].slice(3))
  ];
  finish(a,old,body);
  a.sections[8][1]+=h('retrieval-revocation-boundaries','撤权发生在读正文前，还是发送前')+
   p('两份独立实验分别在取正文前和发输入前撤权。',
   '<b>候选已返回，正文还没读。</b> 实验先取得候选 101、102，再撤销 102 的读取资格。装配器沿用这批编号，SQLite 的正文读取表 <code>body_reads</code> 本次只记录 101/v1。<a href="/article/agent-retrieval/#native-qdrant-retrieval">对照 Qdrant 的候选与实际读取记录 →</a>',
   '<b>正文已读，输入还没发。</b> 另一组费用实验已经取得 a-1/v1、a-2/v2。撤回 a-2 资格后，发送前复检返回 <code>authorization_changed</code>，本地 HTTP 收集器收到 0 条新请求。<a href="/article/agent-retrieval/#context-budget-run">复跑并核对实际发送次数 →</a>',
   '发送前复检与 HTTP 发送分两步。若撤权发生在复检之后，接收端的授权与在途规则决定请求能否继续。已交付的内容按接收端的数据保留与撤回规则处理。<a href="/article/agent-security/#section-2">回到权限章核对执行点 →</a>');
  a.sections[14][1]+=h('native-rag-citation-oracle','两个答案都是 37，为什么有一个不合格')+
   p('前一段核对材料有没有送达。这里另开一份费用实验，让本机 Qwen3 根据检索结果作答。基础项 <code>a-base/v1</code> 是 10。调整项从 <code>a-adjust/v2</code> 更新到 <code>a-adjust/v3</code>，两版金额都为 27。题目要按当前版本算，所以答案既要是 37，也要能指出当前的两份来源。',
    '先在 SQLite 中建立两个索引快照。旧索引仍指向 v2，新索引已经指向 v3。查询同样的“费用”和“汇总”时，真实 FTS5 可以找到 A 和 B 的候选。组装材料只取 A，接着选择是否对照来源库的当前版本。')+
   trainingFigure('rag-citation-oracle','金额不变，调整项的来源版本变了。两次模型生成保留原始回答，第三条路径在宿主侧提前停下。')+
   table(['怎么处理候选','实际送进模型','实际结果'],[
    ['新索引，核对来源版本','基础 v1、调整 v3','模型答 37，引用 v3，验收通过'],
    ['旧索引，直接使用其中的正文','基础 v1、调整 v2','模型也答 37，引用 v2，验收拒绝'],
    ['旧索引，核对来源版本','排除 v2，只剩基础 v1','宿主返回证据不足，本分支模型请求 0 次']
   ])+
   p('第二行的 JSON 格式正确，金额也对。验收器另读权威来源库，算出当前的金额和引用，再检查引用确实来自本次材料。下方两条判断分别查“是不是当前来源”和“这次有没有提供这份来源”。')+
   trainingCode('检查当前引用和本次提供的引用','PYTHON',`if sorted(answer["citations"]) != authority["citations"]:
    errors.append("citation_not_current")
if not set(answer["citations"]) <= {doc["reference"] for doc in supplied}:
    errors.append("citation_not_supplied")`)+
   p('复跑后，先看 <code>versions</code> 里的 v2 → v3，再比较 <code>cases</code> 中实际提供的材料、原始模型响应和判定。两次真正发给模型的请求都能查到。证据不足这一组停在宿主的完整性检查。<a href="/article/agent-evaluation/#section-11">在评估章继续核对交付、来源与实际读取 →</a>')+
   trainingCode('已有固定引擎和权重时，在解压目录运行','SHELL','python3.12 -B rag_lab.py --server /path/to/llama-server \\\n  --model /path/to/Qwen3-0.6B-Q8_0.gguf --output-dir replay')+
   '<p class="practice-links"><a href="/labs/rag-citation-oracle.zip" download>下载程序与记录 ↓</a> · <a href="/labs/rag-citation-oracle/README.md">环境与复跑步骤 →</a> · <a href="/labs/rag-citation-oracle/validation.json">原始检索、模型与验收记录 →</a></p>';
  a.updated='2026.11.12';
  infraDomain('agent').points.find(point=>point.id==='ag-retrieval').body+=
   p('检索命中后，还要验收实际生成的回答。<a href="/article/agent-retrieval/#native-rag-citation-oracle">对照两份总数都是 37 的回答，核对引用的版本 →</a>');
 }

 // The isolated native-bridge check deliberately omits its prerequisite, then
 // injects that bridge alone. Leave that baseline available for its own contract.
 if(typeof langgraphWorkflowBridgeReview==='undefined')return;
 {
  const a=articles.find(x=>x.id==='durable-workflows');
  if(!a)throw Error('V69 missing durable workflow chapter');
  const expected=['把一份日报拆成可以恢复的承诺','历史写下事实，状态由事实推得','重放为什么不该再次询问模型','单执行者的提交间隙，先读两本账','接管先经过控制库，再经过效果接收方','把旧写隔离和业务去重放在同一事务里','三次观察，分别证明哪一个边界','等待、取消与超时怎样决定下一步','先预测，再执行已有的多进程程序','旧任务、升级和保留期一起验收'];
  same('workflow section identities',a.sections.map(s=>s[0]),expected);
  const old=a.sections.map(s=>s[1]),f=old.map(figures),c=old.map(codes),l=old.map(links);
  same('workflow code inventory',c.map(x=>x.length),[0,0,2,3,0,0,0,0,7,2]);
  const body=[
   p('要发布一份 report-A。先读 orders-A/v3，里面有两笔金额 10 和 27，还指向补录 late-A/v1。补录是 5，最后应得到 42。报告要注明两份来源。内容核对后，等这份草稿获准，再向接收方发布一份。',
   '工作流规定这些步骤怎么接。读完补录才能汇总。批准没到就先存下进度，换一个进程也能接着做。这些为本次任务保存的步骤和状态，就是一条运行记录。模型可以提议下一步，执行器检查能否执行，再记下实际结果。')+
   table(['正常推进','已经取得什么','可以继续的条件'],[
    ['读基础→读补录','基础37、补录引用，再取得补录5','引用解析到实际来源；两份读取结果都已保存'],
    ['汇总→检查','草稿42、完整来源清单','金额与来源检查均通过'],
    ['保存草稿→等待批准','待批准正文及其身份','批准针对当前任务、目标和这份草稿'],
    ['发布→验收','接收方报告和回执','实际报告为42、来源相符、只发布一份']
   ])+
   h('subsection-1-3htvho','步骤依赖与计划修订')+p('计划安排未来要做的工作，事实保存已经取得的结果。基础读取先产生补录引用，所以补录读取依赖基础；汇总依赖两份资料；发布依赖检查和批准。固定工作流预先写好这些分支即可完成本题。动态版本初始计划漏掉补录读取，执行器先保存缺失条件，进入NEEDS_REPLAN，再接纳包含read_extra的新计划，保留仍适用的基础事实。')+f[0][0]+
   h('subsection-1-z363qn','工作请求与确认结果')+p('执行请求表达准备做什么，确认结果保存实际观察到什么。planning_lab.py用RUNNING表示可推进，DRAFT_READY表示草稿已形成，WAITING_APPROVAL表示等待当前草稿的批准；DONE表示本地流程已经结束。等待时保存状态后进程可以退出，后续新进程读取同一任务记录，取得适用批准后继续发布。',
   '最后由独立验收直接读取来源和真实报告，检查42、目标、来源与份数。流程状态、模型声明或图已结束都只是各自的记录，是否满足用户目标仍由实际产物决定。')+linkRow(l[0]),

   h('subsection-2-1pgk1ak','历史、快照与可恢复状态')+p('持久化把新进程继续任务所需的信息保存在进程之外。事件历史按顺序记录已接纳的请求和结果；检查点保存某个执行位置的状态及待决工作。report-A读取来源后，后续进程至少需要知道读了哪个版本、取得什么结果，以及接下来还缺哪一步。普通Python局部变量只存在于当前调用栈，进程退出后要从持久记录重新取得这些依据。')+
   table(['planning_lab.py保存位置','任务中的内容','恢复时的用途'],[
    ['plans','已接纳步骤与计划版本revision','确定接下来允许采用的安排'],
    ['facts','步骤名、输入身份和已确认结果','复用当前输入仍适用的读取或计算'],
    ['runtime','当前阶段、游标、预算和草稿','判断推进、等待或结束'],
    ['signals','批准内容、输入标识和消费状态','取得与当前草稿匹配的外部输入'],
    ['reports','实际交付正文和来源清单','独立核对最终业务结果']
   ])+
   h('subsection-2-u7tby','按确认结果恢复下一步')+p('恢复先读取已有事实，再决定是否安排新工作。基础和补录结果已经保存，就使用它们汇总；草稿和等待条件已保存，就查找适用批准；发布是否发生则向持有效果的接收方查证。重放型实现会重新运行决定步骤的代码，并把请求与历史对应；检查点型实现从保存的状态和待决任务继续。具体哪段代码重入，由所用实现规定。')+
   h('subsection-2-1cfmvg2','事实复用的输入身份')+p('计划版本revision属于步骤安排，源版本属于某一份数据。计划1改成2时，orders-A仍为v3，基础事实37可以保留；新增late-A/v1后，汇总输入集合改变，旧汇总37就需要重算为42。',
   'planning_lab.py以步骤名和输入身份共同作为事实键。来源清单记录资源、版本和内容摘要；摘要按固定编码计算SHA-256，用来比较内容身份。汇总键还绑定任务、目标与整份清单。只按步骤名sum缓存，可能找到一份真实保存的旧结果，却把它用于另一组输入。'),

   h('subsection-3-ueacvx','决定代码与历史相容性')+p('确定性重放要求决定代码在相同历史下产生相容的工作安排。外部读取、实时模型或系统随机数可能每次给出新值；需要这些值时，把调用安排为能够记录结果的工作，后续决定消费其保存结果。这样恢复可以解释原来的决定，新的外部调用也有明确的发生位置。框架提供的时间、随机和版本接口应按对应SDK规则使用。')+
   fold('独立23练习：本地解释器怎样匹配工作请求',p('workflow_history.py将外部工作称为活动。read-1/read_metrics读取23，draft-1/render_draft用结果生成文本；两项按活动ID、类型与顺序匹配旧历史。换类型、遗漏旧命令或在完成历史后增加命令会触发相容性错误。它保存args但不比较参数语义，未实现按定义版本选择代码。这个独立解释器用来观察结果记录，未运行Temporal SDK。'))+
   h('subsection-3-1amsab8','结果记录前后的两种恢复')+p('活动返回结果与结果进入持久历史是两个时点。已经记录完成结果时，新进程可以复用；只有安排记录而没有完成记录时，工作可能重新执行。重放能保留哪份结果，取决于退出前真正提交了哪些事实。')+
   fold('23来源改为999：只改变进程退出位置',p('这份独立练习在读取后把来源改成999，再分别恢复。退出码23和24只是两个故障窗口的进程返回值。')+f[2][0]+table(['退出位置','持久记录','实际恢复'],[
    ['completed写入后退出23','安排及结果23','复用23；读取总计1次'],
    ['活动返回、completed未写入时退出24','只有读取安排','重新读999；读取总计2次'],
    ['完整历史再重放','读取、草稿和结束均已记录','新增活动0次，新增事件0条']
   ]))+
   h('v43-history-practice','用独立调用记录核对重放')+p('事件历史和活动调用次数写入两个SQLite文件，真实子进程在指定窗口退出。观察Runner.activity的历史匹配，以及读取返回后append(completed)的位置，再对照after_crash和after_gap_resume。')+c[2][0]+linkRow(l[2].slice(0,3))+fold('完整workflow_history.py',c[2][1])+linkRow(l[2].slice(3)),

   p('report-A发布跨过两个持久化位置：工作流保存待执行意图，接收方保存报告及操作回执。发布前先固定report-A:publish与具体草稿；接收方将效果和回执共同提交；工作流取得并核对回执后，保存自己的后续状态。若接收方已提交、工作流尚未确认，新进程仍沿原操作身份和内容查询或重试。')+
   table(['保存位置','提交间隙后要查的事实'],[
    ['工作流记录','原操作身份、目标和具体草稿'],
    ['效果接收方','该操作是否已提交、参数是否相同、原回执是什么'],
    ['恢复后的工作流','核对结果后保存确认，再推进后续工作']
   ])+
   fold('独立op-001计数例：两本账的最小对照',p('agent_lab.py的op-001使工具库计数加一。提交后退出23，运行器仍RUNNING、尝试1，工具效果为1；沿原键恢复后SUCCEEDED、尝试2、效果仍1。它只验证这笔计数动作，图中历史编号9.2对应现G4。')+f[3][0])+linkRow(l[3].slice(0,1))+
   h('langgraph-workflow-objects','把持久等待映射到LangGraph')+p('实际workflow_lab.py使用LangGraph 1.2.20，把同样的42目标写成有状态图。state是本次数据，ReportState约定它的字段，node是接收状态并返回更新的函数，edge规定推进依赖。checkpointer保存框架检查点；SqliteSaver写入checkpoints.sqlite，thread_id=report-A定位这条执行，与操作系统线程编号分别处理，资源权限仍来自任务委托。',
   '图先读基础、读补录、形成草稿、完成两项检查。approval_publish节点向独立HTTP接收方暂存草稿，再调用interrupt保存待批准对象并暂停。新进程打开相同检查点，以同一thread_id传Command(resume=批准)继续；批准值成为interrupt的返回值，经草稿摘要核对后才能发布。')+fold('42图的原生API与依赖图',c[3][0]+f[3][1])+
   h('langgraph-workflow-wait','并行分支的更新与汇合')+p('金额与来源检查都依赖草稿，彼此可以并行。reducer规定同一状态字段的多份更新怎样合并：checks用operator.add连接["total"]与["sources"]，每个分支只返回自己的新增项。add_edge的起点列表要求两路完成后才进入审批。')+fold('分支更新与显式失败恢复',c[3][1]+p('真实执行器线程的同步点验证了两分支重叠。来源检查主动抛异常时，金额分支的成功更新保存为pending writes；新进程invoke(None)补做来源检查。记录中金额检查1次、来源检查2次，两项结果各合并1份。这是显式异常后的分支恢复。'))+
   h('langgraph-workflow-reentry','节点重入与外部效果去重')+p('本例中断恢复会从approval_publish节点开头重入，再次执行暂存。暂停前stage_receipt尚是局部变量，没有作为节点更新返回；接收方的暂存却已经提交。正常路径在初始状态中固定report-A:stage，两次尝试由接收方认作同一操作，只保留一份效果。若在节点中每次新建UUID，就会成为两笔暂存。')+fold('中断节点的原代码与两次暂存',c[3][2]+f[3][2])+p('durability="sync"让下一步开始前先写框架检查点；HTTP接收方的receiver.sqlite仍是独立事务域。节点重入规则说明哪段代码会再走，接收方操作协议说明这些调用产生几份效果，两者共同决定恢复结果。')+linkRow(l[3].slice(1)),

   p('单执行者恢复之外，还可能出现旧执行者A暂停但未退出，新执行者B已经接手。租约是一份有期限的工作权约定，控制库保存当前持有者、代际和期限；epoch代际是这项所有权递增的编号。效果接收方也保存当前接受的代际，按它拒绝旧持有者的新写入，这称为fencing旧写隔离。',
   'B先在控制库取得代际2，再把2安装到接收方，确认安装后使用2写入。A即使仍活着，携带1的新动作也会被已经安装2的接收方拒绝。控制权记录与写入口分别有自己的提交时点。')+
   table(['阶段','控制库/接收方代际','写入口的规则'],[
    ['A运行','1/1','A的1可提交'],
    ['B取得租约、尚未安装','2/1','接收方仍按1判断'],
    ['B完成安装','2/2','拒绝A的1，允许B的2'],
    ['C取得并安装3','3/3','只接受当前3的新写']
   ])+p('worker_fencing.py将控制库与接收方分开：reserve_lease更新租约，arm_receiver安装接收方fence。函数返回True表示该代际已armed，并未在控制库另存一个armed字段；已安装3时，迟到的2返回False，不会把代际降回2。')+
   fold('安装空窗的生效点',p('控制库为2、接收方仍为1时，旧A还可能提交全新动作；实际独立数据库对照观察了这个空窗。安装2后，旧写才按新规则被拒绝。生产协议还要确定可信代际如何签发、怎样确认安装、安装失败怎样恢复；调用者自行填写更大整数不构成工作权。')),

   p('旧写隔离检查执行者现在有没有新写资格，业务去重检查这笔逻辑动作是否已经提交。接收方在一个受保护的提交边界内，先核对当前代际，再核对操作身份与内容，最后共同提交新效果和回执。安装新代际与执行写入也要受同一类事务保护，避免检查以后资格又变化。',
   '下面用worker_fencing.py的独立数值写入说明两项检查。它保存7、11、13等标量，不发布42报告。B已取得并安装2时：')+
   table(['请求','代际判断','操作判断与结果'],[
    ['B/2，fresh-from-B，值7','当前2','首次提交7及回执'],
    ['B/2，同键同值7','当前2','duplicate，不增加效果'],
    ['B/2，同键改值8','当前2','内容冲突，原效果保留'],
    ['A/1，全新键和值99','旧代际1','stale_epoch，拒绝新写']
   ])+p('新键可能绕过去重，却绕不过过期代际检查；当前持有者仍可能重复同一动作，因此也需要业务去重。新持有者接续旧操作时，使用自己的当前代际和原业务键，既取得原结果，又维持旧执行者的隔离。',
   '本例invoke在SQLite BEGIN IMMEDIATE后读fence、查操作记录并写效果；代际安装也是写事务，两者由数据库串行化。固定租户和工具白名单属于测试夹具，真实身份认证与代际签发不在其中。'),

   p('接管实验分别观察“旧执行者仍活着”“进程已退出”和“接收方已经提交”。让A停在同步点并确认仍存活，B安装2、提交7后再释放A；A用全新键写99时应被拒绝。另一子进程提交11后退出，C安装3并沿原键取得11；C再以新键写13，验证新持有者仍可推进。')+
   table(['观察','实际结果','证明的边界'],[
    ['暂停A→B接管→释放A','A返回stale_epoch；B提交7','活着的旧执行者也不能新写'],
    ['提交11→退出23→C接管','C用当前3和原键得到duplicate/11','恢复认回已提交效果'],
    ['C新键提交13','效果7、11、13，数3、和31','正常新写仍成立'],
    ['独立安装空窗','控制2/接收方1；安装前可旧写，安装后拒绝','生效点在接收方安装']
   ])+p('31只合计正式实验的三份效果；空窗对照使用另一数据库。独立核对效果集合、回执与参数冲突，才能判断拒绝回应是否真的对应零新增旧写。租约时间采用注入的逻辑整数；进程暂停、退出与SQLite事务实际执行。'),

   h('subsection-8-mctg3k','推进、重规划与持久等待')+p('42任务中的等待条件决定下一步，而不是等待进程本身维持任务。发现补录引用、原计划却缺read_extra时，NEEDS_REPLAN保存这一缺口；接纳新计划后才能继续。资料齐备形成草稿后，WAITING_APPROVAL保存当前草稿的等待条件。后续进程先查持久输入，已经有适用批准就直接消费，仍缺则继续等待。')+f[7][0]+p('本地动态夹具有3次提议预算，接纳一次后剩2。它对当前观察与候选步骤共同计算签名；相同观察下，同样的无效提议即使改了理由，连续两次仍判无进展，进入STOPPED_NO_PROGRESS。预算用尽进入相应STOPPED_*终态。来源升版时，本例要求重新接纳计划，使失效条件保持明确。')+
   h('subsection-8-19qsp4l','批准绑定当前草稿')+p('planning_lab.py的批准同时绑定任务、报告目标、计划revision、input_digest、draft_digest和决定。输入摘要input_digest标识来源清单，草稿摘要draft_digest标识待发布正文，消费前重新比较当前值。信号ID去重确认收过这条消息，内容绑定决定它还能不能批准当前草稿。',
   'changed_input使用独立数据库，初始v3没有补录引用，先形成并批准37；把orders-A推进到v4并加入补录后，才生成新42草稿。旧批准保留在历史，重复投递可返回duplicate_signal，但applies_current=false，发布必须等待新批准。early_signal则在DRAFT_READY后、进入等待前保存当前批准，后续推进能够取到它。')+f[7][1]+
   h('subsection-8-1hxbx9c','整项任务的次数与时间预算')+p('次数限制约束任务实际发起多少次尝试，截止时间约束约定起点以来的累计时长。60秒已花24秒调用、8秒核对、5秒退避，剩23秒；预留3秒保存最终记录，下次调用最多20秒。恢复后继续沿剩余预算推进，等待和清理是否计入也要在边界中规定。')+
   h('subsection-8-1ugi1r3','取消后的执行与效果确认')+p('取消先持久保存停止意图，阻止新工作，再终止在途调用和回收受管资源。已经提交的发布仍按原操作身份查证；撤回是另行授权的补偿动作。执行者停止、接收方效果和用户是否收到结果各自留有状态。')+linkRow(l[7]),

   h('agent-planning-run','从来源到42报告的完整状态机')+p('planning_lab.py让推进、提议和批准分别在新Python子进程中执行，同一场景共用SQLite任务文件，各场景独立建立初态。固定分支和动态计划都按同一来源关系交付42，程序据plans、facts、runtime、signals与reports核对推进；提议来自固定夹具，没有调用模型。')+c[8][0]+
   table(['场景','核对的状态与产物'],[
    ['adaptive / fixed','动态计划2、预算3→2；固定计划1；各有一份42报告'],
    ['changed_input','旧37草稿和旧批准不适用，新42批准到来才发布'],
    ['early_signal','DRAFT_READY后批准已入库，等待时直接消费'],
    ['no_progress / budget','分别按无进展或预算用尽停止，报告0份'],
    ['invalid_plan','错误安排被拒，保留计划1与重规划条件']
   ])+
   h('subsection-9-62i94t','从实际产物发现错误完成')+p('wrong_cache_key只用sum查找旧事实，流程可以产生计划2、批准和DONE，实际报告却仍为37。独立验收重新读权威来源并计算42，因此拒绝。corrupt_artifact保留总数42，只改真实报告的来源摘要，同样被拒绝。正确路径完成后再恢复，事件、事实、信号和报告快照保持不变。',
   '此状态机将来源验证、批准消费、报告和DONE放在同一SQLite事务；它展示单库协议。外部接收方的提交间隙由第4节的稳定操作协议处理，不能把单库原子性直接扩展过去。')+fold('完整planning_lab.py',c[8][1])+
   fold('独立接管程序worker_fencing.py：三份效果与安装空窗',p('本程序验证第5—7节的分库接管，按自己的输入检查effect_count=3、effect_sum=31及独立空窗；它不读report-A来源。')+c[8][2]+c[8][3])+
   h('langgraph-workflow-run','真实框架、文件检查点与HTTP接收方')+p('workflow_lab.py实际运行固定LangGraph 1.2.20与SQLite检查点包3.1.3。工作进程读取来源JSON，构建ReportState和依赖图，用同一个检查点文件与thread_id继续。独立HTTP接收方在另一个进程保存暂存、发布和报告；独立验收器oracle重新读取来源及接收方数据库判断结果。')+c[8][4]+
   table(['场景','实际框架记录','业务验收'],[
    ['stable','读基础、补录、草稿及两检查各1次；审批节点2次','暂存尝试2、效果1；发布1、报告42，接收'],
    ['new_id_on_reentry','同样的检查点与42草稿，节点内每次新建UUID','暂存2份，图结束仍拒绝'],
    ['parallel_failure','金额检查1次、来源检查2次；恢复失败分支','两检查各合并1份，接收'],
    ['corrupt_report','框架检查点保留，只把实际报告42改41','独立oracle拒绝']
   ])+p('stable还核对换thread_id为空状态、结束后再次invoke(None)不增节点或效果，以及原发布键改总数41返回409且不覆盖报告。并行失败为主动抛异常后的恢复，未测试物理断电或多宿主故障。批准由本地可信夹具提供，没有真实审批身份、模型或Kairo。')+
   fold('完整workflow_lab.py与固定依赖',c[8][5]+c[8][6])+linkRow(l[8]),

   p('持久任务跨越代码发布时，新进程还需要找到原定义、状态格式、来源和未决工作。事件重放检查新代码产生的命令与旧历史是否相容；检查点恢复检查状态字段、节点和中断含义能否继续解释。先固定旧运行与记录验证，再选择继续旧版、显式迁移或框架版本机制。')+
   table(['仍要恢复的对象','对应保留要求'],[
    ['工作流历史或检查点','在任务允许恢复期间，旧记录和定义保持可读'],
    ['接收方操作回执','覆盖允许的重试期限，保留原操作身份与内容'],
    ['来源与产物版本','保留当时版本、摘要和受保护引用，能够重算或验收'],
    ['批准与身份','保留批准记录，继续执行时重新核对适用内容与当前资格']
   ])+p('接收方只留7天回执、协调端却允许30天后自动重试，就留下23天的判断缺口。可以延长接收方记录，也可以在边界外停止自动新写并转查证；仅有本地DONE无法补回接收方已经遗忘的事实。')+
   fold('最小代际与回执模型：原源码和输出',p('durable-workflows.py使用进程内字典，generation=42是代际编号。它说明判断顺序；持久状态、真实进程和分库安装分别由本章前述程序验证。')+c[9][0]+c[9][1]+linkRow(l[9].slice(0,2)))+
   p('恢复始终沿几组已定义的关系取得依据：目标约束计划，输入身份决定事实能否复用，当前草稿决定批准是否适用，稳定操作身份关联接收方效果，当前代际限制新的写入。记录保留期决定这些依据还能查询多久。')+linkRow(l[9].slice(2))
  ];
  finish(a,old,body);
  a.sections[8][1]=a.sections[8][1].replace(/<details class="progressive-detail">(?=<summary>独立接管程序worker_fencing\.py)/,'<details class="progressive-detail" id="worker-fencing-run">');
  const modelPlan=h('native-model-plan-revision','模型发现补录后，任务怎样改计划并继续？')+
   p('用户要求生成 <code>report-A</code>。宿主的第 1 版计划只安排读取主清单和生成草稿。模型提出读取，宿主调用工具，把主清单里的 10、27 和补录编号 <code>late-A/v1</code> 交回模型。模型提议先加上读补录这一步。宿主核对编号来自清单，保存第 2 版计划，保留已经读到的两笔金额。')+
   trainingFigure('model-plan-revision','四次工具提议来自同一个模型。计划、草稿和批准由宿主核对并保存。')+
   p('四轮都提供相同的四个工具，<code>tool_choice=auto</code> 让模型按提示选择。第 2 轮的提议是 <code>revise_plan</code>。宿主按下方第一行核对并执行提议，再把结果交回模型。<code>tool_call_id</code> 用来对应原来的调用。')+
   trainingCode('宿主执行通过检查的工具，并把结果交回模型','PYTHON',`result = perform_tool(directory, name, args)
messages = [*messages, message, {"role": "tool", "tool_call_id": call["id"], "content": compact(result)}]`)+
   p('第 3 轮读到补录的 5，第 4 轮请求草稿。宿主用两份来源算出 10+27+5=42，保存第 2 版计划和草稿，停在等待批准，原进程退出。新进程打开同一个任务库，核对批准是否匹配操作者、任务、目标 <code>A/daily</code>、计划版本和草稿摘要。摘要由草稿内容算出，草稿中也记录了来源版本。')+
   table(['恢复时给什么','宿主实际决定','数据库中有几份报告'],[
    ['没有批准','继续等待','0'],['只批准第 1 版的 37','批准与当前草稿不符','0'],['批准当前第 2 版的 42','发布并保存完成状态','1'],['完成后再带同一批准恢复','认回已完成的任务','1']
   ])+
   p('复核时，先从模型响应找提议的工具和参数，再到计划表、事实表和报告表查实际结果。库里只有一份 42 的报告，记录主清单和补录两个来源。实验使用固定提示和测试批准，只支持这次计划修订。报告与完成状态在同一个 SQLite 事务中提交。')+
   trainingCode('解压后运行，需要固定版本的本机模型和运行时','SHELL','python3.12 -B model_plan_lab.py run --server /path/to/llama-server \\\n  --model /path/to/Qwen3-0.6B-Q8_0.gguf --output-dir replay')+
   '<p class="practice-links"><a href="/labs/model-plan-revision.zip" download>下载实验与记录 ↓</a> · <a href="/labs/model-plan-revision/README.md">复跑与查表步骤</a> · <a href="/labs/model-plan-revision/validation.json">四轮原始模型请求和恢复记录</a></p>'+
   p('后面的对照也用 42 的日报讲恢复，各有独立的任务状态和接收记录。<a href="/article/durable-workflows/#langgraph-workflow-run">查看 LangGraph 怎样恢复暂停的任务 →</a>')+
   p('观测章把另一份 42 日报交给独立的接收服务。<a href="/article/agent-observability/#native-mcp-trace-reentry">查三次调用为什么只留下一份报告和一条回执 →</a>')+
   p('当发布跨进程、跨数据库时，接收方可能已经写入，任务库却还没有回执。<a href="/article/durable-workflows/#native-model-mcp-recovery">沿这份草稿继续做一次断点恢复 →</a>');
  const modelMcpRecovery=fold('实跑 · 发布已提交，任务怎样认回回执',
   h('native-model-mcp-recovery','从模型修订计划走到跨进程发布恢复')+
   p('沿用上面四轮实际模型提议生成的草稿。任务库保存了第 2 版计划、两份来源和总数 42。先给工作进程一份只批准第 1 版金额 37 的记录，宿主核对草稿摘要后拒绝，接收服务没有收到发布。')+
   trainingFigure('model-mcp-recovery','任务库与接收库分属不同进程。工作进程退出后，接收库仍保留原报告和回执。')+
   p('换成匹配的批准。宿主先持久化操作号 <code>report-A/v3:publish</code>，再通过 MCP 的 Streamable HTTP 传输方式调用独立接收服务。这时客户端与工具服务用 HTTP 交换消息。接收服务在自己的 SQLite 事务中写入报告和回执。监督进程在提交后、服务发出响应前终止发布进程。')+
   table(['核对时点','任务库','接收库'],[
    ['旧批准被拒绝','仍在等待，未发出发布','0 份报告、0 份回执'],
    ['提交后终止工作进程','待确认，回执为空','1 份金额 42 的报告、1 份回执'],
    ['新进程查询原操作','核对回执后标为完成','仍是 1 份报告、1 份回执']
   ])+
   p('新进程建立新会话，调用 <code>lookup_receipt</code> 查询原操作。记录中两条 MCP 会话的 JSON-RPC 请求编号都是 3，真正贯穿发布与恢复的是持久化的操作号。新进程核对回执中的操作号、草稿摘要和来源版本，再保存完成状态。整条记录只有一次发布和一次回执查询。')+
   p('复跑需同时解压本实验和<a href="/labs/model-plan-revision.zip">原模型规划包</a>，按说明准备固定版本的模型和运行时。程序使用本机独立进程、两个数据库和预设的批准输入。可以对照两份数据库及 HTTP 事件顺序，核实工作进程退出时究竟写到了哪一步。')+
   '<p class="practice-links"><a href="/labs/model-mcp-recovery.zip" download>下载源码和真实记录 ↓</a> · <a href="/labs/model-mcp-recovery/validation.json">四轮模型提议与发布恢复记录 →</a> · <a href="/labs/model-mcp-recovery/README.md">复跑与查表步骤 →</a></p>'+
   p('任务库已经标为完成。<a href="/article/agent-evaluation/#native-model-mcp-recovery-verdict">从原订单重算 42，再查接收库里的报告和回执 →</a>'));
  const nativeWorkflow=h('langgraph-workflow-run','真实框架、文件检查点与HTTP接收方');
  const nativeWorkflowStart=a.sections[8][1].indexOf(nativeWorkflow);
  if(nativeWorkflowStart<0)throw Error('Missing workflow practice after model plan revision');
  a.sections[8][1]=fold('选读 · 固定提议与执行者接管的对照',a.sections[8][1].slice(0,nativeWorkflowStart))+
   modelPlan+modelMcpRecovery+fold('选读 · LangGraph 检查点与独立 HTTP 接收方',a.sections[8][1].slice(nativeWorkflowStart));
  a.sections[8][1]+=fold('选读 · MCP 提交后退出，怎样认回原回执',h('mcp-commit-recovery','工具已返回回执，工作流怎样恢复')+p(
   '这个独立实验把提交间隙接到真实的 MCP 工具。权威输入给 report-A/v3 固定三笔金额 10、27、5，发布结果应为 42。LangGraph 先将发布意图和操作 ID <code>report-A:publish</code> 写入自己的 SQLite 检查点。随后 <code>publish</code> 节点通过官方 MCP 客户端发现并调用 <code>publish_report</code>，接收方在另一份 SQLite 数据库里用同一事务提交报告和回执。',
   '第一次调用已经收到回执。监督进程此时读到接收库有一份报告和一份回执，而图检查点仍为 <code>next=["publish"]</code>，尚无回执。监督进程向这个工作进程发送 SIGKILL，切点在节点返回状态更新之前。新工作进程沿原 <code>thread_id</code> 调用 <code>invoke(None)</code>，重跑 <code>publish</code> 并建立新的 MCP stdio 会话。')+
   trainingFigure('mcp-commit-recovery','两个 MCP 会话之间，图检查点保存发布意图，接收库保存报告和回执。')+
   p('接着读<a href="/labs/mcp-recovery/validation.json">同一份执行记录</a>的 <code>cases.stable.resume</code>。在 <code>receiver.attempts</code> 里找两条 <code>publish_report</code> 的调用。两条记录的 <code>server_pid</code> 不同，各自会话的 JSON-RPC 请求编号 <code>rpc_request_id</code> 都记为 <code>"3"</code>。跨会话的业务操作 ID <code>operation_id</code> 都是 <code>report-A:publish</code>。第一条的 <code>outcome</code> 是 <code>committed</code>，第二条是 <code>replayed</code>。工具按操作 ID 找到原回执，核对正文摘要后返回它。',
    '再把 <code>resume.checkpoint.values.receipt</code> 与 <code>cut.observed_mcp.receipt</code> 逐字段对齐。操作 ID、正文摘要和 <code>revision=1</code> 等字段全相同。此时 <code>resume.checkpoint.next</code> 是 <code>[]</code>，接收库仍只有一份报告和一份回执。<a href="/article/agent-recovery/#mcp-receipt-before-checkpoint">回到崩溃恢复章核对退出前的两份记录 →</a>')+
   table(['恢复时提交的操作 ID','接收库中的实际结果','独立验收'],[
    ['沿用发布意图中的 ID','提交、重放各一次，报告 42 一份','通过'],
    ['按尝试派生不同 ID','提交两次，报告各为 42，共两份','拒绝']
   ])+
   p('打开对照 <code>cases.attempt_derived_id</code>，比较 <code>resume.receiver.receipts</code> 中的两份回执。金额都是 42，由任务、来源版本和金额算出的正文摘要 <code>body_digest</code> 也相同。两个操作 ID 分别是 <code>report-A:publish:attempt-1</code> 和 <code>report-A:publish:attempt-2</code>，接收方按 ID 查旧记录，各提交了一次。图的 <code>next</code> 同样变成 <code>[]</code>。查看独立验收的 <code>oracle.conditions</code>，来源和金额核对 <code>correct_source_and_amount</code> 为 <code>true</code>，只发布一份的核对 <code>one_report_and_receipt</code> 为 <code>false</code>。',
    '运行需要 POSIX 进程信号和两个 Python 3.12 虚拟环境，分别使用 <a href="/labs/langgraph-workflow/requirements.txt">LangGraph 1.2.20 与 SQLite 检查点包 3.1.3 的锁定依赖</a>、<a href="/labs/mcp-protocol/requirements.txt">MCP SDK 2.3.0 的锁定依赖</a>。解压后在实验目录运行，替换两个解释器路径。')+
   trainingCode('运行原生 MCP 与检查点恢复实验','SHELL','/path/to/langgraph-env/bin/python -B workflow.py --mcp-python /path/to/mcp-env/bin/python')+
   p('这里的 MCP 工具走本机标准输入输出，发布动作和输入固定。两次工作进程各有自己的 PID，实验观察的是工具回执已收到之后的退出与重入。')+
   '<p class="practice-links"><a href="/labs/mcp-recovery.zip" download>下载完整实验包 ↓</a> · <a href="/labs/mcp-recovery/workflow.py">工作流源码</a> · <a href="/labs/mcp-recovery/mcp_bridge.py">MCP 工具源码</a> · <a href="/labs/mcp-recovery/source.json">权威输入</a></p>');

  const approvalLink='<a href="/article/durable-workflows/#native-approval-reentry">沿真实工作流核对批准、撤权和回执 →</a>';
  a.sections[7][1]+=p('批准信号可以唤醒工作流。恢复以后，动作是否仍可执行，要由实际接收写入的一方重新判断。若上一次写入的结果未知，还要把发布和查回执分成两个工具。'+approvalLink);
  a.sections[8][1]+=fold('选读 · 批准后撤权，恢复时查谁的记录',h('native-approval-reentry','批准后恢复，谁检查当前权限')+
   p('把 10、27 和补录的 5 汇总为 42，准备发布到 <code>A/daily</code>。LangGraph 先把目标、金额和操作键 <code>report-A:publish</code> 存进检查点。审批节点走到 <code>interrupt()</code> 就停下，此时接收库还没有报告。新进程沿用同一个 <code>thread_id</code> 恢复，LangGraph 从审批节点开头重跑。再次走到 <code>interrupt()</code> 时，才拿到 <code>Command(resume=…)</code> 传进来的批准编号。'+
    '<a href="https://docs.langchain.com/oss/python/langgraph/interrupts">LangGraph 的中断与恢复接口 ↗</a>',
    '批准编号指向接收方保存的记录。发布工具在同一个事务里读取当前写权限，再核对批准绑定的发布目标、操作键和参数。通过后才保存报告和回执。两次发布被拒。一次是在等待时撤掉写权限，另一次是拿着批准 42 的编号却提交 41，参数摘要对不上。两组接收库都还是 0 份报告。')+
   trainingFigure('approval-reentry','图进程保存意图与进度。接收库决定当前允许写入或查询，并保存实际效果。')+
   fold('展开接收方事务入口',trainingCode('mcp_bridge.py 的实际事务入口','PYTHON',`def execute(db_path, tool, arguments, request_context, unsafe_snapshot):
    with closing(connect(db_path)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        context = db.execute("SELECT * FROM trusted_context").fetchone()
        policy = db.execute("SELECT * FROM policy").fetchone()
        result = (lookup(db, arguments, context, policy) if tool == LOOKUP
                  else publish(db, arguments, context, policy, unsafe_snapshot))
        log_event(db, "tool", tool, arguments["operation_id"], policy, result["status"],
                  arguments, request_context.request_id)
        # Approval consumption, effect, receipt and audit commit together here.
    return result`)+p('撤权也在这个接收库里通过写事务保存。接收方在实际写入时读取当前策略。批准消费、报告、回执和审计随同一次事务提交。图检查点另用一个库。'))+
   p('打开<a href="/labs/approval-reentry/validation.json">本次实际执行记录</a>，在 <code>cases</code> 中比较 <code>revoked_before_resume</code> 和 <code>unsafe_approval_snapshot</code>。两组先停在 <code>waiting.checkpoint.next=["approval"]</code>。再核对 <code>approval.approval_id</code> 都是 <code>approval-A-1</code>，绑定这次发布参数的摘要 <code>approval.intent_digest</code> 也相同。查 <code>receiver.events</code> 的第 1、2 条，批准时 <code>policy_epoch=1</code>、<code>can_write=1</code>，撤权时变为 <code>policy_epoch=2</code>、<code>can_write=0</code>。批准记录仍保存在 <code>receiver.approvals</code>。',
    '新进程带着原批准恢复。第一组的发布事务读取当前权限，第二组的对照事务沿用批准记录里的 <code>write_at_approval=1</code>。<a href="/article/agent-evaluation/#approval-at-commit-verdict">按发布事件和实际报告给这两组结果判分 →</a>')+
   p('再看提交后的崩溃。接收方已保存报告和回执，工作进程却在保存图状态前被终止。新进程按原操作身份调用 get_receipt。写权限已经撤销、读回执仍允许时，可以核对原回执并结束任务。读权限也已撤销时，图只能保留待确认状态。两次恢复都只调用查询工具，独立验收仍能从接收库看到已经提交的那一份报告。')+
   '<div class="approval-outcomes">'+table(['改变的条件','图能确认什么','报告数'],[
    ['批准仍有效','收到金额 42 的回执','1'],
    ['等待期间撤掉写权限','本次发布被拒绝','0'],
    ['批准对应 42，提交改为 41','参数摘要失配，发布被拒绝','0'],
    ['提交后崩溃，只撤写权限','查询原回执，核对既有的 42','1'],
    ['提交后崩溃，写入与查回执权限均撤销','查询被拒，保留待确认','1'],
    ['故意信任等待前的权限','图收到回执，独立验收发现越权','1']
   ])+'</div>'+
   p('实验通过官方 MCP SDK 的本机标准输入输出传送工具调用。可信主体由实验宿主配置，写权限与查回执权限由接收方实施。独立验收直接重读固定输入和接收库，检查金额、次数和授权结果。复跑需要 POSIX 进程信号和分别安装 LangGraph、MCP 的两个 Python 3.12 环境。')+
   trainingCode('在解压目录复跑，替换两个解释器路径','SHELL','/path/to/langgraph-env/bin/python -B workflow.py --mcp-python /path/to/mcp-env/bin/python')+
   '<p class="practice-links"><a href="/labs/approval-reentry.zip" download>下载源码和运行记录 ↓</a> · <a href="/labs/approval-reentry/README.md">分步运行说明</a></p>');
  a.updated='2026.11.10';

  const security=articleById('agent-security');
  security.sections[4][1]+=p('把撤权放进一次等待批准的真实工作流。审批信号决定图何时继续，接收方在提交事务里再检查当前写权限和参数摘要。预测两种情况是否会留下报告：等待期间撤销权限，或沿用批准 ID 却把金额 42 改成 41。'+approvalLink);
  security.updated='2026.11.09';

  const recovery=articleById('agent-recovery');
  recovery.sections[3][1]+=p('若写入已经可能提交，恢复方可以按原操作身份先查回执。查回执和发布各有自己的权限。查回执被拒时，恢复者对结果的认识仍停在待确认。接收方可能已有一份实际效果，这时也不能换新操作 ID 再发一遍。'+approvalLink);
  recovery.updated='2026.11.12';

  const kairo=articleById('kairo-practice');
  kairo.sections[5][1]+=p('目标环境验收可沿用一组对照：暂停后撤权，确认零新效果。再从提交后退出恢复，分别撤销写权限与查回执权限，对照一份既有效果和图的完成或待确认状态。把目标版本、批准绑定、权限来源、接收方回执和实际产物分别保存。'+approvalLink);
  kairo.sections[5][1]+=p('目标版本若使用 MCP Streamable HTTP，可在同一个操作上分别于提交前、提交后关闭响应流。分别记录断流、执行清理和原操作回执，接收方实际产物决定结果。<a href="/article/mcp-protocol/#mcp-http-cancellation-run">本机协议对照与复跑步骤 →</a>');
  kairo.updated='2026.11.12';
 }
 {
  const a=articleById('agent-retrieval');
  const qdrantAnchor='<h3 id="native-qdrant-retrieval">在 Qdrant 取候选，到来源库核对版本</h3>';
  a.sections[11][1]+=qdrantAnchor+
  p('上面的融合算例给定了第二路排名。这里把向量交给真实的 Qdrant 服务计算。集合规定向量维数和打分方法。每个点由编号、向量和附加字段组成，附加字段称为 payload。本例只把租户、索引中的可读标记和来源版本放入 payload。正文金额保存在独立的 SQLite 来源库。')+
  p('查询向量是 [1,0]。集合用点积，计算式是 1×第一项＋0×第二项。编号 701 的向量是 [0.99,0.1]，因此得分 0.99。服务收到 <code>POST /collections/evidence/points/query</code> 后，按指定条件做精确打分并返回前 k 项。全局前两名都是 B 租户的点，先取前两名再筛掉 B，会得到空表。把租户 A 与可读标记写入查询的 <code>filter.must</code>，在符合条件的候选里取前两名，得到 101、102。只限制租户时，得分 0.95 的 105 仍会进入结果。')+
  trainingFigure('qdrant-retrieval','同一查询在全局候选和受限候选里排名不同。实际交付还要对照来源库当时的资格和版本。')+
  p('第二次取到 101、102 后，实验先保留这组候选，再从来源库撤回 102 的读取资格，并把 103 从第 1 版金额 41 更新到第 2 版金额 42。装配程序用可信租户和候选编号查来源，只读租户、资格和版本三个字段。三项通过才读取正文。此时 102 仍出现在已取回的候选中，正文读取记录里只留下 101。')+
  table(['受限查询或变化','索引返回编号','实际读取的正文'],[
   ['变化前，k=2','101、102','101/v1=10，102/v1=27'],
   ['取回后撤权，沿用 k=2 的候选','101、102','101/v1=10，共 1 项'],
   ['索引仍旧，扩大到 k=4','101、102、103、104','101/v1=10，104/v1=7'],
   ['更新索引，再查询 k=2','101、103','101/v1=10，103/v2=42']
  ])+
  p('k=4 让 104 有机会进入可用证据。103 的旧版候选仍被拒绝，扩大候选数无法推进索引版本。刷新索引时把 102 标成不可读，把 103 的版本与固定向量改到第 2 版，下一次才能读到 42。两项可用材料是否支持用户的具体问题，还要按第 11 节另行核对。')+
  fold('跟源码复跑并核对两份记录',p('运行器创建真实集合，为 <code>tenant</code> 与 <code>eligible</code> 建字段索引，写入 7 个点，再发送 6 次精确查询。对照 <code>exchanges.json</code> 的请求、返回编号和分数，再从 <code>authority.sqlite</code> 的 <code>body_reads</code> 查实际取过哪些版本。拒绝 102 或 103 旧版时，该次装配没有对应正文读取。实验使用人工给定的二维向量、单节点 Qdrant 和本地 SQLite 事务。近似搜索召回、生产权限同步与模型回答要另取证据。'))+
  '<p class="practice-links"><a href="labs/qdrant-retrieval.zip" download>下载运行器与证据 ↓</a> · <a href="labs/qdrant-retrieval/README.md">复跑说明</a> · <a href="labs/qdrant-retrieval/validation.json">查看实际记录</a> · <a href="https://github.com/CaptainGreenskin/infra-guide/actions/runs/42581362152">Linux CI 实跑 ↗</a> · <a href="https://api.qdrant.tech/api-reference/search/query-points">Qdrant 查询接口 ↗</a></p>';
 }
})();

// Preserve the earlier workflow inventory while extending its native practice.
(()=>{
 const a=articleById('durable-workflows');
 const p=text=>'<p>'+text+'</p>';
 a.sections[8][1]+='<details class="progressive-detail"><summary>选读 · 并行候选怎样合并为一次发布</summary><h3 id="native-parallel-merge">两个分支交出同一动作，怎样归并再发布</h3>'+
 p('沿用第 4 节的并行汇合。这次分支 A 和 B 都为 <code>report-A:publish</code> 生成同一份日报的候选。两支在同一个执行步返回。如果都写入普通状态字段，LangGraph 报 <code>InvalidUpdateError</code>，还未进入汇合节点。把字段改成列表并用 <code>operator.add</code>，两条金额 42 都能存下来。若把两项当作不同金额相加，会算成 84。')+
 p('这里用业务操作 ID 区分动作，用字段排序后的 JSON 表示一版正文，把来源分支另记。42 和 42 归为一版，来源记 A、B，汇合节点允许发布。42 和 41 归为两版，汇合节点停在待复核。交换两支记录输出的先后，仍得到同样的两版和复核决定，接收方没有收到发布请求。')+
 trainingFigure('langgraph-parallel-merge','先在图内区分相同候选和冲突候选，再到接收方按原业务操作核对实际效果。')+
 p('首次发布后，另一个进程打开同一个 SQLite 检查点库，选择下一步为 <code>publish</code> 的历史检查点，调用 <code>invoke(None, checkpoint_config)</code>。两个分支和汇合节点各只进入一次，发布节点实际进入两次。第一次用原操作 ID 保存效果和回执，第二次在接收方查回同一个回执。两次请求对应一份已提交效果。这里验证的是本机固定输入下的图状态与独立接收方事务。')+
 '<p class="practice-links"><a href="labs/langgraph-parallel-merge.zip" download>下载程序与原始记录 ↓</a> · <a href="labs/langgraph-parallel-merge/README.md">复跑步骤</a> · <a href="labs/langgraph-parallel-merge/validation.json">核对分支与回执</a> · <a href="https://docs.langchain.com/oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE">并发状态更新 ↗</a> · <a href="https://docs.langchain.com/oss/python/langgraph/use-time-travel">检查点重放 ↗</a></p></details>';

 a.sections[9][1]+='<h3 id="native-workflow-version-resume">旧任务等着发布 A，新版却先问要不要共享给 B</h3>'+
 p('第 1 版把 10、27 和 5 加成 42，停在“发布到 <code>A/daily</code>”的审批上。随后原进程退出。第 2 版还叫这个节点 <code>approval</code>，却在发布前插入“共享到 <code>B/daily</code>”这一步。两版的第一个问题已经不同。')+
 trainingCode('新版多了第一个审批','PYTHON',`if graph_version == 2:
    outcome = visit_gate("inserted_gate")
    if outcome != "committed":
        return {"status": outcome}
return {"status": visit_gate("original_gate")}`)+
 trainingFigure('workflow-version-resume','旧图位置 0 等 A 的批准。新版把 B 放在位置 0，原来 A 的问题移到位置 1。')+
 p('新进程用原 <code>thread_id</code> 打开同一份 SQLite 检查点，提交时还带上了原中断编号。LangGraph 恢复会从节点开头重跑，节点内按顺序使用保存的回答。旧回答被交给新版的第一问，所以代码拿着 A 的批准去请求 B。表里的两份计数来自接收库实际写入的行。')+
 table(['恢复时怎么选图、怎么验批准','接收方看到什么','A、B 各写几份'],[
  ['跑新版，只认批准编号','请求 B，批准记录指向 A，仍错误写入 B。图又停在 A 的审批上','0、1'],
  ['跑新版，核对批准绑定的操作','请求 B，和批准的目标及操作不符，拒绝写入','0、0'],
  ['从检查点读出版本 1，交回旧图','请求与原批准都指向 A，发布完成','1、0']
 ])+
 p('绑定批准能挡住错误写入，但第二组的旧任务也没完成。第三组由应用读取检查点中的 <code>workflow_version</code> 选择图。部署新版时可让新任务用 v2，仍在等待的 v1 任务继续用旧定义。若要迁移等待中的任务，要先确定未回答的问题、批准指向的动作和已有写入怎样对应。')+
 trainingCode('解压后在新目录保存三组记录','SHELL','python -m pip install -r requirements.txt\npython -B resume_lab.py --output-dir replay')+
 p('先对照 <code>waiting_v1.interrupts</code> 和 <code>resume.fresh_v2_pause.interrupts</code>，确认两版第一问。再看 <code>receiver_final.writes</code>，验证哪份报告真的入库。实验使用 LangGraph 1.2.20，批准和接收库均为本机夹具。')+
 '<p class="practice-links"><a href="/labs/workflow-version-resume.zip" download>下载程序与记录 ↓</a> · <a href="/labs/workflow-version-resume/README.md">复跑步骤 →</a> · <a href="/labs/workflow-version-resume/validation.json">核对中断、决定和实际写入 →</a> · <a href="https://docs.langchain.com/oss/python/langgraph/interrupts#do-not-reorder-interrupt-calls-within-a-node">LangGraph 的中断顺序 ↗</a></p>';
 a.updated='2026.11.12';
})();
