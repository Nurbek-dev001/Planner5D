import { calculateBudget, formatPrice } from '@spaceplan/shared';
import { useEditor } from '../store';
import { Dialog } from './Dialog';

/** Budget calculator in KZT (docs, sections 27 and 54) */
export function BudgetDialog({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const budget = calculateBudget(project);
  return (
    <Dialog title="Смета проекта" onClose={onClose} wide>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {budget.byCategory.map((c) => (
          <div key={c.category} className="rounded-lg bg-gray-50 p-3">
            <div className="text-xs text-gray-500">{c.category}</div>
            <div className="font-semibold">{formatPrice(c.total)}</div>
          </div>
        ))}
        <div className="rounded-lg bg-brand-600 p-3 text-white">
          <div className="text-xs opacity-80">Итого</div>
          <div className="text-lg font-bold">{formatPrice(budget.total)}</div>
        </div>
      </div>
      {budget.lines.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2">Позиция</th>
              <th className="py-2 text-right">Кол-во</th>
              <th className="py-2 text-right">Цена</th>
              <th className="py-2 text-right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {budget.lines.map((l, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1.5">
                  <div>{l.label}</div>
                  <div className="text-xs text-gray-400">{l.category}</div>
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {l.quantity} {l.unit}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">{formatPrice(l.unitPrice)}</td>
                <td className="py-1.5 text-right font-medium whitespace-nowrap">{formatPrice(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-center text-sm text-gray-500">Добавьте комнаты, двери, окна и мебель — смета посчитается автоматически.</p>
      )}
      <p className="mt-4 text-xs text-gray-400">Цены ориентировочные, из базового каталога. Отделка стен учитывается, если для комнаты выбран материал стен.</p>
    </Dialog>
  );
}
