# Sora · 个人主页

首页汇总公开作品和研究项目。节拍器、黑夜君临工具和实验室主页链接到各自的 GitHub Pages，桌宠和研究项目链接到公开仓库。

`/sora/gallery/` 展示当前角色设定画，[sora-atelier](https://github.com/soraaa013-ops/sora-atelier) 保存编辑源。推送到 main 后，GitHub Actions 分别打包首页、互动立绘和画集。画集发布目录只包含索引中 `collection/` 作品及其预览。

本地预览使用临时输出目录。

```bash
preview_dir=$(mktemp -d)
python3 .github/scripts/build_showcase.py "$preview_dir/site"
python3 -m http.server 8000 --directory "$preview_dir/site"
```
