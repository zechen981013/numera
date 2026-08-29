interface ResultTableProps {
  rows: Record<string, unknown>[];
}

/** 把结果显示成简洁的表格 */
export function ResultTable({ rows }: ResultTableProps) {
  if (rows.length === 0) {
    return <div className="text-xs text-slate-400">无数据</div>;
  }
  const columns = Object.keys(rows[0]);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-slate-700">
                  {String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
