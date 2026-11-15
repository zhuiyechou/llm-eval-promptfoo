import fs from 'node:fs';

const FILE = process.argv[2] || 'results.json';
if (!fs.existsSync(FILE)) {
  console.error(`找不到 ${FILE}，先运行 npm run eval`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const evalData = raw.results?.results ? raw.results : raw;
const rows = evalData.results || [];
if (!rows.length) {
  console.error('results.json 里没有评测结果');
  process.exit(1);
}

const models = [];
const categories = [];
for (const r of rows) {
  const label = r.provider?.label || r.provider?.id || 'unknown';
  if (!models.includes(label)) models.push(label);
  const cat = r.vars?.category || '未分类';
  if (!categories.includes(cat)) categories.push(cat);
}

const stats = new Map();
for (const m of models) {
  for (const c of categories) stats.set(`${m}|${c}`, { pass: 0, total: 0 });
  stats.set(`${m}|__total__`, { pass: 0, total: 0 });
}

const failures = [];
for (const r of rows) {
  const label = r.provider?.label || r.provider?.id || 'unknown';
  const cat = r.vars?.category || '未分类';
  const ok = r.success === true || r.gradingResult?.pass === true;
  for (const key of [`${label}|${cat}`, `${label}|__total__`]) {
    const s = stats.get(key);
    s.total += 1;
    if (ok) s.pass += 1;
  }
  if (!ok) {
    const reason =
      r.gradingResult?.reason ||
      r.gradingResult?.componentResults?.find((c) => !c.pass)?.reason ||
      r.error ||
      '未通过断言';
    failures.push({
      model: label,
      category: cat,
      description: r.testCase?.description || r.vars?.input?.slice(0, 40) || '(无描述)',
      output: String(r.response?.output ?? '').replace(/\s+/g, ' ').slice(0, 160),
      reason: String(reason).replace(/\s+/g, ' ').slice(0, 160),
    });
  }
}

const pct = (p, t) => (t === 0 ? '-' : `${((p / t) * 100).toFixed(1)}%`);
const cell = (p, t) => (t === 0 ? '-' : `${p}/${t} (${pct(p, t)})`);

const lines = [];
lines.push('| 模型 | ' + categories.join(' | ') + ' | 总计 |');
lines.push('| --- | ' + categories.map(() => '---').join(' | ') + ' | --- |');
for (const m of models) {
  const cells = categories.map((c) => {
    const s = stats.get(`${m}|${c}`);
    return cell(s.pass, s.total);
  });
  const total = stats.get(`${m}|__total__`);
  lines.push(`| ${m} | ${cells.join(' | ')} | **${cell(total.pass, total.total)}** |`);
}

const summary = [];
summary.push(`## 评测矩阵（${categories.length} 个类别 / ${rows.length / models.length} 条用例 × ${models.length} 个模型）`);
summary.push('');
summary.push(...lines);
summary.push('');

if (failures.length) {
  summary.push(`### 未通过用例（${failures.length}）`);
  summary.push('');
  for (const m of models) {
    const list = failures.filter((f) => f.model === m);
    if (!list.length) {
      summary.push(`- ${m}：全部通过`);
      continue;
    }
    summary.push(`**${m}（${list.length} 条）**`);
    summary.push('');
    for (const f of list) {
      summary.push(`- [${f.category}] ${f.description}`);
      if (f.reason && f.reason !== '未通过断言') summary.push(`  - 原因：${f.reason}`);
      if (f.output) summary.push(`  - 实际输出：${f.output}`);
    }
    summary.push('');
  }
}

const out = summary.join('\n') + '\n';
fs.writeFileSync('matrix.md', out);
console.log(out);
