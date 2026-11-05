function renderPromptDownload() {
  return `<section class="jslab-prompt-card" aria-labelledby="jslab-prompt-title"><div class="jslab-prompt-info"><h2 id="jslab-prompt-title">内置 AI 同款提示词</h2><p id="jslab-prompt-description">将 Markdown 发给其他 AI，生成 JSLab 脚本。</p></div><a class="jslab-prompt-action" href="/jslab-cloud/docs/download/jslab-ai-prompt.md" download aria-label="下载内置 AI 同款提示词（Markdown）" aria-describedby="jslab-prompt-description">下载 .md <span aria-hidden="true">↓</span></a></section>`;
}

module.exports = { renderPromptDownload };
