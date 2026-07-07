"""评测服务 — LLM 代码评测 + 选择题程序判分 + 针对性练习动态生成"""

from importlib import import_module
from typing import Optional, Dict, Any
import json
import re

from core.config import settings

litellm = import_module("litellm")
acompletion = getattr(litellm, "acompletion")


class EvaluationService:
    """代码提交与选择题的自动评测 + 薄弱点针对性练习生成"""

    async def _call_llm_json(
        self,
        system_prompt: str,
        user_prompt: str,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        temperature: float = 0.1,
    ) -> dict:
        """统一 LLM 调用 + JSON 解析辅助方法

        构建 kwargs → 调用 litellm → 兼容 markdown 代码块解析 JSON
        异常时抛出，由调用方决定降级策略
        """
        use_api_key = api_key or settings.DEEPSEEK_API_KEY
        use_model = model or settings.DEEPSEEK_MODEL
        use_base_url = base_url or settings.DEEPSEEK_BASE_URL

        if not use_api_key:
            raise ValueError("未配置 API Key，无法调用 LLM")

        litellm_model = use_model
        if use_base_url and not use_model.startswith("openai/"):
            litellm_model = f"openai/{use_model}"

        kwargs: Dict[str, Any] = {
            "model": litellm_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "api_key": use_api_key,
            "stream": False,
            "temperature": temperature,
        }
        if use_base_url:
            kwargs["api_base"] = use_base_url

        response = await acompletion(**kwargs)
        content = response.choices[0].message.content

        # 解析 JSON（兼容 ```json 代码块与裸 JSON）
        json_match = re.search(r"```json\s*(.*?)\s*```", content, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_match = re.search(r"\{.*\}", content, re.DOTALL)
            json_str = json_match.group(0) if json_match else content

        return json.loads(json_str)

    async def evaluate_code_submission(
        self,
        title: str,
        description: str,
        starter_code: str,
        test_cases: dict,
        user_code: str,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> dict:
        """使用 LLM 评测代码提交

        构建 Prompt → 调用 _call_llm_json → 标准化结果字段
        返回: {status, score, feedback, issues, suggestions}
        """
        eval_prompt = f"""你是一位资深的代码评测专家。请评测学员提交的代码实现。

## 题目信息
- 标题: {title}
- 描述: {description}
- 起始代码模板:
```python
{starter_code}
```
- 测试用例数据:
```json
{json.dumps(test_cases, ensure_ascii=False, indent=2)}
```

## 学员提交的代码
```python
{user_code}
```

## 评测要求
1. 检查代码逻辑是否正确实现了题目要求
2. 检查代码是否能正确处理给定的测试用例
3. 检查代码质量（命名规范、异常处理、可读性）

## 输出格式
请以 JSON 格式返回评测结果，不要包含其他文本：
```json
{{
    "status": "passed" | "failed" | "partial",
    "score": 0-100,
    "feedback": "总体评价",
    "issues": ["问题1", "问题2"],
    "suggestions": ["改进建议1", "改进建议2"]
}}
```"""

        try:
            result = await self._call_llm_json(
                system_prompt="你是代码评测专家，请严格按照 JSON 格式输出评测结果。",
                user_prompt=eval_prompt,
                api_key=api_key,
                model=model,
                base_url=base_url,
                temperature=0.1,
            )
            return {
                "status": result.get("status", "error"),
                "score": int(result.get("score", 0)),
                "feedback": result.get("feedback", ""),
                "issues": result.get("issues", []),
                "suggestions": result.get("suggestions", []),
            }
        except Exception as e:
            return {
                "status": "error",
                "score": 0,
                "feedback": f"评测服务异常: {str(e)}",
                "issues": [],
                "suggestions": [],
            }

    def evaluate_quiz_submission(
        self,
        test_cases: dict,
        user_answers: dict,
    ) -> dict:
        """选择题程序判分 — 直接比对 test_cases 中的正确答案

        test_cases 格式:
        {
            "questions": [
                {"id": "q1", "answer": 1, "explanation": "..."},
                ...
            ]
        }
        user_answers 格式:
        {
            "q1": 0,
            "q2": 2,
            ...
        }
        """
        questions = test_cases.get("questions", [])
        if not questions:
            return {
                "status": "error",
                "score": 0,
                "feedback": "未找到题目数据",
                "details": [],
            }

        correct_count = 0
        details = []

        for q in questions:
            q_id = str(q.get("id", ""))
            correct_answer = q.get("answer")
            user_answer = user_answers.get(q_id)
            is_correct = user_answer == correct_answer

            if is_correct:
                correct_count += 1

            details.append(
                {
                    "question_id": q_id,
                    "correct_answer": correct_answer,
                    "user_answer": user_answer,
                    "is_correct": is_correct,
                    "explanation": q.get("explanation", ""),
                }
            )

        total = len(questions)
        score = round((correct_count / total) * 100) if total > 0 else 0
        status = "passed" if score >= 60 else "failed"

        return {
            "status": status,
            "score": score,
            "feedback": f"答对 {correct_count}/{total} 题",
            "details": details,
        }

    async def generate_targeted_exercise(
        self,
        node_name: str,
        node_description: str,
        node_category: str,
        proficiency: float,
        is_lighted: bool,
        exercise_type: str,
        difficulty: str = "medium",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> dict:
        """基于薄弱知识点用 LLM 动态生成针对性练习

        生成的练习结构与 Lab 兼容（title/description/starter_code/test_cases/lab_type/detailed_explanation），
        前端可直接复用 practice 页渲染逻辑。difficulty 与学员掌握度自适应。

        返回: {title, description, starter_code, test_cases, detailed_explanation, difficulty, lab_type} 或 {error}
        """
        # 学员状态描述，引导 LLM 调整难度
        if not is_lighted:
            mastery_desc = "尚未点亮该知识点（建议从入门概念切入）"
        else:
            mastery_desc = f"已点亮但掌握度仅 {proficiency * 100:.0f}%（建议针对薄弱环节巩固）"

        if exercise_type == "quiz":
            system_prompt = "你是计算机基础教育专家，擅长针对学员薄弱点设计高质量选择题。请严格按 JSON 格式输出，不要包含其他文本。"
            user_prompt = f"""请针对以下知识点生成 3 道选择题，帮助学员巩固薄弱知识。

## 知识点信息
- 名称: {node_name}
- 领域: {node_category}
- 描述: {node_description}
- 学员当前状态: {mastery_desc}
- 目标难度: {difficulty}

## 生成要求
1. 题目必须紧扣该知识点的核心概念和常见误区
2. 每题 4 个选项（仅 1 个正确答案），干扰项要有迷惑性
3. 每题附详细解析，说明正确答案为何正确、其他选项为何错误
4. 包含全局 detailed_explanation（详细总解析），大白话通俗易懂，用生活故事类比说明这道题目涉及的概念

## 输出格式（严格 JSON）
```json
{{
    "title": "练习标题",
    "description": "一句话简介",
    "detailed_explanation": "关于该题涉及知识点的通俗化一句话口诀和生活类比总解析",
    "test_cases": {{
        "questions": [
            {{
                "id": "q1",
                "text": "题干",
                "options": ["选项A", "选项B", "选项C", "选项D"],
                "answer": 0,
                "explanation": "解析"
            }}
        ]
    }}
}}
```"""
        elif exercise_type == "match":
            system_prompt = "你是计算机基础教育专家，擅长设计好玩的概念与生活类比连线匹配题。请严格按 JSON 格式输出，不要包含其他文本。"
            user_prompt = f"""请针对以下知识点生成一道连线匹配题，帮学员通过生活类比快速掌握概念。

## 知识点信息
- 名称: {node_name}
- 领域: {node_category}
- 描述: {node_description}
- 学员当前状态: {mastery_desc}
- 目标难度: {difficulty}

## 生成要求
1. 设计 4 个左侧网络/算法概念术语（如：IP地址、TCP三次握手），与 4 个右侧最贴切的生活故事类比（如：家庭住址、确认眼神签收挂号信）。
2. 提供 `pairs` 对象指出它们之间逻辑上的正确连接映射关系。
3. 包含 `detailed_explanation` 字段，以生动的故事对这 4 个连线进行大白话原理解释。

## 输出格式（严格 JSON）
```json
{{
    "title": "连线匹配练习标题",
    "description": "连线匹配：请将概念与其最贴切的生活类比匹配起来。",
    "detailed_explanation": "总解析：例如 TCP 像挂号信...",
    "test_cases": {{
        "left": ["概念1", "概念2", "概念3", "概念4"],
        "right": ["类比1", "类比2", "类比3", "类比4"],
        "pairs": {{
            "概念1": "类比1",
            "概念2": "类比2",
            "概念3": "类比3",
            "概念4": "类比4"
        }}
    }}
}}
```"""
        elif exercise_type == "arrange":
            system_prompt = "你是计算机基础教育专家，擅长设计步骤逻辑排序题。请严格按 JSON 格式输出，不要包含其他文本。"
            user_prompt = f"""请针对以下知识点生成一道步骤排序题，帮助学员加深算法或通信顺序流程的物理理解。

## 知识点信息
- 名称: {node_name}
- 领域: {node_category}
- 描述: {node_description}
- 学员当前状态: {mastery_desc}
- 目标难度: {difficulty}

## 生成要求
1. 提供 4 到 5 个逻辑步骤（如：三次握手的顺序，或冒泡排序内层循环的执行顺序）。
2. steps 字段是打乱顺序后的步骤列表。
3. correct_order 字段提供正确的排序索引序列（对应打乱后的 steps 下标，比如 [1, 0, 2, 3]）。
4. 包含 `detailed_explanation`，用生活场景类比（如排队、做菜）解释为什么要遵循这个正确的执行顺序。

## 输出格式（严格 JSON）
```json
{{
    "title": "流程排序练习标题",
    "description": "步骤排序：请将打乱的步骤调整为正确的先后逻辑顺序。",
    "detailed_explanation": "总解析：解释为什么要按照这个顺序进行...",
    "test_cases": {{
        "steps": ["打乱步骤1", "打乱步骤2", "打乱步骤3", "打乱步骤4"],
        "correct_order": [1, 0, 2, 3]
    }}
}}
```"""
        elif exercise_type == "fill":
            system_prompt = "你是计算机教育专家，擅长出概念或代码关键字填空题。请严格按 JSON 格式输出，不要包含其他文本。"
            user_prompt = f"""请针对以下知识点生成一道概念填空题，考查学员对核心关键字的精确记忆。

## 知识点信息
- 名称: {node_name}
- 领域: {node_category}
- 描述: {node_description}
- 学员当前状态: {mastery_desc}
- 目标难度: {difficulty}

## 生成要求
1. 给出一段科普段落或简短的 Python 代码（使用双下划线 `___` 隐藏 2-3 个核心的关键词/类比词作为空缺项）。
2. text 字段为包含挖空 `___` 的内容段落。
3. blanks 字段为按顺序排列的正确填空答案字符串列表。
4. 包含 `detailed_explanation`，详细讲解填空背后的知识要点。

## 输出格式（严格 JSON）
```json
{{
    "title": "概念填空练习标题",
    "description": "概念填空：请在填空输入框中填入正确的关键字。",
    "detailed_explanation": "填空总解析...",
    "test_cases": {{
        "text": "栈是一种限定在___进行插入的操作，特点是___进___出。",
        "blanks": ["栈顶", "后", "先"]
    }}
}}
```"""
        else:
            system_prompt = "你是编程教育专家，擅长针对学员薄弱点设计代码实操题。请严格按 JSON 格式输出，不要包含其他文本。"
            user_prompt = f"""请针对以下知识点生成一道代码实操题，帮助学员通过编程巩固薄弱知识。

## 知识点信息
- 名称: {node_name}
- 领域: {node_category}
- 描述: {node_description}
- 学员当前状态: {mastery_desc}
- 目标难度: {difficulty}

## 生成要求
1. 题目必须紧扣该知识点的核心概念，通过实际编程任务加深理解
2. 提供起始代码模板（含函数签名和注释占位符）
3. 提供清晰的输入输出示例和测试要点
4. 难度匹配学员当前状态
5. starter_code 字段必须是合法 Python 代码（注意转义换行）
6. 包含 `detailed_explanation` 提供详细解析及参考答案。

## 输出格式（严格 JSON）
```json
{{
    "title": "题目标题",
    "description": "题目描述（含功能要求）",
    "detailed_explanation": "详细解析与参考解答思路",
    "starter_code": "def solution():\\n    # 在此编写代码\\n    pass",
    "test_cases": {{
        "requirements": "功能要求描述",
        "sample_io": [["输入示例", "输出示例"]]
    }}
}}
```"""

        try:
            result = await self._call_llm_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                api_key=api_key,
                model=model,
                base_url=base_url,
                temperature=0.7,
            )
            return {
                "title": result.get("title", f"{node_name} · 针对性练习"),
                "description": result.get("description", ""),
                "starter_code": result.get("starter_code", "") if exercise_type == "code" else "",
                "test_cases": result.get("test_cases", {}),
                "detailed_explanation": result.get("detailed_explanation", ""),
                "difficulty": difficulty,
                "lab_type": exercise_type,
            }
        except Exception as e:
            return {"error": f"生成练习失败: {str(e)}"}


evaluation_service = EvaluationService()
