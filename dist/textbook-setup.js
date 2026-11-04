// The ten model/GPU lessons precede the existing training and serving modules.
modules.splice(modules.findIndex(module => module.id === 'training'), 0, {
 id:'model-foundations',n:'00',name:'模型计算与 GPU 原理',en:'MODEL AND GPU FOUNDATIONS',
 icon:'layers',track:'ai',tags:['Transformer','Autograd','GPU','性能推导'],
 desc:'十篇连续详解，先从张量、Attention 和完整 Decoder 建立计算模型，再推导 GPU 执行、IO 与并行。',
 outcomes:['手算 Attention 并运行最小 Decoder','解释 GPU 存储与性能限制','推导在线 softmax 与 TP 部分和']
});
trackDefinitions.ai.modules.unshift('model-foundations');
trackDefinitions.ai.start='transformer-model';
const textbookFirstChapter = systemChapters.length;
