# Sora · Homepage

简约风格的静态个人主页，无构建步骤，直接托管在 GitHub Pages 上。

在线节拍器已经拆分到独立仓库：<https://github.com/soraaa013-ops/metronome>。

## 本地预览

```bash
cd projects/homepage
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 部署到 GitHub Pages

详见仓库根目录的部署说明，或直接推送到 `main` 分支后
在 GitHub 仓库 Settings &rarr; Pages 中选择从 `main` 分支根目录发布。

## Sora 动态形象

首屏从 `sora/live/index.html` 加载角色，图下链接打开 `sora/gallery/index.html`。角色、动作和设定画的编辑源在 [sora-atelier](https://github.com/soraaa013-ops/sora-atelier)。更新时从该仓库同步对应的展示文件到 `sora/`，保留相对路径。
