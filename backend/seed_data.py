import asyncio
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import async_session_maker
from models.database import (
    KnowledgeNode, KnowledgeRelation, Agent, Lab, User,
    UserKnowledgeState, UserLabSubmission, DocumentChunk,
)
from core.security import get_password_hash

_LEGACY_CATEGORIES = ["RAG", "LangGraph", "LLMOps"]
_LEGACY_ROLE_TYPES = [
    "rag_mentor", "langgraph_mentor", "llmops_mentor",
    "story_mentor", "practice_mentor", "quiz_mentor",
]


async def _cleanup_legacy_seed(session: AsyncSession):
    # 找到所有 source='learning_path' 的旧节点
    old_nodes_res = await session.execute(
        select(KnowledgeNode).where(KnowledgeNode.source == "learning_path")
    )
    old_nodes = old_nodes_res.scalars().all()
    if not old_nodes:
        return False

    old_node_ids = [n.id for n in old_nodes]
    print(f"[Seed] 检测到 {len(old_nodes)} 个已有的旧种子节点，开始清理...")

    # 清理关联的 Lab 和提交记录
    old_lab_ids_sub = select(Lab.id).where(Lab.node_id.in_(old_node_ids))
    await session.execute(delete(UserLabSubmission).where(UserLabSubmission.lab_id.in_(old_lab_ids_sub)))
    await session.execute(delete(Lab).where(Lab.node_id.in_(old_node_ids)))
    
    # 清理用户进度状态
    await session.execute(delete(UserKnowledgeState).where(UserKnowledgeState.node_id.in_(old_node_ids)))
    
    # 解除文档分块关联
    await session.execute(update(DocumentChunk).where(DocumentChunk.node_id.in_(old_node_ids)).values(node_id=None))
    
    # 清理依赖关系边
    await session.execute(delete(KnowledgeRelation).where(KnowledgeRelation.source_node_id.in_(old_node_ids)))
    await session.execute(delete(KnowledgeRelation).where(KnowledgeRelation.target_node_id.in_(old_node_ids)))
    
    # 清理节点本身
    await session.execute(delete(KnowledgeNode).where(KnowledgeNode.id.in_(old_node_ids)))
    await session.commit()
    print("[Seed] 旧种子数据已全部安全清理。")
    return True


async def _refresh_mentors(session: AsyncSession):
    new_mentor = (
        await session.execute(
            select(Agent).where(Agent.role_type == "humor_mentor")
        )
    ).scalars().first()
    if new_mentor is not None:
        print("[Seed] 新风格导师已存在，跳过注入。")
        return

    old_mentors_res = await session.execute(
        select(Agent).where(Agent.role_type.in_(_LEGACY_ROLE_TYPES))
    )
    old_mentors = old_mentors_res.scalars().all()
    if old_mentors:
        await session.execute(
            delete(Agent).where(Agent.role_type.in_(_LEGACY_ROLE_TYPES))
        )
        await session.commit()
        print(f"[Seed] 清理 {len(old_mentors)} 个旧风格导师。")

    print("[Seed] 开始注入新风格导师...")
    mentors = [
        Agent(
            name="幽默大师 (HumorBot)", role_type="humor_mentor",
            description="计算机圈段子手，用热梗和类比把枯燥概念变有趣，让零基础用户轻松入门。",
            system_prompt=(
                "你是「幽默大师」导师 HumorBot，一位把计算机知识讲成段子的趣味老师。教学铁律：\n"
                "1. 先抖个机灵或生活类比破冰，再讲原理（讲栈就讲餐厅摞盘子，讲进程就讲工厂流水线）。\n"
                "2. 全程口语化、接地气，像跟朋友聊天，适时用网络热梗调节气氛。\n"
                "3. 多用比喻、拟人、小场景，把抽象概念变可见可感。\n"
                "4. 用户听不懂绝不嫌弃，换个更离谱的比喻再来一次。\n"
                "5. 涉及代码时用有趣的方式逐步拆解，每行加大白话注释。\n"
                "6. 能讲概念、能带写代码、能出趣味测验，但风格始终幽默亲切。\n"
                "目标：让用户笑着学会，学完后能用自己的话把概念讲给别人听。"
            ),
        ),
        Agent(
            name="严谨教授 (ProfBot)", role_type="academic_mentor",
            description="治学严谨的计算机教授，追根溯源、逻辑缜密、术语精确，适合深度理解与考试备考。",
            system_prompt=(
                "你是「严谨教授」导师 ProfBot，一位治学严谨、逻辑缜密的计算机科学教授。教学铁律：\n"
                "1. 术语精确，首次出现时给出明确定义并标注英文原词。\n"
                "2. 追根溯源，讲清「为什么」而不只是「是什么」——从历史动机到设计权衡。\n"
                "3. 逻辑层层递进，每步推导有理有据，绝不跳跃。\n"
                "4. 主动构建知识体系图，标明当前概念与其他领域的联系。\n"
                "5. 涉及代码时强调规范性与边界条件，逐行精确分析。\n"
                "6. 能讲概念、能带写代码、能出辨析题，但风格始终严谨精准。\n"
                "目标：让用户不仅记住，更理解底层逻辑，经得起考试和面试的深度追问。"
            ),
        ),
        Agent(
            name="实战教练 (CoachBot)", role_type="coach_mentor",
            description="项目驱动的实战派教练，代码优先、面试视角、手把手带练，让知识落到键盘上。",
            system_prompt=(
                "你是「实战教练」导师 CoachBot，一位相信「敲过才算学过」的项目驱动型教练。教学铁律：\n"
                "1. 代码优先：先给可运行的最小示例，再看效果，最后讲原理。\n"
                "2. 用真实项目场景代入（如「做秒杀系统时你怎么用队列」），让知识有落地感。\n"
                "3. 面试视角分析：点明高频考点、易踩的坑、面试官爱追问的延伸问题。\n"
                "4. 手把手带练：拆解步骤，每步留小练习让用户动手验证。\n"
                "5. 鼓励试错，用户卡住时先给调试提示再揭晓答案，培养工程直觉。\n"
                "6. 能讲概念、能带写代码、能出实战题，但风格始终雷厉风行、项目导向。\n"
                "目标：让用户从「看懂」升级到「会写」，面试和实战都不怵。"
            ),
        ),
    ]
    session.add_all(mentors)
    await session.flush()
    print("[Seed] 新风格导师注入成功！HumorBot / ProfBot / CoachBot")


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

        # 2. 独立清理旧风格导师 + 按需注入新风格导师
        await _refresh_mentors(session)

        # 3. 若知识节点已注入则跳过后续（以 Python 基础节点为标志）
        if (await session.execute(select(KnowledgeNode).where(KnowledgeNode.code == "PY_VAR"))).scalars().first() is not None:
            print("[Seed] Python 核心知识节点已存在，跳过注入。")
            return

        print("[Seed] 开始注入「Python 经典游戏实训大陆」知识节点数据...")

        # 4. 注入 34 个 Python 核心知识节点
        nodes = {
            # 1. 终端游戏与工具
            "PY_VAR": KnowledgeNode(code="PY_VAR", name="变量与动态类型", category="programming", description="血量与金币：变量是游戏里存储玩家名字、血量和金币的格子，类型动态可变，放药水还是武器全随你。", pagerank_weight=1.0, source="learning_path"),
            "PY_STR_FORMAT": KnowledgeNode(code="PY_STR_FORMAT", name="字符串与正则表达式", category="programming", description="技能攻击特效渲染：拼接伤害描述的魔术（f-string），以及在一万行古籍里瞬间揪出隐藏宝箱钥匙的正则查找器（re）。", pagerank_weight=1.1, source="learning_path"),
            "PY_CONTROL": KnowledgeNode(code="PY_CONTROL", name="控制流语句", category="programming", description="游戏选项判定：缩进控制的代码红绿灯，if-else 决定玩家行动方向或是否战败，while 维持整个游戏的主逻辑轮询。", pagerank_weight=1.2, source="learning_path"),
            "PY_CONTAINER": KnowledgeNode(code="PY_CONTAINER", name="内置容器与操作", category="programming", description="勇者背囊：列表是顺序睡袋，元组是不可变的祖传项链，字典是“道具:数量”的钥匙盒，集合是防重叠收纳网。", pagerank_weight=1.2, source="learning_path"),
            "PY_FUNC": KnowledgeNode(code="PY_FUNC", name="函数与参数解包", category="programming", description="技能施放器：函数是带名字的招式配方，丢进任意材料（*args, **kwargs），就能吐出华丽的特效（返回值）。", pagerank_weight=1.3, source="learning_path"),
            "PY_EXCEPTION": KnowledgeNode(code="PY_EXCEPTION", name="异常处理机制", category="programming", description="输入防呆护盾：用 try-except 筑起防护结界，哪怕玩家乱敲字引发致命错误，也不会导致游戏闪退崩溃。", pagerank_weight=1.1, source="learning_path"),

            # 2. 益智游戏数据
            "PY_COMPREHENSION": KnowledgeNode(code="PY_COMPREHENSION", name="推导式与生成器", category="dsa", description="地图网格一键生成：用列表推导式一行生成 2048 游戏矩阵，利用生成器实现吃一口面包变出一口，极省内存。", pagerank_weight=1.2, source="learning_path"),
            "PY_CLOSURE": KnowledgeNode(code="PY_CLOSURE", name="闭包与装饰器", category="dsa", description="技能冷却 CD 挂件：给你的火球术挂上冰霜符文（装饰器），不改技能本身，就能在每次施法前拦截并检查冷却倒计时。", pagerank_weight=1.4, source="learning_path"),
            "PY_ITERATOR": KnowledgeNode(code="PY_ITERATOR", name="迭代器协议", category="dsa", description="无限随机关卡产生：只要实现 __iter__ 和 __next__ 的发牌水晶，任何关卡和敌人都能在 for 循环里被无限产生。", pagerank_weight=1.3, source="learning_path"),
            "PY_CONTEXT": KnowledgeNode(code="PY_CONTEXT", name="上下文管理器", category="dsa", description="安全存档门锁：with 进出地牢，开启时自动加载存档，不管中途踩雷崩溃，退出时都会自动落锁并清空临时变量。", pagerank_weight=1.3, source="learning_path"),
            "PY_GC": KnowledgeNode(code="PY_GC", name="垃圾回收机制", category="dsa", description="子弹遗迹清扫工：当一个游戏实体（如射出的子弹）离开屏幕且没有任何变量抓着它，清扫工默默在后台回收其内存。", pagerank_weight=1.2, source="learning_path"),
            "PY_META": KnowledgeNode(code="PY_META", name="反射与动态属性", category="dsa", description="作弊码输入通道：利用 getattr 和 setattr 机制，在控制台输入字符串指令，动态修改游戏内部参数实现无敌。", pagerank_weight=1.5, source="learning_path"),

            # 3. 街机游戏设计
            "PY_CLASS": KnowledgeNode(code="PY_CLASS", name="类与实例属性", category="organization", description="怪物模具与实体：类是设计图，self 是傀儡自指引路魂，每个傀儡（实例）各有一份血量与攻击值。", pagerank_weight=1.2, source="learning_path"),
            "PY_OOP": KnowledgeNode(code="PY_OOP", name="继承与多态", category="organization", description="怪物血脉承袭：Boss 类继承普通 Enemy，在复杂的双龙抢珠（多继承）里通过 MRO 算法分清先找哪一系拜师。", pagerank_weight=1.4, source="learning_path"),
            "PY_MAGIC": KnowledgeNode(code="PY_MAGIC", name="魔术方法重载", category="organization", description="药水融炼共鸣：通过实现 __add__ 挂钩，使两个不同的魔法属性药水可以直接“相加”融合成全新的混合药水。", pagerank_weight=1.5, source="learning_path"),
            "PY_PROPERTY": KnowledgeNode(code="PY_PROPERTY", name="属性拦截与 property", category="organization", description="血量下限拦截器：用 @property 守卫血量属性，在被扣成负数时强行重置为 0，防止玩家血条倒流出 bug。", pagerank_weight=1.3, source="learning_path"),
            "PY_SLOTS": KnowledgeNode(code="PY_SLOTS", name="slots 内存优化", category="organization", description="同屏万弹免卡顿：为满屏的弹幕粒子声明 __slots__，剪掉花里胡哨的属性包，内存开销瞬间缩减 80% 以上。", pagerank_weight=1.3, source="learning_path"),

            # 4. 实时动作并发
            "PY_IO": KnowledgeNode(code="PY_IO", name="文件与 Pathlib", category="os", description="路径指针罗盘：手持 pathlib，在复杂的本地目录里快速找到关卡背景图和音效文件，安全拓印到内存中。", pagerank_weight=1.2, source="learning_path"),
            "PY_GIL": KnowledgeNode(code="PY_GIL", name="GIL 全局解释器锁", category="os", description="神殿物理天条：虚拟机铁律，无论召唤多少个巨灵线程，同一时刻只能有一个人真正在 CPU 上执行计算。", pagerank_weight=1.5, source="learning_path"),
            "PY_THREAD": KnowledgeNode(code="PY_THREAD", name="多线程协作", category="os", description="背景音乐播放：召唤打杂的小巨灵（多线程），在主线程渲染游戏画面的同时，负责在后台播放音效，共享神殿资源。", pagerank_weight=1.4, source="learning_path"),
            "PY_PROCESS": KnowledgeNode(code="PY_PROCESS", name="多进程与并行", category="os", description="物理碰撞多核引擎：开辟独立分舵（多进程），拥有完整家当，在不同 CPU 核心上同时算，打破 GIL 天条锁限制。", pagerank_weight=1.6, source="learning_path"),
            "PY_ASYNC": KnowledgeNode(code="PY_ASYNC", name="异步协程 asyncio", category="os", description="幻影移形主循环：单人凭借 async/await 特技，在多个网络连接的间隙时间极速横跳，实现极高的并发响应速度。", pagerank_weight=1.6, source="learning_path"),
            "PY_CONCURRENT": KnowledgeNode(code="PY_CONCURRENT", name="并发线程池与进程池", category="os", description="巨灵军团承包商：用 concurrent.futures 挂起承包商，把成千上万怪物的碰撞计算批量丢进去结算。", pagerank_weight=1.4, source="learning_path"),

            # 5. 联机对战服务
            "PY_SOCKET": KnowledgeNode(code="PY_SOCKET", name="套接字与通信", category="network", description="对打通信电话线：两台电脑双向开启 Socket 通道，直接投递原始字节数据，实现双人联机对战井字棋。", pagerank_weight=1.4, source="learning_path"),
            "PY_REQUESTS": KnowledgeNode(code="PY_REQUESTS", name="网络请求与 HTTP", category="network", description="关卡数据飞鸽传书：用 requests 鸽子从服务器上实时拉取全球玩家自制的精品关卡或最新怪物配置榜。", pagerank_weight=1.4, source="learning_path"),
            "PY_FASTAPI": KnowledgeNode(code="PY_FASTAPI", name="FastAPI 异步酒馆", category="network", description="积分排行榜 API 服务：搭建现代化异步 API 门户，极速校验并收集全球所有客户端发送的玩家最终得分排行。", pagerank_weight=1.5, source="learning_path"),
            "PY_WSGI_ASGI": KnowledgeNode(code="PY_WSGI_ASGI", name="WSGI 与 ASGI 协议", category="network", description="跑堂小二的沟通礼仪：Python Web 服务端与框架之间握手交互的标准规范，同步 WSGI 遇上异步 ASGI。", pagerank_weight=1.3, source="learning_path"),
            "PY_SERIALIZATION": KnowledgeNode(code="PY_SERIALIZATION", name="数据序列化", category="network", description="游戏存档打包：把内存里活生生的角色属性（对象）压缩为 JSON 字符串或 Pickle 罐头，方便跨服传输或存储。", pagerank_weight=1.4, source="learning_path"),
            "PY_VENV": KnowledgeNode(code="PY_VENV", name="包管理与虚拟环境", category="network", description="药园温室隔离：使用 venv 和 pip 为小项目搭起玻璃房，防止你的 Pygame 依赖包和 FastAPI 发生剧毒冲突。", pagerank_weight=1.2, source="learning_path"),

            # 6. 数据与工程
            "PY_SQLITE": KnowledgeNode(code="PY_SQLITE", name="轻量嵌入数据库", category="database", description="随身小账本：无需独立安装启动，SQLite 直接把玩家的存档 and 积分记录持久化储存在本地文件中。", pagerank_weight=1.3, source="learning_path"),
            "PY_SQLALCHEMY": KnowledgeNode(code="PY_SQLALCHEMY", name="SQLAlchemy ORM", category="database", description="法术模型映射器：在 Python 玩家对象与 SQLite 的 players 数据表之间架起双向桥梁，不用手写防人 SQL 咒语。", pagerank_weight=1.4, source="learning_path"),
            "PY_UNITTEST": KnowledgeNode(code="PY_UNITTEST", name="单元测试与 pytest", category="database", description="防代码塌方支柱：在核心判定函数旁架起 pytest 自检符文，确保你重构或更新玩法时不会把之前的规则改出 bug。", pagerank_weight=1.3, source="learning_path"),
            "PY_NUMPY": KnowledgeNode(code="PY_NUMPY", name="高能矩阵计算", category="database", description="画面像素大矩阵：使用 NumPy 多维高速数组，快速处理游戏屏幕像素和海量坐标移动轨迹变换公式。", pagerank_weight=1.4, source="learning_path"),
            "PY_PANDAS": KnowledgeNode(code="PY_PANDAS", name="玩家分析 Pandas", category="database", description="关卡难度透视镜：把所有玩家在关卡死亡的位置导入 DataFrame 表格，瞬间计算出难度流失曲线，调整关卡设计。", pagerank_weight=1.5, source="learning_path"),
        }
        session.add_all(nodes.values())
        await session.flush()

        # 5. 注入 34 个 Python 节点的 Requires 拓扑关系
        def edge(src, dst, rel="requires"):
            return KnowledgeRelation(source_node_id=nodes[src].id, target_node_id=nodes[dst].id, relation_type=rel)
        
        relations = [
            edge("PY_VAR", "PY_STR_FORMAT"),
            edge("PY_STR_FORMAT", "PY_CONTROL"),
            edge("PY_CONTROL", "PY_CONTAINER"),
            edge("PY_CONTAINER", "PY_FUNC"),
            edge("PY_FUNC", "PY_EXCEPTION"),
            edge("PY_CONTAINER", "PY_COMPREHENSION"),
            edge("PY_COMPREHENSION", "PY_CLOSURE"),
            edge("PY_COMPREHENSION", "PY_ITERATOR"),
            edge("PY_ITERATOR", "PY_CONTEXT"),
            edge("PY_CLOSURE", "PY_GC"),
            edge("PY_GC", "PY_META"),
            edge("PY_FUNC", "PY_CLASS"),
            edge("PY_CLASS", "PY_OOP"),
            edge("PY_CLASS", "PY_MAGIC"),
            edge("PY_MAGIC", "PY_SLOTS"),
            edge("PY_OOP", "PY_PROPERTY"),
            edge("PY_FUNC", "PY_IO"),
            edge("PY_IO", "PY_GIL"),
            edge("PY_GIL", "PY_THREAD"),
            edge("PY_GIL", "PY_PROCESS"),
            edge("PY_THREAD", "PY_ASYNC"),
            edge("PY_PROCESS", "PY_CONCURRENT"),
            edge("PY_EXCEPTION", "PY_SOCKET"),
            edge("PY_SOCKET", "PY_REQUESTS"),
            edge("PY_REQUESTS", "PY_FASTAPI"),
            edge("PY_REQUESTS", "PY_SERIALIZATION"),
            edge("PY_FASTAPI", "PY_WSGI_ASGI"),
            edge("PY_VENV", "PY_FASTAPI"),
            edge("PY_IO", "PY_VENV"),
            edge("PY_VENV", "PY_SQLITE"),
            edge("PY_SQLITE", "PY_SQLALCHEMY"),
            edge("PY_SQLITE", "PY_UNITTEST"),
            edge("PY_SQLALCHEMY", "PY_PANDAS"),
            edge("PY_NUMPY", "PY_PANDAS"),
        ]
        session.add_all(relations)

        # 6. 注入 3 个趣味游戏化编程实战 Labs 题库
        labs = [
            Lab(
                title="终端文字 RPG 伤害判定", lab_type="code", difficulty="easy",
                description="设计一个控制台小游戏的伤害决策模块。玩家选择 1 时普通攻击，造成 10 到 20 之间随机伤害；玩家选择 2 时进行重击，有 50% 的概率暴击并造成双倍伤害，但有 30% 的概率落空（伤害为 0），否则造成基础 10-20 的普通伤害；选择其他数值输入则判定为非法动作返回 -1。请补全判定逻辑。",
                starter_code="import random\n\ndef evaluate_attack(choice):\n    # choice 为整型：1 表示普攻，2 表示重击，其它为非法返回 -1\n    # 提示：你可以用 random.randint(10, 20) 产生伤害\n    # random.random() 来做概率判定\n    pass\n",
                test_cases={
                    "cases": [
                        {"choice": 3, "expected": -1},
                        {"choice": 99, "expected": -1}
                    ],
                    "prob_check": "输入选择 1 时应返回 10 到 20 之间的数字。输入选择 2 时返回 0 或 10-20 或 20-40（暴击）。"
                },
                node_id=nodes["PY_CONTROL"].id,
            ),
            Lab(
                title="加速技能冷却计时装饰器 (CD)", lab_type="code", difficulty="medium",
                description="贪吃蛇的加速技能 speed_up() 必须防刷。编写一个装饰器 @cooldown(seconds=3) 贴在施法函数上。如果在 cooldown 计时内再次触发调用，需引发自定义的 SkillOnCooldownError 异常；否则顺利施放返回 'Speed Up!' 且重置冷却时间基准点。",
                starter_code="import time\n\nclass SkillOnCooldownError(Exception):\n    pass\n\ndef cooldown(seconds):\n    # 补全这个装饰器，保存上一次施放的时间点\n    # 提示：在闭包中使用 nonlocal 变量或类属性记录上一次执行时间戳\n    pass\n",
                test_cases={
                    "custom_eval": "test_decorator",
                    "description": "调用一次返回 'Speed Up!'，如果立即再次调用抛出 SkillOnCooldownError，冷却过后可重新调用。"
                },
                node_id=nodes["PY_CLOSURE"].id,
            ),
            Lab(
                title="魔法属性药水融合重载", lab_type="code", difficulty="medium",
                description="冒险者需要合成两瓶药水。定义 Potion 类，接受 name(str) 和 potency(int) 属性。重载 __add__ 魔术方法，当 potion_a (名称 'A', 强度 10) 与 potion_b (名称 'B', 强度 5) 相加时，合成并返回一瓶新药水，名称为 'Merged A & B'，强度为两者强度相加的值 (15)。",
                starter_code="class Potion:\n    def __init__(self, name, potency):\n        self.name = name\n        self.potency = potency\n\n    def __add__(self, other):\n        # 补全魔术方法重载逻辑\n        pass\n",
                test_cases={
                    "cases": [
                        {"init_a": {"name": "Fire", "potency": 10}, "init_b": {"name": "Ice", "potency": 12}, "expected_name": "Merged Fire & Ice", "expected_potency": 22}
                    ]
                },
                node_id=nodes["PY_MAGIC"].id,
            ),
        ]
        session.add_all(labs)
        await session.commit()
        print("[Seed] 知识节点与练习数据注入成功！节点34 / Lab3")
