"""评测服务 — LLM 代码评测 + 选择题程序判分"""

from importlib import import_module
from typing import Optional, Dict, Any
import json
import re

from core.config import settings

litellm = import_module("litellm")
acompletion = getattr(litellm, "acompletion")


class EvaluationService:
    """代码提交与选择题的自动评测"""

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

        构建 Prompt → 调用 LLM → 解析 JSON 结果
        返回: {status, score, feedback, details}
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

        # Use provided API key or fall back to DeepSeek system key
        use_api_key = api_key or settings.DEEPSEEK_API_KEY
        use_model = model or settings.DEEPSEEK_MODEL
        use_base_url = base_url or settings.DEEPSEEK_BASE_URL

        if not use_api_key:
            return {
                "status": "error",
                "score": 0,
                "feedback": "未配置 API Key，无法进行 LLM 评测",
                "issues": [],
                "suggestions": [],
            }

        litellm_model = use_model
        if use_base_url and not use_model.startswith("openai/"):
            litellm_model = f"openai/{use_model}"

        kwargs: Dict[str, Any] = {
            "model": litellm_model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是代码评测专家，请严格按照 JSON 格式输出评测结果。",
                },
                {"role": "user", "content": eval_prompt},
            ],
            "api_key": use_api_key,
            "stream": False,
            "temperature": 0.1,
        }

        if use_base_url:
            kwargs["api_base"] = use_base_url

        try:
            response = await acompletion(**kwargs)
            content = response.choices[0].message.content

            # Parse JSON from response (handle markdown code blocks)
            json_match = re.search(r"```json\s*(.*?)\s*```", content, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find raw JSON
                json_match = re.search(r"\{.*\}", content, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    json_str = content

            result = json.loads(json_str)

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


evaluation_service = EvaluationService()
