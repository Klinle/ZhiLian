import asyncio
from sqlalchemy import select, delete
from core.database import init_db, async_session_maker
from models.database import Lab, UserLabSubmission
from seed_data import seed_all_data

async def migrate_and_reseed():
    print("[Migration] 1. 正在同步数据库 Schema (添加新表及字段)...")
    await init_db()
    print("[Migration] Schema 同步完成。")

    print("[Migration] 2. 清理旧 Labs 和提交记录，准备注入全新题库...")
    async with async_session_maker() as session:
        # 清理 Submission 和 Lab
        await session.execute(delete(UserLabSubmission))
        await session.execute(delete(Lab))
        await session.commit()
        print("[Migration] 旧数据清理完成。")

        # 3. 由于 seed_data.py 中有 if PROG_VAR node exists skip 逻辑，
        # 我们这里为了保证 seed_all_data() 中除节点外新扩展的 Lab 能被注入，
        # 我们可以单独为 Lab 进行注入。我们直接借用 seed_data.py 里的注入逻辑，或者临时避开 skip。
        # 既然我们已经清空了 Labs，我们可以直接运行一个自定义注入或者临时重装 Labs。
        # 在 seed_data.py 中，如果 PROG_VAR 已存在，它就直接 return 了，它不会重新走后面的注入代码。
        # 所以我们这里直接写一段代码，把 seed_data.py 里的 7 个 Labs 给强行塞进去！
        
        # 我们先查出所有 KnowledgeNode，因为 Lab 需要关联 node_id
        from models.database import KnowledgeNode
        nodes_res = await session.execute(select(KnowledgeNode))
        nodes = {n.code: n for n in nodes_res.scalars().all()}
        
        # 检查是否获取到了节点
        if not nodes:
            print("[Migration] 错误：未检测到基础知识节点，请先进行完整 Reseed。")
            return
            
        print(f"[Migration] 获取到 {len(nodes)} 个知识节点，准备装载 7 个精美内置题型...")
        
        new_labs = [
            Lab(
                title="实现一个栈（后进先出）", lab_type="code", difficulty="easy",
                description="动手实现一个栈。栈像餐厅摞盘子：最后放的最先拿。请实现 push/pop/peek/is_empty。",
                starter_code="class Stack:\\n    def __init__(self):\\n        self._data = []\\n\\n    def push(self, value):\\n        # 把元素压入栈顶\\n        pass\\n\\n    def pop(self):\\n        # 弹出并返回栈顶；栈空返回 None\\n        pass\\n\\n    def peek(self):\\n        # 仅查看栈顶，不弹出\\n        pass\\n\\n    def is_empty(self):\\n        # 判断栈是否为空\\n        pass\\n",
                test_cases={"operations": [{"action": "push", "value": 1}, {"action": "push", "value": 2}, {"action": "pop", "expected": 2}, {"action": "push", "value": 3}, {"action": "peek", "expected": 3}, {"action": "pop", "expected": 3}, {"action": "pop", "expected": 1}, {"action": "is_empty", "expected": True}], "description": "pop 依次返回 2、3、1（LIFO），最后栈为空。"},
                node_id=nodes["DSA_STACK"].id,
                detailed_explanation="栈是一种只能在表的一端进行插入和删除的后进先出（LIFO）数据结构。用 Python 的 list 实现时，在尾部追加（append）和弹出（pop）能实现 O(1) 效率。"
            ),
            Lab(
                title="二分查找实现", lab_type="code", difficulty="medium",
                description="在升序数组中查找目标值，返回下标；找不到返回 -1。二分查找每次砍掉一半，前提是数组有序。",
                starter_code="def binary_search(arr, target):\\n    # arr 为升序列表，返回 target 的下标，未找到返回 -1\\n    pass\\n",
                test_cases={"cases": [{"arr": [1, 3, 5, 7, 9], "target": 5, "expected": 2}, {"arr": [1, 3, 5, 7, 9], "target": 1, "expected": 0}, {"arr": [1, 3, 5, 7, 9], "target": 9, "expected": 4}, {"arr": [1, 3, 5, 7, 9], "target": 6, "expected": -1}]},
                node_id=nodes["DSA_SEARCH"].id,
                detailed_explanation="二分查找的核心是维护左右双指针。每次取中点 mid 与 target 比较，根据有序性缩减搜索区间为左半部分或右半部分，使查找时间复杂度降低至 O(log n)。"
            ),
            Lab(
                title="冒泡排序实现", lab_type="code", difficulty="easy",
                description="实现冒泡排序：相邻元素两两比较，大的往后冒，一轮下来最大值沉底，重复直到有序。",
                starter_code="def bubble_sort(arr):\\n    # 原地排序，返回排好序的列表\\n    pass\\n",
                test_cases={"cases": [{"input": [5, 2, 8, 1, 9], "expected": [1, 2, 5, 8, 9]}, {"input": [3, 1, 2], "expected": [1, 2, 3]}, {"input": [1], "expected": [1]}]},
                node_id=nodes["DSA_SORT"].id,
                detailed_explanation="冒泡排序通过嵌套循环，外层控制排序轮数，内层比较相邻两个元素，若顺序错误就进行交换，从而每轮将未排序部分的『最大值』冒泡到尾部，时间复杂度为 O(n^2)."
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
                detailed_explanation="栈（LIFO）与队列（FIFO）都是限定操作端点的受限线性表。栈支持在一端（栈顶）进行 push/pop，队列则从一端（队尾）入队、另一端（队头）出队。"
            ),
            Lab(
                title="TCP 与 UDP 生活类比连线匹配", lab_type="match", difficulty="easy",
                description="连线匹配：请将网络传输协议中的概念与其最通俗的生活类比连接起来。",
                node_id=nodes["NET_TCP"].id,
                test_cases={
                    "left": ["TCP 协议", "UDP 协议", "IP 地址", "端口号"],
                    "right": ["安全挂号信", "大喇叭广播", "收件人家庭住址", "收件人姓名/房间号"],
                    "pairs": {
                        "TCP 协议": "安全挂号信",
                        "UDP 协议": "大喇叭广播",
                        "IP 地址": "收件人家庭住址",
                        "端口号": "收件人姓名/房间号"
                    }
                },
                detailed_explanation="TCP 建立可靠连接并确保顺序（类似挂号信，必须签收）；UDP 为无连接不可靠服务（类似喇叭广播，只管广播不保送达）；IP 标记主机在网络中的地理位置（如家庭住址）；端口号负责定位到具体的进程程序（如房间号/收件人姓名）。"
            ),
            Lab(
                title="HTTP 交互步骤排序", lab_type="arrange", difficulty="medium",
                description="请将以下浏览器向服务器发起 HTTP 请求和接收响应的步骤排列为正确的逻辑顺序。",
                node_id=nodes["NET_HTTP"].id,
                test_cases={
                    "steps": [
                        "浏览器发起 TCP 三次握手建立底层连接",
                        "浏览器通过 DNS 解析域名获取服务器的 IP 地址",
                        "浏览器向服务器发送 HTTP GET 请求报文",
                        "服务器处理请求并返回 HTTP 200 OK 网页响应",
                        "浏览器接收 HTML 数据并进行页面渲染呈现给用户"
                    ],
                    "correct_order": [1, 0, 2, 3, 4]
                },
                detailed_explanation="HTTP 通信流程是：1. 浏览器先访问 DNS 获取服务器 IP -> 2. 基于 IP 与服务器发起 TCP 握手建立连接 -> 3. 发送 HTTP 请求 -> 4. 接收服务器处理返回的 HTTP 响应 -> 5. 浏览器渲染。因此正确顺序是 DNS解析 -> TCP握手 -> 发送请求 -> 获取响应 -> 渲染页面。"
            ),
            Lab(
                title="栈的特性的概念填空", lab_type="fill", difficulty="easy",
                description="请在填空处填入正确的计算机科学术语，完成关于栈的特性的描述。",
                node_id=nodes["DSA_STACK"].id,
                test_cases={
                    "text": "栈（Stack）是一种特殊的线性数据结构，它只允许在表的一端（栈顶）进行插入和删除操作。栈的显著特点是___进___出（请填入两个中文字符），英文简称为___（请填入 4 个大写英文字母）。",
                    "blanks": ["后", "先", "LIFO"]
                },
                detailed_explanation="栈的特征是后进先出（LIFO，Last In First Out），最晚入栈 of 元素最先被弹出，像是一叠堆起的盘子。"
            )
        ]
        
        session.add_all(new_labs)
        await session.commit()
        print("[Migration] 全新系统内置题库载入成功！(7个Labs包含 match/arrange/fill 新题型)")

if __name__ == "__main__":
    asyncio.run(migrate_and_reseed())
