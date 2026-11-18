# 打包数据格式

每次使用创建一个工作目录，收集参考 SVG、原图和模型网格。由 `build_demo.py` 读取 JSON 清单，生成一个浏览器可打开的 HTML。相对路径以清单所在目录为基准。

~~~json
{
  "title": "工程制图练习",
  "questions": [
    {
      "number": "1",
      "title": "补画台阶块左视图",
      "tab": "补左视图",
      "prompt": "已知主视图和俯视图，补画左视图。",
      "answer": "answer.svg",
      "source": "source.png",
      "model": "part.mesh.gz",
      "notes": ["用俯视图转移深度。"],
      "assumptions": "",
      "sections": [{"label": "A–A 剖切", "model": "part-a.mesh.gz"}]
    }
  ]
}
~~~

`number`、`title`、`answer`、`model` 必需。`source` 支持 PNG、JPEG、WebP、GIF 和 SVG。答案图优先用有 `viewBox` 的自包含 SVG。SVG 以图片方式嵌入，样式写在 SVG 内部。其余字段可按题省略。`assumptions` 会显示在该题下方。

~~~sh
python /path/to/engineering-drawing-3d/scripts/build_demo.py project.json output.html
~~~

## 预览图纸与检查边界

- **SVG 自身的范围。** 计算完整图纸的边界，计入三视图中最外侧的尺寸线、箭头、文字、中心线延长段和剖切标记。给这些元素留出可见的页边距，再设置 `viewBox`，并检查上下左右边缘。宽高比应由整张图纸决定。
- **网页预览的范围。** 沿用 `assets/style.css` 的双轴尺寸约束。图纸框为横纵各有明确可用尺寸的区域，图片通过 `object-fit: contain` 等比适配。默认预览整图入框，放大弹窗提供卷动和局部查看。自定义页面时，确保图纸框的大小由页面布局决定，并在实际浏览器中检查高宽比差异明显的图纸。
- **验收。** 检查最终 HTML 的每道题和每种预览模式。浏览器里核对图纸在宽屏和手机宽度下完整显示，特别查看最末一行标注、第一列侧视图边界和图例。另放大查看图纸，确认 SVG 内的外围文字和线条仍完整。环境已有 Playwright 时，可运行下方脚本自动检查图片盒、等比适配和放大按钮。使用本机 Chromium 或 Edge 时，可把可执行文件路径作为最后一个参数。

~~~sh
node .agents/skills/engineering-drawing-3d/scripts/check_sheet_layout.cjs output.html
~~~

## 生成网格

`scripts/mesh_sdf.py` 需要 NumPy。把 `scripts` 加到 Python 搜索路径后，可调用 `write_mesh`。定义向量化函数 `field(x, y, z)`，内部为负、表面为零。`bounds` 是实体的三轴范围，`step` 是采样步长。选取能够分辨最小面、槽和孔的步长。

~~~python
from mesh_sdf import between, solid, write_mesh

def block(x, y, z):
    return solid(between(x, -40, 40), between(y, 0, 48), between(z, 0, 22))

write_mesh("part.mesh.gz", block, [(-40, 40), (0, 48), (0, 22)], step=1.5)
~~~

`clip(x,y,z)` 可移除返回值为正的区域。例如 `clip=lambda x,y,z: y-24` 保留 Y ≤ 24 的实体，并对截断面着色。各状态分别写文件。剖切模型与完整模型共用 `bounds`，以保持大小和定位一致。贯通孔和补画视图的完整范例见 [示例脚本](../examples/build_sample.py)。

HTML 打包只需要 Python 标准库。网页使用浏览器原生画布与 gzip 解压能力，WebGL 不可用时通过 Canvas 绘制。
