/* Original lessons. Source research informs the teaching; readers follow the mechanism. */
Object.assign(sources,{
 v19Tcp:['IETF · TCP规范：字节流与半关闭','https://www.rfc-editor.org/rfc/rfc9293.html#section-3.6.1'],
 v19Socket:['Python · socket接收与关闭方向','https://docs.python.org/3/library/socket.html#socket.socket.recv'],
 v19Epoll:['Linux man-pages · epoll就绪与触发方式','https://man7.org/linux/man-pages/man7/epoll.7.html']
});

const tcpMessageLesson=infraReadableHTML('<div class="mechanism-core" id="tcp-message-boundary">'+
 knowledgeSubhead('先有连续字节，再由协议切出一条消息')+
 para('TCP不替应用保存消息边界。发送两次，只表示程序做了两次发送操作；对端可能分多次读完，也可能一次读到两条消息。通常所说的“粘包、半包”，要解决的是应用怎样从连续字节中识别完整消息，而不是让TCP恢复一次send对应一次recv。',
 '协议可以选择固定长度、带转义的分隔符或长度前缀。下面采用“四字节大端长度＋UTF-8正文”：长度计算编码后的字节，不是中文字符数。“云上训练”是4个字符、12字节，所以这一帧共16字节。连续两帧共32字节；读取时每次最多拿7字节，消息自然跨越读取边界。')+
 figure('v19-tcp-framing','两帧各16字节。应用每次最多读取7字节；先保留不足的长度头，再累积正文。图中的读取切分是一种合法示意，实际执行的切分另见结果。')+
 table(['缓冲中有什么','解析器应该做什么','为什么'],[
 ['不足4字节','保留，等待下一次读取','长度头也可能被拆开'],
 ['头完整，正文不足','检查长度上限后保留','不把一部分正文当完整消息'],
 ['已有完整帧，后面还有字节','取出这一帧，继续循环解析','一次读取可能携带多帧'],
 ['对端正常关闭发送方向','处理已读字节，再检查是否剩半帧','EOF不是“本帧自动完整”']])+
 code('解析循环的核心：对照完整Decoder类','PYTHON',
 'while len(self.buffer) >= 4:\n    size = struct.unpack("!I", self.buffer[:4])[0]\n    if size > LIMIT:\n        raise ValueError("frame_too_large")\n    if len(self.buffer) < 4 + size:\n        break\n    body = bytes(self.buffer[4:4 + size])\n    del self.buffer[:4 + size]\n    messages.append(body.decode("utf-8"))')+
 para('长度头来自对端，先验证上限，再等待正文。生产实现还要给单连接缓冲、消息完成时间和业务队列设限；否则对方可以声明一个很大的长度后慢慢发送，长时间占着内存与连接。这个短解析器假设每次喂入的是受控小块，正文严格按UTF-8解码，非法编码会报错。')+
 knowledgeSubhead('半关闭只结束一个方向；超时仍要查业务结果')+
 para('客户端调用shutdown(SHUT_WR)，表示本端不再发送。服务端读完这条方向上已经到达的数据后，recv返回空字节；它仍可沿反方向回送结果。客户端随后继续recv，不需要重新建连接。实验用这个顺序验证：发两帧→关闭发送→服务端读到EOF→服务端回一帧→客户端收到回应。',
 '正常EOF、连接重置、暂时不可读和超时是不同观测。即便sendall已经返回，仍不能凭它判断授权、落库或扣款完成；超时也不能证明这些动作没发生。业务恢复应沿原请求身份找权威结果，再决定是否按同一操作键重试。')+
 knowledgeCheck('长度头写12，但连接正常结束时只收到11字节正文，能否接受？','不能。传输正常结束不补齐应用协议。解析器在EOF发现残留缓冲，应报告截断帧；不要把半条消息交给业务层。')+'</div>');

const ioReadinessLesson=infraReadableHTML(knowledgeSubhead('收到可读通知后，仍要区分三个分支')+
 table(['非阻塞读取的结果','含义','后续动作'],[
 ['返回非空字节','这次取得了一段数据','放入协议缓冲，循环解析完整消息'],
 ['返回空字节','这一方向正常到达EOF','检查残帧，按协议完成响应与清理'],
 ['EAGAIN / EWOULDBLOCK','当前没有可读数据','保留解析状态，安排后续就绪处理']])+
 para('Linux的水平触发（LT）在条件仍满足时可以继续报告就绪；边沿触发（ET）不能假定“没读完，下一次一定再提醒”。ET常配合非阻塞描述符，在当前处理轮中读到EAGAIN。若为了公平性设置读取预算，预算耗尽但尚未读空时，必须主动安排继续处理，不能直接丢回等待。',
 '读到完整消息之后，也不能把同步数据库请求塞进事件循环，任它阻塞其他连接。连接缓冲、协议解析、有界业务队列、输出缓冲各自有容量；下游处理不过来时，要暂停读入或限制新工作。写方向还要保存未发送完的余量，按所用模式注册和处理可写事件。下面的TCP实验验证解帧与半关闭；epoll是这里单独讲解的Linux机制。'));

const checkpointStateLesson=infraReadableHTML('<div class="mechanism-core" id="checkpoint-consistent-state">'+
 knowledgeSubhead('检查点要保存“同一步”，不能只收集“最新文件”')+
 para('先固定边界：本例只在一次优化器更新完成后保存，没有正在累积的梯度。训练状态可以拆成模型、优化器、输入进度三份，但它们必须属于同一个run、同一个已完成step和同一配置。模型是第3步、动量却是第4步，各文件的摘要即使都正确，也不能组成第3步的恢复点。')+
 figure('v19-checkpoint-commit','旧提交指针仍指向step 0；step 3的文件先准备，校验同代状态后才发布指针。更晚的半成品目录与混合步数都不能被当成新提交。')+
 table(['检查层次','要验证什么','单独通过后仍可能缺什么'],[
 ['文件完整','长度与摘要符合清单','文件可能来自另一步'],
 ['状态一致','run、step、配置一致；数据进度与提交边界一致','新清单可能尚未对读者发布'],
 ['提交可见','读者从已发布指针取得完整清单','存储的掉电持久性仍依具体协议'],
 ['恢复等价','同条件连续执行与恢复执行对照','不能自动推广到不同并行规模或任意中断点']])+
 para('写入者先准备独立目录与清单，校验通过后再发布CURRENT；读取者只沿CURRENT加载，不扫描目录挑“最大的step”。新目录写到一半时，旧恢复点仍可用。校验失败时保留旧指针，避免用一个更新但不完整的文件覆盖最后可用状态。对象存储需使用自己的版本、条件更新和提交协议，不能照搬本地路径替换。')+
 knowledgeSubhead('用一条能复算的更新式，说明为什么只存权重不够')+
 knowledgeFormula('本地标量训练的完整下一步',
 'gₜ = (wₜ·xₜ − yₜ)·xₜ；vₜ₊₁ = 0.9vₜ + gₜ；wₜ₊₁ = wₜ − 0.05vₜ₊₁',
 '损失为(w·x−y)²/2。本程序每步消费一个样本，样本缩放由固定种子的随机数决定；更新完成后step与cursor各加1。')+
 para('w相同而v不同，下一步更新就可能不同；w和v都相同，样本游标或随机状态变了，也可能沿另一条轨迹走。程序将动量、游标、随机状态与权重一起保存，再比较“连续6步”和“3步＋保存加载＋3步”的全部状态。它检验恢复轨迹，不评估模型收敛效果。',
 '异步保存还多一个问题：训练继续修改参数时，后台究竟读到哪一版？必须按框架的暂存与完成契约冻结或复制待保存状态，等待相应完成阶段；返回了一个异步句柄，并不代表文件已可恢复。使用PyTorch DCP时，再核对所用版本的全rank参与、状态字典、暂存和完成语义。')+
 knowledgeCheck('每个分片都能通过SHA256校验，能否跳过step一致性检查？','不能。摘要检查这份字节是否符合清单；混合步数也可以各自拥有正确摘要。先检查同一状态边界，再做完整恢复对照。')+'</div>');

const approvalRecordsLesson=infraReadableHTML('<div class="mechanism-core" id="approval-records">'+
 knowledgeSubhead('审批、执行器声明、工具回执，分别能证明什么')+
 para('沿同一个动作K1看三份记录。用户批准把A/draft从预期版本7改成金额37；执行器随后报告“成功”；工具端则持有真正的提交记录。它们有关联，但证明的事实不同：批准回答是否允许做，声明回答谁声称做了，接收方回执回答在这个接收方实际提交了什么。')+
 figure('v19-approval-receipt','三份记录用租户A、动作K1和参数摘要关联。批准与声明不能替工具提交；恢复查询必须再次通过当前读取权限。')+
 table(['记录','本例绑定的内容','能支持的结论'],[
 ['批准R18','主体、租户A、K1、工具版本、draft、预期版本7、金额37、有效期','允许这个具体意图；改成99就不匹配'],
 ['执行器声明','A、K1、status=success及完整性校验','本地HMAC校验通过；不证明草稿已经写入'],
 ['工具端回执','A＋K1对应的参数摘要、版本8、金额37','在本接收方事务中，这个意图已产生一份效果']])+
 para('执行前，可信身份和当前策略先限制动作与对象，再核对批准是否覆盖规范化的具体意图。JSON字段顺序可以变化，但业务意图不能悄悄变；字段、编码、数字表示和版本必须由契约固定。签名或HMAC验证声明的完整性，不会验证声明中的业务句子必然为真。真实系统还需验证签发者、密钥与适用范围；本实验使用公开测试密钥，只展示“声明校验”与“真实效果”的区别，不提供真实身份认证。')+
 '<details class="knowledge-check"><summary>记录一：批准金额37；模型把参数改成99，还能执行吗？</summary>'+para('不能。新参数摘要不匹配原批准，接收方应在产生效果之前拒绝。不能只核对“有一个批准ID”。')+'</details>'+
 '<details class="knowledge-check"><summary>记录二：声明校验通过，但工具回执查询超时，现在算成功还是失败？</summary>'+para('结果未知。校验通过只支持声明完整；查询超时没有返回权威提交结果。保存原K1与参数摘要，等待有权限的查询或依接收方协议同键恢复。不要换键重写，也不要据此断言零效果。')+'</details>'+
 '<details class="knowledge-check"><summary>记录三：查到A/K1的版本8与金额37，恢复时还要批准一次新写入吗？</summary>'+para('本例把它定义为读取已提交结果，或同键同参数返回原回执，不创建新效果。接收方仍检查当前权限；原批准过期、读取权限被撤销、跨租户查询分别按契约处理。不存在所有工具通用的默认行为。')+'</details>'+
 para('工具在提交后、回执返回前退出，是提交间隙的具体故障。下面的程序让一个真实子进程在SQLite事务提交后退出，恢复者再找K1。效果、回执和批准消费在接收方同一事务内；运行器本地历史与任意远端工具之间仍不能因此获得跨库原子性。')+'</div>');

function mechanismLabHTML(name,withSource=true){
 const r=mechanismLabValidation.programs[name].result;
 let explanation,rows;
 if(name==='tcp_framing.py'){
  explanation='在真实127.0.0.1 TCP连接上发送两帧，然后半关闭发送方向。接收端每次最多读7字节；另用三种人为切分单独验证解析器。';
  rows=[['输入与线长','4个中文字符各占12字节；两帧共'+r.wire_bytes+'字节'],['实际接收分段',r.server.recv_chunk_bytes.join(' / ')+' 字节；这是本次观测'],['解析后的消息',r.server.messages.join('、')],['半关闭后的回应',r.reply_after_half_close.join('、')],['错误输入','超长拒绝；头和正文截断均拒绝']];
 }else if(name==='checkpoint_commit.py'){
  explanation='标准库实现的标量动量SGD，检查更新后的同一步状态。程序先写半成品，再制造摘要正确但步数混合的文件，最后比较连续与恢复轨迹。';
  rows=[['连续6步 vs 3＋3步','全部状态完全相同：'+r.complete_state_exact_match],['下一样本游标',String(r.next_sample_cursor)],['只恢复权重、step与cursor','参数不相同；丢失了动量和随机状态'],['混合步数 / 文件损坏',r.mixed_generation+' / '+r.corruption],['失败后的提交指针',r.pointer_after_failed_publish+'，旧恢复点保留']];
 }else{
  explanation='可信测试身份与审批由夹具注入。本地HMAC声明故意声称一个尚未发生的成功；真实子进程随后提交工具事务，返回回执之前退出。恢复者从原K1找结果。';
  rows=[['参数37改99',r.changed_parameter+'，未产生效果'],['声明完整，但回执不可查询','校验通过；判定'+r.unavailable_receipt],['工具提交后进程退出','退出码'+r.commit_then_exit_code+'；工具已有版本8、金额37'],['原键重试 / 同键换参',r.same_intent_retry+' / '+r.same_key_changed_intent],['跨租户 / 撤权后的回执查询',r.cross_tenant_receipt+' / '+r.revoked_receipt],['最终效果数',String(r.effects)+'，没有再次写入']];
 }
 return para(explanation)+code('Python 3.9+ · 只用标准库','SHELL','python3 '+name)+
  '<div class="mechanism-results"><strong>本次实际执行结果</strong>'+table(['检查项','输出与解释'],rows)+'</div>'+
  (withSource?'<details class="full-code"><summary>展开完整'+name+'：与下载文件一致</summary>'+code(name,'PYTHON',mechanismLabFiles[name])+'</details>':'')+
  '<p class="practice-links"><a href="labs/learning-mechanisms.zip" download>下载三个独立实验、说明与记录 ↓</a><a href="labs/learning-mechanisms/validation.json" target="_blank" rel="noopener">核对实际输出与源码SHA256 ↗</a></p>'+
  para(name==='tcp_framing.py'?'范围：真实回环TCP与协议解析；没有运行epoll、丢包注入或业务提交测试。':name==='checkpoint_commit.py'?'范围：本地文件与标量SGD；没有运行PyTorch DCP、多rank、GPU或主机掉电测试。':'范围：公开测试密钥、SQLite与真实进程退出；超时为注入观测，未接入远端OAuth、MCP或Kairo。');
}

cloudKnowledgeExplanations['transport-timeout']+=tcpMessageLesson;
cloudKnowledgeExplanations['io-model']+=ioReadinessLesson;
infraDomain('training').points.find(p=>p.id==='tr-recovery').body+=checkpointStateLesson;
infraDomain('agent').points.find(p=>p.id==='ag-authorization').body+=approvalRecordsLesson;

for(const [id,lesson,name,title,refs]of [
 ['network-diagnosis',tcpMessageLesson,'tcp_framing.py','实战：按长度解帧，再验证TCP半关闭',['v19Tcp','v19Socket','v19Epoll']],
 ['checkpoint-recovery',checkpointStateLesson,'checkpoint_commit.py','实战：完整文件、一致状态与提交指针',['v16DCP']],
 ['agent-security',approvalRecordsLesson,'approval_receipt.py','实战：改参被拒、提交后退出与原键取回执',['mcpauth']]
]){
 const article=articles.find(a=>a.id===id);
 article.sections[0][1]+=lesson;
 article.sections.push([title,infraReadableHTML(mechanismLabHTML(name))]);
 article.updated='2026.11.04';
 article.refs=[...new Set([...article.refs,...refs])];
}
cloudKnowledgeDomain('network').refs.push('v19Tcp','v19Socket','v19Epoll');
const networkLabsBeforeMechanisms=cloudFieldLabs;
cloudFieldLabs=id=>(id==='network'?'<h3>按长度解帧与TCP半关闭</h3>'+mechanismLabHTML('tcp_framing.py',false)+readLink('network-diagnosis','阅读机制与完整程序 →'):'')+networkLabsBeforeMechanisms(id);
const trainingCasesBeforeMechanisms=infraFieldCases.training;
infraFieldCases.training=()=>'<h3>本地检查点：只读最后完整提交</h3>'+mechanismLabHTML('checkpoint_commit.py',false)+readLink('checkpoint-recovery','阅读机制与完整恢复程序 →')+'<h3>双进程训练：全局梯度与更新</h3>'+trainingCasesBeforeMechanisms();
const agentCasesBeforeMechanisms=infraFieldCases.agent;
infraFieldCases.agent=()=>'<h3>三份记录：批准、声明与效果</h3>'+mechanismLabHTML('approval_receipt.py',false)+readLink('agent-security','阅读权限机制与完整程序 →')+'<h3>多进程接管与任务交付验收</h3>'+agentCasesBeforeMechanisms();
