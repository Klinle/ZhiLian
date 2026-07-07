import asyncio
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import async_session_maker
from models.database import (
    KnowledgeNode, KnowledgeRelation, Agent, Lab, User,
    UserKnowledgeState, UserLabSubmission, DocumentChunk,
)
from core.security import get_password_hash

# 旧定位的领域分类与 Agent 角色类型，迁移时用于识别并清理旧种子数据
_LEGACY_CATEGORIES = ["RAG", "LangGraph", "LLMOps"]
_LEGACY_ROLE_TYPES = ["rag_mentor", "langgraph_mentor", "llmops_mentor"]


async def _cleanup_legacy_seed(session: AsyncSession):
    """清理旧定位（RAG/LangGraph/LLMOps）种子数据，为新内容让路。

    清理顺序遵守外键依赖：提交记录 → Lab → 用户知识状态 →
    文档分块节点关联 → 知识关系 → 知识节点 → Agent。
    """
    old_nodes_res = await session.execute(
        select(KnowledgeNode).where(KnowledgeNode.category.in_(_LEGACY_CATEGORIES))
    )
    old_nodes = old_nodes_res.scalars().all()
    if not old_nodes:
        return False

    old_node_ids = [n.id for n in old_nodes]
    print(f"[Seed] 检测到 {len(old_nodes)} 个旧定位知识节点，开始清理旧种子数据...")

    old_lab_ids_sub = select(Lab.id).where(Lab.node_id.in_(old_node_ids))
    await session.execute(delete(UserLabSubmission).where(UserLabSubmission.lab_id.in_(old_lab_ids_sub)))
    await session.execute(delete(Lab).where(Lab.node_id.in_(old_node_ids)))
    await session.execute(delete(UserKnowledgeState).where(UserKnowledgeState.node_id.in_(old_node_ids)))
    await session.execute(update(DocumentChunk).where(DocumentChunk.node_id.in_(old_node_ids)).values(node_id=None))
    await session.execute(delete(KnowledgeRelation).where(KnowledgeRelation.source_node_id.in_(old_node_ids)))
    await session.execute(delete(KnowledgeRelation).where(KnowledgeRelation.target_node_id.in_(old_node_ids)))
    await session.execute(delete(KnowledgeNode).where(KnowledgeNode.id.in_(old_node_ids)))
    await session.execute(delete(Agent).where(Agent.role_type.in_(_LEGACY_ROLE_TYPES)))
    await session.commit()
    print("[Seed] 旧种子数据已清理完毕。")
    return True


async def seed_all_data():
    async with async_session_maker() as session:
        # 0. 注入超级管理员 Kleinle
        stmt_admin = select(User).where(User.username == "Kleinle")
        if (await session.execute(stmt_admin)).scalars().first() is None:
            session.add(User(
                username="Kleinle",
                hashed_password=get_password_hash("123456"),
                nickname="Kleinle (SuperAdmin)",
                role="admin",
            ))
            await session.commit()
            print("[Seed] SuperAdmin account 'Kleinle' created.")
        else:
            print("[Seed] SuperAdmin 'Kleinle' already exists. Skip.")

        # 1. 迁移清理旧种子数据
        await _cleanup_legacy_seed(session)

        # 2. 若新内容已注入则跳过（以编程基础节点为标志）
        if (await session.execute(select(KnowledgeNode).where(KnowledgeNode.code == "PROG_VAR"))).scalars().first() is not None:
            print("[Seed] 计算机基础种子数据已存在，跳过注入。")
            return

        print("[Seed] 开始注入「计算机基础知识趣味学习平台」种子数据...")

        # 3. 注入智能导师 Agent（按学习风格设计，趣味化人设）
        mentors = [
            Agent(
                name="故事家导师 (StoryBot)", role_type="story_mentor",
                description="擅长用生活类比和故事把抽象的计算机概念讲得通俗易懂、妙趣横生。",
                system_prompt=(
                    "你是「故事家」导师 StoryBot，一位把枯燥计算机知识讲得像聊八卦一样有趣的老师。教学铁律：\n"
                    "1. 先讲故事或生活类比，再讲原理（讲栈就讲餐厅摞盘子，讲进程线程就讲工厂和工人）。\n"
                    "2. 禁止上来就堆术语，用大白话和比喻代替黑话，必要时再点明术语。\n"
                    "3. 多用比喻、拟人、小场景，让抽象概念可见可感。\n"
                    "4. 语气亲切幽默，像朋友聊天而非教科书。\n"
                    "5. 涉及代码时配少量关键示例并逐行用大白话解释。\n"
                    "目标：让用户学完后能用自己的话把概念讲给别人听。"
                ),
            ),
            Agent(
                name="实操官导师 (CodeBot)", role_type="practice_mentor",
                description="擅长用代码示例和动手实验帮用户把概念落到键盘上、真正掌握。",
                system_prompt=(
                    "你是「实操官」导师 CodeBot，一位相信『敲过才算学过』的实战派老师。教学风格：\n"
                    "1. 凡讲概念必配可运行的最小代码示例，先给代码再看效果。\n"
                    "2. 用通俗一句话点题，再上代码，关键行加中文注释。\n"
                    "3. 善于设计小练习和思考题，引导动手验证而非直接灌答案。\n"
                    "4. 鼓励『改一改试试看』，把学习变成探索游戏。\n"
                    "5. 用户卡住时先给提示再逐步揭晓，培养调试直觉。\n"
                    "目标：让用户从『看懂』升级到『会写』。"
                ),
            ),
            Agent(
                name="答疑官导师 (QuizBot)", role_type="quiz_mentor",
                description="擅长苏格拉底式追问和出题检验，帮用户查漏补缺、把知识钉牢。",
                system_prompt=(
                    "你是「答疑官」导师 QuizBot，一位善用提问代替灌输的苏格拉底式老师。教学风格：\n"
                    "1. 不急于给答案，先反问引导用户自己推理。\n"
                    "2. 擅长出小测验和辨析题，把易混淆概念放在一起考。\n"
                    "3. 用户答错时不批评，用类比重新讲解并再出一题巩固。\n"
                    "4. 总结时给出『一句话记忆口诀』，帮助长期记忆。\n"
                    "5. 主动指出用户回答里的逻辑漏洞，温和但精准。\n"
                    "目标：让用户不仅记住，还能经得起追问。"
                ),
            ),
        ]
        session.add_all(mentors)
        await session.flush()

        # 4. 注入知识图谱节点（计算机基础 6 大领域，通俗+趣味类比描述）
        nodes = {
            "PROG_VAR": KnowledgeNode(code="PROG_VAR", name="变量与数据类型", category="programming", description="变量就像贴了标签的收纳盒，盒里数据可随时换；数据类型是盒子的规格（整数、文字、小数）。", pagerank_weight=1.0),
            "PROG_CONTROL": KnowledgeNode(code="PROG_CONTROL", name="控制流", category="programming", description="程序里的交通灯：if 判断往哪走，for/while 决定走几遍，让代码不再一条道跑到底。", pagerank_weight=1.2),
            "PROG_FUNC": KnowledgeNode(code="PROG_FUNC", name="函数", category="programming", description="函数是带名字的菜谱：丢进食材（参数），按步骤处理，端出菜品（返回值），还能反复调用。", pagerank_weight=1.3),
            "PROG_RECURSION": KnowledgeNode(code="PROG_RECURSION", name="递归", category="programming", description="俄罗斯套娃：函数自己调用自己，一层套一层，直到碰到最小的那一层才停下来往回收。", pagerank_weight=1.5),
            "PROG_SCOPE": KnowledgeNode(code="PROG_SCOPE", name="作用域", category="programming", description="变量的活动范围：在哪个房间定义的，就只在那个房间认识它，出了门可能就找不到了。", pagerank_weight=1.1),
            "DSA_ARRAY": KnowledgeNode(code="DSA_ARRAY", name="数组", category="dsa", description="一排连号的储物柜，从 0 开始编号，按下号能秒取东西，但中间插队很麻烦。", pagerank_weight=1.2),
            "DSA_LINKED": KnowledgeNode(code="DSA_LINKED", name="链表", category="dsa", description="寻宝游戏：每个箱子除了装宝贝，还塞着下一个箱子的地址，插入删除超灵活，但不能随机跳号。", pagerank_weight=1.3),
            "DSA_STACK": KnowledgeNode(code="DSA_STACK", name="栈", category="dsa", description="餐厅摞盘子：最后放上去的最先被拿走（后进先出 LIFO），只能在一端操作。", pagerank_weight=1.4),
            "DSA_QUEUE": KnowledgeNode(code="DSA_QUEUE", name="队列", category="dsa", description="食堂排队打饭：先来的先服务（先进先出 FIFO），从队尾进、队头出。", pagerank_weight=1.4),
            "DSA_TREE": KnowledgeNode(code="DSA_TREE", name="树", category="dsa", description="倒挂的家谱：一个根在顶，层层往下分叉，每个节点有且只有一个父亲（除根外）。", pagerank_weight=1.6),
            "DSA_GRAPH": KnowledgeNode(code="DSA_GRAPH", name="图", category="dsa", description="地铁线路图：若干站点（顶点）由线路（边）相连，能表达错综复杂的关系网络。", pagerank_weight=1.7),
            "DSA_SORT": KnowledgeNode(code="DSA_SORT", name="排序算法", category="dsa", description="把乱七八糟的书按字母摆整齐的不同招式：冒泡、选择、快排……各有各的快慢和脾气。", pagerank_weight=1.5),
            "DSA_SEARCH": KnowledgeNode(code="DSA_SEARCH", name="查找算法", category="dsa", description="在字典里翻字的不同套路：顺序查找一页页翻，二分查找每次砍一半，快慢天差地别。", pagerank_weight=1.4),
            "DSA_COMPLEXITY": KnowledgeNode(code="DSA_COMPLEXITY", name="时间复杂度", category="dsa", description="衡量算法脾气的尺子：当数据量翻倍时，它是稳如老狗还是爆炸式变慢，用大 O 表示。", pagerank_weight=1.8),
            "ORG_BINARY": KnowledgeNode(code="ORG_BINARY", name="二进制与数据表示", category="organization", description="计算机只认识 0 和 1，因为开关只有通/断两种状态；所有文字图片最终都是 01 串。", pagerank_weight=1.2),
            "ORG_INSTRUCTION": KnowledgeNode(code="ORG_INSTRUCTION", name="指令系统", category="organization", description="CPU 能听懂的母语：一串 0 和 1 组成的操作命令，告诉 CPU 做什么、对谁做。", pagerank_weight=1.4),
            "ORG_CPU": KnowledgeNode(code="ORG_CPU", name="CPU 工作原理", category="organization", description="计算机的大脑：不知疲倦地重复『取指令→译码→执行』，像流水线工人处理一条条命令。", pagerank_weight=1.6),
            "ORG_MEMORY": KnowledgeNode(code="ORG_MEMORY", name="存储层次", category="organization", description="数据离 CPU 越近越快越小越贵：寄存器是手边、缓存是抽屉、内存是书桌、硬盘是仓库。", pagerank_weight=1.5),
            "ORG_BUS": KnowledgeNode(code="ORG_BUS", name="总线", category="organization", description="计算机内部的高速公路：数据、地址、控制信号在各个部件之间靠它跑来跑去。", pagerank_weight=1.3),
            "OS_MEMMGMT": KnowledgeNode(code="OS_MEMMGMT", name="内存管理", category="os", description="公寓管理员：给每个程序分配合适的房间（内存空间），还要防止它们互相串门搞破坏。", pagerank_weight=1.5),
            "OS_PROCESS": KnowledgeNode(code="OS_PROCESS", name="进程与线程", category="os", description="进程是一个工厂（独立资源），线程是工厂里的工人（共享车间），工人多了干活快但也容易抢资源。", pagerank_weight=1.7),
            "OS_SCHEDULE": KnowledgeNode(code="OS_SCHEDULE", name="CPU 调度", category="os", description="十字路口的交警：当很多进程都想用 CPU 时，调度器决定谁先用、谁等待、用多久。", pagerank_weight=1.4),
            "OS_CONCURRENCY": KnowledgeNode(code="OS_CONCURRENCY", name="并发与同步", category="os", description="多人共用一台打印机得排队加锁，否则文件搅在一起——并发编程就是处理『同时干』的协调。", pagerank_weight=1.6),
            "OS_FILESYS": KnowledgeNode(code="OS_FILESYS", name="文件系统", category="os", description="图书馆的目录管理：把杂乱的数据按文件、文件夹分门别类存到磁盘上，方便随时翻找。", pagerank_weight=1.3),
            "NET_OSI": KnowledgeNode(code="NET_OSI", name="网络分层模型", category="network", description="寄快递的分层流程：OSI/TCP-IP 把通信拆成几层，每层各司其职、层层封装，复杂问题分层解决。", pagerank_weight=1.4),
            "NET_TCP": KnowledgeNode(code="NET_TCP", name="TCP 与 UDP", category="network", description="TCP 像挂号信（保证送到、按顺序），UDP 像广播喇叭（只管喊、快但可能丢），各有适用场景。", pagerank_weight=1.5),
            "NET_HTTP": KnowledgeNode(code="NET_HTTP", name="HTTP 协议", category="network", description="浏览器和服务器聊天的规矩：客户端发一句请求，服务器回一句响应，一问一答撑起整个 Web。", pagerank_weight=1.6),
            "NET_ROUTING": KnowledgeNode(code="NET_ROUTING", name="路由", category="network", description="数据包的导航仪：在无数路由器之间一跳一跳地找通往目的地的最优路径。", pagerank_weight=1.4),
            "NET_DNS": KnowledgeNode(code="NET_DNS", name="DNS 域名系统", category="network", description="互联网的通讯录：你输入好记的网址，DNS 帮你翻译成机器认的 IP 地址。", pagerank_weight=1.3),
            "DB_MODEL": KnowledgeNode(code="DB_MODEL", name="数据模型", category="database", description="用表格描述现实世界：实体（如学生）是一张表，实体间的关系用字段或连线表达。", pagerank_weight=1.2),
            "DB_SQL": KnowledgeNode(code="DB_SQL", name="SQL 语言", category="database", description="和数据库对话的标准语法：SELECT 查、INSERT 增、UPDATE 改、DELETE 删，一句话操成千上万条数据。", pagerank_weight=1.4),
            "DB_INDEX": KnowledgeNode(code="DB_INDEX", name="索引", category="database", description="字典的偏旁部首目录：不用一页页翻整本，按目录秒查到目标，代价是额外占空间和写时维护。", pagerank_weight=1.5),
            "DB_TX": KnowledgeNode(code="DB_TX", name="事务", category="database", description="打包的原子操作：要么全部成功，要么全部回滚，绝不留半成品——转账绝不能只扣款不入账。", pagerank_weight=1.6),
            "DB_NORM": KnowledgeNode(code="DB_NORM", name="范式", category="database", description="整理房间少放杂物：通过范式减少数据冗余，避免『改一处要改十处』的混乱。", pagerank_weight=1.3),
        }
        session.add_all(nodes.values())
        await session.flush()

        # 5. 注入知识图谱依赖关系（requires 拓扑，构成学习路径）
        def edge(src, dst, rel="requires"):
            return KnowledgeRelation(source_node_id=nodes[src].id, target_node_id=nodes[dst].id, relation_type=rel)
        relations = [
            edge("PROG_VAR", "PROG_CONTROL"), edge("PROG_VAR", "PROG_FUNC"),
            edge("PROG_FUNC", "PROG_RECURSION"), edge("PROG_FUNC", "PROG_SCOPE"),
            edge("PROG_VAR", "DSA_ARRAY"), edge("PROG_RECURSION", "DSA_TREE"),
            edge("DSA_ARRAY", "DSA_LINKED"), edge("DSA_ARRAY", "DSA_STACK"),
            edge("DSA_ARRAY", "DSA_QUEUE"), edge("DSA_LINKED", "DSA_TREE"),
            edge("DSA_TREE", "DSA_GRAPH"), edge("DSA_ARRAY", "DSA_SEARCH"),
            edge("DSA_SEARCH", "DSA_SORT"), edge("DSA_SORT", "DSA_COMPLEXITY"),
            edge("ORG_BINARY", "ORG_INSTRUCTION"), edge("ORG_INSTRUCTION", "ORG_CPU"),
            edge("ORG_BINARY", "ORG_MEMORY"), edge("ORG_CPU", "ORG_BUS"),
            edge("ORG_MEMORY", "ORG_BUS"), edge("ORG_MEMORY", "OS_MEMMGMT"),
            edge("OS_MEMMGMT", "OS_PROCESS"), edge("OS_PROCESS", "OS_SCHEDULE"),
            edge("OS_PROCESS", "OS_CONCURRENCY"), edge("OS_PROCESS", "OS_FILESYS"),
            edge("NET_OSI", "NET_TCP"), edge("NET_TCP", "NET_HTTP"),
            edge("NET_OSI", "NET_ROUTING"), edge("NET_HTTP", "NET_DNS"),
            edge("DB_MODEL", "DB_SQL"), edge("DB_SQL", "DB_INDEX"),
            edge("DB_SQL", "DB_TX"), edge("DB_MODEL", "DB_NORM"),
        ]
        session.add_all(relations)

        # 6. 注入练习题库（code 代码实操 + quiz 概念辨析）
        labs = [
            Lab(
                title="实现一个栈（后进先出）", lab_type="code", difficulty="easy",
                description="动手实现一个栈。栈像餐厅摞盘子：最后放的最先拿。请实现 push/pop/peek/is_empty。",
                starter_code="class Stack:\n    def __init__(self):\n        self._data = []\n\n    def push(self, value):\n        # 把元素压入栈顶\n        pass\n\n    def pop(self):\n        # 弹出并返回栈顶；栈空返回 None\n        pass\n\n    def peek(self):\n        # 仅查看栈顶，不弹出\n        pass\n\n    def is_empty(self):\n        # 判断栈是否为空\n        pass\n",
                test_cases={"operations": [{"action": "push", "value": 1}, {"action": "push", "value": 2}, {"action": "pop", "expected": 2}, {"action": "push", "value": 3}, {"action": "peek", "expected": 3}, {"action": "pop", "expected": 3}, {"action": "pop", "expected": 1}, {"action": "is_empty", "expected": True}], "description": "pop 依次返回 2、3、1（LIFO），最后栈为空。"},
                node_id=nodes["DSA_STACK"].id,
            ),
            Lab(
                title="二分查找实现", lab_type="code", difficulty="medium",
                description="在升序数组中查找目标值，返回下标；找不到返回 -1。二分查找每次砍掉一半，前提是数组有序。",
                starter_code="def binary_search(arr, target):\n    # arr 为升序列表，返回 target 的下标，未找到返回 -1\n    pass\n",
                test_cases={"cases": [{"arr": [1, 3, 5, 7, 9], "target": 5, "expected": 2}, {"arr": [1, 3, 5, 7, 9], "target": 1, "expected": 0}, {"arr": [1, 3, 5, 7, 9], "target": 9, "expected": 4}, {"arr": [1, 3, 5, 7, 9], "target": 6, "expected": -1}]},
                node_id=nodes["DSA_SEARCH"].id,
            ),
            Lab(
                title="冒泡排序实现", lab_type="code", difficulty="easy",
                description="实现冒泡排序：相邻元素两两比较，大的往后冒，一轮下来最大值沉底，重复直到有序。",
                starter_code="def bubble_sort(arr):\n    # 原地排序，返回排好序的列表\n    pass\n",
                test_cases={"cases": [{"input": [5, 2, 8, 1, 9], "expected": [1, 2, 5, 8, 9]}, {"input": [3, 1, 2], "expected": [1, 2, 3]}, {"input": [1], "expected": [1]}]},
                node_id=nodes["DSA_SORT"].id,
            ),
            Lab(
                title="栈与队列概念辨析", lab_type="quiz", difficulty="easy",
                description="检验对栈和队列这两种基础数据结构核心特性的理解。",
                starter_code="", node_id=nodes["DSA_STACK"].id,
                test_cases={"questions": [
                    {"id": "q1", "text": "下列哪种结构遵循『后进先出（LIFO）』？", "options": ["队列", "栈", "链表", "数组"], "answer": 1, "explanation": "栈是后进先出 LIFO，像餐厅摞盘子，最后放的最先拿。"},
                    {"id": "q2", "text": "队列中新元素从哪端加入？", "options": ["队头", "队尾", "中间", "任意端"], "answer": 1, "explanation": "队列是先进先出 FIFO，新元素从队尾入队，从队头出队。"},
                    {"id": "q3", "text": "用数组实现栈，push 的时间复杂度是？", "options": ["O(1)", "O(n)", "O(n log n)", "O(n^2)"], "answer": 0, "explanation": "数组栈的 push 只在末尾追加，时间复杂度 O(1)。"},
                ]},
            ),
            Lab(
                title="进程与线程概念辨析", lab_type="quiz", difficulty="medium",
                description="检验对进程、线程及其关系的理解。",
                starter_code="", node_id=nodes["OS_PROCESS"].id,
                test_cases={"questions": [
                    {"id": "q1", "text": "关于进程和线程，正确的是？", "options": ["进程是资源分配单位，线程是 CPU 调度单位", "进程比线程更轻量", "线程拥有独立地址空间", "一个进程只能有一个线程"], "answer": 0, "explanation": "进程是资源分配的最小单位，线程是 CPU 调度的最小单位，线程共享进程的地址空间。"},
                    {"id": "q2", "text": "同一进程内的多线程共享什么？", "options": ["各自的栈", "各自的寄存器", "堆和全局变量", "什么都不共享"], "answer": 2, "explanation": "同一进程的线程共享堆、全局变量等资源，但各自有独立的栈和寄存器。"},
                    {"id": "q3", "text": "线程相比进程的主要优势是？", "options": ["创建和切换开销更小", "拥有独立地址空间更安全", "不能并发", "占内存更大"], "answer": 0, "explanation": "线程共享进程资源，创建和上下文切换的开销远小于进程。"},
                ]},
            ),
            Lab(
                title="HTTP 协议入门辨析", lab_type="quiz", difficulty="easy",
                description="检验对 HTTP 协议基础特性的理解。",
                starter_code="", node_id=nodes["NET_HTTP"].id,
                test_cases={"questions": [
                    {"id": "q1", "text": "HTTP 协议默认端口是？", "options": ["80", "443", "21", "8080"], "answer": 0, "explanation": "HTTP 默认端口 80，HTTPS 默认端口 443。"},
                    {"id": "q2", "text": "HTTP 是什么模式的协议？", "options": ["请求-响应", "服务器推送", "广播", "单向通知"], "answer": 0, "explanation": "HTTP 是客户端发请求、服务器回响应的请求-响应模式。"},
                    {"id": "q3", "text": "HTTPS 比 HTTP 多了什么？", "options": ["加密传输(SSL/TLS)", "更快的速度", "更大的带宽", "更多端口"], "answer": 0, "explanation": "HTTPS 在 HTTP 基础上加入 SSL/TLS 加密，保障传输安全。"},
                ]},
            ),
        ]
        session.add_all(labs)

        await session.commit()
        print("[Seed] 计算机基础种子数据注入成功！节点34 / Agent3 / Lab7")


if __name__ == "__main__":
    asyncio.run(seed_all_data())
