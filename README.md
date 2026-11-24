# Sora · 个人主页

首页和 `/sora/gallery/` 展示本轮角色设定画。编辑源位于 [sora-atelier](https://github.com/soraaa013-ops/sora-atelier)。

推送到 main 后，GitHub Actions 会从画集索引选择 `collection/` 中的作品，连同对应预览、样式和脚本发布到 GitHub Pages。旧版首页可以从提交 `018eae1` 恢复。

本地预览使用临时输出目录。

```bash
preview_dir=$(mktemp -d)
python3 .github/scripts/build_showcase.py "$preview_dir/site"
python3 -m http.server 8000 --directory "$preview_dir/site"
```
