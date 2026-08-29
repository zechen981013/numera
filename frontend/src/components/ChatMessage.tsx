import { useState } from 'react';
import { AlertTriangle, ChevronDown, FileSpreadsheet, TrendingUp, UserCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ResultTable } from './ResultTable';
import { ExportDialog } from './ExportDialog';
import {
  isSuggestExportDisabled,
  setSuggestExportDisabled,
  shouldSuggestExport,
} from '../utils/excel';
import type { Suggestion } from '../types';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'ai';
  content: string;
  /** 对应的用户问题（用于「是否建议导出」的规则判断） */
  question?: string;
  sql?: string | null;
  data?: Record<string, unknown>[];
  executionTimeMs?: number;
  isError?: boolean;
  /** 业务建议（打折建议 / 升育留裁） */
  suggestion?: Suggestion | null;
}

interface ChatMessageProps {
  message: ChatMessageItem;
}

function formatExecutionTime(ms?: number): string {
  if (ms === undefined) return '';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function fileName(): string {
  return `查询结果_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-indigo-500 to-sky-500 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-md shadow-indigo-500/20">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-400 text-xs font-bold text-white shadow-md shadow-indigo-500/20">
        AI
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {message.isError ? (
          <div className="rounded-2xl rounded-tl-sm border border-red-200 bg-red-50 px-4 py-2.5 text-[15px] text-red-600">
            {message.content}
          </div>
        ) : (
          <>
            <div className="markdown-body text-[15px] leading-relaxed text-slate-800">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
            {message.sql ? (
              <SqlBlock message={message} />
            ) : (
              <div className="text-xs text-slate-400">
                （本次问题未生成可执行的 SQL）
              </div>
            )}
            <SuggestionCard suggestion={message.suggestion} />
            <ExportSuggestion message={message} />
          </>
        )}
      </div>
    </div>
  );
}

/** 智能导出建议：规则闸门 + 偏好记忆，避免每个问题都打扰用户 */
function ExportSuggestion({ message }: { message: ChatMessageItem }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [localDismissed, setLocalDismissed] = useState(false);

  const suggest =
    shouldSuggestExport(message.question ?? '', message.data) &&
    !isSuggestExportDisabled() &&
    !localDismissed;

  if (!suggest) return null;

  const rowCount = message.data?.length ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-2.5">
      <span className="text-xs text-indigo-700">
        检测到 <span className="font-semibold">{rowCount} 行</span> 查询结果，需要导出吗？
      </span>
      <button
        onClick={() => setDialogOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
      >
        <FileSpreadsheet size={13} />
        导出 Excel
      </button>
      <button
        onClick={() => setLocalDismissed(true)}
        className="text-xs text-slate-500 hover:text-slate-700"
      >
        不需要
      </button>
      <button
        onClick={() => {
          setSuggestExportDisabled(true);
          setLocalDismissed(true);
        }}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        以后都别问
      </button>
      {dialogOpen && (
        <ExportDialog rows={message.data ?? []} defaultFileName={fileName()} onClose={() => setDialogOpen(false)} />
      )}
    </div>
  );
}

/** 业务建议卡片：打折建议（airline）/ 升育留裁（employee） */
function SuggestionCard({ suggestion }: { suggestion?: Suggestion | null }) {
  if (!suggestion) return null;

  if (suggestion.type === 'airline') {
    return (
      <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/70 shadow-sm">
        <div className="flex items-center gap-2 border-b border-emerald-100 px-4 py-2.5">
          <TrendingUp size={15} className="text-emerald-600" />
          <span className="text-xs font-semibold text-emerald-800">运营决策建议</span>
        </div>
        <div className="space-y-2 px-4 py-3">
          <div className="text-sm font-bold text-emerald-900">{suggestion.title}</div>
          <p className="text-xs leading-relaxed text-slate-700">{suggestion.description}</p>
          <div className="space-y-1 rounded-lg bg-white/70 p-3">
            {suggestion.basis.map((b, i) => (
              <div key={i} className="flex gap-1.5 text-xs text-slate-600">
                <span className="text-emerald-500">•</span>
                <span>{b}</span>
              </div>
            ))}
            <div className="mt-1.5 flex gap-1.5 text-xs text-slate-700">
              <span className="font-medium text-emerald-700">预期效果：</span>
              <span>{suggestion.expectedEffect}</span>
            </div>
            <div className="flex gap-1.5 text-xs text-amber-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{suggestion.risk}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // employee：升 / 育 / 留 / 裁
  const styleMap: Record<string, string> = {
    升: 'bg-emerald-500/15 text-emerald-700 border-emerald-200',
    育: 'bg-amber-500/15 text-amber-700 border-amber-200',
    留: 'bg-blue-500/15 text-blue-700 border-blue-200',
    裁: 'bg-red-500/15 text-red-700 border-red-200',
  };
  return (
    <div className="overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/70 shadow-sm">
      <div className="flex items-center justify-between border-b border-indigo-100 px-4 py-2.5">
        <span className="flex items-center gap-2 text-xs font-semibold text-indigo-800">
          <UserCheck size={15} className="text-indigo-600" />
          人才干预建议
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-bold ${styleMap[suggestion.action] ?? 'bg-slate-200 text-slate-700'}`}
        >
          {suggestion.actionLabel}
        </span>
      </div>
      <div className="space-y-2 px-4 py-3">
        <div className="text-sm font-bold text-slate-900">
          {suggestion.name}
          <span className="ml-2 text-xs font-normal text-slate-500">{suggestion.action}</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-700">{suggestion.description}</p>
        <div className="space-y-1 rounded-lg bg-white/70 p-3">
          {suggestion.basis.map((b, i) => (
            <div key={i} className="flex gap-1.5 text-xs text-slate-600">
              <span className="text-indigo-500">•</span>
              <span>{b}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SqlBlock({ message }: { message: ChatMessageItem }) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-left text-xs font-medium text-slate-600 hover:text-slate-800"
        >
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          {open ? '隐藏 SQL' : '查看 SQL'}
        </button>
        <div className="flex items-center gap-3">
          {message.data && message.data.length > 0 && (
            <button
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
            >
              <FileSpreadsheet size={13} />
              导出 Excel
            </button>
          )}
          {message.executionTimeMs !== undefined && (
            <span className="text-xs text-slate-400">
              耗时 {formatExecutionTime(message.executionTimeMs)}
            </span>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 overflow-x-auto rounded-lg bg-slate-900 p-3">
            <pre className="text-xs leading-relaxed text-emerald-300">
              {message.sql}
            </pre>
          </div>
          {message.data && message.data.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">
                查询结果（{message.data.length} 行）
              </div>
              <ResultTable rows={message.data} />
            </div>
          )}
        </div>
      )}
      {dialogOpen && (
        <ExportDialog rows={message.data ?? []} defaultFileName={fileName()} onClose={() => setDialogOpen(false)} />
      )}
    </div>
  );
}
