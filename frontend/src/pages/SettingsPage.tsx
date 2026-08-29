import { useEffect, useState } from 'react';
import { Bot, Check, Database, FileSpreadsheet, KeyRound, Loader2, Settings } from 'lucide-react';
import type { AppConfig } from '../types';
import { api } from '../services/api';
import { isSuggestExportDisabled, setSuggestExportDisabled } from '../utils/excel';

const MODEL_PRESETS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'deepseek-chat',
  'qwen-plus',
];

export function SettingsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [suggestEnabled, setSuggestEnabled] = useState(!isSuggestExportDisabled());

  // API 连接表单
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');

  const load = () => {
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        setBaseUrl(c.baseUrl ?? '');
        setModel(c.model);
      })
      .catch(() => setConfig(null));
  };

  useEffect(() => {
    load();
  }, []);

  async function toggleMock() {
    if (!config) return;
    setToggling(true);
    try {
      const res = await api.setMockMode(!config.aiMockMode);
      setConfig({ ...config, aiMockMode: res.aiMockMode });
    } catch {
      // 忽略：保持原状
    } finally {
      setToggling(false);
    }
  }

  async function saveAiConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await api.saveAiConfig({
        // 留空表示不修改已配置的 Key
        openaiApiKey: apiKey.trim() ? apiKey.trim() : undefined,
        openaiBaseUrl: baseUrl.trim(),
        openaiModel: model.trim() || undefined,
      });
      setConfig((prev) => ({
        ...(prev ?? config!),
        model: res.model,
        hasApiKey: res.hasApiKey,
        baseUrl: baseUrl.trim() || null,
      }));
      setApiKey('');
      setSaveMsg({ type: 'success', text: '已保存。切换到「真实 LLM 模式」即可使用 API 提问。' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function removeApiKey() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.saveAiConfig({ openaiApiKey: '' });
      setApiKey('');
      setConfig((prev) => ({ ...(prev ?? config!), hasApiKey: false }));
      setSaveMsg({ type: 'success', text: '已移除已配置的 API Key。' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-indigo-500" />
          <h1 className="text-lg font-semibold text-slate-800">Settings</h1>
        </div>

        {/* API 连接配置 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <KeyRound size={16} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">连接 OpenAI API</h2>
            {config?.hasApiKey && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <Check size={12} /> 已配置
              </span>
            )}
          </div>
          <p className="mb-4 text-xs text-slate-400">
            在此填写 API Key 即可实时生效，无需修改 .env 或重启（Key 只保存在后端内存，不会回传显示）。
          </p>
          <form onSubmit={saveAiConfig} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">API Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={config?.hasApiKey ? '••••••••（已配置，留空保持不变）' : 'sk-...'}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">
                Base URL <span className="text-slate-400">（可选，OpenAI 兼容中转地址）</span>
              </span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-slate-500">模型</span>
              <input
                list="model-presets"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <datalist id="model-presets">
                {MODEL_PRESETS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                保存 API 配置
              </button>
              {config?.hasApiKey && (
                <button
                  type="button"
                  onClick={() => void removeApiKey()}
                  className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50"
                >
                  移除已配置的 Key
                </button>
              )}
              {saveMsg && (
                <span
                  className={`text-xs ${saveMsg.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}
                >
                  {saveMsg.text}
                </span>
              )}
            </div>
          </form>
        </div>

        {/* AI 模式 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Bot size={16} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">AI 模式</h2>
          </div>
          {config ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-slate-600">当前模式</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    config.aiMockMode
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {config.aiMockMode ? 'Mock（内置规则，无需 API Key）' : '真实 LLM（OpenAI）'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-slate-600">模型</span>
                <span className="font-mono text-slate-800">{config.model}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-slate-600">API Key</span>
                <span
                  className={`text-xs font-medium ${
                    config.hasApiKey ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {config.hasApiKey ? '已配置' : '未配置'}
                </span>
              </div>
              <button
                onClick={() => void toggleMock()}
                disabled={toggling || (config.aiMockMode && !config.hasApiKey)}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
              >
                {toggling
                  ? '切换中…'
                  : config.aiMockMode
                    ? '切换到真实 LLM 模式'
                    : '切换到 Mock 模式'}
              </button>
              <p className="text-xs leading-relaxed text-slate-400">
                Mock 模式：SQL 由内置规则生成并在 MySQL 上真实执行，答案 100% 来自真实查询结果。
                <br />
                真实模式：使用上方配置的 API Key + 模型生成 SQL 与回答。若未配置 Key 则无法切换到真实模式。
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-500">无法获取配置（后端未启动？）</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">导出</h2>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm text-slate-600">查询结果「需要导出吗」建议</div>
              <div className="mt-0.5 text-xs text-slate-400">
                仅在结果较多时询问（≥5 行且为列表/统计类结果）；关闭后不会主动询问，但仍可手动导出
              </div>
            </div>
            <button
              onClick={() => {
                const next = !suggestEnabled;
                setSuggestEnabled(next);
                setSuggestExportDisabled(!next);
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                suggestEnabled ? 'bg-indigo-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  suggestEnabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Database size={16} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">数据库与账号</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-500">
            数据库连接在 <span className="font-medium text-slate-700">Database</span> 页面修改；
            管理员在 <span className="font-medium text-slate-700">Admin（数据管理）</span> 页面可增删改员工数据。
            密码只保存在后端内存中，不会暴露给前端，也不会写入任何文件。
          </p>
        </div>
      </div>
    </div>
  );
}
