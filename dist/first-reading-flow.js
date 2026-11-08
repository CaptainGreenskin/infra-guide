/* First reading: identify the components before calculations, contracts and failure cases. */
function conceptReadingTable(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
const firstReadingChanges=[];
{
 const a=articleById('transformer-model'),section=a.sections[0],before=section[1];
 const overview=before.match(/<figure\b[\s\S]*?<\/figure>/)?.[0];
 if(!overview||!overview.includes('v42-ai-concepts.svg'))throw Error('Missing model overview figure');
 section[1]=para('Transformer是一种组织序列计算的模型结构。以文本续写为例：文本变成词元编号，模型计算每个候选词元的得分，再选出下一项。把选中的词元接回输入、继续预测，称为自回归生成。先看输入怎样走到输出，再学习张量形状和矩阵计算。',
 '本章以解码器模型为例。解码器根据已有内容生成后续内容；其中重复堆叠的计算单元叫Decoder Block。一个Block主要完成两件事：注意力读取上下文，前馈网络加工各位置的特征。位置、归一化和残差连接帮助这些计算组成完整层。')+
 conceptReadingTable(['组件','负责什么','在模型中的关系'],[
  ['分词器与词表','把文本片段转换为编号','为词嵌入提供查表编号'],
  ['词嵌入 <code>Embedding</code>','把编号查成向量','产生每个位置的初始表示'],
  ['位置机制','让表示包含先后位置信息','本例把位置向量加到词嵌入上'],
  ['注意力 <code>Attention</code>','从允许看到的位置汇总信息','让不同位置之间交换信息'],
  ['前馈网络 <code>FFN</code>','分别变换每个位置的特征','接着加工注意力汇总后的表示'],
  ['归一化','按规则调整特征的数值尺度','用于注意力和前馈等变换附近'],
  ['残差连接','把分支输出与原表示相加','保留直接路径，连接连续的计算层'],
  ['输出投影','为词表中的每个候选编号打分','分数用于计算训练损失或选择下一项']
 ])+
 para('参数是模型要学习的数字，输入和中间结果是本次处理的数据。推理用固定参数计算预测分数；训练把分数与正确目标比较，得到表示预测偏差的损失。梯度描述损失随参数变化的方向与幅度，优化器据此调整参数。下文会分别计算参数和数据的形状与存储。')+overview+para(
 '后续模型基础章节共用一个小模型：词表V=8、隐藏宽度D=8、批大小B=2、输入长度T=4。token指分词器划出的离散单位，不保证对应一个完整汉字或单词；词元编号只用于定位词表项。',
 '两条原始序列为[0,1,2,3,4]和[4,5,6,7,0]。每条取前四项作输入、后四项作目标，即input=s[:-1]、target=s[1:]。第0位根据输入0预测1，第3位根据前四项预测4。每个位置只读取自己及之前的内容，这个可见范围称为因果约束。训练章节还会把部分目标标为忽略，再统计有效监督数。后面的推导沿用这组对象。');
 a.updated='2026.11.08';firstReadingChanges.push({id:a.id,section:1,before,after:section[1]});
}
{
 const a=articleById('cloud-overview'),section=a.sections[2],before=section[1];
 const replacements=[
  ['它仍不能单独保证什么','在请求路径中的作用'],
  ['<td>业务数据一定正确</td>','<td>把用户请求交给合适的应用入口</td>'],
  ['<td>下游有足够容量</td>','<td>为应用提供执行环境与资源</td>'],
  ['<td>误删后必然能恢复</td>','<td>在实例替换后继续保存和提供数据</td>'],
  ['<td>网络路径一定连通</td>','<td>判断主体可对哪些对象执行什么动作</td>'],
  ['<td>无状态和有状态系统采用同一恢复方式</td>','<td>发现不可用副本，切换或重建所需状态</td>']
 ];
 for(const[from,to]of replacements){if(!section[1].includes(from))throw Error('Missing cloud responsibility row: '+from);section[1]=section[1].replace(from,to);}
 a.updated='2026.11.08';firstReadingChanges.push({id:a.id,section:3,before,after:section[1]});
}
{
 const a=articleById('agent-runtime'),section=a.sections[0],before=section[1];
 const contract=before.match(/<div class="table-wrap">[\s\S]*?<\/table><\/div>/)?.[0];
 if(!contract||!contract.includes('契约项'))throw Error('Missing original Agent task contract');
 section[1]=before.replace('<h3>先把用户目标改写成可以验证的任务契约</h3>','<h3 id="subsection-1-1s1j8lt">模型、运行时、工具与验收器</h3>').replace(contract,'<details class="concept-task-detail"><summary>本章任务契约：数据、权限与停止预算</summary>'+contract+'</details>');
 const modelIntro='模型可以理解要求、提出读取资料或保存报告的动作；';
 if(!section[1].includes(modelIntro))throw Error('Missing Agent model introduction');
 section[1]=section[1].replace(modelIntro,'模型是根据输入生成文本或动作提议的计算组件。它可以提出读取资料或保存报告的动作；');
 const from='可以预先确定的步骤与分支，适合显式工作流；需要根据内容判断下一步的部分，可以允许模型决策。固定工作流也会有重试、权限和提交间隙；动态决策则还增加不合法提议、循环和误判完成。选择从任务的不确定性出发，先把所有方案都必须满足的任务契约写清。';
 if(!section[1].includes(from))throw Error('Missing Agent workflow comparison');
 section[1]=section[1].replace(from,'步骤和分支已知时，可以用显式工作流组织；需要根据内容选择下一步时，可以让模型提出动作。两者都由运行时维护状态、权限和停止条件。先沿本章的正常任务走完，再逐项展开这些机制。');
 a.updated='2026.11.08';firstReadingChanges.push({id:a.id,section:1,before,after:section[1]});
}
