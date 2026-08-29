import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Plane, Send, Loader2 } from 'lucide-react';
import { ChatMessage, type ChatMessageItem } from '../components/ChatMessage';
import { api } from '../services/api';

interface ChatPageProps {
  pendingQuestion: string | null;
  onPendingQuestionConsumed: () => void;
}

let messageSeq = 0;
const nextId = () => `msg-${Date.now()}-${messageSeq++}`;

const SESSION_KEY = 'crm_chat_session_id';

/** 会话 ID：首次生成并持久化，同一会话内多轮提问会带上上下文记忆 */
function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID().slice(0, 16);
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const SUGGESTIONS = [
  '公司一共有多少员工？',
  '技术部的平均工资是多少？',
  '整体客座率是多少？毛利率怎么样？',
  '客座率太低了，该打几折来提升上座？',
  '唐佳琪的绩效和出勤怎么样？该怎么处理？',
];

export function ChatPage({ pendingQuestion, onPendingQuestionConsumed }: ChatPageProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string>(getSessionId());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingQuestion) {
      onPendingQuestionConsumed();
      void send(pendingQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  /** 新建对话：清空当前消息并换一个新的会话 ID（后端将不再有历史上下文） */
  function newConversation() {
    sessionIdRef.current = crypto.randomUUID().slice(0, 16);
    localStorage.setItem(SESSION_KEY, sessionIdRef.current);
    setMessages([]);
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    const userMsg: ChatMessageItem = { id: nextId(), role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.sendQuestion(q, sessionIdRef.current);
      const aiMsg: ChatMessageItem = {
        id: nextId(),
        role: 'ai',
        content: res.answer,
        question: q,
        sql: res.sql,
        data: res.data,
        executionTimeMs: res.executionTimeMs,
        isError: !res.success,
        suggestion: res.suggestion ?? null,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const aiMsg: ChatMessageItem = {
        id: nextId(),
        role: 'ai',
        content: err instanceof Error ? err.message : String(err),
        isError: true,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-6 py-3 backdrop-blur-md">
        <span className="text-sm text-slate-500">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />
          多轮对话已开启，同一会话提问会自动带上上下文记忆
        </span>
        <button
          onClick={newConversation}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600"
        >
          <MessageSquarePlus size={15} />
          新对话
        </button>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {messages.length === 0 && !loading ? (
          <div className="mx-auto mt-14 max-w-2xl text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-xl shadow-indigo-500/25">
              <Plane size={30} />
            </div>
            <h1 className="bg-gradient-to-r from-navy-800 via-indigo-600 to-sky-500 bg-clip-text text-4xl font-bold text-transparent">
              大湾区航空 · 数据分析助手
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-500">
              用中文提问，AI 自动查库分析，并给出可落地的经营与人才决策建议。
            </p>
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="group rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-left text-[15px] text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-lg hover:shadow-indigo-500/10"
                >
                  <span className="mr-1.5 text-indigo-300 transition-colors group-hover:text-indigo-500">✈</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
        {loading && (
          <div className="flex items-center gap-3 text-[15px] text-slate-500">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-400 text-xs font-bold text-white">
              AI
            </div>
            <span className="flex items-center gap-2">
              <Loader2 size={17} className="animate-spin" />
              正在分析并查询数据库…
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200/80 bg-white/90 p-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-lg shadow-slate-200/60 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="请输入你的问题…（Enter 发送，Shift+Enter 换行）"
            className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-base outline-none placeholder:text-slate-400"
          />
          <button
            onClick={() => void send(input)}
            disabled={loading || input.trim().length === 0}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-md shadow-indigo-500/25 transition-all hover:brightness-110 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
