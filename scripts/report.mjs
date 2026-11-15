import fs from 'node:fs';

const FILE = process.argv[2] || 'results.json';
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const evalData = raw.results?.results ? raw.results : raw;
const rows = evalData.results || [];

const models = [];
const categories = [];
for (const r of rows) {
  const label = r.provider?.label || r.provider?.id;
  if (!models.includes(label)) models.push(label);
  const cat = r.vars?.category || '未分类';
  if (!categories.includes(cat)) categories.push(cat);
}

const key = (m, c) => `${m}|${c}`;
const stat = new Map();
for (const m of models) {
  stat.set(key(m, '__all__'), { pass: 0, total: 0 });
  for (const c of categories) stat.set(key(m, c), { pass: 0, total: 0 });
}

const failures = [];
for (const r of rows) {
  const m = r.provider?.label || r.provider?.id;
  const c = r.vars?.category || '未分类';
  const ok = r.success === true;
  for (const k of [key(m, c), key(m, '__all__')]) {
    const s = stat.get(k);
    s.total++;
    if (ok) s.pass++;
  }
  if (!ok) {
    const cr = r.gradingResult?.componentResults?.find((x) => !x.pass);
    failures.push({
      m, c,
      desc: r.testCase?.description || '',
      input: r.vars?.input || '',
      output: String(r.response?.output ?? ''),
      reason: String(cr?.reason || r.gradingResult?.reason || '未通过断言').split('\n')[0],
    });
  }
}

const pct = (p, t) => (t ? ((p / t) * 100).toFixed(1) + '%' : '-');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const header = categories.map((c) => `<th>${esc(c)}</th>`).join('');
const body = models.map((m) => {
  const cells = categories.map((c) => {
    const s = stat.get(key(m, c));
    const p = s.total ? s.pass / s.total : 0;
    const cls = p === 1 ? 'ok' : p >= 0.8 ? 'warn' : 'bad';
    return `<td class="${cls}">${s.pass}/${s.total}<span>${pct(s.pass, s.total)}</span></td>`;
  }).join('');
  const all = stat.get(key(m, '__all__'));
  return `<tr><th class="model">${esc(m)}</th>${cells}<td class="total">${all.pass}/${all.total}<span>${pct(all.pass, all.total)}</span></td></tr>`;
}).join('');

const failHtml = failures.map((f) => `
  <article class="card">
    <header><span class="tag">${esc(f.c)}</span><strong>${esc(f.desc)}</strong><span class="who">${esc(f.m)}</span></header>
    <p class="q"><b>输入</b>${esc(f.input).replace(/\n/g, '<br>')}</p>
    <p class="a"><b>实际输出</b>${esc(f.output).slice(0, 400)}</p>
    <p class="why">${esc(f.reason).slice(0, 200)}</p>
  </article>`).join('');

const ts = evalData.timestamp ? new Date(evalData.timestamp).toLocaleString('zh-CN') : '';
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>本地大模型评测报告</title>
<style>
  body{font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;margin:0;padding:32px;background:#f6f7f9;color:#1f2328}
  h1{font-size:22px;margin:0 0 4px}
  .meta{color:#656d76;margin-bottom:24px}
  table{border-collapse:collapse;width:100%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:32px}
  th,td{padding:10px 12px;border-bottom:1px solid #eaecef;text-align:center;font-variant-numeric:tabular-nums}
  thead th{background:#f6f8fa;font-weight:600;font-size:13px}
  th.model{text-align:left;font-weight:600}
  td span{display:block;font-size:11px;color:#8b949e}
  td.ok{background:#eaf7ec}td.warn{background:#fff8e6}td.bad{background:#fdeceb}
  td.total{font-weight:600}
  h2{font-size:17px;margin:0 0 12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px}
  .card{background:#fff;border:1px solid #eaecef;border-left:3px solid #d1242f;border-radius:6px;padding:14px 16px}
  .card header{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
  .tag{background:#eef2f6;border-radius:4px;padding:1px 6px;font-size:12px;color:#57606a}
  .who{margin-left:auto;font-size:12px;color:#8b949e}
  .card p{margin:6px 0;word-break:break-word}
  .card b{color:#57606a;font-weight:600;margin-right:6px}
  .why{color:#d1242f;font-size:12px}
</style></head>
<body>
  <h1>本地大模型评测报告</h1>
  <div class="meta">${rows.length} 条判定 · ${models.length} 个模型 · ${categories.length} 个类别 · 运行时间 ${esc(ts)}</div>
  <table>
    <thead><tr><th class="model">模型</th>${header}<th>总计</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <h2>未通过用例（${failures.length}）</h2>
  <div class="grid">${failHtml}</div>
</body></html>`;

fs.writeFileSync('report.html', html);
console.log(`report.html written: ${failures.length} failures, ${rows.length} judgments`);