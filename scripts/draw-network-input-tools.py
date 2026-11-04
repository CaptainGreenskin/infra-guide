"""Original vector mechanism diagrams; coordinates are part of the editable source."""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "dist/diagrams"
BLUE, DARK, MUTED, LINE = "#315dce", "#17263e", "#56667d", "#cdd9e9"
GREEN, RED, AMBER = "#12725b", "#b53e3e", "#936013"


def txt(x, y, text, size=21, color=DARK, weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(str(text))}</text>'


def box(x, y, w, h, color="#fff", stroke=LINE, radius=12):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{color}" stroke="{stroke}"/>'


def arrow(x1, y1, x2, y2, color=BLUE):
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="2.5" fill="none" marker-end="url(#arrow)"/>'


def save(name, title, subtitle, items, height=720):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="{height}" viewBox="0 0 1120 {height}" role="img">'
           f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>'
           '<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto">'
           '<path d="M0 0L8 4L0 8" fill="#315dce"/></marker></defs>'
           '<g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">'
           + box(1, 1, 1118, height-2, "#f7f9fd", LINE, 16)
           + txt(36, 49, title, 28, DARK, 700) + txt(36, 85, subtitle, 19, MUTED)
           + "".join(items) + '</g></svg>\n')
    (ROOT / (name + ".svg")).write_text(svg)


items = []
for x, label, lines in [
    (36, "客户端", ["URL：reports.team.test", "DNS → 10.96.0.20", "TCP → 10.96.0.20:443"]),
    (405, "Service 数据面", ["端口443 → targetPort 8443", "选择当次可用后端", "目的地址可变为Pod IP"]),
    (774, "工作负载", ["10.42.2.8:8443", "客户端校验证书与名字", "HTTP Host选择应用路由"]),
]:
    items += [box(x, 128, 310, 178), txt(x+20, 164, label, 23, BLUE, 700)]
    items += [txt(x+20, 205+i*33, line, 18) for i, line in enumerate(lines)]
items += [arrow(350, 216, 400, 216), arrow(719, 216, 769, 216)]
items += [box(36, 345, 1048, 126, "#edf2ff", "#b5c8fa"),
          txt(58, 381, "传输地址会变化，逻辑身份仍由应用契约决定", 23, BLUE, 700),
          txt(58, 418, "TLS：server_hostname / SNI / 证书SAN   ·   HTTP：Host 或 :authority", 21),
          txt(58, 450, "不能把Service转发后的Pod IP，直接当作证书应该声明的名字。", 20)]
items += [box(36, 504, 1048, 154),
          txt(58, 540, "本地真实实验：固定连接127.0.0.1，不执行DNS或Kubernetes转发", 21, DARK, 700),
          txt(58, 578, "信任临时CA + 正确名字 → TLS成功   /   错名字或不信任CA → 校验失败", 20),
          txt(58, 614, "TLS名字正确 + HTTP Host错误 → TLS成功，HTTP返回421", 20, RED),
          txt(58, 644, "网络路径、TLS身份、应用路由分别检查；全过程保持证书与主机名校验。", 18, MUTED)]
save("v23-service-tls-identity", "一个请求，三组不能混用的标识", "Kubernetes路径为机制图；下方结论来自独立的回环TLS/HTTP实验。", items, 696)

items = [box(36, 124, 500, 235), box(564, 124, 520, 235)]
items += [txt(58, 161, "同一个from条目：选择条件相交", 23, BLUE, 700),
          txt(58, 202, "namespaceSelector: team=analytics", 19),
          txt(58, 238, "podSelector: role=reader", 19),
          txt(58, 287, "选中匹配命名空间中的reader Pod", 20, GREEN, 700),
          txt(58, 325, "两个选择器必须同时满足：AND", 20)]
items += [txt(586, 161, "两个from条目：允许来源合并", 23, BLUE, 700),
          txt(586, 202, "条目1：匹配命名空间中的全部Pod", 19),
          txt(586, 238, "条目2：策略所在命名空间的reader Pod", 19),
          txt(586, 287, "满足任意一项即可，范围可能扩大", 20, RED, 700),
          txt(586, 325, "不同条目满足其一：OR", 20)]
items += [box(36, 401, 1048, 166, "#edf6f3", "#abd2c4"),
          txt(58, 438, "方向判定还要再做一次AND", 23, GREEN, 700),
          txt(58, 479, "源端egress允许     +     目的端ingress允许     →     本次连接可被策略放行", 21),
          txt(58, 518, "某方向未隔离时采用该方向的默认允许；已隔离则匹配允许规则。", 20),
          txt(58, 549, "同一端、同一方向的多条允许策略取并集；不是“后写规则覆盖前写规则”。", 18, MUTED)]
items += [txt(38, 612, "前提：网络插件实际实施NetworkPolicy。Service NAT前后按哪组地址匹配，需核对具体实现。", 18, MUTED),
          txt(38, 647, "网络可达仍不替代应用认证、租户隔离或资源授权。", 20, DARK, 700)]
save("v23-policy-selector-logic", "NetworkPolicy：先看缩进，再看方向", "下面讨论Pod流量的选择与允许语义；节点、hostNetwork及具体数据面行为另核对。", items, 687)

items = [txt(38, 135, "Map-style：11个样本 / 2个rank / batch_size=4 / shuffle=False", 22, BLUE, 700)]
for y, rank, ids in [(171,0,[0,2,4,6,8,10]), (263,1,[1,3,5,7,9,0])]:
    items += [txt(38,y+35,f"rank {rank}",21,DARK,700)]
    for j, value in enumerate(ids):
        items += [box(145+j*95,y,76,58,"#fff1e6" if rank==1 and j==5 else "#edf2ff"),
                  txt(170+j*95,y+37,value,23)]
    items += [txt(740,y+27,"首批4项 + 尾批2项",20),
              txt(740,y+55,"loader丢尾：只留下首批",18,MUTED)]
items += [txt(147,365,"Sampler补一个ID 0，使每rank各6项；覆盖11个唯一ID，交付12次。",20),
          box(36,401,1048,196,"#fff",LINE),txt(58,438,"Iterable：分给worker后，批次数还受各自尾批影响",23,BLUE,700)]
for y, rank, worker0, worker1, batches in [
    (475,0,"[0,4] [8]","[1,5] [9]",4),(535,1,"[2,6] [10]","[3,7]",3)]:
    items += [txt(58,y,f"rank {rank}",20,DARK,700),
              txt(170,y,"worker 0："+worker0,20),
              txt(520,y,"worker 1："+worker1,20),
              txt(911,y,str(batches)+" 批",23,RED,700)]
items += [txt(38,643,"正确分流覆盖全部11项，仍得到4批与3批。同步训练要另行约定等步数或不等输入处理。",20,RED,700),
          txt(38,679,"本图来自实际PyTorch 2.5.1 CPU/Gloo和四个worker；没有执行训练步。",18,MUTED)]
save("v23-sampler-worker-batches","样本分对了，训练步数也可能不一样","Sampler分给rank，DataLoader组批；IterableDataset还要显式分给每个worker。",items,713)

items = [txt(38,135,"查询行 / 可见列",20,BLUE,700)]
tokens=["A0","A1","A_EOS","B0","B_EOS"]
for i,t in enumerate(tokens):
    items += [txt(218+i*91,173,t,17,MUTED),txt(46,217+i*66,t,19)]
    for j in range(5):
        good=j<=i and ((i<3 and j<3) or (i>=3 and j>=3))
        leak=j<=i and not good
        items += [box(199+j*91,188+i*66,77,55,"#e4eee9" if good else "#fff1e6" if leak else "#fff",LINE,5),
                  txt(229+j*91,223+i*66,"✓" if good else "×" if leak else "·",22,GREEN if good else RED if leak else MUTED)]
items += [box(714,147,370,205),txt(735,185,"三种边界分别声明",23,BLUE,700),
          txt(735,225,"注意力：因果 + 文档相同",19),
          txt(735,263,"位置：按本例契约每文档归零",19),
          txt(735,301,"标签：跨文档预测位置忽略",19),
          txt(735,334,"EOS只是词元，不会自动设边界。",18,RED)]
items += [box(714,382,370,138,"#fff",LINE),
          txt(735,420,"颜色说明",21,DARK,700),txt(735,458,"绿色：同文档已出现位置",19,GREEN),
          txt(735,493,"橙色：普通因果mask的跨文档可见",18,RED)]
items += [box(36,560,1048,117,"#edf2ff","#b5c8fa"),
          txt(58,596,"A0 → A1    A1 → A_EOS    A_EOS → 忽略    B0 → B_EOS",22,BLUE,700),
          txt(58,635,"本例有效目标3个；直接拼接会多出A_EOS预测B0，任务已改变。",20),
          txt(58,663,"标准库固定向量验证：正确打包与独立计算相同；未实现分词器、RoPE或模型训练。",18,MUTED)]
save("v23-packing-mask","样本打包：EOS、注意力、位置和标签不是同一件事","图中橙色是错误对照会额外读到的位置；正确文档内因果mask应将其屏蔽。",items,712)

items=[]
for x,label,lines in [
    (36,"模型提议",["选择工具名与参数","或提出“已经完成”","外部文字只是数据"]),
    (307,"执行层",["工具白名单 + 类型检查","提议/实际尝试分别计数","校验结果后才加入观察"]),
    (578,"工具服务",["主体与对象授权","版本前提 + 同操作去重","执行后返回结构化回执"]),
    (849,"任务验收",["读真实产物","核对目标/总数/来源版本","合格才SUCCEEDED"])
]:
    items += [box(x,145,235,208),txt(x+18,183,label,23,BLUE,700)]
    items += [txt(x+18,227+38*i,line,17) for i,line in enumerate(lines)]
for x in [275,546,817]:
    items += [arrow(x,247,x+27,247)]
items += [box(36,399,1048,112,"#edf2ff","#b5c8fa"),
          txt(58,438,"一次提议可能不调用工具，也可能因只读重试产生两次HTTP尝试。",23,BLUE,700),
          txt(58,478,"本例上限：4次提议、3次工具尝试；发现工具列表另计，完成验收不消耗工具预算。",19)]
items += [box(36,547,1048,106,"#fff1e6","#e8cda9"),
          txt(58,585,"工具写入总数38：JSON合法、类型合法、写入成功、效果1次；任务仍不合格。",21,RED,700),
          txt(58,622,"固定任务要求37。工具回执证明发生了什么；独立评分器再判断是否符合任务。",20)]
save("v23-tool-control-loop","Agent执行：谁提议，谁批准，谁证明完成","真实HTTP实验采用固定提议脚本；图中模型为系统职责示意，不代表本实验调用了LLM。",items,692)

items = []
rows = [
    ("传输层","HTTP 503或连接中断","先按动作语义判断可重试/结果未知","#eef2f8"),
    ("协议层","JSON-RPC error","方法、参数或协议错误；不能当工具正常输出","#edf2ff"),
    ("工具执行层","result.isError=true","业务拒绝、参数错误或执行失败；不进入成功路径","#fff1e6"),
    ("结果契约层","结构化结果类型不符","HTTP 200也拒绝观察，防止错误结构继续传播","#f9ecec"),
    ("任务验收层","回执成功但实际产物总数38","目标要求37；保留事实，任务状态仍INCOMPLETE","#edf6f3"),
]
for i,(layer,signal,meaning,bg) in enumerate(rows):
    y=131+i*100
    items += [box(36,y,1048,82,bg),txt(55,y+33,layer,21,BLUE,700),
              txt(250,y+33,signal,20,DARK,700),txt(250,y+65,meaning,18)]
items += [txt(38,674,"同一个失败只归入其实际发生层；不把HTTP成功、JSON合法、工具成功和任务完成混为一谈。",19,MUTED)]
save("v23-tool-error-layers","工具失败要按层定位，成功也要逐层证明","MCP消息形状用于解释错误边界；本地程序未实现完整MCP传输与会话协议。",items,713)
print("PASS: 6 original SVG diagrams generated.")

