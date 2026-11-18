# 工程制图题转交互式 3D

上传一道机械工程制图题的图片或 PDF，让 Codex 参考题图重建三维实体、补画题目要求的视图，并生成可双击打开的离线 HTML。网页提供原图、参考图、模型、多题切换、旋转、平移、缩放和正投影视角。

## 下载

[下载仓库 ZIP](https://github.com/chunxiaruo-commits/engineering-drawing-3d-skill/archive/refs/heads/main.zip) · [下载离线示例 HTML](https://github.com/chunxiaruo-commits/engineering-drawing-3d-skill/raw/refs/heads/main/demo.html)

解压后保留完整的隐藏目录 `.agents/`。离线示例使用自制台阶块，下载后可直接在浏览器打开。

## 在 Codex 使用

1. 下载或克隆这个仓库，使用 Codex 打开其根目录。技能放在 `.agents/skills/engineering-drawing-3d/`，可按仓库范围自动发现。
2. 在对话中附上题图，并发送下方指令。在支持技能选择器的界面中也可选择对应技能。

~~~text
使用 $engineering-drawing-3d 处理我上传的题图。按原题号补齐要求的视图，制作可旋转、平移、缩放的模型，并交付一个离线 HTML。请在网页里标明会影响答案的几何假设。
~~~

建议上传能拍到所有已知视图、尺寸和题干的清晰图片。一张图片可以包含多个视图。只有单个投影时，部分深度、孔型或隐藏结构可能只能给出带明示假设的示意解。[OpenAI 技能创建与加载说明](https://learn.chatgpt.com/docs/build-skills)

## 从题图到网页

| 顺序 | 产物 | 谁来完成 |
| --- | --- | --- |
| 1. 读图与编号 | 各题作图要求、已知视图、原图裁剪 | Codex |
| 2. 对齐投影 | 各特征在相邻视图中的端点、延伸范围、凹凸和遮挡依据 | Codex |
| 3. 重建并补画 | 同一组参数驱动的立体网格和参考 SVG | Codex 编写几何和图纸，网格脚本采样 |
| 4. 打包与回投 | 将最终网格投回已知视图，核对漏线、多线、遮挡和补画视图 | 打包脚本与 Codex |
| 5. 交互验收 | 每题的原图和答案适配图纸框，检查放大、视角与模型操作 | 浏览器 |

圆弧形状相似时，先在相邻视图找各自的端点和轴向边，再判断它们是否属于同一个结构。例如，后方立板上的半圆凸缘与底座前缘的阶梯槽，可分别由俯视图后部的短直边和主视图底部的两对竖线定位。回投时同时检查已知视图和补画视图。

## 如何维护这个技能

- **`SKILL.md`** 的头部写清名称及触发场景。正文交代如何从题图走到可验收的 HTML。
- **`references/reconstruction.md`** 放容易误判的投影与孔槽证据。**`references/project-format.md`** 定义每题的图纸、模型和可选剖切状态怎样交给脚本。
- **`scripts/mesh_sdf.py`** 将参数化隐式几何转成三角网格。**`scripts/build_demo.py`** 将题目清单和资源打包。**`assets/`** 是多个题目共用的网页查看器。
- **`scripts/probe_projection.py`** 从最终 HTML 或网格文件抽查某条投影视线上的表面深度，辅助核对孔槽和被遮挡的棱。
- **`scripts/check_sheet_layout.cjs`** 可用 Playwright 检查各题原图和答案在不同屏幕宽度下是否完整入框。
- **`examples/build_sample.py`** 用同一组参数生成一道示例的题图、参考图、完整模型和剖切模型。

在仓库根目录运行示例。网格生成器使用 NumPy。已有网格的 HTML 打包只使用 Python 标准库。

~~~sh
python -m pip install numpy
python .agents/skills/engineering-drawing-3d/examples/build_sample.py --output demo.html
~~~

用浏览器打开 `demo.html`，对照主视、俯视、左视，试着旋转、平移、缩放、复位以及查看沿孔轴剖切的内部。
