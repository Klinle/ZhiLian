# 外部 AI 题目生成与导入指南

> 本文档定义了使用外部 AI（ChatGPT / Claude / DeepSeek 网页版等）生成练习题并导入 CogniLink 数据库的完整规范。

---

## 目录

- [一、输出格式规范](#一输出格式规范)
- [二、字段说明](#二字段说明)
- [三、五种题型的 test_cases 结构](#三五种题型的-test_cases-结构)
- [四、知识节点清单](#四知识节点清单)
- [五、外部 AI 提示词模板](#五外部-ai-提示词模板)
- [六、使用流程](#六使用流程)

---

## 一、输出格式规范

外部 AI 必须输出 **JSON 数组**，每个元素是一道题。示例：

```json
[
  {
    "title": "列表推导式基础练习",
    "description": "本练习考查列表推导式的基本语法与常见陷阱，帮助学员掌握 [x for x in iterable] 的核心写法。",
    "lab_type": "quiz",
    "node_code": "PY_LIST",
    "difficulty": "medium",
    "starter_code": "",
    "detailed_explanation": "列表推导式就像流水线打包草莓：从原料池（可迭代对象）中逐个取出元素，经过加工（表达式），打包进新盒子（新列表）。",
    "test_cases": {
      "questions": [
        {
          "id": "q1",
          "text": "以下哪段代码会输出 [0, 1, 4, 9, 16]？",
          "options": ["[x for x in range(5)]", "[x**2 for x in range(5)]", "[x*2 for x in range(5)]", "[x**2 for x in range(4)]"],
          "answer": 1,
          "explanation": "x**2 对 0-4 分别平方，得到 [0,1,4,9,16]。选项A只输出原值，选项C是乘2，选项D范围少了一个。"
        }
      ]
    }
  }
]
```

---

## 二、字段说明

| 字段 | 类型 | 是否必填 | 说明 |
|---|---|---|---|
| `title` | string | 必填 | 题目标题，简洁明了 |
| `description` | string | 必填 | 题目描述/题干，具体说明考查场景和任务要求 |
| `lab_type` | string | 必填 | 题型，只能是 5 个值之一：`code` / `quiz` / `match` / `arrange` / `fill` |
| `node_code` | string | 必填 | 知识节点编码，必须从[知识节点清单](#四知识节点清单)中选取 |
| `difficulty` | string | 必填 | 难度，只能是：`easy` / `medium` / `hard` |
| `starter_code` | string | `code` 题必填，其他题型留空字符串 `""` | Python 代码模板，用 `\n` 表示换行 |
| `detailed_explanation` | string | 必填 | 详细解析，通俗讲解涉及的知识点，建议用生活类比 |
| `test_cases` | object | 必填 | 测试用例数据，结构根据 `lab_type` 不同而不同，见下方 |

---

## 三、五种题型的 test_cases 结构

### 1. quiz（选择题）

```json
"test_cases": {
  "questions": [
    {
      "id": "q1",
      "text": "题干文本",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": 0,
      "explanation": "为什么选A，其他为什么错"
    },
    {
      "id": "q2",
      "text": "题干文本",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": 2,
      "explanation": "解析"
    },
    {
      "id": "q3",
      "text": "题干文本",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": 1,
      "explanation": "解析"
    }
  ]
}
```

**规则：**
- `questions` 数组，3 道单选题
- `id`：字符串，格式 `q1` `q2` `q3`
- `options`：恰好 4 个选项
- `answer`：整数 0-3，表示正确选项的索引（从 0 开始）
- `explanation`：每题的解析，说明正确答案为何正确、其他为何错误
- 干扰项要有迷惑性，不能有明显错误的选项

---

### 2. code（代码实操题）

```json
"test_cases": {
  "requirements": "功能要求描述，例如：函数接收一个列表，返回每个元素平方后的新列表",
  "sample_io": [
    ["输入: [1, 2, 3]", "输出: [1, 4, 9]"],
    ["输入: [0, -1, 5]", "输出: [0, 1, 25]"]
  ]
}
```

**规则：**
- `starter_code` 字段必须提供，包含函数签名和注释占位符
- `starter_code` 必须是合法 Python 代码，用 `\n` 表示换行
- `sample_io`：二维数组，每项是 `[输入描述, 输出描述]`，至少 2 组

**starter_code 示例：**
```json
"starter_code": "def square_list(nums):\n    # 在此编写代码，返回平方后的新列表\n    pass"
```

---

### 3. match（连线匹配题）

```json
"test_cases": {
  "left": ["装饰器", "闭包", "生成器", "迭代器"],
  "right": ["技能冷却附魔挂件", "函数的背包记忆", "懒加载数据水晶", "逐个吐出元素的管家"],
  "pairs": {
    "装饰器": "技能冷却附魔挂件",
    "闭包": "函数的背包记忆",
    "生成器": "懒加载数据水晶",
    "迭代器": "逐个吐出元素的管家"
  }
}
```

**规则：**
- `left` 和 `right` 各恰好 4 个元素
- `pairs`：对象，键是 `left` 中的概念，值是 `right` 中对应的类比
- `pairs` 的键值对数量必须与 `left`/`right` 长度一致
- 类比要贴切生动，用游戏或生活场景

---

### 4. arrange（排序题）

```json
"test_cases": {
  "steps": ["执行 for 循环体", "调用 __iter__ 获取迭代器", "调用 __next__ 取出元素", "捕获 StopIteration 退出循环"],
  "correct_order": [1, 0, 2, 3]
}
```

**规则：**
- `steps`：4-5 个打乱顺序的步骤
- `correct_order`：整数数组，表示 `steps` 的正确排列顺序（值为 `steps` 的下标索引）
- 数组长度必须与 `steps` 长度一致
- 步骤之间必须有强逻辑先后关系

---

### 5. fill（填空题）

```json
"test_cases": {
  "text": "Python 中使用 ___ 关键字定义函数，使用 ___ 关键字返回值，使用 ___ 关键字异步等待。",
  "blanks": ["def", "return", "await"]
}
```

**规则：**
- `text`：包含 `___`（三个下划线）标记的挖空文本
- `blanks`：字符串数组，按 `___` 在 `text` 中出现的顺序排列正确答案
- `blanks` 数组长度必须等于 `text` 中 `___` 的出现次数

---

## 四、知识节点清单

`node_code` 必须从以下清单中选取：

### 编程开发基础 (programming)

| node_code | 节点名称 |
|---|---|
| PY_INTRO | Python 概述与应用 |
| PY_ENV | 环境安装与虚拟环境 |
| PY_RUN | 交互与脚本运行模式 |
| PY_VAR_EXP | 变量定义与算术表达式 |
| PY_DATATYPES | 基本数据类型与空类型 |
| PY_FLOW | 选择与循环流程控制 |
| PY_MODULES | 模块和包自定义导入 |
| PY_PEP8 | 编程规范与 PEP8 命名 |

### 数据结构与高级特性 (dsa)

| node_code | 节点名称 |
|---|---|
| PY_SEQ | 序列种类与基本操作 |
| PY_LIST | 列表推导式与元素操作 |
| PY_TUPLE | 元组与不可变陷阱 |
| PY_SET | 集合常用操作与推导式 |
| PY_DICT | 字典常用操作与推导式 |
| PY_STR | 字符串常用处理与格式化 |
| PY_BYTES | 二进制序列与字节串 |
| PY_SCOPE | 函数定义调用与作用域 |
| PY_PARAMS | 参数解包、可变与位置 |
| PY_CLOSURE | 嵌套函数与闭包 |
| PY_DECORATOR | 装饰器工作原理与叠加 |

### 面向对象与系统架构 (organization)

| node_code | 节点名称 |
|---|---|
| PY_OOP_BASE | 类与对象及封装继承多态 |
| PY_CLASS_MEMBER | 类成员隐藏与属性分类 |
| PY_PROPERTY | 属性拦截与 property |
| PY_OOP_METH | 实例、类与静态方法 |
| PY_OOP_INHERIT | 多重继承与 MRO 算法 |
| PY_MIXIN | 混入 (Mixin) 行为扩展 |
| PY_MAGIC | 魔术方法重载与可调用 |
| PY_ITER | 迭代器协议与生成器对象 |
| PY_META | 类装饰器、抽象类与元类 |

### 并发编程与操作系统 (os)

| node_code | 节点名称 |
|---|---|
| PY_GIL | GIL 全局解释器锁原理 |
| PY_CONCURRENT | 多进程多线程与并发池 |
| PY_ASYNC | 异步协程与 asyncio |

### 网络编程与联机服务 (network)

| node_code | 节点名称 |
|---|---|
| PY_SOCKET | 套接字网络通信编程 |
| PY_HTTP_REG | HTTP 协议与 requests 模块 |
| PY_WEB_SRV | Web 客户端与服务端原理 |
| PY_WSGI_ASGI | WSGI 与 ASGI 协议接口 |
| PY_WEB_FRAME | Web 框架与 MVC 设计模式 |

### 数据工程与持久化 (database)

| node_code | 节点名称 |
|---|---|
| PY_DEBUG | 调试方法与异常处理机制 |
| PY_TEST | 单元测试与 pytest 用例 |
| PY_IO | 文件读写、路径与上下文 |
| PY_SQL | SQLite 与 SQLAlchemy ORM |
| PY_NUMPY_PANDAS | 高能矩阵计算与 Pandas 分析 |

---

## 五、外部 AI 提示词模板

将以下完整内容粘贴给外部 AI，替换 `{节点名称}` 和 `{node_code}` 占位符：

```
你是一位资深的 Python 教学专家，擅长用通俗类比和趣味互动的方式设计练习题。请根据下方要求，为指定的知识节点生成练习题。

## 任务要求

请为以下知识节点生成 5 种题型的练习题各 1 道（共 5 道）：
- 知识节点：{节点名称，如"装饰器工作原理与叠加"}
- 节点编码：{node_code，如"PY_DECORATOR"}
- 难度：medium

## 5 种题型

1. quiz — 选择题：3 道单选题，每题 4 个选项，干扰项要有迷惑性，每题附解析
2. code — 代码实操题：提供 starter_code 模板（含函数签名和注释），提供 2 组输入输出示例
3. match — 连线匹配题：4 个 Python 概念与 4 个生活/游戏类比配对
4. arrange — 排序题：4-5 个打乱顺序的步骤，给出正确排序索引
5. fill — 填空题：一段包含 2-3 个空缺的文本，给出按顺序的答案

## 严格格式要求

你必须输出一个 JSON 数组，包含 5 个对象。每个对象的字段如下：

{
  "title": "题目标题",
  "description": "题目的详细描述和题干说明",
  "lab_type": "quiz|code|match|arrange|fill",
  "node_code": "{node_code}",
  "difficulty": "medium",
  "starter_code": "code 题必填，其他题型填空字符串",
  "detailed_explanation": "通俗化解析，用生活类比说明核心概念",
  "test_cases": { ... }
}

### test_cases 各题型格式（必须严格遵守）

【quiz】
"test_cases": {
  "questions": [
    {"id": "q1", "text": "题干", "options": ["A","B","C","D"], "answer": 0, "explanation": "解析"},
    {"id": "q2", "text": "题干", "options": ["A","B","C","D"], "answer": 1, "explanation": "解析"},
    {"id": "q3", "text": "题干", "options": ["A","B","C","D"], "answer": 2, "explanation": "解析"}
  ]
}

【code】
"test_cases": {
  "requirements": "功能要求描述",
  "sample_io": [["输入描述", "输出描述"], ["输入描述", "输出描述"]]
}

【match】
"test_cases": {
  "left": ["概念1","概念2","概念3","概念4"],
  "right": ["类比1","类比2","类比3","类比4"],
  "pairs": {"概念1":"类比1","概念2":"类比2","概念3":"类比3","概念4":"类比4"}
}

【arrange】
"test_cases": {
  "steps": ["打乱步骤1","打乱步骤2","打乱步骤3","打乱步骤4"],
  "correct_order": [1,0,2,3]
}

【fill】
"test_cases": {
  "text": "包含 ___ 标记空缺的文本",
  "blanks": ["答案1","答案2","答案3"]
}

## 质量要求

1. 每道题必须包含 detailed_explanation，用通俗的语言和生活中的类比解释核心概念
2. 选择题的干扰项要有迷惑性，不能有明显错误的选项
3. 代码题的 starter_code 必须是合法 Python 代码，用 \n 表示换行
4. 匹配题的类比要贴切生动，用游戏或生活场景
5. 排序题的步骤要有强逻辑顺序
6. 填空题用 ___（三个下划线）标记空缺

## 输出要求

- 只输出 JSON 数组，不要输出任何其他文字
- 不要用 markdown 代码块包裹
- 确保 JSON 格式合法，可直接解析
```

---

## 六、使用流程

```
1. 复制提示词模板 → 填入目标知识节点的名称和 node_code
2. 粘贴给外部 AI → 获取纯 JSON 输出
3. 保存为 JSON 文件（如 labs_export.json）
4. 运行导入脚本 → 批量写入数据库 labs 表
```

**示例操作：**

以"装饰器"节点为例，将提示词中的占位符替换为：
- `{节点名称}` → `装饰器工作原理与叠加`
- `{node_code}` → `PY_DECORATOR`

粘贴给外部 AI 后，将其输出的 JSON 保存为 `labs_py_decorator.json`，然后运行导入脚本入库。

---

*本文档随知识节点更新而同步维护。新增节点后请在[知识节点清单](#四知识节点清单)中补充对应条目。*
