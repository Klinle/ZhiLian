# Python 编程规范 (PEP 8) 与测试工程实践

## 1. PEP 8 代码风格基本指南
为了保证代码的可读性，Python 社区制定了 PEP 8 风格指南，核心规则如下：
*   **缩进**：统一使用 **4 个空格** 进行缩进，禁止使用 Tab。
*   **行宽**：每行最大限制为 79 个字符。
*   **空行**：顶层函数和类定义之间留 **2 个空行**；类内部的实例方法定义之间留 **1 个空行**。
*   **命名规范**：
    *   类名：驼峰命名法 `PascalCase` (例如 `SnakeGame`)。
    *   函数、方法与变量名：蛇形下划线命名法 `snake_case` (例如 `calculate_score`)。
    *   常量：全大写加下划线 `UPPER_SNAKE_CASE` (例如 `MAX_PLAYERS`)。
*   **导入**：所有 `import` 应当放在文件顶部，按标准库、第三方库、项目内部包三部分分组排列，中间留空行。

## 2. 静态类型提示 (Type Hints)与数据验证
*   **类型提示**：自 Python 3.5 起支持静态类型标注。例如 `def cast_spell(name: str, power: int) -> bool:` 声明了参数和返回值类型，可由 mypy 等静态分析器校验。
*   **Pydantic 框架**：在现代 FastAPI Web 接口中，使用 Pydantic 定义数据模型（BaseModel）。它在运行时对客户端传入的 JSON 数据执行严密的类型校验和自动转型，验证不通过则自动拦截并返回错误详情。

## 3. 单元测试与 pytest 实践
*   **测试固件 (Fixture)**：`pytest` 允许定义 `@pytest.fixture`，用于在测试执行前自动准备环境（如创建测试数据库、拉起虚拟客户端），测试后自动执行销毁，减少重复配置。
*   **测试断言**：pytest 直接使用 Python 原生的 `assert` 语句进行校验。通过 `pytest.mark.asyncio` 支持异步函数的测试，是维护大型项目稳定、防范代码重构出 bug 的核心安全锁。
